import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "../lib/http-error.js";
import type { ServiceContext } from "./context.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "vendor",
  "pods",
  "bin",
  "obj",
  ".idea",
  ".vscode",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx",
  ".txt", ".css", ".scss", ".sass", ".less", ".html", ".htm", ".svg",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".kts", ".cs", ".cpp",
  ".cc", ".c", ".h", ".hpp", ".php", ".swift", ".sh", ".bash", ".ps1",
  ".sql", ".prisma", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
  ".graphql", ".gql", ".proto", ".dockerfile", ".tf",
]);

const SKIPPED_FILE_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
  "cargo.lock", "poetry.lock", "composer.lock", "gemfile.lock", "go.sum",
]);

/** Files that commonly hold credentials are never read into the index. */
const SENSITIVE_NAME = /(secret|credential|private[-_]?key|api[-_]?key|\.pem$|\.key$|\.p12$|\.pfx$|\.crt$)/i;

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 4_000;
const MAX_CHUNKS = 20_000;
const CHUNK_LINES = 60;
const CHUNK_OVERLAP = 12;
const MAX_CHUNK_CHARS = 8_000;

export type IndexStats = {
  files: number;
  indexedFiles: number;
  chunks: number;
  skipped: number;
  truncated: boolean;
  bytes: number;
};

type WalkResult = {
  files: string[];
  skipped: number;
  truncated: boolean;
};

function shouldSkipFile(name: string): boolean {
  if (name.startsWith(".")) return true;
  if (SKIPPED_FILE_NAMES.has(name.toLowerCase())) return true;
  if (/\.min\.(js|css)$/i.test(name) || name.endsWith(".map")) return true;
  if (SENSITIVE_NAME.test(name)) return true;
  return !TEXT_EXTENSIONS.has(path.extname(name).toLowerCase()) && name !== "Dockerfile";
}

async function walk(root: string): Promise<WalkResult> {
  const files: string[] = [];
  let skipped = 0;
  let truncated = false;
  const queue: string[] = [""];

  while (queue.length > 0 && !truncated) {
    const relativeDir = queue.shift() as string;
    let entries;
    try {
      entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
    } catch {
      skipped += 1;
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isSymbolicLink()) {
        skipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name.toLowerCase())) {
          skipped += 1;
          continue;
        }
        queue.push(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldSkipFile(entry.name)) {
        skipped += 1;
        continue;
      }
      if (files.length >= MAX_FILES) {
        truncated = true;
        break;
      }
      files.push(relative);
    }
  }

  return { files, skipped, truncated };
}

function isBinary(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, 8_192);
  return probe.includes(0);
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type ChunkRow = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
};

function chunkFile(relativePath: string, text: string): ChunkRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: ChunkRow[] = [];
  const step = CHUNK_LINES - CHUNK_OVERLAP;

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + CHUNK_LINES, lines.length);
    const window = lines.slice(start, end);
    const content = window.join("\n").trim();
    if (!content) {
      if (end >= lines.length) break;
      continue;
    }
    chunks.push({
      path: relativePath,
      startLine: start + 1,
      endLine: end,
      content: content.length > MAX_CHUNK_CHARS ? content.slice(0, MAX_CHUNK_CHARS) : content,
      contentHash: hash(content),
    });
    if (end >= lines.length) break;
  }
  return chunks;
}

async function replaceChunks(
  prisma: PrismaClient,
  repositoryId: string,
  projectId: string,
  chunks: ChunkRow[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.repositoryChunk.deleteMany({ where: { repositoryId } });
    for (let i = 0; i < chunks.length; i += 500) {
      const batch = chunks.slice(i, i + 500);
      await tx.repositoryChunk.createMany({
        data: batch.map((chunk) => ({
          repositoryId,
          projectId,
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          contentHash: chunk.contentHash,
        })),
      });
    }
  });
}

/**
 * Indexes a repository's text files into lexical chunks. Files are read
 * locally only; nothing is sent to a provider. Hidden entries, dependency and
 * build directories, lockfiles, credential-looking names, binaries and
 * oversized files are skipped.
 */
export async function indexRepository(
  ctx: ServiceContext,
  repositoryId: string,
  userId: string,
): Promise<IndexStats> {
  const repository = await ctx.prisma.repository.findFirst({
    where: { id: repositoryId, project: { userId } },
    include: { project: { select: { rootPath: true } } },
  });
  if (!repository) throw notFound("Repository");

  const root = repository.path || repository.project.rootPath;
  if (!root) throw badRequest("Repository has no path to index");
  if (!path.isAbsolute(root)) throw badRequest("Repository path must be absolute");

  let rootStat;
  try {
    rootStat = await stat(root);
  } catch {
    throw badRequest("Repository path does not exist");
  }
  if (!rootStat.isDirectory()) throw badRequest("Repository path is not a directory");

  await ctx.prisma.repository.update({
    where: { id: repository.id },
    data: { indexStatus: "indexing" },
  });

  try {
    const walked = await walk(root);
    const chunks: ChunkRow[] = [];
    let indexedFiles = 0;
    let bytes = 0;
    let skipped = walked.skipped;
    let truncated = walked.truncated;

    for (const relative of walked.files) {
      if (chunks.length >= MAX_CHUNKS) {
        truncated = true;
        break;
      }
      const absolute = path.join(root, relative);
      let fileStat;
      try {
        fileStat = await stat(absolute);
      } catch {
        skipped += 1;
        continue;
      }
      if (!fileStat.isFile()) continue;
      if (fileStat.size > MAX_FILE_BYTES) {
        skipped += 1;
        continue;
      }
      let buffer;
      try {
        buffer = await readFile(absolute);
      } catch {
        skipped += 1;
        continue;
      }
      if (isBinary(buffer)) {
        skipped += 1;
        continue;
      }
      const relativePath = relative.split(path.sep).join("/");
      const fileChunks = chunkFile(relativePath, buffer.toString("utf8"));
      if (fileChunks.length === 0) continue;
      bytes += fileStat.size;
      indexedFiles += 1;
      chunks.push(...fileChunks);
    }

    const capped = chunks.slice(0, MAX_CHUNKS);
    await replaceChunks(ctx.prisma, repository.id, repository.projectId, capped);

    await ctx.prisma.repository.update({
      where: { id: repository.id },
      data: { indexStatus: "indexed", lastIndexedAt: new Date() },
    });

    return {
      files: walked.files.length,
      indexedFiles,
      chunks: capped.length,
      skipped,
      truncated: truncated || capped.length < chunks.length,
      bytes,
    };
  } catch (error) {
    await ctx.prisma.repository
      .update({ where: { id: repository.id }, data: { indexStatus: "failed" } })
      .catch(() => undefined);
    throw error;
  }
}

export type RepositoryHit = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  rank: number;
};

/**
 * Ranks indexed chunks against a query with PostgreSQL full-text search.
 * Lexical retrieval is deliberate: it needs no external embedding service and
 * fabricates nothing. Semantic (pgvector) retrieval is a future layer.
 */
export async function searchRepositoryChunks(
  ctx: ServiceContext,
  projectId: string,
  query: string,
  limit = 8,
): Promise<RepositoryHit[]> {
  const tokens = Array.from(
    new Set(
      (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
        (token) => token.length >= 2,
      ),
    ),
  ).slice(0, 12);
  if (tokens.length === 0) return [];

  return ctx.prisma.$queryRaw<RepositoryHit[]>(Prisma.sql`
    WITH matches AS (
      SELECT c.id,
             c.path,
             c.start_line AS "startLine",
             c.end_line AS "endLine",
             c.content,
             to_tsvector('english', c.content) AS vec,
             plainto_tsquery('english', t.word) AS term
        FROM repository_chunks c
        CROSS JOIN unnest(${tokens}::text[]) AS t(word)
       WHERE c.project_id = ${projectId}
    )
    SELECT id,
           path,
           "startLine",
           "endLine",
           content,
           SUM(ts_rank(vec, term)) AS rank
      FROM matches
     WHERE vec @@ term
     GROUP BY id, path, "startLine", "endLine", content
     ORDER BY rank DESC, id ASC
     LIMIT ${Math.min(Math.max(limit, 1), 20)}
  `);
}

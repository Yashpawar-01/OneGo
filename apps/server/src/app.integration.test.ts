import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ProviderAdapterRegistry, SimulatedAdapter } from "@onego/core";
import { createApp } from "./app.js";
import { parseEnv } from "./config/env.js";

const testUrl =
  process.env.ONEGO_TEST_DATABASE_URL ??
  "postgresql://onego@127.0.0.1:55432/onego_test";
const describeWithDb = describe;
let dbReady = false;

type TestContext = { skip: () => void };

function skipWithoutDb(ctx: TestContext): boolean {
  if (dbReady) return false;
  ctx.skip();
  return true;
}

function parseSse(raw: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of raw.split("\n\n")) {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));
    if (!eventLine || !dataLine) continue;
    const name = eventLine.slice("event: ".length).trim();
    const payload = dataLine.slice("data: ".length);
    try {
      events.push({ event: name, data: JSON.parse(payload) });
    } catch {
      // Ignore non-JSON heartbeats/end frames.
    }
  }
  return events;
}

const sseParser = (res: request.Response, callback: (error: Error | null, body: string) => void) => {
  res.setEncoding("utf8");
  let raw = "";
  res.on("data", (chunk: string) => {
    raw += chunk;
  });
  res.on("end", () => callback(null, raw));
};

describeWithDb("server API acceptance flow", () => {
  const prisma = new PrismaClient({ datasourceUrl: testUrl });
  const registry = new ProviderAdapterRegistry();
  registry.register(new SimulatedAdapter("anthropic", { type: "quota_exhausted" }), {
    priority: 10,
  });
  registry.register(
    new SimulatedAdapter("openai", {
      type: "success",
      text: "Hello from Codex. Your conversation and project context have been preserved.",
      chunkSize: 12,
    }),
    { priority: 20 },
  );

  const env = parseEnv({
    NODE_ENV: "test",
    PORT: "4400",
    LOG_LEVEL: "error",
    CORS_ORIGIN: "http://localhost:5173",
    DATABASE_URL: testUrl,
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    JWT_SECRET: "test-jwt-secret-that-is-long-enough",
  });

  const app = createApp({ env, prisma, registry });
  const email = `acceptance-${Date.now()}@onego.test`;
  let token = "";
  let conversationId = "";
  const tempDirs: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
      await prisma.user.deleteMany({ where: { email: { endsWith: "@onego.test" } } });
    } catch {
      dbReady = false;
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("registers the first user and issues a token", async (ctx) => {
    if (skipWithoutDb(ctx)) return;
    const response = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "correct-horse-battery", name: "Acceptance User" });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    token = response.body.token as string;
  });

  it("rejects unauthenticated API access", async (ctx) => {
    if (skipWithoutDb(ctx)) return;
    const response = await request(app).get("/api/providers");
    expect(response.status).toBe(401);
  });

  it("connects simulated Claude (quota) and Codex accounts", async (ctx) => {
    if (skipWithoutDb(ctx)) return;
    const catalog = await request(app)
      .get("/api/providers")
      .set("Authorization", `Bearer ${token}`);
    expect(catalog.status).toBe(200);

    const anthropic = await request(app)
      .post("/api/providers/anthropic/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        label: "claude-work",
        credentials: { apiKey: "sk-ant-acceptance-secret" },
        priority: 10,
      });
    expect(anthropic.status).toBe(201);
    expect(anthropic.body.validation.ok).toBe(true);

    const openai = await request(app)
      .post("/api/providers/openai/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        label: "codex",
        credentials: { apiKey: "sk-openai-acceptance-secret" },
        priority: 20,
      });
    expect(openai.status).toBe(201);
    expect(openai.body.validation.ok).toBe(true);

    const providers = await request(app)
      .get("/api/providers")
      .set("Authorization", `Bearer ${token}`);
    expect(providers.status).toBe(200);
    expect(JSON.stringify(providers.body)).not.toContain("sk-ant-acceptance-secret");
    expect(JSON.stringify(providers.body)).not.toContain("sk-openai-acceptance-secret");
    expect(JSON.stringify(providers.body)).not.toContain("credentialCiphertext");
  });

  it("streams a Claude→Codex fallback with preserved context", async () => {
    const created = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Acceptance conversation", routingMode: "manual" });
    expect(created.status).toBe(201);
    conversationId = created.body.conversation.id as string;

    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Please fix the failing login test." })
      .buffer(true)
      .parse(sseParser);

    expect(response.status).toBe(200);
    const events = parseSse(response.body as unknown as string);
    const names = events.map((event) => event.event);

    expect(names).toContain("fallback");
    expect(names).toContain("done");

    const fallback = events.find((event) => event.event === "fallback");
    expect((fallback?.data as { reason: string }).reason).toBe("quota_exhausted");

    const attemptStarts = events.filter((event) => event.event === "attempt_started");
    expect(attemptStarts.length).toBeGreaterThanOrEqual(2);

    const done = events.find((event) => event.event === "done");
    const doneData = done?.data as {
      messageId: string;
      providerKind: string;
      accountId: string;
    };
    expect(doneData.providerKind).toBe("openai");
    expect(doneData.messageId).toBeTruthy();

    const deltas = events.filter((event) => event.event === "delta");
    expect(deltas.length).toBeGreaterThan(0);
  });

  it("persists messages, provider switch, and usage", async (ctx) => {
    if (skipWithoutDb(ctx)) return;
    const detail = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.messages[0].role).toBe("user");
    expect(detail.body.messages[1].role).toBe("assistant");
    expect(detail.body.messages[1].content).toContain("Hello from Codex");
    expect(detail.body.switches.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.switches[0].reason).toBe("quota_exhausted");

    const usage = await request(app)
      .get("/api/usage/summary?days=7")
      .set("Authorization", `Bearer ${token}`);
    expect(usage.status).toBe(200);
    expect(usage.body.totals.success).toBeGreaterThanOrEqual(1);
    expect(usage.body.previous.requests).toBe(0);

    const overview = await request(app)
      .get("/api/overview")
      .set("Authorization", `Bearer ${token}`);
    expect(overview.status).toBe(200);
    expect(overview.body.counts.conversations).toBe(1);
    expect(overview.body.recentSwitches.length).toBeGreaterThanOrEqual(1);
  });

  it("continues the same conversation across providers", async (ctx) => {
    if (skipWithoutDb(ctx)) return;
    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Now add a regression test for it." })
      .buffer(true)
      .parse(sseParser);

    const events = parseSse(response.body as unknown as string);
    expect(events.some((event) => event.event === "done")).toBe(true);

    const detail = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.body.messages).toHaveLength(4);
    expect(detail.body.messages.filter((m: { role: string }) => m.role === "assistant")).toHaveLength(2);
  });

  it("steers a turn with the lowest-priority matching routing rule", async (ctx) => {
    if (skipWithoutDb(ctx)) return;
    const createdRule = await request(app)
      .post("/api/routing/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Debug on Codex",
        mode: "automatic",
        priority: 5,
        conditions: { taskTypes: ["debugging"] },
        targetProviderKind: "openai",
      });
    expect(createdRule.status).toBe(201);

    const created = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Rule-routed conversation", routingMode: "automatic" });
    expect(created.status).toBe(201);
    const ruleConversationId = created.body.conversation.id as string;

    const response = await request(app)
      .post(`/api/conversations/${ruleConversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Please debug the failing login test." })
      .buffer(true)
      .parse(sseParser);

    const events = parseSse(response.body as unknown as string);
    const meta = events.find((event) => event.event === "meta");
    expect((meta?.data as { routingRule?: { name: string } }).routingRule?.name).toBe(
      "Debug on Codex",
    );

    const attempts = events.filter((event) => event.event === "attempt_started");
    expect((attempts[0]?.data as { providerKind: string }).providerKind).toBe("openai");
    expect(events.some((event) => event.event === "fallback")).toBe(false);

    const done = events.find((event) => event.event === "done");
    expect((done?.data as { providerKind: string }).providerKind).toBe("openai");
  });

  it("indexes a linked repository and retrieves matching code into the context", async (ctx) => {
    if (skipWithoutDb(ctx)) return;

    const root = await mkdtemp(path.join(tmpdir(), "onego-index-"));
    tempDirs.push(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(
      path.join(root, "src", "fallback.ts"),
      "export class FallbackRunner {\n  switchProvider() { return 'quota_exhausted'; }\n}\n",
    );
    await writeFile(
      path.join(root, "src", "theme.ts"),
      "export const palette = ['red', 'blue'];\n",
    );
    await writeFile(
      path.join(root, "node_modules", "dep", "index.js"),
      "module.exports = 'quota_exhausted';\n",
    );
    await writeFile(path.join(root, ".env"), "SECRET_API_KEY=should-never-be-indexed\n");
    await writeFile(path.join(root, "logo.bin"), Buffer.from([0, 1, 2, 3]));

    const projectResponse = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Indexed project", rootPath: root });
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.project.id as string;

    const relativePath = await request(app)
      .post(`/api/projects/${projectId}/repositories`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "fixture", path: "relative/not/allowed" });
    expect(relativePath.status).toBe(400);

    const repository = await request(app)
      .post(`/api/projects/${projectId}/repositories`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "fixture", path: root });
    expect(repository.status).toBe(201);
    const repositoryId = repository.body.repository.id as string;
    expect(repository.body.repository.indexStatus).toBe("pending");

    const indexed = await request(app)
      .post(`/api/repositories/${repositoryId}/index`)
      .set("Authorization", `Bearer ${token}`);
    expect(indexed.status).toBe(200);
    expect(indexed.body.repository.indexStatus).toBe("indexed");
    expect(indexed.body.repository.chunkCount).toBe(2);
    expect(indexed.body.stats.indexedFiles).toBe(2);
    expect(indexed.body.stats.skipped).toBeGreaterThanOrEqual(3);

    const search = await request(app)
      .get(`/api/projects/${projectId}/search?query=quota_exhausted`)
      .set("Authorization", `Bearer ${token}`);
    expect(search.status).toBe(200);
    expect(search.body.hits).toHaveLength(1);
    expect(search.body.hits[0].path).toBe("src/fallback.ts");
    expect(search.body.hits[0].content).toContain("FallbackRunner");
    expect(JSON.stringify(search.body)).not.toContain("should-never-be-indexed");

    const created = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Indexed conversation", routingMode: "manual", projectId });
    expect(created.status).toBe(201);
    const indexedConversationId = created.body.conversation.id as string;

    const response = await request(app)
      .post(`/api/conversations/${indexedConversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Where is quota_exhausted handled in the fallback runner?" })
      .buffer(true)
      .parse(sseParser);

    const events = parseSse(response.body as unknown as string);
    const meta = events.find((event) => event.event === "meta");
    expect(
      (meta?.data as { context?: { repositoryHits?: number } }).context?.repositoryHits,
    ).toBe(1);
    expect(events.some((event) => event.event === "done")).toBe(true);
  });
});

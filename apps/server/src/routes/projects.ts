import { Router } from "express";
import { z } from "zod";
import type { ProjectMemory, TaskState } from "@prisma/client";
import { notFound } from "../lib/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseBody } from "../lib/validate.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  rootPath: z.string().trim().max(1000).nullable().optional(),
  gitRemoteUrl: z.string().trim().max(1000).nullable().optional(),
  defaultBranch: z.string().trim().max(200).nullable().optional(),
});

const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    rootPath: z.string().trim().max(1000).nullable().optional(),
    gitRemoteUrl: z.string().trim().max(1000).nullable().optional(),
    defaultBranch: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

const memorySchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(20_000),
  category: z.string().trim().max(80).optional(),
  pinned: z.boolean().optional(),
});

const memoryUpdateSchema = z
  .object({
    key: z.string().trim().min(1).max(200).optional(),
    value: z.string().trim().min(1).max(20_000).optional(),
    category: z.string().trim().max(80).optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

const taskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(10_000).nullable().optional(),
  status: z
    .enum(["pending", "in_progress", "blocked", "completed", "cancelled"])
    .optional(),
  conversationId: z.string().min(1).nullable().optional(),
});

const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    detail: z.string().trim().max(10_000).nullable().optional(),
    status: z
      .enum(["pending", "in_progress", "blocked", "completed", "cancelled"])
      .optional(),
  })
  .strict();

type ProjectWithCounts = {
  id: string;
  name: string;
  description: string | null;
  rootPath: string | null;
  gitRemoteUrl: string | null;
  defaultBranch: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { conversations: number; memories: number; tasks: number };
};

function projectDto(project: ProjectWithCounts) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    rootPath: project.rootPath,
    gitRemoteUrl: project.gitRemoteUrl,
    defaultBranch: project.defaultBranch,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    counts: {
      conversations: project._count?.conversations ?? 0,
      memories: project._count?.memories ?? 0,
      tasks: project._count?.tasks ?? 0,
    },
  };
}

function memoryDto(memory: ProjectMemory) {
  return {
    id: memory.id,
    key: memory.key,
    value: memory.value,
    category: memory.category,
    source: memory.source,
    pinned: memory.pinned,
    version: memory.version,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

function taskDto(task: TaskState) {
  return {
    id: task.id,
    title: task.title,
    detail: task.detail,
    status: task.status.toLowerCase(),
    conversationId: task.conversationId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function createProjectsRouter(ctx: ServiceContext): Router {
  const router = Router();

  router.get(
    "/projects",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const projects = await ctx.prisma.project.findMany({
        where: { userId },
        include: {
          _count: { select: { conversations: true, memories: true, tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      res.json({ projects: projects.map(projectDto) });
    }),
  );

  router.post(
    "/projects",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(projectSchema, req.body);
      const project = await ctx.prisma.project.create({
        data: {
          userId,
          name: body.name,
          description: body.description ?? null,
          rootPath: body.rootPath ?? null,
          gitRemoteUrl: body.gitRemoteUrl ?? null,
          defaultBranch: body.defaultBranch ?? "main",
        },
      });
      res.status(201).json({ project: projectDto(project) });
    }),
  );

  router.get(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const project = await ctx.prisma.project.findFirst({
        where: { id: req.params.projectId, userId },
        include: {
          _count: { select: { conversations: true, memories: true, tasks: true } },
          repositories: true,
          tasks: { orderBy: { updatedAt: "desc" }, take: 50 },
          memories: { orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 100 },
        },
      });
      if (!project) throw notFound("Project");
      res.json({
        project: projectDto(project),
        repositories: project.repositories.map((repository) => ({
          id: repository.id,
          name: repository.name,
          path: repository.path,
          remoteUrl: repository.remoteUrl,
          branch: repository.branch,
          indexStatus: repository.indexStatus,
          lastIndexedAt: repository.lastIndexedAt?.toISOString() ?? null,
        })),
        tasks: project.tasks.map(taskDto),
        memories: project.memories.map(memoryDto),
      });
    }),
  );

  router.patch(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(projectUpdateSchema, req.body);
      const existing = await ctx.prisma.project.findFirst({
        where: { id: req.params.projectId, userId },
        select: { id: true },
      });
      if (!existing) throw notFound("Project");
      const project = await ctx.prisma.project.update({
        where: { id: existing.id },
        data: body,
        include: {
          _count: { select: { conversations: true, memories: true, tasks: true } },
        },
      });
      res.json({ project: projectDto(project) });
    }),
  );

  router.delete(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const result = await ctx.prisma.project.deleteMany({
        where: { id: req.params.projectId, userId },
      });
      if (result.count === 0) throw notFound("Project");
      res.status(204).end();
    }),
  );

  router.get(
    "/projects/:projectId/memories",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const project = await ctx.prisma.project.findFirst({
        where: { id: req.params.projectId, userId },
        select: { id: true },
      });
      if (!project) throw notFound("Project");
      const memories = await ctx.prisma.projectMemory.findMany({
        where: { projectId: project.id },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      });
      res.json({ memories: memories.map(memoryDto) });
    }),
  );

  router.post(
    "/projects/:projectId/memories",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(memorySchema, req.body);
      const project = await ctx.prisma.project.findFirst({
        where: { id: req.params.projectId, userId },
        select: { id: true },
      });
      if (!project) throw notFound("Project");
      const memory = await ctx.prisma.projectMemory.upsert({
        where: { projectId_key: { projectId: project.id, key: body.key } },
        create: {
          projectId: project.id,
          key: body.key,
          value: body.value,
          category: body.category ?? "general",
          pinned: body.pinned ?? false,
        },
        update: {
          value: body.value,
          ...(body.category ? { category: body.category } : {}),
          ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
          version: { increment: 1 },
        },
      });
      res.status(201).json({ memory: memoryDto(memory) });
    }),
  );

  router.patch(
    "/memories/:memoryId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(memoryUpdateSchema, req.body);
      const existing = await ctx.prisma.projectMemory.findFirst({
        where: { id: req.params.memoryId, project: { userId } },
        select: { id: true },
      });
      if (!existing) throw notFound("Memory");
      const memory = await ctx.prisma.projectMemory.update({
        where: { id: existing.id },
        data: { ...body, version: { increment: 1 } },
      });
      res.json({ memory: memoryDto(memory) });
    }),
  );

  router.delete(
    "/memories/:memoryId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const result = await ctx.prisma.projectMemory.deleteMany({
        where: { id: req.params.memoryId, project: { userId } },
      });
      if (result.count === 0) throw notFound("Memory");
      res.status(204).end();
    }),
  );

  router.get(
    "/projects/:projectId/tasks",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const project = await ctx.prisma.project.findFirst({
        where: { id: req.params.projectId, userId },
        select: { id: true },
      });
      if (!project) throw notFound("Project");
      const tasks = await ctx.prisma.taskState.findMany({
        where: { projectId: project.id },
        orderBy: { updatedAt: "desc" },
      });
      res.json({ tasks: tasks.map(taskDto) });
    }),
  );

  router.post(
    "/projects/:projectId/tasks",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(taskSchema, req.body);
      const project = await ctx.prisma.project.findFirst({
        where: { id: req.params.projectId, userId },
        select: { id: true },
      });
      if (!project) throw notFound("Project");
      const task = await ctx.prisma.taskState.create({
        data: {
          projectId: project.id,
          title: body.title,
          detail: body.detail ?? null,
          status: (body.status?.toUpperCase() ?? "PENDING") as never,
          conversationId: body.conversationId ?? null,
        },
      });
      res.status(201).json({ task: taskDto(task) });
    }),
  );

  router.patch(
    "/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(taskUpdateSchema, req.body);
      const existing = await ctx.prisma.taskState.findFirst({
        where: { id: req.params.taskId, project: { userId } },
        select: { id: true },
      });
      if (!existing) throw notFound("Task");
      const task = await ctx.prisma.taskState.update({
        where: { id: existing.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.detail !== undefined ? { detail: body.detail } : {}),
          ...(body.status ? { status: body.status.toUpperCase() as never } : {}),
        },
      });
      res.json({ task: taskDto(task) });
    }),
  );

  router.delete(
    "/tasks/:taskId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const result = await ctx.prisma.taskState.deleteMany({
        where: { id: req.params.taskId, project: { userId } },
      });
      if (result.count === 0) throw notFound("Task");
      res.status(204).end();
    }),
  );

  return router;
}

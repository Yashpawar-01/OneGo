import { Router } from "express";
import { z } from "zod";
import type {
  Conversation,
  Message,
  ProviderSwitch,
  ConversationStatus,
  RoutingMode as PrismaRoutingMode,
} from "@prisma/client";
import { notFound, HttpError } from "../lib/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseBody } from "../lib/validate.js";
import { openSseStream } from "../lib/sse.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";
import { runChatTurn } from "../services/chat.js";
import type { ProviderErrorInfo } from "@onego/shared";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().min(1).nullable().optional(),
  routingMode: z.enum(["manual", "automatic", "intelligent"]).optional(),
});

const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    projectId: z.string().min(1).nullable().optional(),
    routingMode: z.enum(["manual", "automatic", "intelligent"]).optional(),
    status: z.enum(["active", "archived"]).optional(),
    activeAccountId: z.string().min(1).nullable().optional(),
  })
  .strict();

const chatSchema = z.object({
  content: z.string().trim().min(1).max(200_000),
  accountId: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).max(200).nullable().optional(),
  routingMode: z.enum(["manual", "automatic", "intelligent"]).nullable().optional(),
});

type ConversationWithMeta = Conversation & {
  project?: { id: string; name: string } | null;
  _count?: { messages: number };
};

function conversationDto(conversation: ConversationWithMeta) {
  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status.toLowerCase() as Lowercase<ConversationStatus>,
    routingMode: conversation.routingMode.toLowerCase(),
    activeAccountId: conversation.activeAccountId,
    projectId: conversation.projectId,
    projectName: conversation.project?.name ?? null,
    version: conversation.version,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation._count?.messages ?? undefined,
  };
}

function messageDto(message: Message) {
  return {
    id: message.id,
    sequence: message.sequence,
    role: message.role.toLowerCase(),
    content: message.content,
    providerAccountId: message.providerAccountId,
    modelId: message.modelId,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
    metadata: message.metadata,
    createdAt: message.createdAt.toISOString(),
  };
}

type SwitchRow = ProviderSwitch & {
  fromAccount:
    | { label: string; provider: { name: string } }
    | null;
  toAccount:
    | { label: string; provider: { name: string } }
    | null;
};

function switchDto(row: SwitchRow) {
  return {
    id: row.id,
    reason: row.reason.toLowerCase(),
    detail: row.detail,
    from: row.fromAccount
      ? { label: row.fromAccount.label, provider: row.fromAccount.provider.name }
      : null,
    to: row.toAccount
      ? { label: row.toAccount.label, provider: row.toAccount.provider.name }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createConversationsRouter(ctx: ServiceContext): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const projectId =
        typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const status =
        req.query.status === "archived"
          ? "ARCHIVED"
          : req.query.status === "all"
            ? undefined
            : "ACTIVE";

      const conversations = await ctx.prisma.conversation.findMany({
        where: {
          userId,
          ...(projectId ? { projectId } : {}),
          ...(status ? { status } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      res.json({ conversations: conversations.map(conversationDto) });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(createConversationSchema, req.body);

      if (body.projectId) {
        const project = await ctx.prisma.project.findFirst({
          where: { id: body.projectId, userId },
        });
        if (!project) throw notFound("Project");
      }

      const conversation = await ctx.prisma.conversation.create({
        data: {
          userId,
          title: body.title ?? "New conversation",
          projectId: body.projectId ?? null,
          routingMode: (body.routingMode?.toUpperCase() ?? "MANUAL") as PrismaRoutingMode,
        },
        include: { project: { select: { id: true, name: true } } },
      });

      res.status(201).json({ conversation: conversationDto(conversation) });
    }),
  );

  router.get(
    "/:conversationId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: req.params.conversationId, userId },
        include: {
          project: { select: { id: true, name: true } },
          messages: { orderBy: { sequence: "asc" } },
          switches: {
            orderBy: { createdAt: "desc" },
            take: 25,
            include: {
              fromAccount: { select: { label: true, provider: { select: { name: true } } } },
              toAccount: { select: { label: true, provider: { select: { name: true } } } },
            },
          },
          contextSnapshots: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              version: true,
              tokenCount: true,
              trigger: true,
              createdAt: true,
            },
          },
        },
      });
      if (!conversation) throw notFound("Conversation");

      res.json({
        conversation: conversationDto(conversation),
        messages: conversation.messages.map(messageDto),
        switches: conversation.switches.map(switchDto),
        contextSnapshot: conversation.contextSnapshots[0] ?? null,
      });
    }),
  );

  router.patch(
    "/:conversationId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(updateConversationSchema, req.body);
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: req.params.conversationId, userId },
      });
      if (!conversation) throw notFound("Conversation");

      if (body.projectId) {
        const project = await ctx.prisma.project.findFirst({
          where: { id: body.projectId, userId },
        });
        if (!project) throw notFound("Project");
      }
      if (body.activeAccountId) {
        const account = await ctx.prisma.providerAccount.findFirst({
          where: { id: body.activeAccountId, userId },
        });
        if (!account) throw notFound("Provider account");
      }

      const updated = await ctx.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
          ...(body.routingMode
            ? { routingMode: body.routingMode.toUpperCase() as PrismaRoutingMode }
            : {}),
          ...(body.status
            ? { status: body.status.toUpperCase() as ConversationStatus }
            : {}),
          ...(body.activeAccountId !== undefined
            ? { activeAccountId: body.activeAccountId }
            : {}),
        },
        include: { project: { select: { id: true, name: true } } },
      });

      res.json({ conversation: conversationDto(updated) });
    }),
  );

  router.delete(
    "/:conversationId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const result = await ctx.prisma.conversation.deleteMany({
        where: { id: req.params.conversationId, userId },
      });
      if (result.count === 0) throw notFound("Conversation");
      res.status(204).end();
    }),
  );

  /**
   * Streams one orchestrated turn as Server-Sent Events. Provider switches are
   * emitted as `fallback` events and persisted; `done` carries the final
   * assistant message id so the client can reconcile its optimistic state.
   */
  router.post(
    "/:conversationId/messages",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(chatSchema, req.body);

      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: req.params.conversationId, userId },
        select: { id: true },
      });
      if (!conversation) throw notFound("Conversation");

      res.setTimeout(0);
      const sse = openSseStream(res);
      const controller = new AbortController();
      let finished = false;
      req.on("close", () => {
        if (!finished) controller.abort();
      });

      try {
        for await (const event of runChatTurn(ctx, {
          userId,
          conversationId: conversation.id,
          content: body.content,
          accountId: body.accountId,
          modelId: body.modelId,
          routingMode: body.routingMode,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          sse.send(event.type, event);
        }
      } catch (error) {
        const info: ProviderErrorInfo =
          error instanceof HttpError
            ? {
                kind: error.status === 429 ? "rate_limited" : "invalid_request",
                message: error.message,
                retryable: false,
              }
            : {
                kind: "unknown",
                message:
                  error instanceof Error
                    ? error.message
                    : "The conversation turn failed",
                retryable: false,
              };
        sse.send("error", { type: "error", error: info, partial: false });
      } finally {
        finished = true;
        sse.close();
      }
    }),
  );

  return router;
}

import type { Message, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Allocates the next per-conversation message sequence, retrying on races. */
export async function appendMessage(
  db: Db,
  data: Omit<Prisma.MessageUncheckedCreateInput, "sequence">,
): Promise<Message> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const last = await db.message.findFirst({
      where: { conversationId: data.conversationId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;
    try {
      return await db.message.create({ data: { ...data, sequence } });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new Error("Could not allocate a message sequence");
}

export async function nextContextVersion(
  db: Db,
  conversationId: string,
): Promise<number> {
  const last = await db.contextSnapshot.findFirst({
    where: { conversationId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}

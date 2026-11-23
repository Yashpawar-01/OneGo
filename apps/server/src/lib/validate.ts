import type { ZodType } from "zod";
import { badRequest } from "./http-error.js";

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw badRequest(message);
  }
  return result.data;
}

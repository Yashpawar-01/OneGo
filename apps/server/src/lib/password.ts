import { randomBytes, scryptSync } from "node:crypto";
import { safeEqual } from "./crypto.js";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return safeEqual(derived, expected);
}

import pino, { type Logger } from "pino";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "*.apiKey",
  "*.token",
  "*.credentials",
  "*.credentialCiphertext",
];

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  });
}

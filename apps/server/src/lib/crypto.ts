import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

function keyFromBase64(secret: string): Buffer {
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error("Credential encryption key must decode to 32 bytes");
  }
  return key;
}

/** Encrypts a JSON-serializable credential payload with AES-256-GCM. */
export function encryptSecret(
  payload: unknown,
  keyBase64: string,
): { ciphertext: string; keyVersion: number } {
  const key = keyFromBase64(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: [
      VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join("."),
    keyVersion: 1,
  };
}

export function decryptSecret<T>(ciphertext: string, keyBase64: string): T {
  const [version, ivPart, tagPart, dataPart] = ciphertext.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Unsupported credential ciphertext format");
  }

  const key = keyFromBase64(keyBase64);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

import type { AuthMethod, ProviderCredentials } from "@onego/shared";
import { badRequest } from "../lib/http-error.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

export type CredentialInput = {
  apiKey?: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
};

export function credentialsFromInput(
  method: AuthMethod,
  input: CredentialInput,
): ProviderCredentials {
  if (method === "api_key") {
    const apiKey = input.apiKey?.trim() ?? input.token?.trim();
    if (!apiKey) throw badRequest("An API key is required for this provider");
    return { method: "api_key", apiKey };
  }
  if (method === "cli_pat") {
    const token = input.token?.trim() ?? input.apiKey?.trim();
    if (!token) throw badRequest("A personal access token is required");
    return { method: "cli_pat", token };
  }
  const accessToken = input.accessToken?.trim() ?? input.token?.trim();
  if (!accessToken) throw badRequest("An OAuth access token is required");
  return {
    method: "oauth",
    accessToken,
    refreshToken: input.refreshToken?.trim() || undefined,
    expiresAt: input.expiresAt,
  };
}

export function encryptCredentials(
  credentials: ProviderCredentials,
  encryptionKey: string,
): { ciphertext: string; keyVersion: number; hint: string } {
  const secretValue =
    credentials.method === "oauth"
      ? credentials.accessToken
      : credentials.method === "api_key"
        ? credentials.apiKey
        : credentials.token;
  const suffix = secretValue.slice(-4);
  const encrypted = encryptSecret(credentials, encryptionKey);
  return {
    ciphertext: encrypted.ciphertext,
    keyVersion: encrypted.keyVersion,
    hint: `••••${suffix}`,
  };
}

export function decryptCredentials(
  ciphertext: string,
  encryptionKey: string,
): ProviderCredentials {
  const payload = decryptSecret<ProviderCredentials>(ciphertext, encryptionKey);
  if (
    !payload ||
    (payload.method !== "api_key" &&
      payload.method !== "oauth" &&
      payload.method !== "cli_pat")
  ) {
    throw new Error("Stored credential payload is invalid");
  }
  return payload;
}

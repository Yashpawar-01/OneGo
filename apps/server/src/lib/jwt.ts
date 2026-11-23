import jwt from "jsonwebtoken";

const EXPIRES_IN = "7d";

export function signToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, {
    algorithm: "HS256",
    expiresIn: EXPIRES_IN,
  });
}

export function verifyToken(token: string, secret: string): string | undefined {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload === "object" && typeof payload.sub === "string") {
      return payload.sub;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

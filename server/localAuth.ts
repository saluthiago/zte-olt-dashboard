import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const LOCAL_SESSION_COOKIE = "olt_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type LocalSession = { id: number; openId: string; username: string; name: string; role: "user" | "admin"; exp: number };

export function hashOperatorPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyOperatorPassword(password: string, stored: string) {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const actual = scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }

export function createLocalSession(input: Omit<LocalSession, "exp">, secret: string) {
  const payload = Buffer.from(JSON.stringify({ ...input, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readLocalSession(token: string | undefined, secret: string): LocalSession | null {
  if (!token || !secret) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload ?? "", secret);
  if (!payload || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LocalSession;
    return session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch { return null; }
}

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { readLocalSession, LOCAL_SESSION_COOKIE } from "../localAuth";
import { parse } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookies = parse(opts.req.headers.cookie ?? "");
    const local = readLocalSession(cookies[LOCAL_SESSION_COOKIE], ENV.cookieSecret);
    if (local) {
      user = { id: local.id, openId: local.openId, name: local.name, email: null, loginMethod: "local", role: local.role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    }
  } catch { user = null; }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

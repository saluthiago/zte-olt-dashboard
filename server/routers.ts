import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { authorizeUnconfiguredOnu, executeOperatorAction, moveOnu, getLiveOltSnapshot, getOltConfig, getPonAvailability, getUnconfiguredOnus, getOltNetworkConfig, runOltTerminalCommand, updateOltConfig, updateOnuDescription } from "./zteAdapter";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { deleteOperatorAccount, getOperatorByUsername, insertOperationLog, listOperationLogs, listOperatorAccounts, saveOperatorAccount } from "./db";
import { createLocalSession, hashOperatorPassword, LOCAL_SESSION_COOKIE, verifyOperatorPassword } from "./localAuth";
import { ENV } from "./_core/env";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure.input(z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) })).mutation(async ({ ctx, input }) => {
      const account = await getOperatorByUsername(input.username);
      if (!account || !verifyOperatorPassword(input.password, account.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
      const session = createLocalSession({ id: account.id, openId: `local:${account.username}`, username: account.username, name: account.name, role: account.role === "admin" ? "admin" : "user" }, ENV.cookieSecret);
      ctx.res.cookie(LOCAL_SESSION_COOKIE, session, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 12 });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, { ...cookieOptions, maxAge: 0 });
      return { success: true } as const;
    }),
  }),


  operators: router({ list: adminProcedure.query(() => listOperatorAccounts()), save: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(160), email: z.string().email().optional().or(z.literal("")), username: z.string().trim().min(3).max(80), password: z.string().min(8).max(200).optional(), role: z.enum(["tecnico", "operador", "admin"]) })).mutation(({ input }) => saveOperatorAccount({ ...input, passwordHash: input.password ? hashOperatorPassword(input.password) : undefined })), remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteOperatorAccount(input.id)) }),
  logs: router({ list: protectedProcedure.query(() => listOperationLogs()), create: protectedProcedure.input(z.object({ action: z.string().min(1).max(80), onu: z.string().max(80).optional(), commands: z.array(z.string().max(240)).max(100) })).mutation(({ ctx, input }) => insertOperationLog({ ...input, operatorOpenId: ctx.user.openId, operatorName: ctx.user.name || ctx.user.email || "operador" })) }),
  olt: router({
    liveSnapshot: protectedProcedure.query(() => getLiveOltSnapshot()),
    unconfiguredOnus: protectedProcedure.query(() => getUnconfiguredOnus()),
    ponAvailability: protectedProcedure.input(z.object({ pon: z.string().regex(/^\d+\/\d+\/\d+$/) })).query(({ input }) => getPonAvailability(input.pon)),
    config: protectedProcedure.query(() => getOltConfig()),
    networkConfig: protectedProcedure.query(() => getOltNetworkConfig()),
    terminal: protectedProcedure.input(z.object({ command: z.string().trim().min(1).max(4000) })).mutation(({ input }) => runOltTerminalCommand(input.command)),
    updateConfig: protectedProcedure.input(z.object({ host: z.string(), snmpPort: z.number(), telnetPort: z.number(), boards: z.string(), telnetUsername: z.string().max(80).optional(), telnetPassword: z.string().max(200).optional() })).mutation(({ input }) => updateOltConfig(input)),
    updateDescription: protectedProcedure.input(z.object({ onuId: z.string().regex(/^\d+\/\d+\/\d+:\d+$/, "Identificador de ONU inválido"), description: z.string().trim().min(1).max(64) })).mutation(({ input }) => updateOnuDescription(input.onuId, input.description)),
    moveOnu: protectedProcedure.input(z.object({ source: z.string().regex(/^\d+\/\d+\/\d+:\d+$/), targetPon: z.string().regex(/^\d+\/\d+\/\d+$/), targetOnuId: z.number().int().min(1).max(128), serial: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/) })).mutation(({ input }) => moveOnu(input)),
    authorizeUnconfigured: protectedProcedure.input(z.object({ pon: z.string().regex(/^\d+\/\d+\/\d+$/), serial: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/), onuId: z.number().int().min(1).max(128), description: z.string().max(64).optional(), commands: z.array(z.string().max(240)).max(100).optional() })).mutation(({ input }) => authorizeUnconfiguredOnu(input)),
    operatorAction: protectedProcedure.input(z.object({ action: z.enum(["authorize", "disable", "deauthorize", "reboot"]), onuId: z.string().regex(/^\d+\/\d+\/\d+:\d+$/, "Identificador de ONU inválido") })).mutation(({ input }) => executeOperatorAction(input.action, input.onuId)),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;

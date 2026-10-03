import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { authorizeUnconfiguredOnu, executeOperatorAction, moveOnu, getLiveOltSnapshot, getOltConfig, getPonAvailability, getUnconfiguredOnus, getOltNetworkConfig, runOltTerminalCommand, updateOltConfig, updateOnuDescription } from "./zteAdapter";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  olt: router({
    liveSnapshot: publicProcedure.query(() => getLiveOltSnapshot()),
    unconfiguredOnus: publicProcedure.query(() => getUnconfiguredOnus()),
    ponAvailability: publicProcedure.input(z.object({ pon: z.string().regex(/^\d+\/\d+\/\d+$/) })).query(({ input }) => getPonAvailability(input.pon)),
    config: publicProcedure.query(() => getOltConfig()),
    networkConfig: publicProcedure.query(() => getOltNetworkConfig()),
    terminal: publicProcedure.input(z.object({ command: z.string().trim().min(1).max(4000) })).mutation(({ input }) => runOltTerminalCommand(input.command)),
    updateConfig: publicProcedure.input(z.object({ host: z.string(), snmpPort: z.number(), telnetPort: z.number(), boards: z.string() })).mutation(({ input }) => updateOltConfig(input)),
    updateDescription: publicProcedure.input(z.object({ onuId: z.string().regex(/^\d+\/\d+\/\d+:\d+$/, "Identificador de ONU inválido"), description: z.string().trim().min(1).max(64) })).mutation(({ input }) => updateOnuDescription(input.onuId, input.description)),
    moveOnu: publicProcedure.input(z.object({ source: z.string().regex(/^\d+\/\d+\/\d+:\d+$/), targetPon: z.string().regex(/^\d+\/\d+\/\d+$/), targetOnuId: z.number().int().min(1).max(128), serial: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/) })).mutation(({ input }) => moveOnu(input)),
    authorizeUnconfigured: publicProcedure.input(z.object({ pon: z.string().regex(/^\d+\/\d+\/\d+$/), serial: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/), onuId: z.number().int().min(1).max(128), description: z.string().max(64).optional(), commands: z.array(z.string().max(240)).max(100).optional() })).mutation(({ input }) => authorizeUnconfiguredOnu(input)),
    operatorAction: publicProcedure.input(z.object({ action: z.enum(["authorize", "disable", "deauthorize", "reboot"]), onuId: z.string().regex(/^\d+\/\d+\/\d+:\d+$/, "Identificador de ONU inválido") })).mutation(({ input }) => executeOperatorAction(input.action, input.onuId)),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Security Dashboard Router — Admin-only real-time security monitoring
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides endpoints for:
 * - Real-time security event feed
 * - Security statistics and metrics
 * - Canary token status
 * - Penetration test mode control
 * - Dependency vulnerability scanning
 * - Incident response controls
 * - 2FA admin session management
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getSecurityDashboardData,
  enablePenTestMode,
  disablePenTestMode,
  isPenTestModeActive,
  getPenTestLog,
  runDependencyAudit,
  runFortressSweep,
  checkCanaryToken,
  plantCanaryToken,
  createAdmin2FASession,
  enforceAdmin2FA,
} from "./security-fortress";
import { runSecuritySweep } from "./security-hardening";
import { createLogger } from "./_core/logger.js";

const log = createLogger("SecurityDashboard");

export const securityDashboardRouter = router({
  /**
   * Get the full security dashboard data — events, stats, canary status.
   */
  overview: adminProcedure.query(async () => {
    return await getSecurityDashboardData(100);
  }),

  /**
   * Get recent security events with pagination.
   */
  events: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(50),
    }).optional())
    .query(async ({ input }) => {
      const data = await getSecurityDashboardData(input?.limit || 50);
      return data.recentEvents;
    }),

  /**
   * Get security statistics.
   */
  stats: adminProcedure.query(async () => {
    const data = await getSecurityDashboardData(0);
    return data.stats;
  }),

  /**
   * Check canary token integrity.
   */
  canaryStatus: adminProcedure.query(async () => {
    return await checkCanaryToken();
  }),

  /**
   * Plant a new canary token (if one doesn't exist).
   */
  plantCanary: adminProcedure.mutation(async () => {
    const result = await plantCanaryToken();
    return { success: result };
  }),

  /**
   * Run a manual security sweep (both base + fortress).
   */
  runSweep: adminProcedure.mutation(async () => {
    log.info("[SecurityDashboard] Manual security sweep triggered by admin");
    const [baseSweep, fortressSweep] = await Promise.all([
      runSecuritySweep(),
      runFortressSweep(),
    ]);
    return {
      base: baseSweep,
      fortress: fortressSweep,
    };
  }),

  /**
   * Run dependency vulnerability audit.
   */
  dependencyAudit: adminProcedure.mutation(async () => {
    log.info("[SecurityDashboard] Dependency audit triggered by admin");
    return await runDependencyAudit();
  }),

  /**
   * Enable penetration test mode for a specific user.
   */
  enablePenTest: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      enablePenTestMode(input.userId);
      log.warn(`[SecurityDashboard] Pen test mode ENABLED for user ${input.userId}`);
      return { enabled: true, userId: input.userId };
    }),

  /**
   * Disable penetration test mode and get results.
   */
  disablePenTest: adminProcedure.mutation(async () => {
    const results = disablePenTestMode();
    log.warn(`[SecurityDashboard] Pen test mode DISABLED. ${results.log.length} events captured.`);
    return {
      enabled: false,
      eventsLogged: results.log.length,
      log: results.log,
    };
  }),

  /**
   * Get current pen test status and log.
   */
  penTestStatus: adminProcedure.query(async () => {
    return {
      active: isPenTestModeActive(),
      eventsLogged: getPenTestLog().length,
      log: getPenTestLog(),
    };
  }),

  /**
   * Create a 2FA admin session for privileged operations.
   * Called after successful TOTP verification.
   */
  create2FASession: adminProcedure.mutation(async ({ ctx }) => {
    const token = createAdmin2FASession(ctx.user.id);
    return { sessionToken: token, expiresInMinutes: 10 };
  }),

  /**
   * Verify that a 2FA session is valid for a given operation.
   */
  verify2FASession: adminProcedure
    .input(z.object({
      sessionToken: z.string(),
      operation: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return await enforceAdmin2FA(ctx.user.id, input.operation, input.sessionToken);
    }),
});

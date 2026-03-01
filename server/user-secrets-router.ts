/**
 * ═══════════════════════════════════════════════════════════════════════════
 * User Secrets Router — Manage per-user encrypted API keys
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Allows users to store their own OpenAI API key so their chat/builder
 * calls use their personal rate limit pool instead of the system keys.
 *
 * Security:
 * - Keys are encrypted at rest using AES-256-GCM (same as credential vault)
 * - Keys are NEVER returned in full — only masked versions (sk-...xxxx)
 * - Validation: key must start with "sk-" and be at least 20 chars
 * - Only the owning user can access their own secrets
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { userSecrets } from "../drizzle/schema";
import { encrypt, decrypt } from "./fetcher-db";
import { TRPCError } from "@trpc/server";
import { getErrorMessage } from "./_core/errors.js";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Mask an API key for display: sk-proj-xxxx...xxxx (show first 7 + last 4) */
function maskApiKey(key: string): string {
  if (key.length < 12) return "sk-****";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

/** Validate that a string looks like an OpenAI API key */
function isValidOpenAIKey(key: string): boolean {
  return key.startsWith("sk-") && key.length >= 20;
}

/** Validate an API key by making a lightweight test call to OpenAI */
async function validateKeyWithOpenAI(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: "Invalid API key — authentication failed" };
    }

    if (response.status === 429) {
      // Key is valid but rate limited — that's fine, it works
      return { valid: true };
    }

    const body = await response.text().catch(() => "");
    return { valid: false, error: `OpenAI returned ${response.status}: ${body.slice(0, 200)}` };
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { valid: false, error: "Connection to OpenAI timed out — please try again" };
    }
    return { valid: false, error: `Failed to connect to OpenAI: ${getErrorMessage(err)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════════════════

export const userSecretsRouter = router({
  /**
   * Get the user's stored OpenAI API key (masked)
   */
  getOpenAIKey: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { hasKey: false, maskedKey: null, lastUsedAt: null };

    const rows = await db
      .select()
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, ctx.user.id),
          eq(userSecrets.secretType, "openai_api_key")
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return { hasKey: false, maskedKey: null, lastUsedAt: null };
    }

    const row = rows[0];
    try {
      const decrypted = decrypt(row.encryptedValue);
      return {
        hasKey: true,
        maskedKey: maskApiKey(decrypted),
        lastUsedAt: row.lastUsedAt?.toISOString() || null,
      };
    } catch {
      // Decryption failed — key is corrupted, treat as not set
      return { hasKey: false, maskedKey: null, lastUsedAt: null };
    }
  }),

  /**
   * Save or update the user's OpenAI API key
   */
  saveOpenAIKey: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(20, "API key must be at least 20 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate format
      if (!isValidOpenAIKey(input.apiKey)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid API key format. OpenAI keys start with 'sk-' and are at least 20 characters.",
        });
      }

      // Validate with OpenAI
      const validation = await validateKeyWithOpenAI(input.apiKey);
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.error || "API key validation failed",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const encrypted = encrypt(input.apiKey);

      // Check if user already has a key
      const existing = await db
        .select({ id: userSecrets.id })
        .from(userSecrets)
        .where(
          and(
            eq(userSecrets.userId, ctx.user.id),
            eq(userSecrets.secretType, "openai_api_key")
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(userSecrets)
          .set({
            encryptedValue: encrypted,
            label: maskApiKey(input.apiKey),
          })
          .where(eq(userSecrets.id, existing[0].id));
      } else {
        // Insert new
        await db.insert(userSecrets).values({
          userId: ctx.user.id,
          secretType: "openai_api_key",
          encryptedValue: encrypted,
          label: maskApiKey(input.apiKey),
        });
      }

      return {
        success: true,
        maskedKey: maskApiKey(input.apiKey),
      };
    }),

  /**
   * Delete the user's OpenAI API key
   */
  deleteOpenAIKey: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    await db
      .delete(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, ctx.user.id),
          eq(userSecrets.secretType, "openai_api_key")
        )
      );

    return { success: true };
  }),

  /**
   * Test the user's stored API key (makes a lightweight call to OpenAI)
   */
  testOpenAIKey: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    const rows = await db
      .select()
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, ctx.user.id),
          eq(userSecrets.secretType, "openai_api_key")
        )
      )
      .limit(1);

    if (rows.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No API key stored" });
    }

    let decrypted: string;
    try {
      decrypted = decrypt(rows[0].encryptedValue);
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to decrypt stored key" });
    }

    const validation = await validateKeyWithOpenAI(decrypted);

    // Update lastUsedAt on successful test
    if (validation.valid) {
      await db
        .update(userSecrets)
        .set({ lastUsedAt: new Date() })
        .where(eq(userSecrets.id, rows[0].id));
    }

    return {
      valid: validation.valid,
      error: validation.error || null,
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // GitHub PAT Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the user's stored GitHub PAT (masked)
   */
  getGithubPat: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { hasPat: false, maskedPat: null };

    const rows = await db
      .select({ id: userSecrets.id, label: userSecrets.label })
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, ctx.user.id),
          eq(userSecrets.secretType, "github_pat")
        )
      )
      .limit(1);

    return {
      hasPat: rows.length > 0,
      maskedPat: rows.length > 0 ? rows[0].label : null,
    };
  }),

  /**
   * Save the user's GitHub Personal Access Token
   */
  saveGithubPat: protectedProcedure
    .input(z.object({ pat: z.string().min(10) }))
    .mutation(async ({ input, ctx }) => {
      // Validate the PAT by making a test call to GitHub
      try {
        const testResp = await fetch("https://api.github.com/user", {
          headers: { Authorization: `token ${input.pat}`, "User-Agent": "ArchibaldTitan" },
          signal: AbortSignal.timeout(10000),
        });
        if (!testResp.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid GitHub PAT — GitHub returned ${testResp.status}. Make sure the token has 'repo' scope.`,
          });
        }
        const userData = await testResp.json() as any;
        const githubUsername = userData.login || "unknown";

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const encrypted = encrypt(input.pat);
        const maskedPat = `ghp_...${input.pat.slice(-4)} (${githubUsername})`;

        // Check if user already has a GitHub PAT
        const existing = await db
          .select({ id: userSecrets.id })
          .from(userSecrets)
          .where(
            and(
              eq(userSecrets.userId, ctx.user.id),
              eq(userSecrets.secretType, "github_pat")
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(userSecrets)
            .set({ encryptedValue: encrypted, label: maskedPat })
            .where(eq(userSecrets.id, existing[0].id));
        } else {
          await db.insert(userSecrets).values({
            userId: ctx.user.id,
            secretType: "github_pat",
            encryptedValue: encrypted,
            label: maskedPat,
          });
        }

        return { success: true, maskedPat, githubUsername };
      } catch (err: unknown) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "BAD_REQUEST", message: `GitHub PAT validation failed: ${getErrorMessage(err)}` });
      }
    }),

  /**
   * Delete the user's GitHub PAT
   */
  deleteGithubPat: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    await db
      .delete(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, ctx.user.id),
          eq(userSecrets.secretType, "github_pat")
        )
      );

    return { success: true };
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper for chat-router: Get decrypted user API key (returns null if not set)
// ═══════════════════════════════════════════════════════════════════════════

export async function getUserOpenAIKey(userId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, userId),
          eq(userSecrets.secretType, "openai_api_key")
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const decrypted = decrypt(rows[0].encryptedValue);

    // Update lastUsedAt asynchronously (fire and forget)
    db.update(userSecrets)
      .set({ lastUsedAt: new Date() })
      .where(eq(userSecrets.id, rows[0].id))
      .catch(() => {}); // ignore errors

    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Get the user's stored GitHub PAT from their vault (decrypted).
 * Returns null if not set or decryption fails.
 */
export async function getUserGithubPat(userId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, userId),
          eq(userSecrets.secretType, "github_pat")
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const decrypted = decrypt(rows[0].encryptedValue);

    // Update lastUsedAt asynchronously (fire and forget)
    db.update(userSecrets)
      .set({ lastUsedAt: new Date() })
      .where(eq(userSecrets.id, rows[0].id))
      .catch(() => {}); // ignore errors

    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Get any user secret by type from their vault (decrypted).
 * Supports: "openai_api_key", "github_pat", "stripe_secret_key", etc.
 */
export async function getUserSecret(userId: number, secretType: string): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(userSecrets)
      .where(
        and(
          eq(userSecrets.userId, userId),
          eq(userSecrets.secretType, secretType)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const decrypted = decrypt(rows[0].encryptedValue);

    db.update(userSecrets)
      .set({ lastUsedAt: new Date() })
      .where(eq(userSecrets.id, rows[0].id))
      .catch(() => {});

    return decrypted;
  } catch {
    return null;
  }
}

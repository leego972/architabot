import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import * as db from "../db";
import { getDb } from "../db";
import { identityProviders, users } from "../../drizzle/schema";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { createLogger } from "./logger.js";
const log = createLogger("OAuth");

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Auto-link an OAuth provider to the user's identity_providers table.
 * If already linked, just update lastUsedAt.
 */
async function autoLinkProvider(
  userId: number,
  provider: string,
  providerAccountId: string,
  email: string | null,
  displayName: string | null
) {
  const database = await getDb();
  if (!database) return;

  try {
    const existing = await database
      .select()
      .from(identityProviders)
      .where(
        and(
          eq(identityProviders.userId, userId),
          eq(identityProviders.provider, provider),
          eq(identityProviders.providerAccountId, providerAccountId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Already linked — update lastUsedAt
      await database
        .update(identityProviders)
        .set({ lastUsedAt: new Date() })
        .where(eq(identityProviders.id, existing[0].id));
    } else {
      // Link new provider
      await database.insert(identityProviders).values({
        userId,
        provider,
        providerAccountId,
        email,
        displayName,
        linkedAt: new Date(),
        lastUsedAt: new Date(),
      });
    }
  } catch (error) {
    log.error("[OAuth] Failed to auto-link provider:", { error: String(error) });
    // Non-fatal — don't block login
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      // Get the user ID for provider linking
      const user = await db.getUserByOpenId(userInfo.openId);

      // Determine the OAuth provider name
      const providerName = (userInfo.loginMethod ?? userInfo.platform ?? "manus").toLowerCase();

      // Auto-link this OAuth provider to the user's identity
      if (user) {
        await autoLinkProvider(
          user.id,
          providerName,
          userInfo.openId,
          userInfo.email ?? null,
          userInfo.name || null
        );
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/dashboard");
    } catch (error) {
      log.error("[OAuth] Callback failed", { error: String(error) });
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

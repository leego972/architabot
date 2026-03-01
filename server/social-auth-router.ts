/**
 * Independent Social OAuth Router
 * 
 * Direct GitHub and Google OAuth flows — no Manus proxy.
 * Creates/links users and issues JWT sessions identical to email auth.
 * 
 * Cross-domain flow (when PUBLIC_URL differs from MANUS_ORIGIN):
 *   1. User on archibaldtitan.com clicks "Sign in with Google"
 *   2. Browser goes to archibaldtitan.com/api/auth/google (relative URL)
 *   3. Server redirects to Google with callback = manus.space (registered domain)
 *   4. Google redirects back to manus.space/api/auth/google/callback
 *   5. Server creates a one-time token, redirects to archibaldtitan.com/api/auth/token-exchange?token=XXX
 *   6. Token-exchange endpoint sets the session cookie on archibaldtitan.com and redirects to /dashboard
 * 
 * STATE MANAGEMENT (v9.0.1 — bulletproof):
 *   OAuth state is validated using a DUAL-LAYER approach:
 *   Layer 1: In-memory Map (fast, works when server stays up)
 *   Layer 2: Signed httpOnly cookie (survives server restarts & redeployments)
 *   If either layer validates, the login proceeds. This eliminates the
 *   "Invalid or expired state" error caused by Railway redeployments.
 */

import { Express, Request, Response } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { users, identityProviders } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { ENV } from "./_core/env";
import { createLogger } from "./_core/logger.js";
const log = createLogger("SocialAuthRouter");

// ─── Origin Helpers ──────────────────────────────────────────────
// Both archibaldtitan.com and manus.space are registered in Google/GitHub OAuth console.
// On Railway, PUBLIC_URL = https://www.archibaldtitan.com, so callbacks go directly there.
const MANUS_ORIGIN = "https://archibaldtitan.com";

function getOAuthCallbackOrigin(): string {
  // Use PUBLIC_URL as callback origin (archibaldtitan.com is registered with Google/GitHub)
  if (ENV.publicUrl) return ENV.publicUrl.replace(/\/$/, "");
  return MANUS_ORIGIN;
}

function getPublicOrigin(): string {
  if (ENV.publicUrl) return ENV.publicUrl.replace(/\/$/, "");
  return MANUS_ORIGIN;
}

// ─── Admin Auto-Promotion Helper ────────────────────────────────
/**
 * Determines if a user should be auto-promoted to admin.
 * Checks: OWNER_OPEN_ID match, OWNER_EMAIL match, or user ID 1 (first user).
 */
function shouldBeAdmin(openId: string | null, email: string | null, userId: number): boolean {
  // Match by OWNER_OPEN_ID
  if (ENV.ownerOpenId && openId === ENV.ownerOpenId) return true;
  // Match by OWNER_EMAILS list
  if (ENV.ownerEmails && email && ENV.ownerEmails.includes(email.toLowerCase())) return true;
  // First user (ID 1) is always the platform owner
  if (userId === 1) return true;
  return false;
}

// ─── CSRF State Store (Layer 1: In-Memory) ────────────────────────
const pendingStates = new Map<string, { provider: string; returnPath: string; expiresAt: number; mode: string }>();

// ─── One-Time Token Store (for cross-domain cookie transfer) ──────
const pendingTokens = new Map<string, { sessionToken: string; returnPath: string; expiresAt: number }>();

// Cleanup expired states and tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of Array.from(pendingStates.entries())) {
    if (now > val.expiresAt) pendingStates.delete(key);
  }
  for (const [key, val] of Array.from(pendingTokens.entries())) {
    if (now > val.expiresAt) pendingTokens.delete(key);
  }
}, 5 * 60 * 1000);

// ─── Cookie-Based State (Layer 2: Survives Restarts) ──────────────
// HMAC-sign the state payload so it can't be forged.
const STATE_COOKIE_NAME = "oauth_state";
const STATE_TTL_MS = 30 * 60 * 1000; // 30 minutes — generous for mobile

/**
 * Derive a signing key from available secrets.
 * Falls back to a stable hash of the GitHub client secret if no dedicated key exists.
 */
function getStateSigningKey(): string {
  return ENV.githubClientSecret || ENV.googleClientSecret || "archibald-titan-fallback-key";
}

/**
 * Create an HMAC signature for the state payload.
 */
function signStatePayload(payload: string): string {
  return crypto.createHmac("sha256", getStateSigningKey()).update(payload).digest("hex");
}

/**
 * Build a signed cookie value containing the OAuth state metadata.
 * Format: base64(JSON) + "." + hmac
 */
function buildStateCookie(data: { state: string; provider: string; returnPath: string; mode: string; expiresAt: number }): string {
  const json = JSON.stringify(data);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = signStatePayload(b64);
  return `${b64}.${sig}`;
}

/**
 * Parse and verify a signed state cookie.
 * Returns null if invalid, tampered, or expired.
 */
function parseStateCookie(cookieValue: string | undefined): { state: string; provider: string; returnPath: string; mode: string; expiresAt: number } | null {
  if (!cookieValue) return null;
  try {
    const [b64, sig] = cookieValue.split(".");
    if (!b64 || !sig) return null;
    const expectedSig = signStatePayload(b64);
    // Timing-safe comparison to prevent timing attacks
    if (sig.length !== expectedSig.length) return null;
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const json = Buffer.from(b64, "base64url").toString("utf-8");
    const data = JSON.parse(json);
    if (Date.now() > data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Validate OAuth state using dual-layer approach.
 * Returns the state metadata if valid from either layer, or null if both fail.
 */
function validateOAuthState(
  stateParam: string,
  provider: string,
  req: Request
): { returnPath: string; mode: string; source: string } | null {
  // Layer 1: In-memory Map (fast path)
  const memState = pendingStates.get(stateParam);
  if (memState && memState.provider === provider) {
    pendingStates.delete(stateParam);
    if (Date.now() <= memState.expiresAt) {
      log.info(`[OAuth State] Validated via in-memory map (provider=${provider})`);
      return { returnPath: memState.returnPath, mode: memState.mode, source: "memory" };
    }
  }

  // Layer 2: Signed cookie (survives server restarts/redeployments)
  const cookies = req.cookies || {};
  const cookieVal = cookies[STATE_COOKIE_NAME];
  const cookieState = parseStateCookie(cookieVal);
  if (cookieState && cookieState.state === stateParam && cookieState.provider === provider) {
    log.info(`[OAuth State] Validated via signed cookie (provider=${provider}) — server likely restarted since auth started`);
    return { returnPath: cookieState.returnPath, mode: cookieState.mode, source: "cookie" };
  }

  // Both layers failed
  log.warn(`[OAuth State] BOTH layers failed for provider=${provider}, state=${stateParam.substring(0, 8)}...`);
  return null;
}

// ─── GitHub OAuth Helpers ──────────────────────────────────────────

async function exchangeGitHubCode(code: string, redirectUri: string): Promise<{ access_token: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: ENV.githubClientId,
      client_secret: ENV.githubClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`GitHub token exchange failed: ${data.error_description || data.error}`);
  return data;
}

async function getGitHubUser(accessToken: string): Promise<{ id: number; login: string; name: string | null; email: string | null; avatar_url: string }> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  const user = await res.json();
  if (!user.email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = emails.find((e: any) => e.primary && e.verified);
      if (primary) user.email = primary.email;
      else {
        const verified = emails.find((e: any) => e.verified);
        if (verified) user.email = verified.email;
      }
    }
  }
  return user;
}

// ─── Google OAuth Helpers ──────────────────────────────────────────

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{ access_token: string; id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Google token exchange failed: ${data.error_description || data.error}`);
  return data;
}

async function getGoogleUser(accessToken: string): Promise<{ sub: string; name: string; email: string; picture: string; email_verified: boolean }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google user info");
  return res.json();
}

// ─── Shared: Find or Create User ───────────────────────────────────

async function findOrCreateOAuthUser(opts: {
  provider: string;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}): Promise<{ userId: number; openId: string; name: string; isNew: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingLink = await db
    .select({ userId: identityProviders.userId })
    .from(identityProviders)
    .where(and(eq(identityProviders.provider, opts.provider), eq(identityProviders.providerAccountId, opts.providerAccountId)))
    .limit(1);

  if (existingLink.length > 0) {
    const user = await db.select().from(users).where(eq(users.id, existingLink[0].userId)).limit(1);
    if (user.length > 0) {
      await db.update(identityProviders).set({ lastUsedAt: new Date() }).where(and(eq(identityProviders.provider, opts.provider), eq(identityProviders.providerAccountId, opts.providerAccountId)));
      // Auto-promote to admin on login if email matches owner
      const updateFields: Record<string, unknown> = { lastSignedIn: new Date() };
      if (user[0].role !== "admin" && shouldBeAdmin(user[0].openId, user[0].email, user[0].id)) {
        updateFields.role = "admin";
        log.info(`[Auth] Auto-promoted existing user to admin on login: ${user[0].email || user[0].openId}`);
      }
      await db.update(users).set(updateFields).where(eq(users.id, user[0].id));
      const effectiveRole = (updateFields.role as string) || user[0].role;
      return { userId: user[0].id, openId: user[0].openId, name: user[0].name || "", isNew: false };
    }
  }

  if (opts.email) {
    const existingUser = await db.select().from(users).where(eq(users.email, opts.email.toLowerCase())).limit(1);
    if (existingUser.length > 0) {
      await db.insert(identityProviders).values({
        userId: existingUser[0].id, provider: opts.provider, providerAccountId: opts.providerAccountId,
        email: opts.email, displayName: opts.name, avatarUrl: opts.avatarUrl, linkedAt: new Date(), lastUsedAt: new Date(),
      });
      // Auto-promote to admin on login if email matches owner
      const updateFields: Record<string, unknown> = { lastSignedIn: new Date() };
      if (existingUser[0].role !== "admin" && shouldBeAdmin(existingUser[0].openId, existingUser[0].email, existingUser[0].id)) {
        updateFields.role = "admin";
        log.info(`[Auth] Auto-promoted existing user to admin on login: ${existingUser[0].email || existingUser[0].openId}`);
      }
      await db.update(users).set(updateFields).where(eq(users.id, existingUser[0].id));
      return { userId: existingUser[0].id, openId: existingUser[0].openId, name: existingUser[0].name || "", isNew: false };
    }
  }

  const openId = `${opts.provider}_${crypto.randomUUID().replace(/-/g, "")}`;

  // Auto-promote to admin: match by OWNER_OPEN_ID, OWNER_EMAIL, or first user
  let role: "admin" | "user" = "user";
  if (openId === ENV.ownerOpenId) {
    role = "admin";
  } else if (ENV.ownerEmails && opts.email && ENV.ownerEmails.includes(opts.email.toLowerCase())) {
    role = "admin";
  } else {
    // First user auto-admin: if no users exist yet, this is the platform owner
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length === 0) {
      role = "admin";
      log.info(`[Auth] First user auto-promoted to admin: ${opts.email || openId}`);
    }
  }
  const displayName = opts.name || (opts.email ? opts.email.split("@")[0] : "User");

  await db.insert(users).values({
    openId, name: displayName, email: opts.email?.toLowerCase() || null,
    loginMethod: opts.provider, role, emailVerified: true, lastSignedIn: new Date(),
  });

  const newUser = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (newUser.length === 0) throw new Error("Failed to create user");

  await db.insert(identityProviders).values({
    userId: newUser[0].id, provider: opts.provider, providerAccountId: opts.providerAccountId,
    email: opts.email, displayName: opts.name, avatarUrl: opts.avatarUrl, linkedAt: new Date(), lastUsedAt: new Date(),
  });

  return { userId: newUser[0].id, openId, name: displayName, isNew: true };
}

// ─── Helper: Issue session and redirect (handles cross-domain) ────

async function issueSessionAndRedirect(
  req: Request, res: Response,
  result: { userId: number; openId: string; name: string; isNew: boolean },
  returnPath: string, logPrefix: string, logDetail: string
) {
  const sessionToken = await sdk.createSessionToken(result.openId, { name: result.name, expiresInMs: ONE_YEAR_MS });
  const publicOrigin = getPublicOrigin();
  const callbackOrigin = getOAuthCallbackOrigin();
  // On Railway, callbackOrigin == publicOrigin (both archibaldtitan.com), so no cross-domain needed
  // Cross-domain only applies when running on manus.space with a different public domain
  const isCrossDomain = callbackOrigin !== publicOrigin;
  log.info(`[Auth] publicOrigin=${publicOrigin}, callbackOrigin=${callbackOrigin}, isCrossDomain=${isCrossDomain}`);

  // Clear the OAuth state cookie now that login is complete
  res.clearCookie(STATE_COOKIE_NAME, { path: "/", httpOnly: true });

  if (isCrossDomain) {
    const oneTimeToken = crypto.randomBytes(32).toString("hex");
    pendingTokens.set(oneTimeToken, { sessionToken, returnPath, expiresAt: Date.now() + 2 * 60 * 1000 });
    log.info(`${logPrefix} ${logDetail} → user ${result.userId} (${result.isNew ? "new" : "existing"}) → cross-domain token exchange`);
    return res.redirect(302, `${publicOrigin}/api/auth/token-exchange?token=${oneTimeToken}&returnPath=${encodeURIComponent(returnPath)}`);
  } else {
    const cookieOptions = getSessionCookieOptions(req);
    log.info(`[Auth] Cookie options: ${JSON.stringify(cookieOptions)}, cookieName=${COOKIE_NAME}, tokenLength=${sessionToken.length}`);
    log.info(`[Auth] req.protocol=${req.protocol}, x-forwarded-proto=${req.headers['x-forwarded-proto']}, hostname=${req.hostname}`);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    log.info(`${logPrefix} ${logDetail} → user ${result.userId} (${result.isNew ? "new" : "existing"}) → redirecting to ${publicOrigin}${returnPath}`);
    return res.redirect(302, `${publicOrigin}${returnPath}`);
  }
}

// ─── Helper: Redirect to login with error (user-friendly) ─────────

function redirectToLoginWithError(res: Response, message: string): void {
  const publicOrigin = getPublicOrigin();
  res.redirect(302, `${publicOrigin}/login?error=${encodeURIComponent(message)}`);
}

// ─── Route Registration ────────────────────────────────────────────

export function registerSocialAuthRoutes(app: Express) {


  // ─── GET /api/auth/token-exchange ────────────────────────────────
  app.get("/api/auth/token-exchange", (req: Request, res: Response) => {
    const token = req.query.token as string;
    const returnPath = (req.query.returnPath as string) || "/dashboard";
    if (!token) return res.status(400).send("Missing token parameter");

    const pending = pendingTokens.get(token);
    if (!pending) {
      log.warn("[Token Exchange] Invalid or expired token");
      return redirectToLoginWithError(res, "Login session expired. Please try again.");
    }
    pendingTokens.delete(token);

    if (Date.now() > pending.expiresAt) {
      log.warn("[Token Exchange] Token expired");
      return redirectToLoginWithError(res, "Login session expired. Please try again.");
    }

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, pending.sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    log.info(`[Token Exchange] Session cookie set, redirecting to ${returnPath}`);
    return res.redirect(302, returnPath);
  });

  // ─── GET /api/auth/github ─────────────────────────────────────────
  app.get("/api/auth/github", (req: Request, res: Response) => {
    const returnPath = (req.query.returnPath as string) || "/dashboard";
    const mode = (req.query.mode as string) || "login";
    const state = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + STATE_TTL_MS;

    // Layer 1: Store in memory
    pendingStates.set(state, { provider: "github", returnPath, expiresAt, mode });

    // Layer 2: Store in signed httpOnly cookie (survives server restarts)
    const cookieVal = buildStateCookie({ state, provider: "github", returnPath, mode, expiresAt });
    res.cookie(STATE_COOKIE_NAME, cookieVal, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
      maxAge: STATE_TTL_MS,
    });

    const callbackOrigin = getOAuthCallbackOrigin();
    const params = new URLSearchParams({
      client_id: ENV.githubClientId,
      redirect_uri: `${callbackOrigin}/api/auth/github/callback`,
      scope: "read:user user:email",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // ─── GET /api/auth/github/callback ────────────────────────────────
  app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    if (!code || !state) {
      return redirectToLoginWithError(res, "Login failed — missing parameters. Please try again.");
    }

    // Dual-layer state validation
    const validated = validateOAuthState(state, "github", req);
    if (!validated) {
      log.warn(`[Social Auth] GitHub state validation failed (both layers). Redirecting to login.`);
      return redirectToLoginWithError(res, "Your login session expired (likely due to a server update). Please try again — it will work immediately.");
    }

    // Clear the state cookie
    res.clearCookie(STATE_COOKIE_NAME, { path: "/", httpOnly: true });

    try {
      const callbackOrigin = getOAuthCallbackOrigin();
      const redirectUri = `${callbackOrigin}/api/auth/github/callback`;
      const tokenData = await exchangeGitHubCode(code, redirectUri);
      const ghUser = await getGitHubUser(tokenData.access_token);

      const result = await findOrCreateOAuthUser({
        provider: "github", providerAccountId: String(ghUser.id),
        email: ghUser.email, name: ghUser.name || ghUser.login, avatarUrl: ghUser.avatar_url,
      });

      await issueSessionAndRedirect(req, res, result, validated.returnPath, "[Social Auth]", `GitHub login: ${ghUser.login} (${ghUser.email})`);
    } catch (error: unknown) {
      log.error("[Social Auth] GitHub callback failed:", { error: String(error) });
      redirectToLoginWithError(res, "GitHub login failed. Please try again.");
    }
  });

  // ─── GET /api/auth/google ─────────────────────────────────────────
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const returnPath = (req.query.returnPath as string) || "/dashboard";
    const mode = (req.query.mode as string) || "login";
    const state = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + STATE_TTL_MS;

    // Layer 1: Store in memory
    pendingStates.set(state, { provider: "google", returnPath, expiresAt, mode });

    // Layer 2: Store in signed httpOnly cookie (survives server restarts)
    const cookieVal = buildStateCookie({ state, provider: "google", returnPath, mode, expiresAt });
    res.cookie(STATE_COOKIE_NAME, cookieVal, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
      maxAge: STATE_TTL_MS,
    });

    const callbackOrigin = getOAuthCallbackOrigin();
    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: `${callbackOrigin}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // ─── GET /api/auth/google/callback ────────────────────────────────
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    if (!code || !state) {
      return redirectToLoginWithError(res, "Login failed — missing parameters. Please try again.");
    }

    // Dual-layer state validation
    const validated = validateOAuthState(state, "google", req);
    if (!validated) {
      log.warn(`[Social Auth] Google state validation failed (both layers). Redirecting to login.`);
      return redirectToLoginWithError(res, "Your login session expired (likely due to a server update). Please try again — it will work immediately.");
    }

    // Clear the state cookie
    res.clearCookie(STATE_COOKIE_NAME, { path: "/", httpOnly: true });

    try {
      const callbackOrigin = getOAuthCallbackOrigin();
      const redirectUri = `${callbackOrigin}/api/auth/google/callback`;
      const tokenData = await exchangeGoogleCode(code, redirectUri);
      const googleUser = await getGoogleUser(tokenData.access_token);

      const result = await findOrCreateOAuthUser({
        provider: "google", providerAccountId: googleUser.sub,
        email: googleUser.email, name: googleUser.name, avatarUrl: googleUser.picture,
      });

      await issueSessionAndRedirect(req, res, result, validated.returnPath, "[Social Auth]", `Google login: ${googleUser.email}`);
    } catch (error: unknown) {
      log.error("[Social Auth] Google callback failed:", { error: String(error) });
      redirectToLoginWithError(res, "Google login failed. Please try again.");
    }
  });
}

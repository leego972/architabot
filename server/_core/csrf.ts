/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * How it works:
 * 1. On every response, we set a `csrf_token` cookie (non-httpOnly so JS can read it)
 * 2. The client reads the cookie and sends it back as `x-csrf-token` header on mutations
 * 3. The server middleware compares the cookie value with the header value
 * 4. If they don't match (or are missing), the request is rejected
 *
 * This works because:
 * - An attacker on a different origin cannot read our cookies (Same-Origin Policy)
 * - So they can't set the matching header
 * - Combined with SameSite=Lax cookies, this provides robust CSRF protection
 *
 * Exemptions:
 * - Webhook endpoints (Stripe, Binance) — they use signature verification
 * - API key-authenticated requests — they don't use cookies
 * - GET/HEAD/OPTIONS requests — safe methods
 */

import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger } from "./logger.js";

const log = createLogger("CSRF");

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const TOKEN_LENGTH = 32; // 256 bits

/** Paths exempt from CSRF validation (webhooks use their own signature verification, auth routes use passwords/tokens) */
const EXEMPT_PATHS = [
  // Webhooks — use signature verification
  "/api/stripe-webhook",
  "/api/binance-pay/webhook",
  "/api/health",
  "/api/desktop/",
  // Auth routes — use password/token auth, not cookie-based sessions
  // These MUST be exempt because the login/register forms can't send CSRF headers
  // before the user has a session (chicken-and-egg problem)
  "/api/auth/",
  // OAuth callback routes
  "/api/oauth/",
  // GitHub release sync webhook
  "/api/releases/",
  // File upload routes — use multipart form data which can't easily include CSRF headers
  // These are authenticated via session cookies and only accept file data
  "/api/chat/upload",
  "/api/voice/upload",
];

/** Check if a path is exempt from CSRF */
function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((p) => path.startsWith(p));
}

/** Check if the request uses API key auth instead of cookies */
function usesApiKeyAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  return !!(authHeader && authHeader.startsWith("Bearer "));
}

/** Safe HTTP methods that don't need CSRF protection */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Generate a cryptographically random CSRF token.
 */
function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Middleware: Set CSRF cookie on every response if not already present.
 */
export function csrfCookieMiddleware(req: Request, res: Response, next: NextFunction) {
  // If no CSRF cookie exists, generate one
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // Client JS must be able to read this
      secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  }
  next();
}

/**
 * Middleware: Validate CSRF token on mutation requests.
 * Must be applied AFTER cookie-parser or equivalent.
 */
export function csrfValidationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip safe methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip exempt paths (webhooks, auth routes)
  // Use req.originalUrl because when mounted via app.use('/api/', ...),
  // req.path is relative to the mount point (e.g., /auth/login instead of /api/auth/login)
  if (isExempt(req.originalUrl || req.path)) {
    return next();
  }

  // Skip API key-authenticated requests
  if (usesApiKeyAuth(req)) {
    return next();
  }

  // Get token from cookie and header
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  // Both must be present and match
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    log.warn("CSRF validation failed", {
      path: req.path,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
      ip: req.ip,
    });
    return res.status(403).json({ error: "CSRF token validation failed" });
  }

  next();
}

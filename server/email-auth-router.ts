/**
 * Email/Password Authentication Router
 * 
 * Provides register and login endpoints that create the same JWT session
 * as Manus OAuth, so the rest of the app works identically.
 */

import { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, isNotNull, gt } from "drizzle-orm";
import { getDb } from "./db";
import { users, passwordResetTokens, identityProviders } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email-service";
import { createLogger } from "./_core/logger.js";
import { checkGeoAnomaly, trackIncident } from "./security-fortress";
import { logSecurityEvent } from "./security-hardening";
const log = createLogger("EmailAuthRouter");

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Behind a reverse proxy, req.protocol/host return internal URLs.
function getPublicOrigin(req: Request): string {
  // 1. Use explicit PUBLIC_URL env var if set (most reliable)
  if (ENV.publicUrl) return ENV.publicUrl.replace(/\/$/, "");
  // 2. Use req.hostname which respects trust proxy setting
  const proto = req.protocol || "https";
  const host = req.hostname || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

// ─── Rate Limiting ──────────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

// ─── Pending 2FA Logins ─────────────────────────────────────────────
interface PendingTwoFactorLogin {
  userId: number;
  openId: string;
  name: string;
  email: string;
  expiresAt: number;
}
const pendingTwoFactorLogins = new Map<string, PendingTwoFactorLogin>();

// Cleanup expired 2FA tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of Array.from(pendingTwoFactorLogins.entries())) {
    if (now > val.expiresAt) pendingTwoFactorLogins.delete(key);
  }
}, 5 * 60 * 1000);

function getRateLimitKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`;
}

function checkRateLimit(ip: string, email: string): { allowed: boolean; retryAfterMs?: number } {
  const key = getRateLimitKey(ip, email);
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record) return { allowed: true };

  // Check if locked out
  if (record.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, retryAfterMs: record.lockedUntil - now };
  }

  // Reset if window has passed
  if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    return { allowed: false, retryAfterMs: LOCKOUT_DURATION_MS };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string, email: string): void {
  const key = getRateLimitKey(ip, email);
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

function clearFailedAttempts(ip: string, email: string): void {
  loginAttempts.delete(getRateLimitKey(ip, email));
}

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(loginAttempts.entries());
  for (const [key, record] of entries) {
    if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS * 2) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function generateResetToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function registerEmailAuthRoutes(app: Express) {
  // ─── POST /api/auth/register ─────────────────────────────────────
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body || {};

      // Validate inputs
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      if (!validateEmail(email.trim())) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if email already exists
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Generate a unique openId for email users
      const openId = `email_${crypto.randomUUID().replace(/-/g, "")}`;

      // Determine role — check OWNER_OPEN_ID, OWNER_EMAIL, or first user
      let role: "admin" | "user" = "user";
      if (openId === ENV.ownerOpenId) {
        role = "admin";
      } else if (ENV.ownerEmails && ENV.ownerEmails.includes(normalizedEmail)) {
        role = "admin";
      } else {
        // First user auto-admin
        const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
        if (existingUsers.length === 0) {
          role = "admin";
          log.info(`[EmailAuth] First user auto-promoted to admin: ${normalizedEmail}`);
        }
      }

      // Generate email verification token
      const verificationToken = crypto.randomBytes(48).toString("hex");
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      await db.insert(users).values({
        openId,
        name: name?.trim() || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        loginMethod: "email",
        passwordHash,
        role,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
        lastSignedIn: new Date(),
      });

      // Create session token (same as OAuth flow)
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name?.trim() || normalizedEmail.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Fetch the created user to return
      const newUser = await db
        .select()
        .from(users)
        .where(eq(users.openId, openId))
        .limit(1);

      // Auto-link email identity provider
      if (newUser[0]) {
        await db.insert(identityProviders).values({
          userId: newUser[0].id,
          provider: "email",
          providerAccountId: normalizedEmail,
          email: normalizedEmail,
          displayName: name?.trim() || normalizedEmail.split("@")[0],
          linkedAt: new Date(),
          lastUsedAt: new Date(),
        }).catch(() => {
          log.warn("[Email Auth] Failed to auto-link email provider");
        });
      }

      // Send verification email
      const baseUrl = req.headers.origin || getPublicOrigin(req);
      const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
      await sendVerificationEmail(
        normalizedEmail,
        name?.trim() || normalizedEmail.split("@")[0],
        verifyUrl
      ).catch(() => {
        log.warn("[Email Auth] Failed to send verification email");
      });

      return res.json({
        success: true,
        needsVerification: true,
        user: newUser[0] ? {
          id: newUser[0].id,
          name: newUser[0].name,
          email: newUser[0].email,
          role: newUser[0].role,
          emailVerified: false,
        } : null,
      });
    } catch (error: unknown) {
      log.error("[Email Auth] Registration failed:", { error: String(error) });
      return res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // ─── POST /api/auth/forgot-password ──────────────────────────
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email, origin } = req.body || {};

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email (email auth users only)
      const result = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.email, normalizedEmail),
            isNotNull(users.passwordHash)
          )
        )
        .limit(1);

      // Always return success to prevent email enumeration
      if (result.length === 0) {
        return res.json({ success: true, message: "If an account with that email exists, a password reset link has been sent." });
      }

      const user = result[0];

      // Generate reset token
      const token = generateResetToken();
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      // Store token in database
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      // Build reset URL
      const baseUrl = origin || req.headers.origin || getPublicOrigin(req);
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      // Send password reset email via email service
      await sendPasswordResetEmail(
        user.email!,
        user.name || user.email!,
        resetUrl
      ).catch(() => {
        log.warn("[Password Reset] Failed to send email");
      });

      log.info(`[Password Reset] Token generated for ${user.email}: ${resetUrl}`);

      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
        // Include resetUrl in response for development/testing
        // In production with real email, remove this
        resetUrl,
      });
    } catch (error: unknown) {
      log.error("[Password Reset] Request failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to process password reset request. Please try again." });
    }
  });

  // ─── POST /api/auth/verify-reset-token ─────────────────────
  app.post("/api/auth/verify-reset-token", async (req: Request, res: Response) => {
    try {
      const { token } = req.body || {};

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Token is required", valid: false });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available", valid: false });
      }

      // Find valid, unused, non-expired token
      const result = await db
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          expiresAt: passwordResetTokens.expiresAt,
          usedAt: passwordResetTokens.usedAt,
        })
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (result.length === 0) {
        return res.status(400).json({ error: "Invalid or expired reset link", valid: false });
      }

      const resetToken = result[0];

      if (resetToken.usedAt) {
        return res.status(400).json({ error: "This reset link has already been used", valid: false });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "This reset link has expired. Please request a new one.", valid: false });
      }

      // Get user email for display
      const userResult = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, resetToken.userId))
        .limit(1);

      return res.json({
        valid: true,
        email: userResult[0]?.email || "your account",
      });
    } catch (error: unknown) {
      log.error("[Password Reset] Token verification failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to verify token", valid: false });
    }
  });

  // ─── POST /api/auth/reset-password ────────────────────────
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body || {};

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Token is required" });
      }
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Find valid, unused, non-expired token
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (result.length === 0) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }

      const resetToken = result[0];

      if (resetToken.usedAt) {
        return res.status(400).json({ error: "This reset link has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Update user password
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, resetToken.userId));

      // Mark token as used
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      log.info(`[Password Reset] Password successfully reset for userId: ${resetToken.userId}`);

      return res.json({
        success: true,
        message: "Your password has been reset successfully. You can now sign in with your new password.",
      });
    } catch (error: unknown) {
      log.error("[Password Reset] Reset failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to reset password. Please try again." });
    }
  });

  // ─── POST /api/auth/login ───────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};

      // Validate inputs
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";

      // Check rate limit before any DB work
      const rateCheck = checkRateLimit(clientIp, normalizedEmail);
      if (!rateCheck.allowed) {
        const retryMinutes = Math.ceil((rateCheck.retryAfterMs || LOCKOUT_DURATION_MS) / 60000);
        return res.status(429).json({
          error: `Too many login attempts. Please try again in ${retryMinutes} minute${retryMinutes > 1 ? "s" : ""}.`,
          retryAfterMs: rateCheck.retryAfterMs,
        });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Find user by email with a password hash (email users only)
      const result = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.email, normalizedEmail),
            isNotNull(users.passwordHash)
          )
        )
        .limit(1);

      if (result.length === 0) {
        recordFailedAttempt(clientIp, normalizedEmail);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = result[0];

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash!);
      if (!isValid) {
        recordFailedAttempt(clientIp, normalizedEmail);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Successful login — clear failed attempts
      clearFailedAttempts(clientIp, normalizedEmail);

      // ── SECURITY: IP Geo-Anomaly Detection ──────────────────────
      const geoCheck = await checkGeoAnomaly(user.id, clientIp);
      if (geoCheck.suspicious) {
        log.warn(`[EmailAuth] Geo-anomaly for user ${user.id}: ${geoCheck.warning}`);
        await trackIncident(user.id, "impossible_travel", user.role === "admin");
        // Don't block — just log. The user might be using a VPN.
      }

      // ─── 2FA Challenge ──────────────────────────────────────────
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        // Don't create session yet — return a 2FA challenge
        // Generate a temporary 2FA token to identify this login attempt
        const twoFactorToken = crypto.randomBytes(32).toString("hex");
        // Store it temporarily (in-memory, expires in 5 minutes)
        pendingTwoFactorLogins.set(twoFactorToken, {
          userId: user.id,
          openId: user.openId,
          name: user.name || normalizedEmail.split("@")[0],
          email: normalizedEmail,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return res.json({
          success: false,
          requiresTwoFactor: true,
          twoFactorToken,
        });
      }

      // Update last sign in + auto-promote to admin if owner
      const loginUpdate: Record<string, unknown> = { lastSignedIn: new Date() };
      if (user.role !== "admin" && (
        (ENV.ownerEmails && ENV.ownerEmails.includes(normalizedEmail)) ||
        (user.openId === ENV.ownerOpenId) ||
        user.id === 1
      )) {
        loginUpdate.role = "admin";
        log.info(`[EmailAuth] Auto-promoted user to admin on login: ${normalizedEmail}`);
      }
      await db
        .update(users)
        .set(loginUpdate)
        .where(eq(users.id, user.id));

      // Create session token (same as OAuth flow)
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || normalizedEmail.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Update lastUsedAt on the email identity provider
      await db
        .update(identityProviders)
        .set({ lastUsedAt: new Date() })
        .where(
          and(
            eq(identityProviders.userId, user.id),
            eq(identityProviders.provider, "email"),
            eq(identityProviders.providerAccountId, normalizedEmail)
          )
        )
        .catch(() => {
          // Non-fatal — don't block login
        });

      return res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: unknown) {
      log.error("[Email Auth] Login failed:", { error: String(error) });
      return res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // ─── POST /api/auth/change-password ──────────────────────────
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body || {};

      if (!currentPassword || typeof currentPassword !== "string") {
        return res.status(400).json({ error: "Current password is required" });
      }
      if (!newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ error: "New password is required" });
      }
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      if (newPassword.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `New password must be at most ${MAX_PASSWORD_LENGTH} characters` });
      }

      // Get user from session
      let sessionUser;
      try {
        sessionUser = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!sessionUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Find user with password hash
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id))
        .limit(1);

      if (result.length === 0 || !result[0].passwordHash) {
        return res.status(400).json({ error: "Password change is not available for OAuth accounts. Please use your OAuth provider to manage your password." });
      }

      const user = result[0];

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash!);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash and update new password
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return res.json({ success: true, message: "Password changed successfully" });
    } catch (error: unknown) {
      log.error("[Email Auth] Change password failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to change password. Please try again." });
    }
  });

  // ─── POST /api/auth/set-password ──────────────────────────
  // For OAuth users who don't have a password yet — lets them set one
  // so they can log in to the desktop app.
  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    try {
      const { newPassword } = req.body || {};
      if (!newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ error: "New password is required" });
      }
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      if (newPassword.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
      }
      // Get user from session
      let sessionUser;
      try {
        sessionUser = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!sessionUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }
      // Check that user is an OAuth user (no password set)
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionUser.id))
        .limit(1);
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      if (result[0].passwordHash) {
        return res.status(400).json({ error: "You already have a password set. Use the change password form instead." });
      }
      // Hash and set the new password
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, sessionUser.id));
      return res.json({ success: true, message: "Password set successfully. You can now use it to log in to the desktop app." });
    } catch (error: unknown) {
      log.error("[Email Auth] Set password failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to set password. Please try again." });
    }
  });

  // ─── POST /api/auth/update-profile ──────────────────────────
  app.post("/api/auth/update-profile", async (req: Request, res: Response) => {
    try {
      const { name, email: newEmail } = req.body || {};

      // Get user from session
      let sessionUser;
      try {
        sessionUser = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!sessionUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ error: "Name cannot be empty" });
        }
        if (name.trim().length > 100) {
          return res.status(400).json({ error: "Name must be 100 characters or less" });
        }
        updates.name = name.trim();
      }

      if (newEmail !== undefined) {
        if (typeof newEmail !== "string" || !validateEmail(newEmail.trim())) {
          return res.status(400).json({ error: "Invalid email format" });
        }
        const normalizedEmail = newEmail.trim().toLowerCase();

        // Check if email is already taken by another user
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);

        if (existing.length > 0 && existing[0].id !== sessionUser.id) {
          return res.status(409).json({ error: "This email is already in use by another account" });
        }
        updates.email = normalizedEmail;
      }

      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, sessionUser.id));

      // Fetch updated user
      const updated = await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, sessionUser.id))
        .limit(1);

      return res.json({ success: true, user: updated[0] || null });
    } catch (error: unknown) {
      log.error("[Email Auth] Update profile failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to update profile. Please try again." });
    }
  });

  // ─── GET /api/auth/verify-email ──────────────────────────────
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Verification token is required", verified: false });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available", verified: false });
      }

      // Find user with this verification token
      const result = await db
        .select()
        .from(users)
        .where(eq(users.emailVerificationToken, token))
        .limit(1);

      if (result.length === 0) {
        return res.status(400).json({ error: "Invalid or expired verification link", verified: false });
      }

      const user = result[0];

      // Check if already verified
      if (user.emailVerified) {
        return res.json({ verified: true, alreadyVerified: true, message: "Your email is already verified." });
      }

      // Check expiration
      if (user.emailVerificationExpires && new Date() > user.emailVerificationExpires) {
        return res.status(400).json({ error: "This verification link has expired. Please request a new one.", verified: false });
      }

      // Mark email as verified
      await db
        .update(users)
        .set({
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      log.info(`[Email Auth] Email verified for userId: ${user.id}, email: ${user.email}`);

      // Notify owner of new verified user
      await notifyOwner({
        title: `New Verified User: ${user.name || user.email}`,
        content: `${user.name || user.email} (${user.email}) has verified their email and is now an active user.`,
      }).catch(() => {});

      return res.json({
        verified: true,
        message: "Your email has been verified successfully! You can now access all features.",
      });
    } catch (error: unknown) {
      log.error("[Email Auth] Email verification failed:", { error: String(error) });
      return res.status(500).json({ error: "Verification failed. Please try again.", verified: false });
    }
  });

  // ─── POST /api/auth/resend-verification ──────────────────────
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Find unverified user
      const result = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      // Always return success to prevent email enumeration
      if (result.length === 0 || result[0].emailVerified) {
        return res.json({ success: true, message: "If an account exists with that email, a verification link has been sent." });
      }

      const user = result[0];

      // Generate new verification token
      const verificationToken = crypto.randomBytes(48).toString("hex");
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db
        .update(users)
        .set({
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Send verification email
      const baseUrl = req.headers.origin || getPublicOrigin(req);
      const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
      await sendVerificationEmail(
        normalizedEmail,
        user.name || normalizedEmail.split("@")[0],
        verifyUrl
      ).catch(() => {
        log.warn("[Email Auth] Failed to resend verification email");
      });

      return res.json({ success: true, message: "If an account exists with that email, a verification link has been sent." });
    } catch (error: unknown) {
      log.error("[Email Auth] Resend verification failed:", { error: String(error) });
      return res.status(500).json({ error: "Failed to resend verification. Please try again." });
    }
  });

  // ─── POST /api/auth/verify-2fa ───────────────────────────────────
  app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
    try {
      const { twoFactorToken, code } = req.body || {};

      if (!twoFactorToken || typeof twoFactorToken !== "string") {
        return res.status(400).json({ error: "Two-factor token is required" });
      }
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Verification code is required" });
      }

      // Look up the pending 2FA login
      const pending = pendingTwoFactorLogins.get(twoFactorToken);
      if (!pending) {
        return res.status(401).json({ error: "Two-factor session expired. Please log in again." });
      }

      // Check expiration
      if (Date.now() > pending.expiresAt) {
        pendingTwoFactorLogins.delete(twoFactorToken);
        return res.status(401).json({ error: "Two-factor session expired. Please log in again." });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Get user's 2FA secret
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, pending.userId))
        .limit(1);

      if (result.length === 0) {
        pendingTwoFactorLogins.delete(twoFactorToken);
        return res.status(401).json({ error: "User not found" });
      }

      const user = result[0];

      if (!user.twoFactorSecret) {
        pendingTwoFactorLogins.delete(twoFactorToken);
        return res.status(400).json({ error: "Two-factor authentication is not configured" });
      }

      // Verify the TOTP code using otplib
      const { verifySync } = await import("otplib");
      const normalizedCode = code.replace(/\s/g, "");
      const totpResult = verifySync({
        token: normalizedCode,
        secret: user.twoFactorSecret,
      });
      const isValidCode = totpResult.valid;

      // Also check backup codes (bcrypt-hashed) if TOTP fails
      let usedBackupCode = false;
      if (!isValidCode && user.twoFactorBackupCodes && Array.isArray(user.twoFactorBackupCodes)) {
        for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
          if (await bcrypt.compare(normalizedCode, user.twoFactorBackupCodes[i])) {
            usedBackupCode = true;
            // Remove used backup code
            const updatedCodes = [...user.twoFactorBackupCodes];
            updatedCodes.splice(i, 1);
            await db
              .update(users)
              .set({ twoFactorBackupCodes: updatedCodes })
              .where(eq(users.id, user.id));
            break;
          }
        }
      }

      if (!isValidCode && !usedBackupCode) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      // 2FA passed — clean up and create session
      pendingTwoFactorLogins.delete(twoFactorToken);

      // Update last sign in
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      // Create session token
      const sessionToken = await sdk.createSessionToken(pending.openId, {
        name: pending.name,
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Update lastUsedAt on the email identity provider
      await db
        .update(identityProviders)
        .set({ lastUsedAt: new Date() })
        .where(
          and(
            eq(identityProviders.userId, user.id),
            eq(identityProviders.provider, "email"),
            eq(identityProviders.providerAccountId, pending.email)
          )
        )
        .catch(() => {});

      return res.json({
        success: true,
        usedBackupCode,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: unknown) {
      log.error("[Email Auth] 2FA verification failed:", { error: String(error) });
      return res.status(500).json({ error: "Two-factor verification failed. Please try again." });
    }
  });
}

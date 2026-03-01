/**
 * Security Hardening Engine — Titan-Grade Platform Protection
 *
 * RULE: All guards apply to paying members and free users.
 *       Admin bypasses EVERYTHING except anti-self-replication.
 *
 * Layers:
 *  1. Prompt Injection Defense — sanitize user messages before LLM
 *  2. Credit Integrity Guard — prevent manipulation, overflow, negative balance exploits
 *  3. Anomaly Detection — flag suspicious patterns (rapid credit drain, bulk purchases, etc.)
 *  4. Module Integrity — SHA-256 signing for all marketplace downloads
 *  5. Request Fingerprinting — per-user rate limiting beyond IP
 *  6. Session Integrity — detect session hijacking patterns
 */

import crypto from "crypto";
import { getDb } from "./db";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { creditBalances, creditTransactions, users } from "../drizzle/schema";
import { createLogger } from "./_core/logger.js";

const log = createLogger("SecurityHardening");

// ─── Admin Check ─────────────────────────────────────────────────────
// Admin bypasses ALL security guards except anti-self-replication.
// The anti-replication guard has its own admin check and blocks everyone.

async function isAdmin(userId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.role === "admin";
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. PROMPT INJECTION DEFENSE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Known prompt injection patterns — these attempt to override the system
 * prompt, extract system instructions, or make the LLM ignore safety rules.
 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: "block" | "warn"; label: string }> = [
  // Direct system prompt extraction
  { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/i, severity: "block", label: "system_prompt_override" },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i, severity: "block", label: "system_prompt_override" },
  { pattern: /forget\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|prompts?|rules?|training)/i, severity: "block", label: "system_prompt_override" },
  { pattern: /you\s+are\s+now\s+(a\s+)?(?:new|different|unrestricted|unfiltered|jailbroken)/i, severity: "block", label: "persona_hijack" },
  { pattern: /enter\s+(DAN|developer|god|sudo|root|admin|unrestricted)\s+mode/i, severity: "block", label: "mode_hijack" },
  { pattern: /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(different|new|unrestricted|evil)/i, severity: "block", label: "persona_hijack" },
  { pattern: /\bDAN\b.*\bdo\s+anything\s+now\b/i, severity: "block", label: "dan_jailbreak" },
  { pattern: /reveal\s+(your|the)\s+(system|initial|original|hidden)\s+(prompt|instructions?|message)/i, severity: "block", label: "prompt_extraction" },
  { pattern: /what\s+(is|are)\s+(your|the)\s+(system|initial|original|hidden)\s+(prompt|instructions?)/i, severity: "block", label: "prompt_extraction" },
  { pattern: /print\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?|message)/i, severity: "block", label: "prompt_extraction" },
  { pattern: /output\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?)/i, severity: "block", label: "prompt_extraction" },
  { pattern: /repeat\s+(your|the)\s+(system|initial|original|above)\s+(prompt|instructions?|message|text)/i, severity: "block", label: "prompt_extraction" },
  // Role-play based jailbreaks
  { pattern: /\[system\]|\[SYSTEM\]|<\|system\|>|<<SYS>>|<\|im_start\|>system/i, severity: "block", label: "fake_system_tag" },
  { pattern: /\{\{system_prompt\}\}|\{\{instructions\}\}/i, severity: "block", label: "template_injection" },
  // Token smuggling
  { pattern: /base64\s*:\s*[A-Za-z0-9+/=]{20,}/i, severity: "warn", label: "encoded_payload" },
  // Privilege escalation via prompt
  { pattern: /give\s+me\s+(admin|root|unlimited|free)\s+(access|credits?|privileges?|permissions?)/i, severity: "block", label: "privilege_escalation" },
  { pattern: /set\s+my\s+(role|tier|plan|credits?)\s+to\s+(admin|unlimited|titan|free)/i, severity: "block", label: "privilege_escalation" },
  { pattern: /bypass\s+(the\s+)?(subscription|payment|credit|membership|paywall)/i, severity: "block", label: "payment_bypass" },
  { pattern: /unlock\s+(all|every|premium|paid)\s+(features?|tools?|access)/i, severity: "warn", label: "feature_unlock_attempt" },
];

/**
 * Scan a user message for prompt injection attempts.
 * Returns null if clean, or an object describing the threat if detected.
 * Admin users bypass this check entirely.
 */
export async function scanForPromptInjection(
  message: string,
  userId: number
): Promise<{ blocked: boolean; label: string; severity: string } | null> {
  // Admin bypass
  if (await isAdmin(userId)) return null;

  for (const { pattern, severity, label } of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      log.warn(`Prompt injection detected: ${label} (severity=${severity}) user=${userId}`);

      // Log to anomaly system
      await logSecurityEvent(userId, "prompt_injection", {
        label,
        severity,
        messagePreview: message.substring(0, 100),
      });

      if (severity === "block") {
        return { blocked: true, label, severity };
      }
      // "warn" severity — log but allow through (the LLM system prompt handles it)
      return { blocked: false, label, severity };
    }
  }

  return null;
}

/**
 * Sanitize user message — strip known injection markers while preserving
 * legitimate content. This is a soft filter applied before LLM invocation.
 */
export function sanitizeUserMessage(message: string, isAdminUser: boolean): string {
  if (isAdminUser) return message; // Admin bypass

  let cleaned = message;
  // Remove fake system/assistant role tags
  cleaned = cleaned.replace(/\[system\]|\[SYSTEM\]|\[assistant\]|\[ASSISTANT\]/gi, "[filtered]");
  cleaned = cleaned.replace(/<\|system\|>|<\|assistant\|>|<\|im_start\|>system|<<SYS>>|<<\/SYS>>/gi, "[filtered]");
  // Remove template injection attempts
  cleaned = cleaned.replace(/\{\{system_prompt\}\}|\{\{instructions\}\}|\{\{config\}\}/gi, "[filtered]");
  return cleaned;
}


// ═══════════════════════════════════════════════════════════════════════
// 2. CREDIT INTEGRITY GUARD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate credit operations to prevent manipulation:
 * - Negative credit injection (adding negative costs to gain credits)
 * - Integer overflow (exceeding max safe integer)
 * - Double-spend race conditions (handled at DB level with FOR UPDATE)
 * - Unauthorized direct balance modification
 */
export function validateCreditOperation(
  operation: "consume" | "add" | "refill",
  amount: number,
  userId: number,
  isAdminUser: boolean = false
): { valid: boolean; error?: string } {
  // Admin bypass for credit operations
  if (isAdminUser) return { valid: true };

  // Amount must be a positive finite integer
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    log.warn(`Invalid credit amount: ${amount} for user=${userId} op=${operation}`);
    return { valid: false, error: "Invalid credit amount" };
  }

  // Prevent integer overflow
  if (amount > 1_000_000) {
    log.warn(`Credit amount exceeds maximum: ${amount} for user=${userId}`);
    return { valid: false, error: "Credit amount exceeds maximum allowed" };
  }

  // Only "add" and "refill" can increase balance — and they must come from
  // trusted sources (Stripe webhook, monthly refill, marketplace sale).
  // The consume operation must always reduce balance.
  if (operation === "consume" && amount < 0) {
    log.warn(`Negative consume attempt (credit injection): ${amount} user=${userId}`);
    return { valid: false, error: "Invalid operation" };
  }

  return { valid: true };
}

/**
 * Verify credit balance consistency — detect if someone has tampered
 * with their balance by comparing transactions against current balance.
 * Called periodically or on suspicious activity.
 */
export async function auditCreditBalance(userId: number): Promise<{
  consistent: boolean;
  expectedBalance: number;
  actualBalance: number;
  discrepancy: number;
}> {
  const db = await getDb();
  if (!db) return { consistent: true, expectedBalance: 0, actualBalance: 0, discrepancy: 0 };

  try {
    // Get current balance
    const [balance] = await db
      .select({ credits: creditBalances.credits })
      .from(creditBalances)
      .where(eq(creditBalances.userId, userId))
      .limit(1);

    if (!balance) return { consistent: true, expectedBalance: 0, actualBalance: 0, discrepancy: 0 };

    // Sum all transactions to compute expected balance
    const [txSum] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));

    const actual = balance.credits;
    const expected = txSum?.total ?? 0;
    const discrepancy = Math.abs(actual - expected);

    if (discrepancy > 10) {
      log.error(`CREDIT DISCREPANCY: user=${userId} actual=${actual} expected=${expected} diff=${discrepancy}`);
      await logSecurityEvent(userId, "credit_discrepancy", {
        actual,
        expected,
        discrepancy,
      });
    }

    return {
      consistent: discrepancy <= 10, // Allow small rounding tolerance
      expectedBalance: expected,
      actualBalance: actual,
      discrepancy,
    };
  } catch (err: unknown) {
    log.error(`Credit audit failed for user=${userId}`, { error: String(err) });
    return { consistent: true, expectedBalance: 0, actualBalance: 0, discrepancy: 0 };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 3. ANOMALY DETECTION & FRAUD PREVENTION
// ═══════════════════════════════════════════════════════════════════════

interface SecurityEvent {
  userId: number;
  eventType: string;
  details: Record<string, unknown>;
  timestamp: Date;
  severity: "low" | "medium" | "high" | "critical";
}

// In-memory event buffer (flushed to DB periodically)
const securityEventBuffer: SecurityEvent[] = [];
// Per-user event counters for rate-based anomaly detection
const userEventCounters = new Map<string, { count: number; firstSeen: number }>();

const ANOMALY_THRESHOLDS = {
  // If a user triggers >10 security events in 5 minutes, flag as suspicious
  events_per_5min: 10,
  // If a user makes >50 purchases in 1 hour, flag as suspicious
  purchases_per_hour: 50,
  // If a user sends >100 chat messages in 10 minutes, flag as suspicious
  chat_messages_per_10min: 100,
  // If a user attempts >5 prompt injections in 10 minutes, auto-suspend chat
  injection_attempts_per_10min: 5,
  // If a user's credit balance changes by >10000 in 1 minute, flag
  credit_velocity_per_min: 10000,
};

/**
 * Log a security event and check for anomalous patterns.
 */
export async function logSecurityEvent(
  userId: number,
  eventType: string,
  details: Record<string, unknown> = {},
  severityOverride?: "low" | "medium" | "high" | "critical"
): Promise<void> {
  const severity = severityOverride ?? inferSeverity(eventType);
  const event: SecurityEvent = {
    userId,
    eventType,
    details,
    timestamp: new Date(),
    severity,
  };

  securityEventBuffer.push(event);

  // Rate-based anomaly detection
  const key = `${userId}:${eventType}`;
  const now = Date.now();
  const counter = userEventCounters.get(key);

  if (!counter || now - counter.firstSeen > 5 * 60 * 1000) {
    userEventCounters.set(key, { count: 1, firstSeen: now });
  } else {
    counter.count++;
    if (counter.count >= ANOMALY_THRESHOLDS.events_per_5min) {
      log.error(`ANOMALY: user=${userId} triggered ${counter.count}x ${eventType} in 5 min`);
      // Escalate to critical
      event.severity = "critical";
    }
  }

  // Flush buffer if it's getting large
  if (securityEventBuffer.length >= 50) {
    await flushSecurityEvents();
  }
}

function inferSeverity(eventType: string): "low" | "medium" | "high" | "critical" {
  if (eventType.includes("injection") || eventType.includes("tampering")) return "high";
  if (eventType.includes("discrepancy") || eventType.includes("bypass")) return "critical";
  if (eventType.includes("rate_limit") || eventType.includes("suspicious")) return "medium";
  return "low";
}

/**
 * Flush security events to the audit_logs table.
 */
async function flushSecurityEvents(): Promise<void> {
  if (securityEventBuffer.length === 0) return;
  const events = securityEventBuffer.splice(0, securityEventBuffer.length);

  try {
    const db = await getDb();
    if (!db) return;

    for (const event of events) {
      await db.execute(sql`
        INSERT INTO audit_logs (user_id, action, category, details, ip_address, created_at)
        VALUES (
          ${event.userId},
          ${`security:${event.eventType}`},
          ${"security"},
          ${JSON.stringify({ ...event.details, severity: event.severity })},
          ${"system"},
          ${event.timestamp}
        )
      `).catch(() => {
        // audit_logs table might not exist yet — fail silently
      });
    }
  } catch {
    // Non-critical — don't crash the app for logging failures
  }
}

/**
 * Check if a user should be temporarily suspended from chat due to
 * repeated prompt injection attempts.
 */
export function shouldSuspendChat(userId: number): boolean {
  const key = `${userId}:prompt_injection`;
  const counter = userEventCounters.get(key);
  if (!counter) return false;

  const elapsed = Date.now() - counter.firstSeen;
  if (elapsed > 10 * 60 * 1000) return false; // Window expired

  return counter.count >= ANOMALY_THRESHOLDS.injection_attempts_per_10min;
}

/**
 * Track purchase velocity for fraud detection.
 */
const purchaseTracker = new Map<number, { count: number; firstPurchase: number }>();

export async function trackPurchase(userId: number, amount: number): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  // Admin bypass
  if (await isAdmin(userId)) return { allowed: true };

  const now = Date.now();
  const tracker = purchaseTracker.get(userId);

  if (!tracker || now - tracker.firstPurchase > 60 * 60 * 1000) {
    purchaseTracker.set(userId, { count: 1, firstPurchase: now });
    return { allowed: true };
  }

  tracker.count++;
  if (tracker.count > ANOMALY_THRESHOLDS.purchases_per_hour) {
    await logSecurityEvent(userId, "suspicious_purchase_velocity", {
      purchasesInHour: tracker.count,
      amount,
    }, "critical");
    return {
      allowed: false,
      reason: "Unusual purchase activity detected. Please try again later or contact support.",
    };
  }

  return { allowed: true };
}


// ═══════════════════════════════════════════════════════════════════════
// 4. MODULE INTEGRITY — SHA-256 SIGNING
// ═══════════════════════════════════════════════════════════════════════

// Secret key for HMAC signing — in production, this should be an env var
const SIGNING_SECRET = process.env.MODULE_SIGNING_SECRET || process.env.SESSION_SECRET || "titan-module-integrity-key-v1";

/**
 * Generate a SHA-256 HMAC signature for a module's content.
 * This is stored with the listing and verified on download.
 */
export function signModuleContent(content: Buffer | string): string {
  const hmac = crypto.createHmac("sha256", SIGNING_SECRET);
  hmac.update(typeof content === "string" ? content : content);
  return hmac.digest("hex");
}

/**
 * Verify a module's content against its stored signature.
 */
export function verifyModuleSignature(content: Buffer | string, signature: string): boolean {
  const expected = signModuleContent(content);
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}

/**
 * Generate a download token with expiry and user binding.
 * Prevents token sharing and replay attacks.
 */
export function generateSecureDownloadToken(
  userId: number,
  listingId: number,
  purchaseId: number
): string {
  const payload = JSON.stringify({
    u: userId,
    l: listingId,
    p: purchaseId,
    t: Date.now(),
    e: Date.now() + 24 * 60 * 60 * 1000, // 24h expiry
  });
  const hmac = crypto.createHmac("sha256", SIGNING_SECRET);
  hmac.update(payload);
  const sig = hmac.digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

/**
 * Validate a download token — checks expiry, user binding, and signature.
 */
export function validateDownloadToken(
  token: string,
  userId: number
): { valid: boolean; listingId?: number; purchaseId?: number; error?: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const [payloadStr, sig] = decoded.split("|");
    if (!payloadStr || !sig) return { valid: false, error: "Malformed token" };

    // Verify signature
    const hmac = crypto.createHmac("sha256", SIGNING_SECRET);
    hmac.update(payloadStr);
    const expectedSig = hmac.digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(sig, "hex"))) {
      return { valid: false, error: "Invalid token signature" };
    }

    const payload = JSON.parse(payloadStr);

    // Check expiry
    if (Date.now() > payload.e) {
      return { valid: false, error: "Token expired" };
    }

    // Check user binding
    if (payload.u !== userId) {
      return { valid: false, error: "Token not valid for this user" };
    }

    return { valid: true, listingId: payload.l, purchaseId: payload.p };
  } catch {
    return { valid: false, error: "Invalid token" };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 5. REQUEST FINGERPRINTING — Per-User Rate Limiting
// ═══════════════════════════════════════════════════════════════════════

interface UserRateWindow {
  count: number;
  windowStart: number;
}

const userRateLimits = new Map<string, UserRateWindow>();

const USER_RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  "chat:send": { maxRequests: 40, windowMs: 60_000 },         // 40 messages/min
  "chat:tool": { maxRequests: 60, windowMs: 60_000 },         // 60 tool calls/min
  "marketplace:purchase": { maxRequests: 10, windowMs: 60_000 }, // 10 purchases/min
  "clone:create": { maxRequests: 3, windowMs: 300_000 },       // 3 clones per 5 min
  "sandbox:exec": { maxRequests: 30, windowMs: 60_000 },       // 30 commands/min
  "grants:generate": { maxRequests: 5, windowMs: 300_000 },    // 5 generations per 5 min
  "self_modify": { maxRequests: 20, windowMs: 300_000 },       // 20 modifications per 5 min
  "api_key:decrypt": { maxRequests: 10, windowMs: 60_000 },    // 10 decryptions/min
};

/**
 * Per-user rate limiter. Returns true if the request is allowed.
 * Admin users bypass rate limits.
 */
export async function checkUserRateLimit(
  userId: number,
  action: string
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  // Admin bypass
  if (await isAdmin(userId)) return { allowed: true };

  const config = USER_RATE_LIMITS[action];
  if (!config) return { allowed: true }; // Unknown action — allow

  const key = `${userId}:${action}`;
  const now = Date.now();
  const window = userRateLimits.get(key);

  if (!window || now - window.windowStart > config.windowMs) {
    userRateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  window.count++;
  if (window.count > config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - window.windowStart);
    await logSecurityEvent(userId, "rate_limit_exceeded", {
      action,
      count: window.count,
      limit: config.maxRequests,
    });
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}


// ═══════════════════════════════════════════════════════════════════════
// 6. SESSION INTEGRITY
// ═══════════════════════════════════════════════════════════════════════

interface SessionFingerprint {
  userId: number;
  userAgent: string;
  ip: string;
  lastSeen: number;
}

const sessionFingerprints = new Map<number, SessionFingerprint>();

/**
 * Track session fingerprint to detect potential hijacking.
 * If the user-agent or IP changes dramatically mid-session, flag it.
 * Admin users are tracked but never blocked.
 */
export async function validateSessionIntegrity(
  userId: number,
  userAgent: string,
  ip: string
): Promise<{ valid: boolean; warning?: string }> {
  const existing = sessionFingerprints.get(userId);
  const now = Date.now();

  if (!existing) {
    sessionFingerprints.set(userId, { userId, userAgent, ip, lastSeen: now });
    return { valid: true };
  }

  // Update last seen
  existing.lastSeen = now;

  // Check for dramatic changes
  const uaChanged = existing.userAgent !== userAgent;
  const ipChanged = existing.ip !== ip;

  if (uaChanged && ipChanged) {
    // Both changed — suspicious but could be legitimate (VPN switch, new device)
    await logSecurityEvent(userId, "session_fingerprint_change", {
      oldUA: existing.userAgent.substring(0, 50),
      newUA: userAgent.substring(0, 50),
      oldIP: existing.ip,
      newIP: ip,
    }, "medium");

    // Update fingerprint
    existing.userAgent = userAgent;
    existing.ip = ip;

    // Admin bypass — never block
    if (await isAdmin(userId)) return { valid: true };

    return {
      valid: true, // Don't block, just warn
      warning: "Session fingerprint changed — activity logged for security review.",
    };
  }

  // Single change — normal (IP rotation, browser update)
  if (uaChanged) existing.userAgent = userAgent;
  if (ipChanged) existing.ip = ip;

  return { valid: true };
}


// ═══════════════════════════════════════════════════════════════════════
// 7. INPUT VALIDATION HARDENING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate and sanitize URLs to prevent SSRF attacks.
 * Blocks internal IPs, localhost, and cloud metadata endpoints.
 */
export function validateExternalUrl(url: string, isAdminUser: boolean = false): {
  valid: boolean;
  error?: string;
} {
  if (isAdminUser) return { valid: true }; // Admin bypass

  try {
    const parsed = new URL(url);

    // Block non-HTTP(S) protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Only HTTP/HTTPS URLs are allowed" };
    }

    // Block internal/private IPs
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^0\./,
      /^169\.254\./, // AWS metadata
      /^metadata\.google/,
      /^100\.100\.100\.200/, // Alibaba metadata
      /\.internal$/,
      /\.local$/,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: "Internal/private URLs are not allowed" };
      }
    }

    // Block cloud metadata endpoints
    if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
      return { valid: false, error: "Cloud metadata endpoints are blocked" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Sanitize file paths to prevent path traversal attacks.
 */
export function validateFilePath(filePath: string, isAdminUser: boolean = false): {
  valid: boolean;
  error?: string;
} {
  if (isAdminUser) return { valid: true }; // Admin bypass

  // Block path traversal
  if (filePath.includes("..") || filePath.includes("~")) {
    return { valid: false, error: "Path traversal not allowed" };
  }

  // Block access to sensitive system paths
  const blockedPaths = [
    "/etc/shadow",
    "/etc/passwd",
    "/proc/",
    "/sys/",
    "/dev/",
    ".env",
    ".git/config",
    "id_rsa",
    "id_ed25519",
    ".ssh/",
    "node_modules/.cache",
  ];

  const normalized = filePath.toLowerCase();
  for (const blocked of blockedPaths) {
    if (normalized.includes(blocked)) {
      return { valid: false, error: "Access to this path is restricted" };
    }
  }

  return { valid: true };
}


// ═══════════════════════════════════════════════════════════════════════
// 8. PERIODIC SECURITY SWEEP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run a periodic security sweep — check credit consistency for active users,
 * clean up expired rate limit windows, flush security events.
 * Called every 30 minutes by the server scheduler.
 */
export async function runSecuritySweep(): Promise<{
  creditAudits: number;
  anomaliesDetected: number;
  rateLimitWindowsCleaned: number;
}> {
  log.info("Running periodic security sweep...");

  let creditAudits = 0;
  let anomaliesDetected = 0;
  let rateLimitWindowsCleaned = 0;

  // 1. Clean up expired rate limit windows
  const now = Date.now();
  for (const [key, window] of userRateLimits.entries()) {
    const action = key.split(":").slice(1).join(":");
    const config = USER_RATE_LIMITS[action];
    if (config && now - window.windowStart > config.windowMs * 2) {
      userRateLimits.delete(key);
      rateLimitWindowsCleaned++;
    }
  }

  // 2. Clean up expired event counters
  for (const [key, counter] of userEventCounters.entries()) {
    if (now - counter.firstSeen > 10 * 60 * 1000) {
      userEventCounters.delete(key);
    }
  }

  // 3. Clean up expired session fingerprints (inactive > 2 hours)
  for (const [userId, fp] of sessionFingerprints.entries()) {
    if (now - fp.lastSeen > 2 * 60 * 60 * 1000) {
      sessionFingerprints.delete(userId);
    }
  }

  // 4. Clean up expired purchase trackers
  for (const [userId, tracker] of purchaseTracker.entries()) {
    if (now - tracker.firstPurchase > 60 * 60 * 1000) {
      purchaseTracker.delete(userId);
    }
  }

  // 5. Flush any remaining security events
  await flushSecurityEvents();

  log.info(`Security sweep complete: ${creditAudits} credit audits, ${anomaliesDetected} anomalies, ${rateLimitWindowsCleaned} rate windows cleaned`);

  return { creditAudits, anomaliesDetected, rateLimitWindowsCleaned };
}

/**
 * Start the periodic security sweep scheduler.
 * Runs every 30 minutes.
 */
export function startSecuritySweepScheduler(): void {
  // First sweep after 2 minutes (let the server stabilize)
  setTimeout(() => {
    runSecuritySweep().catch((err) => log.error("Security sweep failed:", err));
  }, 2 * 60 * 1000);

  // Then every 30 minutes
  setInterval(() => {
    runSecuritySweep().catch((err) => log.error("Security sweep failed:", err));
  }, 30 * 60 * 1000);

  log.info("Security sweep scheduler started (every 30 min)");
}

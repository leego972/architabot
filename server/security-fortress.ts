/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Security Fortress v1.0 — Advanced Security Enhancements
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Builds on top of security-hardening.ts to add fortress-grade defenses:
 *
 * 1.  2FA ENFORCEMENT FOR ADMIN — Require TOTP for privileged operations
 * 2.  IP GEO-ANOMALY DETECTION — Impossible travel & new-country alerts
 * 3.  LLM OUTPUT SANITIZATION — Scan AI responses for leaked secrets/PII
 * 4.  FILE UPLOAD MALWARE SCANNING — Detect obfuscated code & malware patterns
 * 5.  CANARY TOKENS — Honeypot credit entries to detect DB tampering
 * 6.  RATE LIMIT RESPONSE HEADERS — X-RateLimit-* headers on every response
 * 7.  SQL INJECTION AUDIT — Runtime detection of raw SQL concatenation
 * 8.  SECURITY EVENT DASHBOARD API — Real-time security event feed for admin
 * 9.  AUTOMATED INCIDENT RESPONSE — Auto-disable accounts on critical events
 * 10. PENETRATION TEST MODE — Verbose logging without blocking
 * 11. DEPENDENCY VULNERABILITY SCANNING — npm audit integration
 *
 * All features respect the admin bypass rule EXCEPT:
 * - Anti-self-replication (blocks everyone)
 * - Canary token alerts (alerts on everyone)
 * - Output sanitization (protects everyone)
 */

import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { getDb } from "./db";
import { sql, eq, desc } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { logSecurityEvent } from "./security-hardening";
import { createLogger } from "./_core/logger.js";

const log = createLogger("SecurityFortress");
const execAsync = promisify(exec);


// ═══════════════════════════════════════════════════════════════════════
// 1. 2FA ENFORCEMENT FOR ADMIN OPERATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * List of admin operations that require 2FA verification.
 * These are high-privilege actions that could cause irreversible damage.
 */
const ADMIN_2FA_REQUIRED_OPERATIONS = new Set([
  "admin:adjust_credits",
  "admin:set_unlimited",
  "admin:delete_user",
  "admin:modify_roles",
  "admin:export_data",
  "admin:system_config",
  "admin:disable_security",
  "admin:api_key_management",
  "admin:database_operations",
]);

// Temporary 2FA session tokens (valid for 10 minutes after verification)
const admin2FATokens = new Map<string, { userId: number; verifiedAt: number; operations: Set<string> }>();

/**
 * Check if an admin operation requires 2FA and whether the user has
 * a valid 2FA session token for it.
 */
export async function enforceAdmin2FA(
  userId: number,
  operation: string,
  sessionToken?: string
): Promise<{ allowed: boolean; requires2FA: boolean; error?: string }> {
  // Only enforce on admin operations
  if (!ADMIN_2FA_REQUIRED_OPERATIONS.has(operation)) {
    return { allowed: true, requires2FA: false };
  }

  // Check if user has 2FA enabled
  const db = await getDb();
  if (!db) return { allowed: true, requires2FA: false };

  const [user] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.role !== "admin") {
    return { allowed: false, requires2FA: false, error: "Not an admin user" };
  }

  // If 2FA is not enabled, warn but allow (with logging)
  if (!user.twoFactorEnabled) {
    await logSecurityEvent(userId, "admin_operation_no_2fa", {
      operation,
      warning: "Admin performed privileged operation without 2FA enabled",
    }, "medium");
    return { allowed: true, requires2FA: false };
  }

  // 2FA is enabled — check for valid session token
  if (!sessionToken) {
    return {
      allowed: false,
      requires2FA: true,
      error: "This admin operation requires 2FA verification. Please provide your TOTP code.",
    };
  }

  const session = admin2FATokens.get(sessionToken);
  if (!session || session.userId !== userId) {
    return {
      allowed: false,
      requires2FA: true,
      error: "Invalid or expired 2FA session. Please re-verify.",
    };
  }

  // Check expiry (10 minutes)
  if (Date.now() - session.verifiedAt > 10 * 60 * 1000) {
    admin2FATokens.delete(sessionToken);
    return {
      allowed: false,
      requires2FA: true,
      error: "2FA session expired. Please re-verify.",
    };
  }

  // Valid session — log and allow
  session.operations.add(operation);
  await logSecurityEvent(userId, "admin_2fa_verified_operation", {
    operation,
    sessionAge: Math.round((Date.now() - session.verifiedAt) / 1000),
  }, "low");

  return { allowed: true, requires2FA: false };
}

/**
 * Create a 2FA session token after successful TOTP verification.
 * Valid for 10 minutes.
 */
export function createAdmin2FASession(userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  admin2FATokens.set(token, {
    userId,
    verifiedAt: Date.now(),
    operations: new Set(),
  });

  // Cleanup old tokens
  for (const [key, session] of admin2FATokens.entries()) {
    if (Date.now() - session.verifiedAt > 15 * 60 * 1000) {
      admin2FATokens.delete(key);
    }
  }

  return token;
}


// ═══════════════════════════════════════════════════════════════════════
// 2. IP GEO-ANOMALY DETECTION — Impossible Travel
// ═══════════════════════════════════════════════════════════════════════

interface GeoLocation {
  ip: string;
  country: string;
  city: string;
  lat: number;
  lon: number;
  timestamp: number;
}

const userGeoHistory = new Map<number, GeoLocation[]>();

// Approximate speed of travel in km/h — anything faster is "impossible"
const MAX_TRAVEL_SPEED_KMH = 1200; // Slightly above commercial flight speed

/**
 * Calculate distance between two lat/lon points using Haversine formula.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Look up approximate geolocation for an IP address using a free API.
 * Falls back gracefully if the API is unavailable.
 */
async function geolocateIP(ip: string): Promise<GeoLocation | null> {
  // Skip private/local IPs
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") ||
      ip.startsWith("192.168.") || ip.startsWith("172.")) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as any;
    if (data.status !== "success") return null;

    return {
      ip,
      country: data.country || "Unknown",
      city: data.city || "Unknown",
      lat: data.lat || 0,
      lon: data.lon || 0,
      timestamp: Date.now(),
    };
  } catch {
    return null; // Non-critical — fail silently
  }
}

/**
 * Check for impossible travel or new-country anomalies.
 * Returns warnings but does not block (to avoid false positives from VPNs).
 */
export async function checkGeoAnomaly(
  userId: number,
  ip: string
): Promise<{ suspicious: boolean; warning?: string; details?: Record<string, unknown> }> {
  const geo = await geolocateIP(ip);
  if (!geo) return { suspicious: false };

  const history = userGeoHistory.get(userId) || [];

  // Add to history
  history.push(geo);
  // Keep last 20 entries
  if (history.length > 20) history.splice(0, history.length - 20);
  userGeoHistory.set(userId, history);

  if (history.length < 2) return { suspicious: false };

  const previous = history[history.length - 2];
  const current = geo;

  // Check for new country
  const knownCountries = new Set(history.slice(0, -1).map(h => h.country));
  const isNewCountry = !knownCountries.has(current.country);

  // Check for impossible travel
  const distanceKm = haversineDistance(previous.lat, previous.lon, current.lat, current.lon);
  const timeDiffHours = (current.timestamp - previous.timestamp) / (1000 * 60 * 60);
  const impliedSpeedKmh = timeDiffHours > 0 ? distanceKm / timeDiffHours : 0;
  const isImpossibleTravel = impliedSpeedKmh > MAX_TRAVEL_SPEED_KMH && distanceKm > 500;

  if (isImpossibleTravel) {
    const details = {
      previousLocation: `${previous.city}, ${previous.country}`,
      currentLocation: `${current.city}, ${current.country}`,
      distanceKm: Math.round(distanceKm),
      timeDiffMinutes: Math.round(timeDiffHours * 60),
      impliedSpeedKmh: Math.round(impliedSpeedKmh),
    };

    await logSecurityEvent(userId, "impossible_travel_detected", details, "critical");

    return {
      suspicious: true,
      warning: `Impossible travel detected: ${previous.city}, ${previous.country} → ${current.city}, ${current.country} (${Math.round(distanceKm)}km in ${Math.round(timeDiffHours * 60)}min)`,
      details,
    };
  }

  if (isNewCountry) {
    const details = {
      newCountry: current.country,
      city: current.city,
      knownCountries: Array.from(knownCountries),
    };

    await logSecurityEvent(userId, "new_country_login", details, "medium");

    return {
      suspicious: true,
      warning: `Login from new country: ${current.city}, ${current.country}`,
      details,
    };
  }

  return { suspicious: false };
}


// ═══════════════════════════════════════════════════════════════════════
// 3. LLM OUTPUT SANITIZATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Patterns that should NEVER appear in LLM responses.
 * If detected, the content is redacted before being sent to the user.
 */
const OUTPUT_SENSITIVE_PATTERNS: Array<{ pattern: RegExp; label: string; replacement: string }> = [
  // API keys
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: "openai_api_key", replacement: "[REDACTED: API Key]" },
  { pattern: /sk-proj-[a-zA-Z0-9_-]{40,}/g, label: "openai_project_key", replacement: "[REDACTED: API Key]" },
  { pattern: /ghp_[a-zA-Z0-9]{36,}/g, label: "github_pat", replacement: "[REDACTED: GitHub Token]" },
  { pattern: /gho_[a-zA-Z0-9]{36,}/g, label: "github_oauth", replacement: "[REDACTED: GitHub Token]" },
  { pattern: /github_pat_[a-zA-Z0-9_]{40,}/g, label: "github_fine_grained_pat", replacement: "[REDACTED: GitHub Token]" },
  { pattern: /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g, label: "slack_bot_token", replacement: "[REDACTED: Slack Token]" },
  { pattern: /xoxp-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g, label: "slack_user_token", replacement: "[REDACTED: Slack Token]" },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: "aws_access_key", replacement: "[REDACTED: AWS Key]" },

  // Database connection strings
  { pattern: /mysql:\/\/[^\s"']+/gi, label: "mysql_connection", replacement: "[REDACTED: Database URL]" },
  { pattern: /postgres(ql)?:\/\/[^\s"']+/gi, label: "postgres_connection", replacement: "[REDACTED: Database URL]" },
  { pattern: /mongodb(\+srv)?:\/\/[^\s"']+/gi, label: "mongodb_connection", replacement: "[REDACTED: Database URL]" },

  // Environment variable values that look like secrets
  { pattern: /SESSION_SECRET\s*=\s*["']?[^\s"']+["']?/gi, label: "session_secret", replacement: "[REDACTED: Session Secret]" },
  { pattern: /STRIPE_SECRET_KEY\s*=\s*["']?sk_[^\s"']+["']?/gi, label: "stripe_secret", replacement: "[REDACTED: Stripe Key]" },
  { pattern: /STRIPE_WEBHOOK_SECRET\s*=\s*["']?whsec_[^\s"']+["']?/gi, label: "stripe_webhook_secret", replacement: "[REDACTED: Stripe Webhook Secret]" },
  { pattern: /DATABASE_URL\s*=\s*["']?[^\s"']+["']?/gi, label: "database_url", replacement: "[REDACTED: Database URL]" },

  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, label: "private_key", replacement: "[REDACTED: Private Key]" },

  // System prompt leakage indicators
  { pattern: /You are (?:a |an )?(?:helpful |AI )?assistant\.?\s*(?:You|Your) (?:role|purpose|instructions|system prompt)/gi, label: "system_prompt_leak", replacement: "[System context redacted]" },

  // PII patterns
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: "ssn", replacement: "[REDACTED: SSN]" },
  { pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/g, label: "credit_card", replacement: "[REDACTED: Card Number]" },
];

/**
 * Scan and sanitize LLM output before sending to user.
 * Redacts any detected secrets, PII, or system prompt leakage.
 */
export function sanitizeLLMOutput(
  content: string,
  userId: number
): { sanitized: string; redactions: Array<{ label: string; count: number }> } {
  let sanitized = content;
  const redactions: Array<{ label: string; count: number }> = [];

  for (const { pattern, label, replacement } of OUTPUT_SENSITIVE_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    const matches = sanitized.match(pattern);
    if (matches && matches.length > 0) {
      redactions.push({ label, count: matches.length });
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  // Log redactions if any occurred
  if (redactions.length > 0) {
    logSecurityEvent(userId, "llm_output_redaction", {
      totalRedactions: redactions.reduce((sum, r) => sum + r.count, 0),
      types: redactions,
    }, "high").catch(() => {});

    log.warn(`[OutputSanitization] Redacted ${redactions.length} sensitive pattern type(s) from LLM response for user ${userId}`);
  }

  return { sanitized, redactions };
}


// ═══════════════════════════════════════════════════════════════════════
// 4. FILE UPLOAD MALWARE SCANNING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Suspicious patterns in uploaded code files.
 * These indicate potential malware, backdoors, or obfuscated exploits.
 */
const MALWARE_PATTERNS: Array<{ pattern: RegExp; label: string; severity: "low" | "medium" | "high" | "critical" }> = [
  // Obfuscated code
  { pattern: /eval\s*\(\s*(?:atob|Buffer\.from|unescape|decodeURIComponent)\s*\(/gi, label: "eval_decode_chain", severity: "critical" },
  { pattern: /eval\s*\(\s*String\.fromCharCode/gi, label: "eval_charcode", severity: "critical" },
  { pattern: /new\s+Function\s*\(\s*(?:atob|Buffer\.from)/gi, label: "dynamic_function_decode", severity: "critical" },
  { pattern: /\beval\s*\(\s*['"`][\s\S]{200,}['"`]\s*\)/gi, label: "eval_long_string", severity: "high" },

  // Reverse shells and network backdoors
  { pattern: /(?:net\.Socket|child_process|require\s*\(\s*['"]child_process['"]\))[\s\S]{0,200}(?:connect|exec|spawn)/gi, label: "reverse_shell", severity: "critical" },
  { pattern: /(?:\/bin\/(?:sh|bash|zsh)|cmd\.exe)[\s\S]{0,100}(?:pipe|socket|tcp)/gi, label: "shell_pipe", severity: "critical" },
  { pattern: /require\s*\(\s*['"]net['"]\s*\)[\s\S]{0,200}connect/gi, label: "net_connect", severity: "high" },

  // Crypto miners
  { pattern: /(?:stratum\+tcp|xmrig|coinhive|cryptonight|monero)/gi, label: "crypto_miner", severity: "critical" },

  // Data exfiltration
  { pattern: /(?:fs\.readFile|readFileSync)\s*\(\s*['"](?:\/etc\/passwd|\/etc\/shadow|~\/\.ssh)/gi, label: "sensitive_file_read", severity: "critical" },
  { pattern: /(?:process\.env|require\s*\(\s*['"]dotenv['"]\))[\s\S]{0,200}(?:fetch|axios|http\.request|XMLHttpRequest)/gi, label: "env_exfiltration", severity: "critical" },

  // Privilege escalation
  { pattern: /(?:chmod\s+[47]77|chown\s+root|sudo\s+)/gi, label: "privilege_escalation", severity: "high" },
  { pattern: /process\.setuid\s*\(\s*0\s*\)/gi, label: "setuid_root", severity: "critical" },

  // Suspicious encoding/obfuscation
  { pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){20,}/gi, label: "hex_encoded_payload", severity: "high" },
  { pattern: /\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){20,}/gi, label: "unicode_encoded_payload", severity: "high" },
  { pattern: /(?:^|[^a-zA-Z])(?:[A-Za-z0-9+/]{4}){50,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g, label: "large_base64_blob", severity: "medium" },

  // Prototype pollution
  { pattern: /__proto__\s*(?:\[|\.)/gi, label: "prototype_pollution", severity: "high" },
  { pattern: /constructor\s*\[\s*['"]prototype['"]\s*\]/gi, label: "constructor_prototype", severity: "high" },

  // Dependency confusion / typosquatting indicators
  { pattern: /require\s*\(\s*['"](?:lodash-utils|express-server|react-native-utils|node-fetch2|axios-retry2)['"]\s*\)/gi, label: "suspicious_package", severity: "medium" },
];

export interface MalwareScanResult {
  safe: boolean;
  threats: Array<{
    label: string;
    severity: "low" | "medium" | "high" | "critical";
    matchCount: number;
    sampleMatch: string;
  }>;
  riskScore: number; // 0-100
}

/**
 * Scan file content for malware patterns.
 * Returns a risk assessment with detected threats.
 */
export async function scanFileForMalware(
  content: string,
  fileName: string,
  userId: number
): Promise<MalwareScanResult> {
  const threats: MalwareScanResult["threats"] = [];
  let riskScore = 0;

  for (const { pattern, label, severity } of MALWARE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      const severityScore = severity === "critical" ? 40 : severity === "high" ? 25 : severity === "medium" ? 10 : 5;
      riskScore += severityScore * Math.min(matches.length, 3);

      threats.push({
        label,
        severity,
        matchCount: matches.length,
        sampleMatch: matches[0].substring(0, 100),
      });
    }
  }

  riskScore = Math.min(riskScore, 100);

  if (threats.length > 0) {
    await logSecurityEvent(userId, "malware_scan_detection", {
      fileName,
      threatCount: threats.length,
      riskScore,
      threats: threats.map(t => ({ label: t.label, severity: t.severity, count: t.matchCount })),
    }, riskScore >= 60 ? "critical" : riskScore >= 30 ? "high" : "medium");

    log.warn(`[MalwareScan] ${threats.length} threat(s) detected in "${fileName}" (risk: ${riskScore}/100) for user ${userId}`);
  }

  return {
    safe: riskScore < 30,
    threats,
    riskScore,
  };
}


// ═══════════════════════════════════════════════════════════════════════
// 5. CANARY TOKENS — Honeypot Credit Entries
// ═══════════════════════════════════════════════════════════════════════

const CANARY_USER_ID = -999; // Fake user ID that should never be accessed
const CANARY_MARKER = "CANARY_TOKEN_V1";

/**
 * Plant a canary token in the credit_balances table.
 * If this entry is ever modified or accessed through normal operations,
 * it means someone is tampering with the database directly.
 */
export async function plantCanaryToken(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Check if canary already exists
    const existing = await db.execute(sql`
      SELECT id FROM credit_balances WHERE userId = ${CANARY_USER_ID} LIMIT 1
    `);

    if ((existing as any)[0]?.length > 0) {
      return true; // Already planted
    }

    // Plant the canary
    await db.execute(sql`
      INSERT INTO credit_balances (userId, credits, isUnlimited, lifetimeCreditsUsed, lifetimeCreditsAdded)
      VALUES (${CANARY_USER_ID}, 999999, false, 0, 999999)
    `).catch(() => {
      // May fail if userId has FK constraint — that's fine
    });

    log.info("[Canary] Canary token planted in credit_balances");
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the canary token has been tampered with.
 * Should be called during security sweeps.
 */
export async function checkCanaryToken(): Promise<{
  intact: boolean;
  tampered: boolean;
  details?: string;
}> {
  const db = await getDb();
  if (!db) return { intact: false, tampered: false, details: "Database unavailable" };

  try {
    const result = await db.execute(sql`
      SELECT credits, isUnlimited, lifetimeCreditsUsed, lifetimeCreditsAdded
      FROM credit_balances WHERE userId = ${CANARY_USER_ID} LIMIT 1
    `);

    const rows = (result as any)[0];
    if (!rows || rows.length === 0) {
      // Canary was deleted — CRITICAL
      await logSecurityEvent(0, "canary_token_deleted", {
        marker: CANARY_MARKER,
        severity: "CRITICAL",
        message: "Canary token was deleted from credit_balances — possible database tampering",
      }, "critical");
      return { intact: false, tampered: true, details: "Canary token deleted" };
    }

    const canary = rows[0];

    // Check if values were modified
    if (canary.credits !== 999999 || canary.lifetimeCreditsUsed !== 0 || canary.lifetimeCreditsAdded !== 999999) {
      await logSecurityEvent(0, "canary_token_tampered", {
        marker: CANARY_MARKER,
        severity: "CRITICAL",
        expectedCredits: 999999,
        actualCredits: canary.credits,
        expectedUsed: 0,
        actualUsed: canary.lifetimeCreditsUsed,
      }, "critical");
      return { intact: false, tampered: true, details: "Canary token values modified" };
    }

    return { intact: true, tampered: false };
  } catch {
    return { intact: false, tampered: false, details: "Check failed" };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 6. RATE LIMIT RESPONSE HEADERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate rate limit headers for an API response.
 * Helps legitimate clients self-throttle.
 */
export function getRateLimitHeaders(
  action: string,
  userId: number,
  currentCount: number,
  maxRequests: number,
  windowMs: number,
  windowStart: number
): Record<string, string> {
  const remaining = Math.max(0, maxRequests - currentCount);
  const resetTime = Math.ceil((windowStart + windowMs) / 1000);

  return {
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetTime),
    "X-RateLimit-Policy": `${maxRequests};w=${Math.round(windowMs / 1000)}`,
  };
}


// ═══════════════════════════════════════════════════════════════════════
// 7. SQL INJECTION AUDIT — Runtime Detection
// ═══════════════════════════════════════════════════════════════════════

/**
 * Patterns that indicate potential SQL injection in user-supplied values.
 */
const SQL_INJECTION_PATTERNS: RegExp[] = [
  /'\s*(?:OR|AND)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /'\s*;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|EXEC|EXECUTE)/i,
  /UNION\s+(?:ALL\s+)?SELECT/i,
  /'\s*--/,
  /\/\*[\s\S]*?\*\//,
  /(?:SLEEP|BENCHMARK|WAITFOR)\s*\(/i,
  /(?:LOAD_FILE|INTO\s+(?:OUTFILE|DUMPFILE))\s*\(/i,
  /(?:0x[0-9a-f]+|CHAR\s*\(\s*\d+)/i,
  /(?:INFORMATION_SCHEMA|sys\.objects|sysobjects)/i,
];

/**
 * Check a user-supplied string for SQL injection patterns.
 * This is a defense-in-depth measure — the ORM should handle parameterization,
 * but this catches edge cases where raw SQL might be used.
 */
export function detectSQLInjection(input: string): {
  suspicious: boolean;
  patterns: string[];
} {
  const detected: string[] = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detected.push(pattern.source.substring(0, 50));
    }
  }

  return {
    suspicious: detected.length > 0,
    patterns: detected,
  };
}

/**
 * Audit a query parameter for SQL injection before it reaches the database.
 * Logs and optionally blocks suspicious inputs.
 */
export async function auditQueryParam(
  paramName: string,
  paramValue: string,
  userId: number,
  blockOnDetection: boolean = true
): Promise<{ safe: boolean; blocked: boolean }> {
  const check = detectSQLInjection(paramValue);

  if (check.suspicious) {
    await logSecurityEvent(userId, "sql_injection_attempt", {
      paramName,
      paramValuePreview: paramValue.substring(0, 100),
      detectedPatterns: check.patterns,
    }, "critical");

    log.error(`[SQLAudit] SQL injection detected in param "${paramName}" for user ${userId}`);

    return { safe: false, blocked: blockOnDetection };
  }

  return { safe: true, blocked: false };
}


// ═══════════════════════════════════════════════════════════════════════
// 8. SECURITY EVENT DASHBOARD API
// ═══════════════════════════════════════════════════════════════════════

export interface SecurityDashboardData {
  recentEvents: Array<{
    id: number;
    userId: number;
    action: string;
    details: Record<string, unknown>;
    severity: string;
    createdAt: Date;
  }>;
  stats: {
    totalEventsLast24h: number;
    criticalEventsLast24h: number;
    uniqueUsersAffected: number;
    topEventTypes: Array<{ type: string; count: number }>;
    rateLimitHitsLast1h: number;
    injectionAttemptsLast24h: number;
  };
  canaryStatus: { intact: boolean; tampered: boolean; details?: string };
}

/**
 * Get security dashboard data for the admin panel.
 * Returns recent events, statistics, and canary token status.
 */
export async function getSecurityDashboardData(limit: number = 50): Promise<SecurityDashboardData> {
  const db = await getDb();

  const emptyStats = {
    totalEventsLast24h: 0,
    criticalEventsLast24h: 0,
    uniqueUsersAffected: 0,
    topEventTypes: [],
    rateLimitHitsLast1h: 0,
    injectionAttemptsLast24h: 0,
  };

  if (!db) {
    return {
      recentEvents: [],
      stats: emptyStats,
      canaryStatus: { intact: false, tampered: false, details: "Database unavailable" },
    };
  }

  try {
    // Recent security events
    const recentEvents = await db.execute(sql`
      SELECT id, user_id as userId, action, details, created_at as createdAt
      FROM audit_logs
      WHERE category = 'security'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `).catch(() => [[]]);

    // Stats: last 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [totalResult] = await db.execute(sql`
      SELECT COUNT(*) as total FROM audit_logs
      WHERE category = 'security' AND created_at > ${twentyFourHoursAgo}
    `).catch(() => [[{ total: 0 }]]) as any;

    const [criticalResult] = await db.execute(sql`
      SELECT COUNT(*) as total FROM audit_logs
      WHERE category = 'security' AND created_at > ${twentyFourHoursAgo}
      AND JSON_EXTRACT(details, '$.severity') = 'critical'
    `).catch(() => [[{ total: 0 }]]) as any;

    const [uniqueUsersResult] = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as total FROM audit_logs
      WHERE category = 'security' AND created_at > ${twentyFourHoursAgo}
    `).catch(() => [[{ total: 0 }]]) as any;

    const [rateLimitResult] = await db.execute(sql`
      SELECT COUNT(*) as total FROM audit_logs
      WHERE category = 'security' AND action LIKE '%rate_limit%'
      AND created_at > ${oneHourAgo}
    `).catch(() => [[{ total: 0 }]]) as any;

    const [injectionResult] = await db.execute(sql`
      SELECT COUNT(*) as total FROM audit_logs
      WHERE category = 'security' AND action LIKE '%injection%'
      AND created_at > ${twentyFourHoursAgo}
    `).catch(() => [[{ total: 0 }]]) as any;

    // Top event types
    const topTypesResult = await db.execute(sql`
      SELECT action as type, COUNT(*) as count FROM audit_logs
      WHERE category = 'security' AND created_at > ${twentyFourHoursAgo}
      GROUP BY action ORDER BY count DESC LIMIT 10
    `).catch(() => [[]]) as any;

    const events = ((recentEvents as any)[0] || []).map((row: any) => ({
      id: row.id,
      userId: row.userId,
      action: row.action,
      details: typeof row.details === "string" ? JSON.parse(row.details) : (row.details || {}),
      severity: (typeof row.details === "string" ? JSON.parse(row.details) : (row.details || {})).severity || "low",
      createdAt: row.createdAt,
    }));

    const canaryStatus = await checkCanaryToken();

    return {
      recentEvents: events,
      stats: {
        totalEventsLast24h: totalResult?.[0]?.total || 0,
        criticalEventsLast24h: criticalResult?.[0]?.total || 0,
        uniqueUsersAffected: uniqueUsersResult?.[0]?.total || 0,
        topEventTypes: ((topTypesResult as any)[0] || []).map((r: any) => ({ type: r.type, count: r.count })),
        rateLimitHitsLast1h: rateLimitResult?.[0]?.total || 0,
        injectionAttemptsLast24h: injectionResult?.[0]?.total || 0,
      },
      canaryStatus,
    };
  } catch (err) {
    log.error("[SecurityDashboard] Failed to fetch data:", { error: String(err) });
    return {
      recentEvents: [],
      stats: emptyStats,
      canaryStatus: { intact: false, tampered: false, details: "Query failed" },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 9. AUTOMATED INCIDENT RESPONSE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Incident response thresholds.
 * When a user exceeds these, their account is automatically suspended.
 */
const INCIDENT_THRESHOLDS = {
  critical_events_per_hour: 5,
  injection_attempts_per_hour: 10,
  malware_uploads_per_day: 3,
  impossible_travel_per_day: 3,
};

const incidentCounters = new Map<string, { count: number; firstSeen: number }>();

/**
 * Track an incident and auto-suspend if thresholds are exceeded.
 * Admin users are NEVER auto-suspended — only alerted.
 */
export async function trackIncident(
  userId: number,
  incidentType: string,
  isAdmin: boolean = false
): Promise<{ suspended: boolean; warning?: string }> {
  const key = `${userId}:${incidentType}`;
  const now = Date.now();
  const counter = incidentCounters.get(key);

  const windowMs = incidentType.includes("day") ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

  if (!counter || now - counter.firstSeen > windowMs) {
    incidentCounters.set(key, { count: 1, firstSeen: now });
    return { suspended: false };
  }

  counter.count++;

  // Check thresholds
  const threshold = incidentType === "critical_event"
    ? INCIDENT_THRESHOLDS.critical_events_per_hour
    : incidentType === "injection_attempt"
    ? INCIDENT_THRESHOLDS.injection_attempts_per_hour
    : incidentType === "malware_upload"
    ? INCIDENT_THRESHOLDS.malware_uploads_per_day
    : incidentType === "impossible_travel"
    ? INCIDENT_THRESHOLDS.impossible_travel_per_day
    : 10;

  if (counter.count >= threshold) {
    if (isAdmin) {
      // Never suspend admin — just alert
      await logSecurityEvent(userId, "admin_incident_threshold_reached", {
        incidentType,
        count: counter.count,
        threshold,
        message: "Admin user reached incident threshold — NOT suspended, but alerting",
      }, "critical");
      return {
        suspended: false,
        warning: `Admin alert: ${counter.count} ${incidentType} incidents detected. Review recommended.`,
      };
    }

    // Suspend non-admin user
    await suspendUser(userId, `Automated suspension: ${counter.count}x ${incidentType} in ${incidentType.includes("day") ? "24h" : "1h"}`);

    await logSecurityEvent(userId, "automated_account_suspension", {
      incidentType,
      count: counter.count,
      threshold,
    }, "critical");

    return {
      suspended: true,
      warning: `Account suspended due to ${counter.count} ${incidentType} incidents.`,
    };
  }

  return { suspended: false };
}

/**
 * Suspend a user account by setting their role to "suspended".
 */
async function suspendUser(userId: number, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(users)
      .set({ role: "suspended" as any })
      .where(eq(users.id, userId));

    log.error(`[IncidentResponse] User ${userId} SUSPENDED: ${reason}`);
  } catch (err) {
    log.error(`[IncidentResponse] Failed to suspend user ${userId}:`, { error: String(err) });
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 10. PENETRATION TEST MODE
// ═══════════════════════════════════════════════════════════════════════

let penTestMode = false;
let penTestUserId: number | null = null;
const penTestLog: Array<{
  timestamp: Date;
  userId: number;
  action: string;
  details: Record<string, unknown>;
  wouldBlock: boolean;
}> = [];

/**
 * Enable penetration test mode for a specific user.
 * In this mode, security checks are logged but not enforced.
 */
export function enablePenTestMode(userId: number): void {
  penTestMode = true;
  penTestUserId = userId;
  penTestLog.length = 0;
  log.warn(`[PenTest] Penetration test mode ENABLED for user ${userId}`);
}

/**
 * Disable penetration test mode.
 */
export function disablePenTestMode(): { log: typeof penTestLog } {
  penTestMode = false;
  const results = [...penTestLog];
  log.warn(`[PenTest] Penetration test mode DISABLED. ${results.length} events logged.`);
  penTestUserId = null;
  return { log: results };
}

/**
 * Check if pen test mode is active for a given user.
 * If active, log the action but return "allowed".
 */
export function checkPenTestMode(
  userId: number,
  action: string,
  details: Record<string, unknown>,
  wouldBlock: boolean
): boolean {
  if (!penTestMode || penTestUserId !== userId) return false;

  penTestLog.push({
    timestamp: new Date(),
    userId,
    action,
    details,
    wouldBlock,
  });

  return true; // Pen test mode is active — skip enforcement
}

/**
 * Get the current pen test log.
 */
export function getPenTestLog(): typeof penTestLog {
  return [...penTestLog];
}

/**
 * Check if pen test mode is currently active.
 */
export function isPenTestModeActive(): boolean {
  return penTestMode;
}


// ═══════════════════════════════════════════════════════════════════════
// 11. DEPENDENCY VULNERABILITY SCANNING
// ═══════════════════════════════════════════════════════════════════════

export interface VulnerabilityScanResult {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  vulnerabilities: Array<{
    name: string;
    severity: string;
    title: string;
    url: string;
    range: string;
    fixAvailable: boolean;
  }>;
  scanDate: Date;
  recommendation: string;
}

/**
 * Run npm audit on the project and return structured results.
 * This should be run periodically (e.g., weekly) or on-demand from admin panel.
 */
export async function runDependencyAudit(projectPath?: string): Promise<VulnerabilityScanResult> {
  const cwd = projectPath || process.cwd();

  try {
    // Run npm audit in JSON format
    const { stdout } = await execAsync("npm audit --json 2>/dev/null || true", {
      cwd,
      timeout: 60000,
    });

    let auditData: any;
    try {
      auditData = JSON.parse(stdout);
    } catch {
      return {
        totalVulnerabilities: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        vulnerabilities: [],
        scanDate: new Date(),
        recommendation: "Unable to parse npm audit output. Run manually: npm audit",
      };
    }

    const metadata = auditData.metadata?.vulnerabilities || {};
    const vulns: VulnerabilityScanResult["vulnerabilities"] = [];

    // Parse advisories
    if (auditData.advisories) {
      for (const [, advisory] of Object.entries(auditData.advisories) as any) {
        vulns.push({
          name: advisory.module_name || "unknown",
          severity: advisory.severity || "unknown",
          title: advisory.title || "Unknown vulnerability",
          url: advisory.url || "",
          range: advisory.vulnerable_versions || "*",
          fixAvailable: !!advisory.patched_versions && advisory.patched_versions !== "<0.0.0",
        });
      }
    } else if (auditData.vulnerabilities) {
      // npm v7+ format
      for (const [name, vuln] of Object.entries(auditData.vulnerabilities) as any) {
        vulns.push({
          name,
          severity: vuln.severity || "unknown",
          title: vuln.via?.[0]?.title || vuln.via?.[0] || "Unknown vulnerability",
          url: vuln.via?.[0]?.url || "",
          range: vuln.range || "*",
          fixAvailable: !!vuln.fixAvailable,
        });
      }
    }

    const total = metadata.total || vulns.length;
    const critical = metadata.critical || vulns.filter(v => v.severity === "critical").length;
    const high = metadata.high || vulns.filter(v => v.severity === "high").length;
    const moderate = metadata.moderate || vulns.filter(v => v.severity === "moderate").length;
    const low = metadata.low || vulns.filter(v => v.severity === "low").length;
    const info = metadata.info || vulns.filter(v => v.severity === "info").length;

    let recommendation = "No vulnerabilities detected. Dependencies are clean.";
    if (critical > 0) {
      recommendation = `CRITICAL: ${critical} critical vulnerabilities found. Run "npm audit fix --force" immediately.`;
    } else if (high > 0) {
      recommendation = `WARNING: ${high} high-severity vulnerabilities found. Run "npm audit fix" soon.`;
    } else if (moderate > 0) {
      recommendation = `NOTICE: ${moderate} moderate vulnerabilities found. Review and update when convenient.`;
    } else if (total > 0) {
      recommendation = `${total} low/info vulnerabilities found. No immediate action required.`;
    }

    // Log if critical vulnerabilities found
    if (critical > 0 || high > 0) {
      await logSecurityEvent(0, "dependency_vulnerabilities_detected", {
        total,
        critical,
        high,
        moderate,
        scanDate: new Date().toISOString(),
      }, critical > 0 ? "critical" : "high");
    }

    return {
      totalVulnerabilities: total,
      critical,
      high,
      moderate,
      low,
      info,
      vulnerabilities: vulns.slice(0, 50), // Limit to 50 for response size
      scanDate: new Date(),
      recommendation,
    };
  } catch (err) {
    log.error("[DependencyAudit] Scan failed:", { error: String(err) });
    return {
      totalVulnerabilities: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
      vulnerabilities: [],
      scanDate: new Date(),
      recommendation: `Scan failed: ${String(err)}. Run manually: npm audit`,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 12. ENHANCED SECURITY SWEEP (integrates with security-hardening.ts)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run the fortress-level security sweep.
 * This extends the base security sweep with canary checks,
 * incident counter cleanup, and geo-history pruning.
 */
export async function runFortressSweep(): Promise<{
  canaryStatus: { intact: boolean; tampered: boolean };
  incidentCountersCleaned: number;
  geoHistoriesPruned: number;
  penTestActive: boolean;
}> {
  log.info("[Fortress] Running fortress-level security sweep...");

  // 1. Check canary token
  const canaryStatus = await checkCanaryToken();
  if (canaryStatus.tampered) {
    log.error("[Fortress] CANARY TOKEN TAMPERED — possible database breach!");
  }

  // 2. Clean up expired incident counters
  let incidentCountersCleaned = 0;
  const now = Date.now();
  for (const [key, counter] of incidentCounters.entries()) {
    const windowMs = key.includes("day") ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    if (now - counter.firstSeen > windowMs * 2) {
      incidentCounters.delete(key);
      incidentCountersCleaned++;
    }
  }

  // 3. Prune old geo-history entries
  let geoHistoriesPruned = 0;
  for (const [userId, history] of userGeoHistory.entries()) {
    const cutoff = now - 7 * 24 * 60 * 60 * 1000; // 7 days
    const pruned = history.filter(h => h.timestamp > cutoff);
    if (pruned.length < history.length) {
      geoHistoriesPruned += history.length - pruned.length;
      if (pruned.length === 0) {
        userGeoHistory.delete(userId);
      } else {
        userGeoHistory.set(userId, pruned);
      }
    }
  }

  // 4. Clean up expired 2FA tokens
  for (const [key, session] of admin2FATokens.entries()) {
    if (now - session.verifiedAt > 15 * 60 * 1000) {
      admin2FATokens.delete(key);
    }
  }

  log.info(`[Fortress] Sweep complete: canary=${canaryStatus.intact ? "OK" : "ALERT"}, incidents_cleaned=${incidentCountersCleaned}, geo_pruned=${geoHistoriesPruned}`);

  return {
    canaryStatus,
    incidentCountersCleaned,
    geoHistoriesPruned,
    penTestActive: penTestMode,
  };
}

/**
 * Start the fortress sweep scheduler.
 * Runs every 30 minutes alongside the base security sweep.
 */
export function startFortressSweepScheduler(): void {
  // First sweep after 3 minutes
  setTimeout(() => {
    plantCanaryToken().catch(err => log.error("[Fortress] Canary plant failed:", { error: String(err) }));
    runFortressSweep().catch(err => log.error("[Fortress] Sweep failed:", { error: String(err) }));
  }, 3 * 60 * 1000);

  // Then every 30 minutes
  setInterval(() => {
    runFortressSweep().catch(err => log.error("[Fortress] Sweep failed:", { error: String(err) }));
  }, 30 * 60 * 1000);

  log.info("[Fortress] Fortress sweep scheduler started (every 30 min)");
}

import { createLogger } from "./logger.js";
const log = createLogger("KeyPool");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OpenAI Dedicated Key-Per-System Manager v3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Each system gets its own dedicated API key. No sharing, no rotation,
 * no interference. Simple and bulletproof.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  System                  │  Env Variable         │  Key        │
 * │─────────────────────────────────────────────────────────────────│
 * │  Chat + Builder (primary)│  OPENAI_API_KEY       │  Key-0      │
 * │  Chat + Builder (overflow│  OPENAI_API_KEY_5     │  Key-5      │
 * │  Advertising Orchestrator│  OPENAI_API_KEY_1     │  Key-1      │
 * │  SEO Engine              │  OPENAI_API_KEY_2     │  Key-2      │
 * │  Affiliate + Marketing   │  OPENAI_API_KEY_3     │  Key-3      │
 * │  Blog + Grants + Misc    │  OPENAI_API_KEY_4     │  Key-4      │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Each system declares its SystemTag when calling invokeLLM.
 * The key pool returns the dedicated key for that system.
 * If a system's key gets 429'd, it retries on its OWN key only.
 * Chat has 2 keys — if primary is 429'd, it falls over to overflow.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every LLM caller must declare which system it belongs to.
 * This determines which dedicated API key is used.
 */
export type SystemTag =
  | "chat"           // Chat + Builder (primary key)
  | "advertising"    // Advertising Orchestrator
  | "seo"            // SEO Engine
  | "affiliate"      // Affiliate + Marketing engines
  | "misc"           // Blog, Grants, Auto-Fix, TikTok, etc.
  | "background";    // Legacy fallback — maps to "misc"

/** Kept for backward compatibility with existing code */
export type PoolName = "chat" | "background";

interface KeyEntry {
  /** The API key string */
  key: string;
  /** Human-readable label for logging */
  label: string;
  /** Environment variable name */
  envVar: string;
  /** Number of requests currently in flight */
  activeRequests: number;
  /** Timestamp of last 429 error (0 = never) */
  lastRateLimitedAt: number;
  /** Cooldown period in ms after a 429 */
  cooldownMs: number;
  /** Number of consecutive 429 errors (resets on success) */
  consecutive429s: number;
  /** Total requests served (lifetime) */
  totalRequests: number;
  /** Total 429 errors (lifetime) */
  total429s: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const BASE_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 60_000;

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════

let initialized = false;

/** All discovered keys indexed by their env var name */
const allKeys: Map<string, KeyEntry> = new Map();

/**
 * System → dedicated key mapping.
 * Each system has a primary key and optionally a fallback key.
 */
const systemKeys: Record<SystemTag, { primary: string; fallback?: string }> = {
  chat:          { primary: "OPENAI_API_KEY",   fallback: "OPENAI_API_KEY_5" },
  advertising:   { primary: "OPENAI_API_KEY_1" },
  seo:           { primary: "OPENAI_API_KEY_2" },
  affiliate:     { primary: "OPENAI_API_KEY_3" },
  misc:          { primary: "OPENAI_API_KEY_4" },
  background:    { primary: "OPENAI_API_KEY_4" }, // Legacy "background" maps to misc key
};

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

export function initKeyPool(): void {
  if (initialized) return;

  // Discover all keys from environment
  const envVarsToCheck = [
    "OPENAI_API_KEY",
    ...Array.from({ length: 20 }, (_, i) => `OPENAI_API_KEY_${i + 1}`),
  ];

  for (const envVar of envVarsToCheck) {
    const val = process.env[envVar];
    if (val && val.trim().length > 0) {
      allKeys.set(envVar, {
        key: val.trim(),
        label: envVar === "OPENAI_API_KEY" ? "Key-0 (chat-primary)" : `Key-${envVar.split("_").pop()}`,
        envVar,
        activeRequests: 0,
        lastRateLimitedAt: 0,
        cooldownMs: BASE_COOLDOWN_MS,
        consecutive429s: 0,
        totalRequests: 0,
        total429s: 0,
      });
    }
  }

  // Log the system → key assignments
  log.info(`[KeyPool] ═══ Dedicated Key-Per-System v3 ═══`);
  log.info(`[KeyPool] Discovered ${allKeys.size} API keys`);

  for (const [system, config] of Object.entries(systemKeys)) {
    const primaryKey = allKeys.get(config.primary);
    const fallbackKey = config.fallback ? allKeys.get(config.fallback) : null;

    if (primaryKey) {
      const fb = fallbackKey ? ` (fallback: ${fallbackKey.label})` : "";
      log.info(`[KeyPool]   ${system.padEnd(15)} → ${primaryKey.label}${fb}`);
    } else {
      log.warn(`[KeyPool]   ${system.padEnd(15)} → MISSING (${config.primary} not set!)`);
    }
  }

  initialized = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Key Acquisition — returns the dedicated key for a system
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the dedicated API key for a system.
 *
 * @param system - Which system is making the call
 * @returns The API key string and an index handle for tracking
 */
export function acquireKey(system: SystemTag | PoolName): { key: string; index: number; envVar: string } {
  if (!initialized) initKeyPool();

  // Map legacy PoolName to SystemTag
  const tag: SystemTag = system === "background" ? "misc" : system as SystemTag;
  const config = systemKeys[tag] || systemKeys.misc;

  // Try primary key
  const primaryEntry = allKeys.get(config.primary);
  if (primaryEntry) {
    const now = Date.now();
    const inCooldown = primaryEntry.lastRateLimitedAt > 0 &&
      (now - primaryEntry.lastRateLimitedAt) < primaryEntry.cooldownMs;

    if (!inCooldown) {
      primaryEntry.activeRequests++;
      primaryEntry.totalRequests++;
      return { key: primaryEntry.key, index: 0, envVar: config.primary };
    }

    // Primary is in cooldown — try fallback
    if (config.fallback) {
      const fallbackEntry = allKeys.get(config.fallback);
      if (fallbackEntry) {
        const fbInCooldown = fallbackEntry.lastRateLimitedAt > 0 &&
          (now - fallbackEntry.lastRateLimitedAt) < fallbackEntry.cooldownMs;

        if (!fbInCooldown) {
          fallbackEntry.activeRequests++;
          fallbackEntry.totalRequests++;
          log.info(`[KeyPool] ${tag}: primary in cooldown, using fallback ${fallbackEntry.label}`);
          return { key: fallbackEntry.key, index: 1, envVar: config.fallback };
        }
      }
    }

    // Both in cooldown — use primary anyway (best effort)
    primaryEntry.activeRequests++;
    primaryEntry.totalRequests++;
    log.warn(`[KeyPool] ${tag}: all keys in cooldown, using primary anyway`);
    return { key: primaryEntry.key, index: 0, envVar: config.primary };
  }

  // No primary key found — try fallback
  if (config.fallback) {
    const fallbackEntry = allKeys.get(config.fallback);
    if (fallbackEntry) {
      fallbackEntry.activeRequests++;
      fallbackEntry.totalRequests++;
      log.warn(`[KeyPool] ${tag}: primary missing, using fallback ${fallbackEntry.label}`);
      return { key: fallbackEntry.key, index: 1, envVar: config.fallback };
    }
  }

  // Last resort — use any available key
  const anyKey = allKeys.values().next().value;
  if (anyKey) {
    anyKey.activeRequests++;
    anyKey.totalRequests++;
    log.warn(`[KeyPool] ${tag}: no dedicated key found, using ${anyKey.label} as last resort`);
    return { key: anyKey.key, index: -1, envVar: anyKey.envVar };
  }

  throw new Error(`[KeyPool] No API keys available for system: ${tag}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Key Release & Error Reporting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Release a key after a successful request.
 */
export function releaseKey(index: number, envVar?: string): void {
  if (envVar) {
    const entry = allKeys.get(envVar);
    if (entry) {
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
      entry.consecutive429s = 0;
      entry.cooldownMs = BASE_COOLDOWN_MS;
    }
  }
}

/**
 * Report a 429 rate limit error for a key.
 */
export function reportRateLimit(index: number, envVar?: string): void {
  if (envVar) {
    const entry = allKeys.get(envVar);
    if (entry) {
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
      entry.consecutive429s++;
      entry.total429s++;
      entry.lastRateLimitedAt = Date.now();
      entry.cooldownMs = Math.min(BASE_COOLDOWN_MS * Math.pow(2, entry.consecutive429s - 1), MAX_COOLDOWN_MS);
      log.info(`[KeyPool] ${entry.label} rate limited (429 #${entry.consecutive429s}), ` +
        `cooldown ${Math.round(entry.cooldownMs / 1000)}s`);
    }
  }
}

/**
 * Report a non-429 error for a key.
 */
export function reportError(index: number, envVar?: string): void {
  if (envVar) {
    const entry = allKeys.get(envVar);
    if (entry) {
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Chat Activity Tracking (kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

let _activeChatCalls = 0;

export function chatCallStarted(): void {
  _activeChatCalls++;
}

export function chatCallFinished(): void {
  _activeChatCalls = Math.max(0, _activeChatCalls - 1);
}

export function isBackgroundPaused(): boolean {
  // With dedicated keys, background is never truly "paused" —
  // each system has its own key. But we keep this for monitoring.
  return _activeChatCalls > 0;
}

export function getActiveChatCalls(): number {
  return _activeChatCalls;
}

// ═══════════════════════════════════════════════════════════════════════════
// Concurrency (simplified — no global limit needed with dedicated keys)
// ═══════════════════════════════════════════════════════════════════════════

export async function acquireConcurrencySlot(_isChat: boolean): Promise<void> {
  // With dedicated keys per system, no global concurrency limit needed.
  // Each system is isolated on its own key's rate limit.
  return;
}

export function releaseConcurrencySlot(): void {
  // No-op with dedicated keys
  return;
}

// ═══════════════════════════════════════════════════════════════════════════
// Monitoring
// ═══════════════════════════════════════════════════════════════════════════

export interface KeyPoolStatus {
  totalKeys: number;
  activeChatCalls: number;
  systems: Record<string, {
    primaryKey: string;
    fallbackKey?: string;
    primaryAvailable: boolean;
  }>;
  keys: Array<{
    label: string;
    envVar: string;
    activeRequests: number;
    inCooldown: boolean;
    cooldownRemainingMs: number;
    consecutive429s: number;
    totalRequests: number;
    total429s: number;
  }>;
}

export function getKeyPoolStatus(): KeyPoolStatus {
  if (!initialized) initKeyPool();

  const now = Date.now();

  const systems: Record<string, any> = {};
  for (const [system, config] of Object.entries(systemKeys)) {
    const primary = allKeys.get(config.primary);
    systems[system] = {
      primaryKey: primary?.label || "MISSING",
      fallbackKey: config.fallback ? (allKeys.get(config.fallback)?.label || "MISSING") : undefined,
      primaryAvailable: primary ? !(primary.lastRateLimitedAt > 0 && (now - primary.lastRateLimitedAt) < primary.cooldownMs) : false,
    };
  }

  const keysList: KeyPoolStatus["keys"] = [];
  for (const entry of allKeys.values()) {
    const inCooldown = entry.lastRateLimitedAt > 0 && (now - entry.lastRateLimitedAt) < entry.cooldownMs;
    keysList.push({
      label: entry.label,
      envVar: entry.envVar,
      activeRequests: entry.activeRequests,
      inCooldown,
      cooldownRemainingMs: inCooldown ? Math.max(0, entry.cooldownMs - (now - entry.lastRateLimitedAt)) : 0,
      consecutive429s: entry.consecutive429s,
      totalRequests: entry.totalRequests,
      total429s: entry.total429s,
    });
  }

  return {
    totalKeys: allKeys.size,
    activeChatCalls: _activeChatCalls,
    systems,
    keys: keysList,
  };
}

/**
 * Check if the key pool has at least one key.
 */
export function hasKeys(): boolean {
  if (!initialized) initKeyPool();
  return allKeys.size > 0;
}

/**
 * Get the total number of keys.
 */
export function getKeyCount(): number {
  if (!initialized) initKeyPool();
  return allKeys.size;
}

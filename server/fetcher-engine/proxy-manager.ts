/**
 * Proxy Pool Manager
 * Manages a pool of proxies with health checking, latency testing,
 * geo-location detection, automatic rotation, and provider-level routing.
 */
import { eq, and, asc, desc } from "drizzle-orm";
import { getDb } from "../db";
import { fetcherProxies, type FetcherProxy, type InsertFetcherProxy } from "../../drizzle/schema";
import { encrypt, decrypt } from "../fetcher-db";
import { createLogger } from "../_core/logger.js";
const log = createLogger("ProxyManager");

// ─── Provider Proxy Requirements ─────────────────────────────────────
// Defines which providers need residential proxies to bypass bot detection
export interface ProviderProxyRequirement {
  requiresProxy: boolean;
  proxyTypes: ("residential" | "mobile" | "isp")[];
  reason: string;
}

export const PROVIDER_PROXY_REQUIREMENTS: Record<string, ProviderProxyRequirement> = {
  godaddy: {
    requiresProxy: true,
    proxyTypes: ["residential", "mobile", "isp"],
    reason: "GoDaddy uses Akamai Bot Manager which blocks datacenter IPs at the network level",
  },
  google_cloud: {
    requiresProxy: true,
    proxyTypes: ["residential", "mobile", "isp"],
    reason: "Google detects and blocks automated access from datacenter IPs",
  },
  firebase: {
    requiresProxy: true,
    proxyTypes: ["residential", "mobile", "isp"],
    reason: "Firebase (Google) detects and blocks automated access from datacenter IPs",
  },
  aws: {
    requiresProxy: false,
    proxyTypes: [],
    reason: "AWS generally allows datacenter access but residential proxy improves reliability",
  },
  openai: {
    requiresProxy: false,
    proxyTypes: [],
    reason: "OpenAI may rate-limit datacenter IPs; residential proxy recommended for reliability",
  },
  anthropic: {
    requiresProxy: false,
    proxyTypes: [],
    reason: "Anthropic may rate-limit datacenter IPs",
  },
  github: {
    requiresProxy: false,
    proxyTypes: [],
    reason: "GitHub allows datacenter access",
  },
  stripe: {
    requiresProxy: false,
    proxyTypes: [],
    reason: "Stripe allows datacenter access",
  },
  cloudflare: {
    requiresProxy: true,
    proxyTypes: ["residential", "mobile", "isp"],
    reason: "Cloudflare has strong bot detection that blocks datacenter IPs",
  },
};

// ─── Recommended Proxy Providers ─────────────────────────────────────
export interface ProxyProviderInfo {
  name: string;
  url: string;
  types: string[];
  pricing: string;
  features: string[];
  setupGuide: string;
}

export const RECOMMENDED_PROXY_PROVIDERS: ProxyProviderInfo[] = [
  {
    name: "Bright Data (Luminati)",
    url: "https://brightdata.com",
    types: ["residential", "mobile", "isp", "datacenter"],
    pricing: "From $8.40/GB residential",
    features: ["72M+ residential IPs", "195 countries", "City-level targeting", "Rotating & sticky sessions"],
    setupGuide: "Sign up → Dashboard → Add Zone → Select Residential → Copy host:port and credentials",
  },
  {
    name: "Oxylabs",
    url: "https://oxylabs.io",
    types: ["residential", "mobile", "isp", "datacenter"],
    pricing: "From $8/GB residential",
    features: ["100M+ residential IPs", "195 countries", "City-level targeting", "API access"],
    setupGuide: "Sign up → Dashboard → Residential Proxies → Get credentials (host: pr.oxylabs.io, port: 7777)",
  },
  {
    name: "Smartproxy",
    url: "https://smartproxy.com",
    types: ["residential", "mobile", "datacenter"],
    pricing: "From $7/GB residential",
    features: ["55M+ residential IPs", "195 countries", "Rotating proxies", "Browser extension"],
    setupGuide: "Sign up → Dashboard → Residential → Endpoint Generator → Copy connection details",
  },
  {
    name: "IPRoyal",
    url: "https://iproyal.com",
    types: ["residential", "mobile", "isp", "datacenter"],
    pricing: "From $5.50/GB residential",
    features: ["Ethically sourced IPs", "195 countries", "Sticky sessions up to 24h", "SOCKS5 support"],
    setupGuide: "Sign up → Dashboard → Royal Residential → Generate proxy list → Copy credentials",
  },
  {
    name: "SOAX",
    url: "https://soax.com",
    types: ["residential", "mobile", "isp"],
    pricing: "From $6.60/GB residential",
    features: ["155M+ residential IPs", "Real-time IP validation", "City/ISP targeting", "API access"],
    setupGuide: "Sign up → Dashboard → Create Package → Residential → Copy proxy endpoint",
  },
];

// ─── Proxy CRUD Operations ───────────────────────────────────────────

export async function addProxy(userId: number, data: {
  label: string;
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxyType: "residential" | "datacenter" | "mobile" | "isp";
  country?: string;
  city?: string;
  provider?: string;
  notes?: string;
}): Promise<FetcherProxy> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const encryptedPassword = data.password ? encrypt(data.password) : null;

  await db.insert(fetcherProxies).values({
    userId,
    label: data.label,
    protocol: data.protocol,
    host: data.host,
    port: data.port,
    username: data.username || null,
    password: encryptedPassword,
    proxyType: data.proxyType,
    country: data.country || null,
    city: data.city || null,
    provider: data.provider || null,
    notes: data.notes || null,
  });

  const result = await db.select().from(fetcherProxies)
    .where(eq(fetcherProxies.userId, userId))
    .orderBy(desc(fetcherProxies.id))
    .limit(1);
  return result[0];
}

export async function getProxies(userId: number): Promise<FetcherProxy[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(fetcherProxies)
    .where(eq(fetcherProxies.userId, userId))
    .orderBy(asc(fetcherProxies.id));
}

export async function getProxy(proxyId: number, userId: number): Promise<FetcherProxy | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(fetcherProxies)
    .where(and(eq(fetcherProxies.id, proxyId), eq(fetcherProxies.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateProxy(proxyId: number, userId: number, data: Partial<{
  label: string;
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  proxyType: "residential" | "datacenter" | "mobile" | "isp";
  country: string | null;
  city: string | null;
  provider: string | null;
  notes: string | null;
}>): Promise<FetcherProxy | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = { ...data };
  if (data.password !== undefined) {
    updateData.password = data.password ? encrypt(data.password) : null;
  }

  await db.update(fetcherProxies).set(updateData)
    .where(and(eq(fetcherProxies.id, proxyId), eq(fetcherProxies.userId, userId)));
  return getProxy(proxyId, userId);
}

export async function deleteProxy(proxyId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(fetcherProxies)
    .where(and(eq(fetcherProxies.id, proxyId), eq(fetcherProxies.userId, userId)));
}

// ─── Health Check ────────────────────────────────────────────────────

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  externalIp: string | null;
  country: string | null;
  city: string | null;
  error: string | null;
}

export async function checkProxyHealth(proxy: FetcherProxy): Promise<HealthCheckResult> {
  const proxyPassword = proxy.password ? decrypt(proxy.password) : undefined;
  const proxyUrl = buildProxyUrl(proxy.protocol, proxy.host, proxy.port, proxy.username || undefined, proxyPassword);

  const start = Date.now();

  try {
    // Use a lightweight IP check service to test the proxy
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // We use node's native fetch with a proxy agent
    // For simplicity, test by making a request through the proxy
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const { SocksProxyAgent } = await import("socks-proxy-agent");

    let agent: any;
    if (proxy.protocol === "socks5") {
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      agent = new HttpsProxyAgent(proxyUrl);
    }

    const response = await fetch("https://ipapi.co/json/", {
      signal: controller.signal,
      // @ts-ignore - agent is not in the standard fetch types
      agent,
    } as any);

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return { healthy: false, latencyMs, externalIp: null, country: null, city: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json() as { ip?: string; country_name?: string; city?: string };

    return {
      healthy: true,
      latencyMs,
      externalIp: data.ip || null,
      country: data.country_name || null,
      city: data.city || null,
      error: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      healthy: false,
      latencyMs,
      externalIp: null,
      country: null,
      city: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testAndUpdateProxy(proxyId: number, userId: number): Promise<HealthCheckResult> {
  const proxy = await getProxy(proxyId, userId);
  if (!proxy) throw new Error("Proxy not found");

  const result = await checkProxyHealth(proxy);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(fetcherProxies).set({
    healthy: result.healthy ? 1 : 0,
    latencyMs: result.latencyMs,
    lastCheckedAt: new Date(),
    country: result.country || proxy.country,
    city: result.city || proxy.city,
    failCount: result.healthy ? proxy.failCount : proxy.failCount + 1,
    successCount: result.healthy ? proxy.successCount + 1 : proxy.successCount,
  }).where(eq(fetcherProxies.id, proxyId));

  return result;
}

// ─── Proxy Selection ─────────────────────────────────────────────────

export interface ProxySelection {
  proxy: FetcherProxy | null;
  proxyUrl: string | null;
  proxyConfig: { server: string; username?: string; password?: string } | null;
  reason: string;
}

/**
 * Select the best proxy for a given provider.
 * Considers provider requirements, proxy health, latency, and usage rotation.
 */
export async function selectProxyForProvider(
  userId: number,
  providerId: string
): Promise<ProxySelection> {
  const requirement = PROVIDER_PROXY_REQUIREMENTS[providerId];
  const proxies = await getProxies(userId);

  if (proxies.length === 0) {
    if (requirement?.requiresProxy) {
      return {
        proxy: null,
        proxyUrl: null,
        proxyConfig: null,
        reason: `${providerId} requires a residential proxy but no proxies are configured. Add a proxy in Settings → Proxies.`,
      };
    }
    return {
      proxy: null,
      proxyUrl: null,
      proxyConfig: null,
      reason: "No proxies configured. Using direct connection.",
    };
  }

  // Filter by health and type requirements
  let candidates = proxies.filter(p => p.healthy === 1);

  if (requirement?.requiresProxy && requirement.proxyTypes.length > 0) {
    const typeFiltered = candidates.filter(p =>
      requirement.proxyTypes.includes(p.proxyType as any)
    );
    if (typeFiltered.length > 0) {
      candidates = typeFiltered;
    } else {
      // No matching type — warn but try any healthy proxy
      log.warn(`[ProxyManager] No ${requirement.proxyTypes.join("/")} proxy available for ${providerId}. Using best available.`);
    }
  }

  if (candidates.length === 0) {
    // Fall back to all proxies including unhealthy
    candidates = proxies;
    if (requirement?.requiresProxy) {
      const typeFiltered = candidates.filter(p =>
        requirement.proxyTypes.includes(p.proxyType as any)
      );
      if (typeFiltered.length > 0) candidates = typeFiltered;
    }
  }

  if (candidates.length === 0) {
    return {
      proxy: null,
      proxyUrl: null,
      proxyConfig: null,
      reason: `No suitable proxy found for ${providerId}.`,
    };
  }

  // Sort by: healthy first, then lowest latency, then least recently used
  candidates.sort((a, b) => {
    // Healthy first
    if (a.healthy !== b.healthy) return b.healthy - a.healthy;
    // Lower latency preferred
    const aLat = a.latencyMs ?? 9999;
    const bLat = b.latencyMs ?? 9999;
    if (aLat !== bLat) return aLat - bLat;
    // Least recently used preferred (rotation)
    const aUsed = a.lastUsedAt?.getTime() ?? 0;
    const bUsed = b.lastUsedAt?.getTime() ?? 0;
    return aUsed - bUsed;
  });

  const selected = candidates[0];
  const proxyPassword = selected.password ? decrypt(selected.password) : undefined;
  const proxyUrl = buildProxyUrl(selected.protocol, selected.host, selected.port, selected.username || undefined, proxyPassword);

  // Mark as used
  const db = await getDb();
  if (db) {
    await db.update(fetcherProxies).set({ lastUsedAt: new Date() })
      .where(eq(fetcherProxies.id, selected.id));
  }

  return {
    proxy: selected,
    proxyUrl,
    proxyConfig: {
      server: `${selected.protocol}://${selected.host}:${selected.port}`,
      username: selected.username || undefined,
      password: proxyPassword,
    },
    reason: `Using ${selected.proxyType} proxy "${selected.label}" (${selected.host}:${selected.port})`,
  };
}

/**
 * Record proxy usage result (success or failure) to update health stats.
 */
export async function recordProxyResult(proxyId: number, success: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const proxy = await db.select().from(fetcherProxies).where(eq(fetcherProxies.id, proxyId)).limit(1);
  if (!proxy[0]) return;

  if (success) {
    await db.update(fetcherProxies).set({
      successCount: proxy[0].successCount + 1,
      healthy: 1,
    }).where(eq(fetcherProxies.id, proxyId));
  } else {
    const newFailCount = proxy[0].failCount + 1;
    // Mark unhealthy after 3 consecutive failures
    const healthy = newFailCount >= 3 ? 0 : proxy[0].healthy;
    await db.update(fetcherProxies).set({
      failCount: newFailCount,
      healthy,
    }).where(eq(fetcherProxies.id, proxyId));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildProxyUrl(protocol: string, host: string, port: number, username?: string, password?: string): string {
  const auth = username ? (password ? `${username}:${password}@` : `${username}@`) : "";
  return `${protocol}://${auth}${host}:${port}`;
}

/**
 * Parse a proxy URL string into components.
 * Supports formats:
 *   protocol://user:pass@host:port
 *   host:port:user:pass
 *   host:port
 */
export function parseProxyUrl(input: string): {
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
} | null {
  try {
    // Try URL format first
    if (input.includes("://")) {
      const url = new URL(input);
      const proto = (url.protocol.replace(":", "") as "http" | "https" | "socks5") || "http";
      const defaultPort = proto === "https" ? 443 : proto === "socks5" ? 1080 : 80;
      return {
        protocol: proto,
        host: url.hostname,
        port: url.port ? parseInt(url.port) : defaultPort,
        username: url.username || undefined,
        password: url.password || undefined,
      };
    }

    // Try host:port:user:pass format
    const parts = input.split(":");
    if (parts.length === 4) {
      return {
        protocol: "http",
        host: parts[0],
        port: parseInt(parts[1]),
        username: parts[2],
        password: parts[3],
      };
    }
    if (parts.length === 2) {
      return {
        protocol: "http",
        host: parts[0],
        port: parseInt(parts[1]),
      };
    }

    return null;
  } catch {
    return null;
  }
}

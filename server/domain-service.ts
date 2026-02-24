import { getErrorMessage } from "./_core/errors.js";
/**
 * Domain Service — GoDaddy domain search, purchase, and DNS configuration
 *
 * Provides:
 * 1. Domain availability search with 3 affordable suggestions
 * 2. Domain purchase via GoDaddy API
 * 3. DNS configuration to point domain to Vercel or Railway
 *
 * Requires env vars:
 * - GODADDY_API_KEY: GoDaddy API key
 * - GODADDY_API_SECRET: GoDaddy API secret
 * - GODADDY_ENV: "production" | "ote" (test environment)
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface DomainSuggestion {
  domain: string;
  available: boolean;
  price: number; // in USD cents
  currency: string;
  period: number; // years
  renewalPrice: number; // in USD cents
}

export interface DomainPurchaseResult {
  success: boolean;
  domain: string;
  orderId?: string;
  message: string;
}

export interface DNSRecord {
  type: "A" | "CNAME" | "TXT" | "MX" | "NS";
  name: string;
  data: string;
  ttl: number;
}

// ─── Config ─────────────────────────────────────────────────────────

function getGoDaddyConfig() {
  const apiKey = process.env.GODADDY_API_KEY;
  const apiSecret = process.env.GODADDY_API_SECRET;
  const env = process.env.GODADDY_ENV || "production";

  if (!apiKey || !apiSecret) {
    throw new Error("GoDaddy API credentials not configured. Set GODADDY_API_KEY and GODADDY_API_SECRET environment variables.");
  }

  const baseUrl = env === "ote"
    ? "https://api.ote-godaddy.com"
    : "https://api.godaddy.com";

  return { apiKey, apiSecret, baseUrl };
}

function godaddyHeaders() {
  const { apiKey, apiSecret } = getGoDaddyConfig();
  return {
    Authorization: `sso-key ${apiKey}:${apiSecret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ─── Domain Search ──────────────────────────────────────────────────

/**
 * Search for available domains based on a keyword/brand name.
 * Returns 3 affordable, available domain suggestions.
 */
export async function searchDomains(
  keyword: string,
  maxResults: number = 3
): Promise<DomainSuggestion[]> {
  const { baseUrl } = getGoDaddyConfig();
  const headers = godaddyHeaders();

  // Clean the keyword for domain use
  const cleanKeyword = keyword
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 63);

  if (!cleanKeyword) {
    throw new Error("Invalid keyword for domain search");
  }

  // Strategy: check multiple TLD variations for affordability
  const tlds = [".com", ".net", ".io", ".co", ".app", ".dev", ".site", ".store", ".shop", ".online"];
  const candidates: DomainSuggestion[] = [];

  // 1. Check exact match with popular TLDs
  const exactDomains = tlds.map(tld => cleanKeyword + tld);

  // 2. Also try variations
  const variations = [
    `get${cleanKeyword}`,
    `${cleanKeyword}hq`,
    `${cleanKeyword}app`,
    `my${cleanKeyword}`,
    `the${cleanKeyword}`,
  ];
  const variationDomains = variations.flatMap(v => [".com", ".net", ".io"].map(tld => v + tld));

  const allDomains = [...exactDomains, ...variationDomains];

  // Check availability in batches of 10
  for (let i = 0; i < allDomains.length; i += 10) {
    const batch = allDomains.slice(i, i + 10);

    try {
      // Use the bulk availability check endpoint
      const resp = await fetch(`${baseUrl}/v1/domains/available`, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        // Fallback: check one by one
        for (const domain of batch) {
          try {
            const singleResp = await fetch(
              `${baseUrl}/v1/domains/available?domain=${encodeURIComponent(domain)}`,
              { headers, signal: AbortSignal.timeout(10000) }
            );
            if (singleResp.ok) {
              const data = await singleResp.json() as any;
              if (data.available) {
                candidates.push({
                  domain: data.domain,
                  available: true,
                  price: data.price || 1199, // default ~$11.99
                  currency: data.currency || "USD",
                  period: data.period || 1,
                  renewalPrice: data.renewalPrice || data.price || 1999,
                });
              }
            }
          } catch { /* skip */ }
        }
        continue;
      }

      const results = await resp.json() as any;
      const domainList = Array.isArray(results) ? results : (results.domains || []);

      for (const result of domainList) {
        if (result.available) {
          candidates.push({
            domain: result.domain,
            available: true,
            price: result.price || 1199,
            currency: result.currency || "USD",
            period: result.period || 1,
            renewalPrice: result.renewalPrice || result.price || 1999,
          });
        }
      }
    } catch {
      // Skip failed batches
    }

    // Stop early if we have enough
    if (candidates.length >= maxResults * 2) break;
  }

  // Sort by price (cheapest first) and return top results
  candidates.sort((a, b) => a.price - b.price);
  return candidates.slice(0, maxResults);
}

/**
 * Get the price for a specific domain
 */
export async function getDomainPrice(domain: string): Promise<DomainSuggestion | null> {
  const { baseUrl } = getGoDaddyConfig();
  const headers = godaddyHeaders();

  try {
    const resp = await fetch(
      `${baseUrl}/v1/domains/available?domain=${encodeURIComponent(domain)}`,
      { headers, signal: AbortSignal.timeout(10000) }
    );

    if (!resp.ok) return null;

    const data = await resp.json() as any;
    return {
      domain: data.domain,
      available: data.available,
      price: data.price || 0,
      currency: data.currency || "USD",
      period: data.period || 1,
      renewalPrice: data.renewalPrice || data.price || 0,
    };
  } catch {
    return null;
  }
}

// ─── Domain Purchase ────────────────────────────────────────────────

/**
 * Purchase a domain via GoDaddy API.
 * Requires valid contact info for WHOIS registration.
 */
export async function purchaseDomain(
  domain: string,
  contact: {
    nameFirst: string;
    nameLast: string;
    email: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string; // ISO 2-letter code
    organization?: string;
  },
  years: number = 1,
  privacy: boolean = true
): Promise<DomainPurchaseResult> {
  const { baseUrl } = getGoDaddyConfig();
  const headers = godaddyHeaders();

  const contactInfo = {
    nameFirst: contact.nameFirst,
    nameLast: contact.nameLast,
    email: contact.email,
    phone: contact.phone,
    addressMailing: {
      address1: contact.addressLine1,
      city: contact.city,
      state: contact.state,
      postalCode: contact.postalCode,
      country: contact.country,
    },
    organization: contact.organization || "",
  };

  const purchaseBody = {
    domain,
    consent: {
      agreedAt: new Date().toISOString(),
      agreedBy: contact.email,
      agreementKeys: ["DNRA"],
    },
    contactAdmin: contactInfo,
    contactBilling: contactInfo,
    contactRegistrant: contactInfo,
    contactTech: contactInfo,
    period: years,
    privacy,
    renewAuto: true,
    nameServers: undefined as string[] | undefined,
  };

  try {
    const resp = await fetch(`${baseUrl}/v1/domains/purchase`, {
      method: "POST",
      headers,
      body: JSON.stringify(purchaseBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const error = await resp.json() as any;
      const errorMsg = error.message || error.code || `HTTP ${resp.status}`;
      return {
        success: false,
        domain,
        message: `Domain purchase failed: ${errorMsg}`,
      };
    }

    const result = await resp.json() as any;
    return {
      success: true,
      domain,
      orderId: result.orderId?.toString(),
      message: `Domain ${domain} purchased successfully!`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      domain,
      message: `Domain purchase error: ${getErrorMessage(err)}`,
    };
  }
}

// ─── DNS Configuration ──────────────────────────────────────────────

/**
 * Configure DNS records for a domain to point to Vercel or Railway.
 */
export async function configureDNS(
  domain: string,
  platform: "vercel" | "railway",
  deploymentUrl?: string
): Promise<{ success: boolean; message: string; records: DNSRecord[] }> {
  const { baseUrl } = getGoDaddyConfig();
  const headers = godaddyHeaders();

  let records: DNSRecord[];

  if (platform === "vercel") {
    // Vercel uses CNAME for subdomains and A records for apex domains
    records = [
      { type: "A", name: "@", data: "76.76.21.21", ttl: 600 },
      { type: "CNAME", name: "www", data: "cname.vercel-dns.com", ttl: 600 },
    ];
  } else {
    // Railway uses CNAME pointing to the railway deployment
    const railwayTarget = deploymentUrl
      ? deploymentUrl.replace("https://", "").replace("http://", "")
      : `${domain.replace(/\./g, "-")}.up.railway.app`;

    records = [
      { type: "CNAME", name: "@", data: railwayTarget, ttl: 600 },
      { type: "CNAME", name: "www", data: railwayTarget, ttl: 600 },
    ];
  }

  // Apply DNS records via GoDaddy API
  try {
    // Set A records
    const aRecords = records.filter(r => r.type === "A");
    if (aRecords.length > 0) {
      const resp = await fetch(`${baseUrl}/v1/domains/${domain}/records/A`, {
        method: "PUT",
        headers,
        body: JSON.stringify(aRecords.map(r => ({
          data: r.data,
          name: r.name,
          ttl: r.ttl,
          type: r.type,
        }))),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        const err = await resp.json() as any;
        return { success: false, message: `Failed to set A records: ${getErrorMessage(err) || resp.status}`, records };
      }
    }

    // Set CNAME records
    const cnameRecords = records.filter(r => r.type === "CNAME");
    if (cnameRecords.length > 0) {
      const resp = await fetch(`${baseUrl}/v1/domains/${domain}/records/CNAME`, {
        method: "PUT",
        headers,
        body: JSON.stringify(cnameRecords.map(r => ({
          data: r.data,
          name: r.name,
          ttl: r.ttl,
          type: r.type,
        }))),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        const err = await resp.json() as any;
        return { success: false, message: `Failed to set CNAME records: ${getErrorMessage(err) || resp.status}`, records };
      }
    }

    return {
      success: true,
      message: `DNS configured for ${domain} → ${platform}. Records may take up to 48 hours to propagate.`,
      records,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `DNS configuration error: ${getErrorMessage(err)}`,
      records,
    };
  }
}

/**
 * Get current DNS records for a domain
 */
export async function getDNSRecords(domain: string): Promise<DNSRecord[]> {
  const { baseUrl } = getGoDaddyConfig();
  const headers = godaddyHeaders();

  try {
    const resp = await fetch(`${baseUrl}/v1/domains/${domain}/records`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return [];

    const records = await resp.json() as any[];
    return records.map(r => ({
      type: r.type,
      name: r.name,
      data: r.data,
      ttl: r.ttl,
    }));
  } catch {
    return [];
  }
}

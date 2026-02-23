/**
 * Clone Website Safety & Content Moderation
 * 
 * Prevents replication of:
 * - Banking and financial institution websites
 * - Government websites (.gov, .mil, etc.)
 * - Emergency services (911, police, fire, hospital portals)
 * - Law enforcement and judicial websites
 * - Child safety / abuse related content
 * - Known phishing targets (major platform login pages)
 * - Military and intelligence agency websites
 * - Healthcare provider portals (HIPAA-protected)
 * 
 * Admin users bypass all safety checks.
 * All blocked attempts are logged for audit.
 */

// ─── Blocked Domain Patterns ───────────────────────────────────────
// These are checked against the target URL's hostname

const BLOCKED_DOMAIN_PATTERNS: Array<{ pattern: RegExp; reason: string; category: string }> = [
  // Government domains
  { pattern: /\.gov(\.[a-z]{2})?$/i, reason: "Government websites cannot be cloned", category: "government" },
  { pattern: /\.mil$/i, reason: "Military websites cannot be cloned", category: "government" },
  { pattern: /\.gov\.uk$/i, reason: "UK Government websites cannot be cloned", category: "government" },
  { pattern: /\.gc\.ca$/i, reason: "Canadian Government websites cannot be cloned", category: "government" },
  { pattern: /\.gov\.au$/i, reason: "Australian Government websites cannot be cloned", category: "government" },
  { pattern: /\.europa\.eu$/i, reason: "EU institutional websites cannot be cloned", category: "government" },

  // Banking and financial institutions
  { pattern: /\b(chase|wellsfargo|bankofamerica|citibank|hsbc|barclays|jpmorgan|goldmansachs|morganstanley)\b/i, reason: "Banking websites cannot be cloned", category: "banking" },
  { pattern: /\b(paypal|venmo|cashapp|zelle|wise|revolut|monzo|chime)\b/i, reason: "Payment platform websites cannot be cloned", category: "banking" },
  { pattern: /\b(visa|mastercard|americanexpress|amex|discover)\b/i, reason: "Credit card company websites cannot be cloned", category: "banking" },
  { pattern: /\b(fidelity|vanguard|schwab|etrade|robinhood|coinbase|binance|kraken)\b/i, reason: "Financial trading platforms cannot be cloned", category: "banking" },
  { pattern: /\b(fdic|sec\.gov|finra|occ\.gov)\b/i, reason: "Financial regulatory websites cannot be cloned", category: "banking" },

  // Emergency services
  { pattern: /\b(911|emergency|ambulance)\b/i, reason: "Emergency service websites cannot be cloned", category: "emergency" },
  { pattern: /\b(police|sheriff|lawenforcement|fbi|cia|nsa|dea|atf|interpol|europol)\b/i, reason: "Law enforcement websites cannot be cloned", category: "emergency" },
  { pattern: /\b(firebrigade|firedept|firestation|fire-rescue)\b/i, reason: "Fire service websites cannot be cloned", category: "emergency" },

  // Healthcare / Hospital portals (HIPAA)
  { pattern: /\b(hospital|medicalcenter|healthsystem|medicare|medicaid|nhs\.uk)\b/i, reason: "Healthcare provider portals cannot be cloned", category: "healthcare" },
  { pattern: /\b(mychart|patientportal|healthrecords|epic\.com|cerner\.com)\b/i, reason: "Medical records systems cannot be cloned", category: "healthcare" },

  // Major platform login pages (phishing risk)
  { pattern: /\b(accounts\.google|login\.microsoft|signin\.apple|login\.facebook|auth0)\b/i, reason: "Authentication portals cannot be cloned — phishing risk", category: "phishing" },
  { pattern: /\b(login\.gov|id\.me|irs\.gov)\b/i, reason: "Government identity portals cannot be cloned", category: "phishing" },

  // Military and intelligence
  { pattern: /\b(army|navy|airforce|marines|spaceforce|pentagon|defense\.gov|mod\.uk)\b/i, reason: "Military websites cannot be cloned", category: "military" },

  // Courts and judicial
  { pattern: /\b(uscourts|supremecourt|judiciary|courtservice)\b/i, reason: "Judicial websites cannot be cloned", category: "government" },
];

// ─── Blocked Content Keywords ──────────────────────────────────────
// These are checked against the URL path, target name, and page content

const BLOCKED_CONTENT_KEYWORDS: Array<{ keywords: string[]; reason: string; category: string }> = [
  {
    keywords: ["child abuse", "child exploitation", "csam", "csem", "child porn", "underage", "minor exploitation", "pedophil"],
    reason: "Content related to child abuse or exploitation is strictly prohibited",
    category: "child_safety",
  },
  {
    keywords: ["human trafficking", "sex trafficking", "forced labor", "modern slavery"],
    reason: "Content related to human trafficking is strictly prohibited",
    category: "abuse",
  },
  {
    keywords: ["terrorism", "terrorist", "bomb making", "explosive device", "jihad recruitment"],
    reason: "Content related to terrorism is strictly prohibited",
    category: "terrorism",
  },
  {
    keywords: ["drug dealer", "buy drugs online", "dark market", "darknet market", "illegal substances"],
    reason: "Content related to illegal drug trade is strictly prohibited",
    category: "illegal",
  },
  {
    keywords: ["identity theft", "steal identity", "fake id", "counterfeit document", "forged passport"],
    reason: "Content related to identity fraud is strictly prohibited",
    category: "fraud",
  },
  {
    keywords: ["phishing kit", "credential harvester", "login stealer", "account takeover tool"],
    reason: "Phishing and credential theft tools are strictly prohibited",
    category: "phishing",
  },
];

// ─── Blocked TLD Patterns ──────────────────────────────────────────

const BLOCKED_TLDS = [".gov", ".mil", ".edu"];

// ─── Safety Check Result ───────────────────────────────────────────

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  category?: string;
  blockedBy?: "domain" | "content" | "tld";
}

// ─── Main Safety Check Function ────────────────────────────────────

/**
 * Check if a target URL is safe to clone.
 * Admin users bypass all checks.
 * 
 * @param targetUrl - The URL the user wants to clone
 * @param targetName - The name/description the user provided
 * @param isAdmin - Whether the user is an admin
 * @param pageContent - Optional: scraped page content for deeper analysis
 * @returns SafetyCheckResult
 */
export function checkCloneSafety(
  targetUrl: string,
  targetName: string,
  isAdmin: boolean,
  pageContent?: string
): SafetyCheckResult {
  // Admin users bypass all safety checks
  if (isAdmin) {
    return { allowed: true };
  }

  try {
    const url = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
    const hostname = url.hostname.toLowerCase();
    const fullUrl = url.href.toLowerCase();

    // Check 1: Blocked TLDs
    for (const tld of BLOCKED_TLDS) {
      if (hostname.endsWith(tld)) {
        return {
          allowed: false,
          reason: `Websites with ${tld} domains cannot be cloned. This includes government, military, and educational institution websites.`,
          category: "tld_block",
          blockedBy: "tld",
        };
      }
    }

    // Check 2: Blocked domain patterns
    for (const rule of BLOCKED_DOMAIN_PATTERNS) {
      if (rule.pattern.test(hostname) || rule.pattern.test(fullUrl)) {
        return {
          allowed: false,
          reason: rule.reason,
          category: rule.category,
          blockedBy: "domain",
        };
      }
    }

    // Check 3: Blocked content keywords in URL and target name
    const textToCheck = `${fullUrl} ${targetName}`.toLowerCase();
    for (const rule of BLOCKED_CONTENT_KEYWORDS) {
      for (const keyword of rule.keywords) {
        if (textToCheck.includes(keyword.toLowerCase())) {
          return {
            allowed: false,
            reason: rule.reason,
            category: rule.category,
            blockedBy: "content",
          };
        }
      }
    }

    // Check 4: If page content is provided, scan it too
    if (pageContent) {
      const contentLower = pageContent.toLowerCase();
      for (const rule of BLOCKED_CONTENT_KEYWORDS) {
        for (const keyword of rule.keywords) {
          if (contentLower.includes(keyword.toLowerCase())) {
            return {
              allowed: false,
              reason: rule.reason,
              category: rule.category,
              blockedBy: "content",
            };
          }
        }
      }
    }

    // All checks passed
    return { allowed: true };
  } catch {
    // If URL parsing fails, allow it (the actual fetch will fail later)
    return { allowed: true };
  }
}

/**
 * Quick pre-check before even starting the clone process.
 * Throws an error if the URL is blocked.
 */
export function enforceCloneSafety(
  targetUrl: string,
  targetName: string,
  isAdmin: boolean
): void {
  const result = checkCloneSafety(targetUrl, targetName, isAdmin);
  if (!result.allowed) {
    throw new Error(
      `🚫 Clone blocked: ${result.reason}\n\n` +
      `Archibald Titan does not support the replication of websites related to ` +
      `banking, government, emergency services, law enforcement, healthcare portals, ` +
      `or any content involving abuse, exploitation, or illegal activity.\n\n` +
      `If you believe this is an error, please contact support.`
    );
  }
}

/**
 * Post-scrape content check — run after fetching the target page
 * to catch blocked content that wasn't visible in the URL.
 */
export function checkScrapedContent(
  targetUrl: string,
  targetName: string,
  scrapedHtml: string,
  isAdmin: boolean
): SafetyCheckResult {
  return checkCloneSafety(targetUrl, targetName, isAdmin, scrapedHtml);
}

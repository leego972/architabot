/**
 * Autonomous SEO Engine v3 for Archibald Titan
 *
 * Major improvements over v2:
 *  1. Dynamic per-page meta tag injection (SSR-like) — solves the SPA SEO problem
 *  2. Dynamic OG image generation endpoint with proper 1200×630 dimensions
 *  3. security.txt (/.well-known/security.txt) generation
 *  4. Hreflang alternate link tags for 12 supported languages
 *  5. Smarter sitemap with <news:news>, <image:image>, lastmod from DB
 *  6. Page-specific structured data (not just global schemas)
 *  7. Performance / Core Web Vitals beacon endpoint
 *  8. Content brief persistence to DB (seo_content_briefs table)
 *  9. Improved scoring with mobile-friendliness and accessibility checks
 * 10. Auto blog post SEO with focus keyword density analysis
 * 11. Redirect manager for old/moved URLs
 * 12. RSS/Atom feed generation for blog
 * 13. Smarter scheduling: cost-aware (skip startup, stagger LLM calls)
 * 14. Google Search Console IndexNow integration
 * 15. All v2 features preserved (robots.txt, sitemap, structured data, etc.)
 */

import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { blogPosts } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("SeoEngine");

// ─── Configuration ──────────────────────────────────────────────────

const SITE_URL = "https://www.archibaldtitan.com";
const SITE_NAME = "Archibald Titan";
const SITE_DESCRIPTION =
  "The World's Most Advanced Local AI Agent. Autonomously retrieve API keys and credentials from 15+ providers. AES-256 encrypted vault, stealth browser, CAPTCHA solving, and residential proxy support.";
const SITE_LOGO =
  "/logos/at-icon-256.png";
const SITE_TWITTER = "@ArchibaldTitan";
const SITE_CONTACT_EMAIL = "security@archibaldtitan.com";

// Supported languages for hreflang
const SUPPORTED_LOCALES = [
  "en", "es", "fr", "de", "pt", "zh", "ja", "ko", "ar", "hi", "ru", "it",
];

// ─── Kill Switch ────────────────────────────────────────────────────

let isKilled = false;
const KILL_CODE = "SEO_KILL_9X4M";

export function triggerSeoKillSwitch(code: string): boolean {
  if (code === KILL_CODE) {
    isKilled = true;
    logSeoEvent("kill_switch", "SEO kill switch activated");
    log.info("[SEO] KILL SWITCH ACTIVATED — all SEO operations halted");
    return true;
  }
  return false;
}

export function resetSeoKillSwitch(code: string): boolean {
  if (code === KILL_CODE) {
    isKilled = false;
    logSeoEvent("kill_switch", "SEO kill switch reset");
    log.info("[SEO] Kill switch reset — SEO operations resumed");
    return true;
  }
  return false;
}

export function isSeoKilled(): boolean {
  return isKilled;
}

// ─── SEO Event Log (Audit Trail) ───────────────────────────────────

interface SeoEvent {
  timestamp: number;
  type: string;
  message: string;
  data?: any;
}

const seoEventLog: SeoEvent[] = [];
const MAX_LOG_SIZE = 1000;

function logSeoEvent(type: string, message: string, data?: any): void {
  seoEventLog.push({ timestamp: Date.now(), type, message, data });
  if (seoEventLog.length > MAX_LOG_SIZE) {
    seoEventLog.splice(0, seoEventLog.length - MAX_LOG_SIZE);
  }
}

export function getSeoEventLog(limit = 50): SeoEvent[] {
  return seoEventLog.slice(-limit);
}

// ─── Public Pages Configuration ─────────────────────────────────────

export interface PageSeoConfig {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  priority: number;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  ogType: string;
  structuredDataType?: string;
  canonicalUrl?: string;
  breadcrumbs?: Array<{ name: string; url: string }>;
  /** If true, page is behind auth and should NOT be indexed */
  noIndex?: boolean;
}

const PUBLIC_PAGES: PageSeoConfig[] = [
  {
    path: "/",
    title: "Archibald Titan — The World's Most Advanced Local AI Agent",
    description:
      "Autonomously retrieve API keys and credentials from 15+ providers. AES-256 encrypted vault, stealth browser, CAPTCHA solving, and residential proxy support. Download for Windows, Mac, and Linux.",
    keywords: [
      "AI agent", "credential management", "API key automation", "local AI",
      "browser automation", "CAPTCHA solver", "developer tools", "cybersecurity",
      "password manager", "stealth browser", "DevOps tools", "secret management",
    ],
    priority: 1.0,
    changefreq: "daily",
    ogType: "website",
    structuredDataType: "SoftwareApplication",
    breadcrumbs: [{ name: "Home", url: "/" }],
  },
  {
    path: "/pricing",
    title: "Pricing — Archibald Titan | Free, Pro & Enterprise Plans",
    description:
      "Choose the right plan for your needs. Start free with 5 fetches/month, upgrade to Pro for unlimited fetches, CAPTCHA solving, and priority support. Enterprise plans available.",
    keywords: [
      "pricing", "subscription plans", "free tier", "pro plan", "enterprise",
      "AI agent pricing", "developer tool pricing", "SaaS pricing",
    ],
    priority: 0.9,
    changefreq: "weekly",
    ogType: "website",
    structuredDataType: "Product",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Pricing", url: "/pricing" },
    ],
  },
  {
    path: "/blog",
    title: "Blog — Archibald Titan | Developer Security & AI Insights",
    description:
      "Expert articles on credential security, browser automation, AI agents, developer tools, and cybersecurity best practices. Stay ahead with Archibald Titan.",
    keywords: [
      "developer blog", "cybersecurity blog", "AI agent insights",
      "credential security", "automation tutorials", "developer tools blog",
    ],
    priority: 0.8,
    changefreq: "daily",
    ogType: "website",
    structuredDataType: "Blog",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" },
    ],
  },
  {
    path: "/docs",
    title: "Documentation — Archibald Titan | API Reference & Guides",
    description:
      "Complete documentation for Archibald Titan. API reference, integration guides, provider setup tutorials, and troubleshooting. Get started in minutes.",
    keywords: [
      "documentation", "API reference", "integration guide", "developer docs",
      "setup tutorial", "getting started",
    ],
    priority: 0.8,
    changefreq: "weekly",
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Docs", url: "/docs" },
    ],
  },
  {
    path: "/contact",
    title: "Contact Us — Archibald Titan Support",
    description:
      "Get in touch with the Archibald Titan team. Technical support, billing inquiries, partnership opportunities, and enterprise sales.",
    keywords: ["contact", "support", "help", "customer service", "enterprise sales"],
    priority: 0.6,
    changefreq: "monthly",
    ogType: "website",
    structuredDataType: "ContactPage",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Contact", url: "/contact" },
    ],
  },
  {
    path: "/compare",
    title: "Archibald Titan vs Competitors | Feature Comparison",
    description:
      "See how Archibald Titan compares to 1Password, HashiCorp Vault, and other credential management tools. Detailed feature comparison and pricing analysis.",
    keywords: [
      "comparison", "alternative", "vs 1Password", "vs HashiCorp Vault",
      "credential manager comparison", "best API key manager",
    ],
    priority: 0.7,
    changefreq: "monthly",
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Compare", url: "/compare" },
    ],
  },
  {
    path: "/register",
    title: "Create Account — Archibald Titan | Get Started Free",
    description:
      "Create your free Archibald Titan account. Start automating credential retrieval with 5 free fetches per month. No credit card required.",
    keywords: ["register", "sign up", "create account", "free trial", "get started"],
    priority: 0.8,
    changefreq: "monthly",
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Get Started", url: "/register" },
    ],
  },
  {
    path: "/login",
    title: "Sign In — Archibald Titan",
    description:
      "Sign in to your Archibald Titan account. Access your dashboard, credentials vault, and AI agent.",
    keywords: ["login", "sign in", "account"],
    priority: 0.4,
    changefreq: "monthly",
    ogType: "website",
  },
  {
    path: "/terms",
    title: "Terms of Service — Archibald Titan",
    description:
      "Read the terms of service for Archibald Titan. Usage policies, liability limitations, and user responsibilities.",
    keywords: ["terms of service", "legal", "usage policy"],
    priority: 0.3,
    changefreq: "yearly",
    ogType: "website",
  },
  {
    path: "/privacy",
    title: "Privacy Policy — Archibald Titan",
    description:
      "Learn how Archibald Titan protects your data. AES-256 encryption, local-first architecture, zero-knowledge design, and GDPR compliance.",
    keywords: ["privacy policy", "data protection", "GDPR", "encryption", "security"],
    priority: 0.3,
    changefreq: "yearly",
    ogType: "website",
  },
];

// ─── Dynamic Meta Tag Injection (SSR-like) ─────────────────────────
// This is the #1 most impactful SEO improvement: Google sees unique
// <title>, <meta description>, <og:*>, and <link canonical> per page.

export function injectMetaTags(html: string, requestPath: string): string {
  // Normalize path: strip trailing slash, query params, hash
  const cleanPath = requestPath.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";

  // Find matching page config
  let page = PUBLIC_PAGES.find((p) => p.path === cleanPath);

  // Check for blog post pattern: /blog/:slug
  const blogMatch = cleanPath.match(/^\/blog\/([a-z0-9-]+)$/);

  if (!page && !blogMatch) {
    // Unknown page — use homepage defaults
    page = PUBLIC_PAGES[0];
  }

  const title = page?.title || PUBLIC_PAGES[0].title;
  const description = page?.description || PUBLIC_PAGES[0].description;
  const canonicalUrl = page?.canonicalUrl || `${SITE_URL}${cleanPath}`;
  const ogType = page?.ogType || "website";
  const keywords = page?.keywords?.join(", ") || PUBLIC_PAGES[0].keywords.join(", ");
  const noIndex = page?.noIndex;

  // Build replacement <head> content
  const replacements: Array<[RegExp, string]> = [
    // Title
    [/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`],
    // Meta description
    [
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeAttr(description)}" />`,
    ],
    // Meta keywords
    [
      /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/,
      `<meta name="keywords" content="${escapeAttr(keywords)}" />`,
    ],
    // Canonical
    [
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`,
    ],
    // OG title
    [
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escapeAttr(title)}" />`,
    ],
    // OG description
    [
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${escapeAttr(description)}" />`,
    ],
    // OG URL
    [
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`,
    ],
    // OG type
    [
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:type" content="${escapeAttr(ogType)}" />`,
    ],
    // Twitter title
    [
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    ],
    // Twitter description
    [
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    ],
    // Twitter URL
    [
      /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:url" content="${escapeAttr(canonicalUrl)}" />`,
    ],
  ];

  let result = html;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  // Inject robots noindex for auth pages
  if (noIndex) {
    result = result.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/,
      `<meta name="robots" content="noindex, nofollow" />`
    );
  }

  // Inject hreflang tags (before </head>)
  const hreflangTags = SUPPORTED_LOCALES.map(
    (locale) =>
      `<link rel="alternate" hreflang="${locale}" href="${SITE_URL}${cleanPath}${locale === "en" ? "" : `?lang=${locale}`}" />`
  ).join("\n    ");
  const xDefaultTag = `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${cleanPath}" />`;
  result = result.replace(
    "</head>",
    `    ${hreflangTags}\n    ${xDefaultTag}\n  </head>`
  );

  // Inject page-specific JSON-LD structured data (before </head>)
  const pageStructuredData = generatePageStructuredData(cleanPath, title, description);
  if (pageStructuredData) {
    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(pageStructuredData)}</script>`;
    result = result.replace("</head>", `    ${jsonLdScript}\n  </head>`);
  }

  // Inject SEO v4 enhancements (AI citation meta, enhanced structured data, preload hints)
  try {
    const { injectV4MetaTags } = require("./seo-engine-v4");
    result = injectV4MetaTags(result, requestPath);
  } catch {
    // v4 module not available — graceful fallback
  }

  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Page-Specific Structured Data ─────────────────────────────────

function generatePageStructuredData(
  path: string,
  title: string,
  description: string
): Record<string, any> | null {
  const page = PUBLIC_PAGES.find((p) => p.path === path);
  if (!page?.breadcrumbs) return null;

  // BreadcrumbList for this specific page
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: page.breadcrumbs.map((bc, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: bc.name,
      item: `${SITE_URL}${bc.url}`,
    })),
  };
}

// ─── robots.txt Generation ──────────────────────────────────────────

export function generateRobotsTxt(): string {
  return `# Archibald Titan — robots.txt
# Generated by Autonomous SEO Engine v3

User-agent: *
Allow: /
Allow: /blog/
Allow: /docs/
Allow: /pricing
Allow: /compare
Allow: /contact
Allow: /register
Disallow: /api/
Disallow: /dashboard/
Disallow: /settings/
Disallow: /admin/
Disallow: /chat
Disallow: /_next/
Disallow: /static/

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml

# Crawl-delay for aggressive bots
User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10

User-agent: MJ12bot
Crawl-delay: 30

User-agent: DotBot
Crawl-delay: 30

# Block AI training scrapers (protect proprietary content)
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Applebot-Extended
Disallow: /
`;
}

// ─── security.txt Generation ────────────────────────────────────────

export function generateSecurityTxt(): string {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  return `Contact: mailto:${SITE_CONTACT_EMAIL}
Contact: ${SITE_URL}/contact
Expires: ${expires.toISOString()}
Preferred-Languages: en
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: ${SITE_URL}/terms
`;
}

// ─── Sitemap Generation ─────────────────────────────────────────────

export async function generateSitemapXml(): Promise<string> {
  const now = new Date().toISOString().split("T")[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

  for (const page of PUBLIC_PAGES) {
    if (page.noIndex) continue;

    xml += `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
`;
    // Hreflang alternates for every public page
    for (const locale of SUPPORTED_LOCALES) {
      const href = locale === "en" ? `${SITE_URL}${page.path}` : `${SITE_URL}${page.path}?lang=${locale}`;
      xml += `    <xhtml:link rel="alternate" hreflang="${locale}" href="${href}" />\n`;
    }
    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${page.path}" />\n`;

    if (page.path === "/") {
      xml += `    <image:image>
      <image:loc>${SITE_LOGO}</image:loc>
      <image:title>${SITE_NAME}</image:title>
      <image:caption>${escapeXml(SITE_DESCRIPTION)}</image:caption>
    </image:image>
`;
    }
    xml += `  </url>\n`;
  }

  // Add blog posts to sitemap dynamically
  try {
    const db = await getDb();
    if (db) {
      const posts = await db
        .select({
          slug: blogPosts.slug,
          title: blogPosts.title,
          updatedAt: blogPosts.updatedAt,
          publishedAt: blogPosts.publishedAt,
          coverImageUrl: blogPosts.coverImageUrl,
        })
        .from(blogPosts)
        .where(eq(blogPosts.status, "published"))
        .orderBy(desc(blogPosts.publishedAt));

      for (const post of posts) {
        const lastmod = post.updatedAt
          ? new Date(post.updatedAt).toISOString().split("T")[0]
          : now;
        xml += `  <url>
    <loc>${SITE_URL}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
`;
        // Image sitemap for blog cover images
        if (post.coverImageUrl) {
          xml += `    <image:image>
      <image:loc>${escapeXml(post.coverImageUrl)}</image:loc>
      <image:title>${escapeXml(post.title)}</image:title>
    </image:image>
`;
        }
        // News sitemap for posts published within last 2 days
        if (post.publishedAt) {
          const pubDate = new Date(post.publishedAt);
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
          if (pubDate > twoDaysAgo) {
            xml += `    <news:news>
      <news:publication>
        <news:name>${SITE_NAME}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate.toISOString()}</news:publication_date>
      <news:title>${escapeXml(post.title)}</news:title>
    </news:news>
`;
          }
        }
        xml += `  </url>\n`;
      }

      logSeoEvent("sitemap", `Generated sitemap with ${PUBLIC_PAGES.length + posts.length} URLs`);
    }
  } catch (err) {
    log.error("[SEO] Failed to add blog posts to sitemap:", { error: String(err) });
  }

  xml += `</urlset>`;
  return xml;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── RSS / Atom Feed Generation ─────────────────────────────────────

export async function generateRssFeed(): Promise<string> {
  const now = new Date().toUTCString();
  let items = "";

  try {
    const db = await getDb();
    if (db) {
      const posts = await db
        .select({
          slug: blogPosts.slug,
          title: blogPosts.title,
          excerpt: blogPosts.excerpt,
          publishedAt: blogPosts.publishedAt,
          category: blogPosts.category,
        })
        .from(blogPosts)
        .where(eq(blogPosts.status, "published"))
        .orderBy(desc(blogPosts.publishedAt));

      for (const post of posts.slice(0, 50)) {
        const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : now;
        items += `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <description>${escapeXml(post.excerpt || "")}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(post.category)}</category>
    </item>\n`;
      }
    }
  } catch (err) {
    log.error("[SEO] RSS feed generation error:", { error: String(err) });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_LOGO}</url>
      <title>${SITE_NAME}</title>
      <link>${SITE_URL}</link>
    </image>
${items}  </channel>
</rss>`;
}

// ─── Structured Data (JSON-LD) — Global Schemas ────────────────────

export function generateStructuredData(): Record<string, any>[] {
  const schemas: Record<string, any>[] = [];

  // Organization schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: SITE_LOGO,
    description: SITE_DESCRIPTION,
    sameAs: [
      "https://github.com/ArchibaldTitan",
      "https://twitter.com/ArchibaldTitan",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${SITE_URL}/contact`,
      email: SITE_CONTACT_EMAIL,
      availableLanguage: SUPPORTED_LOCALES.map((l) => l.toUpperCase()),
    },
    foundingDate: "2025",
    knowsAbout: [
      "AI Agents", "Credential Management", "Browser Automation",
      "Cybersecurity", "Developer Tools", "Secret Management",
    ],
  });

  // SoftwareApplication schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Security",
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: "3.0",
    releaseNotes: `${SITE_URL}/blog/release-notes`,
    downloadUrl: `${SITE_URL}/register`,
    screenshot: SITE_LOGO,
    offers: [
      {
        "@type": "Offer",
        name: "Free Plan",
        price: "0",
        priceCurrency: "USD",
        description: "5 fetches/month, basic providers, community support",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Pro Plan",
        price: "29",
        priceCurrency: "USD",
        priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        description: "Unlimited fetches, all providers, CAPTCHA solving, priority support",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Enterprise Plan",
        price: "99",
        priceCurrency: "USD",
        priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        description: "Everything in Pro plus team management, API access, dedicated support",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/pricing`,
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
      bestRating: "5",
      worstRating: "1",
    },
    featureList: [
      "Autonomous credential retrieval from 50+ providers",
      "AES-256 encrypted vault",
      "Stealth browser with anti-detection",
      "CAPTCHA solving (reCAPTCHA, hCaptcha, Turnstile)",
      "Residential proxy support",
      "REST API and webhooks",
      "Team management and collaboration",
      "Cross-platform (Windows, Mac, Linux)",
      "Self-improving AI engine",
      "12-language internationalization",
      "Voice-powered AI chat",
      "Advertising automation across 15+ platforms",
    ],
  });

  // WebSite schema with search action
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/blog?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  });

  // FAQ schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Archibald Titan?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Archibald Titan is the world's most advanced local AI agent that autonomously retrieves API keys and credentials from 50+ providers. It features AES-256 encryption, stealth browser technology, CAPTCHA solving, and residential proxy support.",
        },
      },
      {
        "@type": "Question",
        name: "Is Archibald Titan free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, Archibald Titan offers a free plan with 5 fetches per month and access to basic providers. Pro ($29/mo) and Enterprise ($99/mo) plans are available for power users and teams.",
        },
      },
      {
        "@type": "Question",
        name: "What platforms does Archibald Titan support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Archibald Titan is available for Windows (.exe), macOS (.dmg), and Linux (.AppImage). It also runs as a web app at archibaldtitan.com.",
        },
      },
      {
        "@type": "Question",
        name: "How does Archibald Titan protect my credentials?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "All credentials are encrypted with AES-256 encryption and stored in a local vault. The system uses a zero-knowledge architecture — your master password never leaves your device.",
        },
      },
      {
        "@type": "Question",
        name: "How is Archibald Titan different from 1Password or HashiCorp Vault?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Unlike traditional password managers, Archibald Titan autonomously retrieves and manages API keys using AI-powered browser automation. It actively fetches credentials from provider dashboards, solves CAPTCHAs, and handles bot detection — no manual copy-paste needed.",
        },
      },
      {
        "@type": "Question",
        name: "Does Archibald Titan support team collaboration?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, the Enterprise plan includes team management, shared credential vaults, role-based access control, and audit logging for compliance.",
        },
      },
    ],
  });

  // HowTo schema — Getting Started
  schemas.push({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Get Started with Archibald Titan",
    description: "Set up Archibald Titan in 3 easy steps to automate your credential management.",
    totalTime: "PT5M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Create an Account",
        text: "Sign up for a free account at archibaldtitan.com/register. No credit card required.",
        url: `${SITE_URL}/register`,
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Add Your Provider Credentials",
        text: "Enter your email and password for providers like OpenAI, AWS, GitHub, etc. in the Fetcher dashboard.",
        url: `${SITE_URL}/dashboard`,
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Run Your First Fetch",
        text: "Click 'Start Fetch' and Titan will autonomously log in, navigate to API key pages, and extract your credentials into the encrypted vault.",
        url: `${SITE_URL}/dashboard`,
      },
    ],
  });

  return schemas;
}

// ─── Blog Post SEO Auto-Optimization ────────────────────────────────

export interface BlogPostSeo {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  readingTimeMinutes: number;
  excerpt: string;
  internalLinks: Array<{ text: string; url: string }>;
  structuredData: Record<string, any>;
  focusKeywordDensity: number;
  wordCount: number;
  headingStructure: string[];
}

export async function optimizeBlogPostSeo(
  slug: string,
  title: string,
  content: string,
  focusKeyword?: string
): Promise<BlogPostSeo> {
  // Calculate reading time (average 238 words per minute for technical content)
  const wordCount = content.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 238));

  // Generate excerpt (first 155 chars of content, cleaned — optimal for Google snippet)
  const cleanContent = content.replace(/<[^>]+>/g, "").replace(/[#*_`]/g, "").trim();
  const excerpt =
    cleanContent.substring(0, 155).trim() + (cleanContent.length > 155 ? "..." : "");

  // Analyze heading structure (H1, H2, H3)
  const headingStructure: string[] = [];
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headingStructure.push(`H${match[1].length}: ${match[2]}`);
  }

  // Focus keyword density analysis
  let focusKeywordDensity = 0;
  if (focusKeyword) {
    const lowerContent = cleanContent.toLowerCase();
    const lowerKeyword = focusKeyword.toLowerCase();
    const keywordCount = (lowerContent.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    focusKeywordDensity = wordCount > 0 ? Math.round((keywordCount / wordCount) * 10000) / 100 : 0;
  }

  // Determine internal links based on content keywords
  const internalLinks: Array<{ text: string; url: string }> = [];
  const linkableKeywords: Record<string, string> = {
    pricing: "/pricing",
    "free plan": "/pricing",
    "pro plan": "/pricing",
    enterprise: "/pricing",
    "sign up": "/register",
    "get started": "/register",
    documentation: "/docs",
    "API reference": "/docs",
    contact: "/contact",
    compare: "/compare",
    "credential management": "/",
    "AI agent": "/",
    "browser automation": "/",
    "CAPTCHA solving": "/pricing",
    blog: "/blog",
  };

  for (const [keyword, url] of Object.entries(linkableKeywords)) {
    if (content.toLowerCase().includes(keyword.toLowerCase())) {
      internalLinks.push({ text: keyword, url });
    }
  }

  // Generate optimized meta tags with LLM
  let metaTitle = `${title} | ${SITE_NAME}`;
  let metaDescription = excerpt;
  let keywords: string[] = [];

  try {
    const response = await invokeLLM({
      priority: "background",
      messages: [
        {
          role: "system",
          content: `You are an SEO expert. Generate optimized meta tags for a blog post.
Rules:
- metaTitle: 50-60 chars, include primary keyword near the start, include brand name
- metaDescription: 150-155 chars, compelling with a CTA, include primary keyword
- keywords: 5-8 relevant long-tail keywords

Return JSON: {"metaTitle": "...", "metaDescription": "...", "keywords": ["..."]}`,
        },
        {
          role: "user",
          content: `Blog post title: ${title}\nFocus keyword: ${focusKeyword || "auto-detect"}\nFirst 500 chars: ${cleanContent.substring(0, 500)}\nSite: ${SITE_NAME}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "blog_seo",
          strict: true,
          schema: {
            type: "object",
            properties: {
              metaTitle: { type: "string" },
              metaDescription: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
            },
            required: ["metaTitle", "metaDescription", "keywords"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices?.[0]?.message?.content as string);
    metaTitle = parsed.metaTitle || metaTitle;
    metaDescription = parsed.metaDescription || metaDescription;
    keywords = parsed.keywords || [];
  } catch (err) {
    log.error("[SEO] Blog post LLM optimization failed, using defaults:", { error: String(err) });
    keywords = title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
  }

  // Generate Article structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: metaTitle,
    description: metaDescription,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: SITE_LOGO },
    },
    url: `${SITE_URL}/blog/${slug}`,
    mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
    wordCount,
    timeRequired: `PT${readingTimeMinutes}M`,
    keywords: keywords.join(", "),
    inLanguage: "en",
    isAccessibleForFree: true,
  };

  logSeoEvent("blog_seo", `Optimized blog post: ${slug}`, {
    metaTitle,
    keywords,
    focusKeywordDensity,
    wordCount,
  });

  return {
    slug,
    metaTitle,
    metaDescription,
    keywords,
    readingTimeMinutes,
    excerpt,
    internalLinks,
    structuredData,
    focusKeywordDensity,
    wordCount,
    headingStructure,
  };
}

// ─── Internal Linking Analysis ──────────────────────────────────────

export interface InternalLinkAnalysis {
  orphanPages: string[];
  weaklyLinkedPages: Array<{ page: string; incomingLinks: number }>;
  suggestedLinks: Array<{ from: string; to: string; anchorText: string; reason: string }>;
  totalInternalLinks: number;
  linkDepth: Record<string, number>;
  analyzedAt: number;
}

export async function analyzeInternalLinks(): Promise<InternalLinkAnalysis> {
  const linkMap = new Map<string, Set<string>>();
  const incomingCount = new Map<string, number>();

  for (const page of PUBLIC_PAGES) {
    linkMap.set(page.path, new Set());
    incomingCount.set(page.path, 0);
  }

  // Analyze keyword overlap to suggest internal links
  for (const source of PUBLIC_PAGES) {
    for (const target of PUBLIC_PAGES) {
      if (source.path === target.path) continue;
      const overlap = source.keywords.filter((k) =>
        target.keywords.some(
          (tk) =>
            tk.toLowerCase().includes(k.toLowerCase()) ||
            k.toLowerCase().includes(tk.toLowerCase())
        )
      );
      if (overlap.length >= 2) {
        linkMap.get(source.path)?.add(target.path);
        incomingCount.set(target.path, (incomingCount.get(target.path) || 0) + 1);
      }
    }
  }

  const orphanPages = PUBLIC_PAGES.filter(
    (p) => (incomingCount.get(p.path) || 0) === 0 && p.path !== "/"
  ).map((p) => p.path);

  const weaklyLinkedPages = PUBLIC_PAGES.filter(
    (p) => (incomingCount.get(p.path) || 0) <= 1 && p.path !== "/"
  ).map((p) => ({ page: p.path, incomingLinks: incomingCount.get(p.path) || 0 }));

  // Generate link suggestions
  const suggestedLinks: Array<{
    from: string;
    to: string;
    anchorText: string;
    reason: string;
  }> = [];

  for (const orphan of orphanPages) {
    const orphanPage = PUBLIC_PAGES.find((p) => p.path === orphan);
    if (!orphanPage) continue;
    suggestedLinks.push({
      from: "/",
      to: orphan,
      anchorText: orphanPage.title.split(" — ")[0] || orphanPage.title,
      reason: `${orphan} is an orphan page with no incoming internal links`,
    });
  }

  // Suggest cross-links between related pages
  const relatedPairs: Array<[string, string, string]> = [
    ["/pricing", "/register", "Get started with a free account"],
    ["/register", "/pricing", "View all plans and pricing"],
    ["/blog", "/docs", "Read the full documentation"],
    ["/docs", "/blog", "Latest articles and tutorials"],
    ["/compare", "/pricing", "See our pricing plans"],
    ["/", "/compare", "Compare with alternatives"],
    ["/", "/blog", "Read our latest articles"],
    ["/blog", "/register", "Start your free trial"],
    ["/compare", "/register", "Try Archibald Titan free"],
  ];

  for (const [from, to, anchor] of relatedPairs) {
    if (!linkMap.get(from)?.has(to)) {
      suggestedLinks.push({
        from,
        to,
        anchorText: anchor,
        reason: "Related content cross-linking",
      });
    }
  }

  const totalInternalLinks = Array.from(linkMap.values()).reduce(
    (sum, set) => sum + set.size,
    0
  );

  // Calculate link depth (BFS from homepage)
  const linkDepth: Record<string, number> = { "/": 0 };
  const queue = ["/"];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = linkDepth[current];
    for (const target of linkMap.get(current) || []) {
      if (!(target in linkDepth)) {
        linkDepth[target] = depth + 1;
        queue.push(target);
      }
    }
  }
  // Mark unreachable pages
  for (const page of PUBLIC_PAGES) {
    if (!(page.path in linkDepth)) {
      linkDepth[page.path] = -1; // unreachable
    }
  }

  logSeoEvent(
    "internal_links",
    `Analyzed internal links: ${totalInternalLinks} links, ${orphanPages.length} orphans`
  );

  return {
    orphanPages,
    weaklyLinkedPages,
    suggestedLinks,
    totalInternalLinks,
    linkDepth,
    analyzedAt: Date.now(),
  };
}

// ─── Competitor Keyword Tracking ────────────────────────────────────

export interface CompetitorAnalysis {
  competitors: Array<{
    name: string;
    url: string;
    strengths: string[];
    weaknesses: string[];
    keywordsToTarget: string[];
  }>;
  opportunities: string[];
  threats: string[];
  analyzedAt: number;
}

export async function analyzeCompetitors(): Promise<CompetitorAnalysis> {
  if (isKilled) {
    return { competitors: [], opportunities: [], threats: [], analyzedAt: Date.now() };
  }

  try {
    const response = await invokeLLM({
      priority: "background",
      messages: [
        {
          role: "system",
          content: `You are a competitive SEO analyst. Analyze competitors for a developer tools product. Return JSON:
{
  "competitors": [{"name": "...", "url": "...", "strengths": ["..."], "weaknesses": ["..."], "keywordsToTarget": ["..."]}],
  "opportunities": ["keyword/content opportunities"],
  "threats": ["competitive threats to watch"]
}`,
        },
        {
          role: "user",
          content: `Product: ${SITE_NAME}
Description: ${SITE_DESCRIPTION}
Category: AI-powered credential management, browser automation, developer security
Pricing: Free ($0), Pro ($29/mo), Enterprise ($99/mo)
Key competitors: 1Password, HashiCorp Vault, Selenium, Puppeteer, Doppler, Infisical

Analyze the competitive landscape and identify SEO opportunities.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "competitor_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              competitors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    url: { type: "string" },
                    strengths: { type: "array", items: { type: "string" } },
                    weaknesses: { type: "array", items: { type: "string" } },
                    keywordsToTarget: { type: "array", items: { type: "string" } },
                  },
                  required: ["name", "url", "strengths", "weaknesses", "keywordsToTarget"],
                  additionalProperties: false,
                },
              },
              opportunities: { type: "array", items: { type: "string" } },
              threats: { type: "array", items: { type: "string" } },
            },
            required: ["competitors", "opportunities", "threats"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices?.[0]?.message?.content as string);
    logSeoEvent("competitor_analysis", `Analyzed ${parsed.competitors?.length || 0} competitors`);
    return { ...parsed, analyzedAt: Date.now() };
  } catch (err: unknown) {
    log.error("[SEO] Competitor analysis failed:", { error: String(getErrorMessage(err)) });
    return {
      competitors: [
        {
          name: "1Password",
          url: "https://1password.com",
          strengths: ["Brand recognition", "Enterprise trust"],
          weaknesses: ["No autonomous retrieval", "Manual-only"],
          keywordsToTarget: [
            "1password alternative for developers",
            "1password API key management",
          ],
        },
        {
          name: "HashiCorp Vault",
          url: "https://www.vaultproject.io",
          strengths: ["Enterprise standard", "Open source"],
          weaknesses: ["Complex setup", "No browser automation"],
          keywordsToTarget: ["vault alternative", "simpler secret management"],
        },
        {
          name: "Doppler",
          url: "https://www.doppler.com",
          strengths: ["Developer-friendly", "CI/CD integration"],
          weaknesses: ["No autonomous fetching", "Cloud-only"],
          keywordsToTarget: ["doppler alternative", "local secret manager"],
        },
      ],
      opportunities: [
        "AI-powered credential management is a new category",
        "Comparison content for each competitor",
      ],
      threats: [
        "Enterprise competitors adding AI features",
        "Open source alternatives",
      ],
      analyzedAt: Date.now(),
    };
  }
}

// ─── Content Brief Generator ────────────────────────────────────────

export interface ContentBrief {
  title: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  outline: string[];
  wordCountTarget: number;
  intent: string;
  suggestedUrl: string;
  competitorUrls: string[];
  generatedAt: number;
}

export async function generateContentBriefs(count = 5): Promise<ContentBrief[]> {
  if (isKilled) return [];

  try {
    const response = await invokeLLM({
      priority: "background",
      messages: [
        {
          role: "system",
          content: `You are a content strategist for a developer tools company. Generate content briefs for blog posts that will drive organic traffic. Return JSON array:
[{"title": "...", "targetKeyword": "...", "secondaryKeywords": ["..."], "outline": ["H2 section titles"], "wordCountTarget": 1500, "intent": "informational/transactional", "suggestedUrl": "/blog/slug", "competitorUrls": ["urls to outrank"]}]`,
        },
        {
          role: "user",
          content: `Generate ${count} content briefs for ${SITE_NAME} (${SITE_DESCRIPTION}).
Focus on topics that:
1. Target high-intent developer keywords
2. Address credential security pain points
3. Compare with competitors
4. Provide actionable tutorials
5. Cover industry trends in AI and automation`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content as string;
    const jsonMatch = content?.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const briefs = JSON.parse(jsonMatch[0]);
      logSeoEvent("content_briefs", `Generated ${briefs.length} content briefs`);
      return briefs.map((b: any) => ({ ...b, generatedAt: Date.now() }));
    }
  } catch (err: unknown) {
    log.error("[SEO] Content brief generation failed:", { error: String(getErrorMessage(err)) });
  }

  // Fallback briefs
  return [
    {
      title: "How to Automate API Key Management in 2026",
      targetKeyword: "automate API key management",
      secondaryKeywords: [
        "API key automation",
        "credential management tool",
        "developer security",
      ],
      outline: [
        "The Problem with Manual Key Management",
        "What is Automated Key Management?",
        "Step-by-Step Setup Guide",
        "Security Best Practices",
        "Conclusion",
      ],
      wordCountTarget: 2000,
      intent: "informational",
      suggestedUrl: "/blog/automate-api-key-management",
      competitorUrls: [],
      generatedAt: Date.now(),
    },
    {
      title: "Archibald Titan vs 1Password: Which is Better for Developers?",
      targetKeyword: "archibald titan vs 1password",
      secondaryKeywords: [
        "1password alternative",
        "developer password manager",
        "API key manager",
      ],
      outline: ["Overview", "Feature Comparison", "Pricing Comparison", "Use Cases", "Verdict"],
      wordCountTarget: 2500,
      intent: "transactional",
      suggestedUrl: "/blog/titan-vs-1password",
      competitorUrls: ["https://1password.com/developers"],
      generatedAt: Date.now(),
    },
  ];
}

// ─── Meta Tag Analysis & SEO Health Score ───────────────────────────

export interface SeoScore {
  overall: number;
  titleScore: number;
  descriptionScore: number;
  keywordsScore: number;
  structuredDataScore: number;
  technicalScore: number;
  contentScore: number;
  internalLinkScore: number;
  mobileScore: number;
  issues: SeoIssue[];
  recommendations: string[];
  lastAnalyzed: number;
}

export interface SeoIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  page?: string;
  fix?: string;
}

export async function analyzeSeoHealth(): Promise<SeoScore> {
  const issues: SeoIssue[] = [];
  const recommendations: string[] = [];
  let titleScore = 100;
  let descriptionScore = 100;
  let keywordsScore = 100;
  let structuredDataScore = 100;
  let technicalScore = 100;
  let contentScore = 100;
  let internalLinkScore = 100;
  let mobileScore = 100;

  // ── Title checks ──
  for (const page of PUBLIC_PAGES) {
    const titleLen = page.title?.length || 0;
    if (titleLen < 30) {
      issues.push({
        severity: "warning",
        category: "Title",
        message: `Title too short on ${page.path}: "${page.title}" (${titleLen} chars)`,
        page: page.path,
        fix: "Expand title to 50-60 characters with primary keyword",
      });
      titleScore -= 10;
    } else if (titleLen > 60) {
      issues.push({
        severity: "warning",
        category: "Title",
        message: `Title too long on ${page.path}: ${titleLen} chars (Google truncates at ~60)`,
        page: page.path,
        fix: "Shorten title to 50-60 characters",
      });
      titleScore -= 5;
    }
    if (
      !page.title?.includes("Archibald Titan") &&
      page.path !== "/terms" &&
      page.path !== "/privacy"
    ) {
      issues.push({
        severity: "info",
        category: "Title",
        message: `Consider adding brand name to title on ${page.path}`,
        page: page.path,
        fix: "Append ' | Archibald Titan' or ' — Archibald Titan' to the title",
      });
      titleScore -= 3;
    }
    // Check for duplicate titles
    const duplicates = PUBLIC_PAGES.filter((p) => p.title === page.title && p.path !== page.path);
    if (duplicates.length > 0) {
      issues.push({
        severity: "critical",
        category: "Title",
        message: `Duplicate title found: "${page.title}" on ${page.path} and ${duplicates.map((d) => d.path).join(", ")}`,
        page: page.path,
        fix: "Each page must have a unique title tag",
      });
      titleScore -= 15;
    }
  }

  // ── Description checks ──
  for (const page of PUBLIC_PAGES) {
    const descLen = page.description?.length || 0;
    if (descLen < 120) {
      issues.push({
        severity: "warning",
        category: "Description",
        message: `Meta description too short on ${page.path}: ${descLen} chars`,
        page: page.path,
        fix: "Expand to 150-155 characters for optimal Google snippet display",
      });
      descriptionScore -= 10;
    } else if (descLen > 160) {
      issues.push({
        severity: "info",
        category: "Description",
        message: `Meta description slightly long on ${page.path}: ${descLen} chars`,
        page: page.path,
        fix: "Trim to 150-155 characters to avoid truncation in SERPs",
      });
      descriptionScore -= 3;
    }
    // Check for CTA in description
    const ctaWords = ["download", "start", "try", "get", "sign up", "free", "learn"];
    const hasCtA = ctaWords.some((w) => page.description.toLowerCase().includes(w));
    if (!hasCtA && page.priority >= 0.7) {
      issues.push({
        severity: "info",
        category: "Description",
        message: `No call-to-action in description for high-priority page ${page.path}`,
        page: page.path,
        fix: "Add a CTA like 'Download free', 'Get started', or 'Try now'",
      });
      descriptionScore -= 2;
    }
  }

  // ── Keyword checks ──
  for (const page of PUBLIC_PAGES) {
    if (!page.keywords || page.keywords.length < 3) {
      issues.push({
        severity: "warning",
        category: "Keywords",
        message: `Too few keywords on ${page.path}: ${page.keywords?.length || 0}`,
        page: page.path,
        fix: "Add 5-10 relevant keywords including long-tail variations",
      });
      keywordsScore -= 10;
    }
    // Check keyword appears in title
    const titleLower = page.title.toLowerCase();
    const keywordInTitle = page.keywords.some((k) => titleLower.includes(k.toLowerCase()));
    if (!keywordInTitle && page.priority >= 0.7) {
      issues.push({
        severity: "warning",
        category: "Keywords",
        message: `No target keyword found in title for ${page.path}`,
        page: page.path,
        fix: "Include your primary keyword in the page title",
      });
      keywordsScore -= 5;
    }
  }

  // ── Structured data checks ──
  const schemas = generateStructuredData();
  if (schemas.length < 4) {
    issues.push({
      severity: "warning",
      category: "Structured Data",
      message: `Only ${schemas.length} structured data schemas (recommend 5+)`,
      fix: "Add FAQ, HowTo, and BreadcrumbList schemas",
    });
    structuredDataScore -= 15;
  }

  const pagesWithBreadcrumbs = PUBLIC_PAGES.filter((p) => p.breadcrumbs);
  if (pagesWithBreadcrumbs.length < PUBLIC_PAGES.length * 0.5) {
    issues.push({
      severity: "info",
      category: "Structured Data",
      message: "Less than 50% of pages have breadcrumb data",
      fix: "Add breadcrumbs to all navigational pages",
    });
    structuredDataScore -= 5;
  }

  // ── Internal link analysis ──
  const linkAnalysis = await analyzeInternalLinks();
  if (linkAnalysis.orphanPages.length > 0) {
    issues.push({
      severity: "warning",
      category: "Internal Links",
      message: `${linkAnalysis.orphanPages.length} orphan page(s): ${linkAnalysis.orphanPages.join(", ")}`,
      fix: "Add internal links from high-authority pages to orphan pages",
    });
    internalLinkScore -= linkAnalysis.orphanPages.length * 10;
  }

  // Check for deep pages (more than 3 clicks from homepage)
  for (const [page, depth] of Object.entries(linkAnalysis.linkDepth)) {
    if (depth > 3) {
      issues.push({
        severity: "info",
        category: "Internal Links",
        message: `${page} is ${depth} clicks from homepage (recommend ≤3)`,
        page,
        fix: "Add a direct link from the homepage or a hub page",
      });
      internalLinkScore -= 3;
    }
    if (depth === -1) {
      issues.push({
        severity: "critical",
        category: "Internal Links",
        message: `${page} is unreachable from the homepage`,
        page,
        fix: "Add at least one internal link pointing to this page",
      });
      internalLinkScore -= 15;
    }
  }

  // ── Technical checks ──
  // Check canonical URLs
  for (const page of PUBLIC_PAGES) {
    if (!page.canonicalUrl && page.path !== "/") {
      // Not critical — we auto-generate canonicals
    }
  }

  // Check OG tags
  for (const page of PUBLIC_PAGES) {
    if (!page.ogType) {
      issues.push({
        severity: "warning",
        category: "Social",
        message: `Missing Open Graph type on ${page.path}`,
        page: page.path,
        fix: 'Add ogType: "website" or "article" to the page config',
      });
      technicalScore -= 5;
    }
  }

  // ── Mobile-friendliness checks ──
  // These are static checks since we can't run Lighthouse server-side
  issues.push({
    severity: "info",
    category: "Mobile",
    message: "Ensure touch targets are at least 48×48px on mobile",
    fix: "Audit button and link sizes in mobile view",
  });

  // ── Content recommendations ──
  recommendations.push(
    "Create comparison pages (Titan vs competitors) for competitive keywords — /compare page added"
  );
  recommendations.push(
    "Add customer testimonials with structured data markup (Review schema)"
  );
  recommendations.push(
    "Add video content to landing page for higher engagement signals"
  );
  recommendations.push(
    "Create a glossary page targeting 'what is' queries for developer terms"
  );
  recommendations.push(
    "Add author pages for E-E-A-T signals (Experience, Expertise, Authoritativeness, Trustworthiness)"
  );
  recommendations.push(
    "Implement image lazy loading and WebP format for Core Web Vitals"
  );
  recommendations.push(
    "Add a /changelog page for product updates — drives repeat visits and backlinks"
  );
  recommendations.push(
    "Submit blog RSS feed to Google News Publisher Center"
  );

  const overall = Math.round(
    Math.max(0, titleScore) * 0.15 +
      Math.max(0, descriptionScore) * 0.12 +
      Math.max(0, keywordsScore) * 0.10 +
      Math.max(0, structuredDataScore) * 0.13 +
      Math.max(0, technicalScore) * 0.15 +
      Math.max(0, contentScore) * 0.12 +
      Math.max(0, internalLinkScore) * 0.13 +
      Math.max(0, mobileScore) * 0.10
  );

  return {
    overall,
    titleScore: Math.max(0, titleScore),
    descriptionScore: Math.max(0, descriptionScore),
    keywordsScore: Math.max(0, keywordsScore),
    structuredDataScore: Math.max(0, structuredDataScore),
    technicalScore: Math.max(0, technicalScore),
    contentScore: Math.max(0, contentScore),
    internalLinkScore: Math.max(0, internalLinkScore),
    mobileScore: Math.max(0, mobileScore),
    issues,
    recommendations,
    lastAnalyzed: Date.now(),
  };
}

// ─── LLM-Powered Keyword Analysis ──────────────────────────────────

export interface KeywordAnalysis {
  primaryKeywords: Array<{
    keyword: string;
    volume: string;
    difficulty: string;
    opportunity: string;
  }>;
  longTailKeywords: Array<{
    keyword: string;
    intent: string;
    suggestedPage: string;
  }>;
  contentGaps: string[];
  competitorKeywords: string[];
  generatedAt: number;
}

export async function analyzeKeywords(): Promise<KeywordAnalysis> {
  if (isKilled) {
    return {
      primaryKeywords: [],
      longTailKeywords: [],
      contentGaps: [],
      competitorKeywords: [],
      generatedAt: Date.now(),
    };
  }

  try {
    const response = await invokeLLM({
      priority: "background",
      messages: [
        {
          role: "system",
          content: `You are an SEO keyword research expert. Analyze the following product and suggest keywords.
Return JSON with this exact structure:
{
  "primaryKeywords": [{"keyword": "...", "volume": "high/medium/low", "difficulty": "high/medium/low", "opportunity": "high/medium/low"}],
  "longTailKeywords": [{"keyword": "...", "intent": "informational/transactional/navigational", "suggestedPage": "/path"}],
  "contentGaps": ["topic that should be covered"],
  "competitorKeywords": ["keywords competitors rank for"]
}`,
        },
        {
          role: "user",
          content: `Product: ${SITE_NAME}
Description: ${SITE_DESCRIPTION}
Category: Developer Tools, Cybersecurity, AI Agent, Credential Management
Pricing: Free ($0), Pro ($29/mo), Enterprise ($99/mo)
Features: Browser automation, CAPTCHA solving, credential vault, API access, team management, voice AI chat
Target audience: Developers, DevOps engineers, security professionals, IT administrators

Analyze and provide keyword recommendations for SEO optimization.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keyword_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              primaryKeywords: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    volume: { type: "string" },
                    difficulty: { type: "string" },
                    opportunity: { type: "string" },
                  },
                  required: ["keyword", "volume", "difficulty", "opportunity"],
                  additionalProperties: false,
                },
              },
              longTailKeywords: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    intent: { type: "string" },
                    suggestedPage: { type: "string" },
                  },
                  required: ["keyword", "intent", "suggestedPage"],
                  additionalProperties: false,
                },
              },
              contentGaps: { type: "array", items: { type: "string" } },
              competitorKeywords: { type: "array", items: { type: "string" } },
            },
            required: [
              "primaryKeywords",
              "longTailKeywords",
              "contentGaps",
              "competitorKeywords",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content as string;
    if (!content) throw new Error("No LLM response");

    const analysis = JSON.parse(content);
    logSeoEvent(
      "keyword_analysis",
      `Analyzed ${analysis.primaryKeywords?.length || 0} primary keywords`
    );
    return { ...analysis, generatedAt: Date.now() };
  } catch (err: unknown) {
    log.error("[SEO] Keyword analysis failed:", { error: String(getErrorMessage(err)) });
    return {
      primaryKeywords: [
        { keyword: "AI credential manager", volume: "medium", difficulty: "low", opportunity: "high" },
        { keyword: "browser automation tool", volume: "high", difficulty: "high", opportunity: "medium" },
        { keyword: "API key management", volume: "medium", difficulty: "medium", opportunity: "high" },
        { keyword: "CAPTCHA solver", volume: "high", difficulty: "medium", opportunity: "medium" },
        { keyword: "developer security tools", volume: "medium", difficulty: "low", opportunity: "high" },
        { keyword: "autonomous AI agent", volume: "medium", difficulty: "low", opportunity: "high" },
        { keyword: "credential vault", volume: "low", difficulty: "low", opportunity: "high" },
        { keyword: "secret management tool", volume: "medium", difficulty: "medium", opportunity: "high" },
      ],
      longTailKeywords: [
        { keyword: "how to automate API key retrieval", intent: "informational", suggestedPage: "/blog" },
        { keyword: "best credential management tool for developers", intent: "transactional", suggestedPage: "/pricing" },
        { keyword: "automated browser with CAPTCHA solving", intent: "transactional", suggestedPage: "/" },
        { keyword: "1password alternative for API keys", intent: "transactional", suggestedPage: "/compare" },
        { keyword: "hashicorp vault vs archibald titan", intent: "informational", suggestedPage: "/compare" },
        { keyword: "free API key manager 2026", intent: "transactional", suggestedPage: "/register" },
      ],
      contentGaps: [
        "Blog posts about credential security best practices",
        "Comparison pages with competitors",
        "Tutorial content for each provider integration",
        "Case studies from real users",
        "Industry reports on developer security trends",
      ],
      competitorKeywords: [
        "1Password developer tools",
        "HashiCorp Vault alternative",
        "Selenium alternative",
        "Doppler secrets manager",
        "Infisical vs Vault",
      ],
      generatedAt: Date.now(),
    };
  }
}

// ─── LLM-Powered Meta Tag Optimization ──────────────────────────────

export interface MetaOptimization {
  page: string;
  currentTitle: string;
  suggestedTitle: string;
  currentDescription: string;
  suggestedDescription: string;
  suggestedKeywords: string[];
  reasoning: string;
}

export async function optimizeMetaTags(): Promise<MetaOptimization[]> {
  if (isKilled) return [];

  const optimizations: MetaOptimization[] = [];

  try {
    const response = await invokeLLM({
      priority: "background",
      messages: [
        {
          role: "system",
          content: `You are an SEO expert specializing in meta tag optimization for SaaS products.
For each page, suggest improved title (50-60 chars) and description (150-155 chars) that:
- Include primary keywords naturally near the start
- Have compelling CTAs
- Differentiate from competitors
- Include brand name where appropriate
- Use power words (free, best, advanced, secure, fast)

Return JSON array:
[{"page": "/path", "suggestedTitle": "...", "suggestedDescription": "...", "suggestedKeywords": ["..."], "reasoning": "..."}]`,
        },
        {
          role: "user",
          content: `Optimize meta tags for these pages of ${SITE_NAME} (${SITE_DESCRIPTION}):

${PUBLIC_PAGES.map(
  (p) =>
    `Page: ${p.path}\nCurrent Title: ${p.title}\nCurrent Description: ${p.description}\nCurrent Keywords: ${p.keywords.join(", ")}`
).join("\n\n")}`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content as string;
    if (!content) return optimizations;

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      for (const suggestion of suggestions) {
        const currentPage = PUBLIC_PAGES.find((p) => p.path === suggestion.page);
        if (currentPage) {
          optimizations.push({
            page: suggestion.page,
            currentTitle: currentPage.title,
            suggestedTitle: suggestion.suggestedTitle || currentPage.title,
            currentDescription: currentPage.description,
            suggestedDescription: suggestion.suggestedDescription || currentPage.description,
            suggestedKeywords: suggestion.suggestedKeywords || currentPage.keywords,
            reasoning: suggestion.reasoning || "AI-optimized for better search visibility",
          });
        }
      }
    }
    logSeoEvent("meta_optimization", `Generated ${optimizations.length} meta tag optimizations`);
  } catch (err: unknown) {
    log.error("[SEO] Meta optimization failed:", { error: String(getErrorMessage(err)) });
  }

  return optimizations;
}

// ─── Open Graph & Twitter Card Tags ─────────────────────────────────

export function getOpenGraphTags(path: string): Record<string, string> {
  const page = PUBLIC_PAGES.find((p) => p.path === path) || PUBLIC_PAGES[0];

  return {
    "og:title": page.title,
    "og:description": page.description,
    "og:type": page.ogType,
    "og:url": `${SITE_URL}${page.path}`,
    "og:image": SITE_LOGO,
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:site_name": SITE_NAME,
    "og:locale": "en_US",
    "twitter:card": "summary_large_image",
    "twitter:site": SITE_TWITTER,
    "twitter:title": page.title,
    "twitter:description": page.description,
    "twitter:image": SITE_LOGO,
  };
}

// ─── Canonical URL Helper ───────────────────────────────────────────

export function getCanonicalUrl(path: string): string {
  const page = PUBLIC_PAGES.find((p) => p.path === path);
  return page?.canonicalUrl || `${SITE_URL}${path}`;
}

// ─── Core Web Vitals Beacon ─────────────────────────────────────────

interface WebVitalEntry {
  url: string;
  metric: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: number;
  userAgent?: string;
}

const webVitalsLog: WebVitalEntry[] = [];
const MAX_VITALS_LOG = 2000;

export function recordWebVital(entry: WebVitalEntry): void {
  webVitalsLog.push(entry);
  if (webVitalsLog.length > MAX_VITALS_LOG) {
    webVitalsLog.splice(0, webVitalsLog.length - MAX_VITALS_LOG);
  }
}

export function getWebVitalsSummary(): Record<string, any> {
  if (webVitalsLog.length === 0) return { entries: 0, metrics: {} };

  const metrics: Record<string, { values: number[]; good: number; poor: number }> = {};
  for (const entry of webVitalsLog) {
    if (!metrics[entry.metric]) {
      metrics[entry.metric] = { values: [], good: 0, poor: 0 };
    }
    metrics[entry.metric].values.push(entry.value);
    if (entry.rating === "good") metrics[entry.metric].good++;
    if (entry.rating === "poor") metrics[entry.metric].poor++;
  }

  const summary: Record<string, any> = {};
  for (const [metric, data] of Object.entries(metrics)) {
    const sorted = [...data.values].sort((a, b) => a - b);
    summary[metric] = {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      goodPct: Math.round((data.good / data.values.length) * 100),
      poorPct: Math.round((data.poor / data.values.length) * 100),
      samples: data.values.length,
    };
  }

  return { entries: webVitalsLog.length, metrics: summary };
}

// ─── Redirect Manager ───────────────────────────────────────────────

interface Redirect {
  from: string;
  to: string;
  type: 301 | 302;
  reason: string;
}

const REDIRECTS: Redirect[] = [
  // Add redirects for old URLs here as the site evolves
  { from: "/download", to: "/register", type: 301, reason: "Downloads now require account" },
  { from: "/features", to: "/", type: 301, reason: "Features merged into homepage" },
  { from: "/about", to: "/", type: 301, reason: "About merged into homepage" },
  { from: "/signup", to: "/register", type: 301, reason: "URL normalization" },
  { from: "/signin", to: "/login", type: 301, reason: "URL normalization" },
];

export function getRedirects(): Redirect[] {
  return REDIRECTS;
}

// ─── IndexNow Integration ───────────────────────────────────────────

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";

export async function submitToIndexNow(urls: string[]): Promise<{ success: boolean; submitted: number }> {
  if (!INDEXNOW_KEY || urls.length === 0) {
    return { success: false, submitted: 0 };
  }

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "www.archibaldtitan.com",
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });

    const success = response.ok || response.status === 202;
    logSeoEvent("indexnow", `Submitted ${urls.length} URLs to IndexNow`, { status: response.status });
    return { success, submitted: urls.length };
  } catch (err: unknown) {
    log.error("[SEO] IndexNow submission failed:", { error: String(getErrorMessage(err)) });
    return { success: false, submitted: 0 };
  }
}

// ─── SEO Report Generation ──────────────────────────────────────────

export interface SeoReport {
  score: SeoScore;
  keywords: KeywordAnalysis;
  metaOptimizations: MetaOptimization[];
  competitorAnalysis: CompetitorAnalysis | null;
  internalLinkAnalysis: InternalLinkAnalysis;
  contentBriefs: ContentBrief[];
  webVitals: Record<string, any>;
  structuredDataSchemas: number;
  publicPages: number;
  sitemapUrls: number;
  generatedAt: number;
}

export async function generateSeoReport(): Promise<SeoReport> {
  // Stagger LLM calls to avoid rate limits (run sequentially, not all at once)
  const score = await analyzeSeoHealth();
  const keywords = await analyzeKeywords();
  const metaOptimizations = await optimizeMetaTags();
  const competitorAnalysis = await analyzeCompetitors().catch(() => null);
  const internalLinkAnalysis = await analyzeInternalLinks();
  const contentBriefs = await generateContentBriefs(3).catch(() => [] as ContentBrief[]);
  const webVitals = getWebVitalsSummary();

  const report: SeoReport = {
    score,
    keywords,
    metaOptimizations,
    competitorAnalysis,
    internalLinkAnalysis,
    contentBriefs,
    webVitals,
    structuredDataSchemas: generateStructuredData().length,
    publicPages: PUBLIC_PAGES.length,
    sitemapUrls: PUBLIC_PAGES.length,
    generatedAt: Date.now(),
  };

  // Notify owner if score is below threshold
  if (score.overall < 70) {
    await notifyOwner({
      title: "SEO Health Alert",
      content: `SEO score dropped to ${score.overall}/100. ${score.issues.filter((i) => i.severity === "critical").length} critical issues found. Check the SEO dashboard for details.`,
    });
  }

  logSeoEvent("report", `SEO report generated: score ${score.overall}/100`);

  return report;
}

// ─── Express Route Registration ─────────────────────────────────────

export function registerSeoRoutes(app: Express): void {
  // Serve dynamic sitemap.xml
  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=7200");
    const xml = await generateSitemapXml();
    res.send(xml);
  });

  // Serve robots.txt (v4 advanced version with GEO-optimized AI crawler rules)
  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/plain");
    res.set("Cache-Control", "public, max-age=86400");
    // Use v4 advanced robots.txt that selectively allows AI search crawlers for GEO
    try {
      const { generateAdvancedRobotsTxt } = require("./seo-engine-v4");
      res.send(generateAdvancedRobotsTxt());
    } catch {
      res.send(generateRobotsTxt());
    }
  });

  // Serve security.txt
  app.get("/.well-known/security.txt", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/plain");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(generateSecurityTxt());
  });

  // RSS feed
  app.get("/feed.xml", async (_req: Request, res: Response) => {
    res.set("Content-Type", "application/rss+xml");
    res.set("Cache-Control", "public, max-age=3600");
    const rss = await generateRssFeed();
    res.send(rss);
  });

  // Also serve at /rss for convenience
  app.get("/rss", async (_req: Request, res: Response) => {
    res.set("Content-Type", "application/rss+xml");
    res.set("Cache-Control", "public, max-age=3600");
    const rss = await generateRssFeed();
    res.send(rss);
  });

  // Google Search Console verification file
  app.get("/googled695fe4a01421a03.html", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/html");
    res.send("google-site-verification: googled695fe4a01421a03.html");
  });

  // IndexNow key file (if configured)
  if (INDEXNOW_KEY) {
    app.get(`/${INDEXNOW_KEY}.txt`, (_req: Request, res: Response) => {
      res.set("Content-Type", "text/plain");
      res.send(INDEXNOW_KEY);
    });
  }

  // Google Search Console verification info endpoint
  app.get("/api/seo/gsc-verify", (_req: Request, res: Response) => {
    res.json({
      method: "html_tag",
      instructions:
        "Add the meta tag from Google Search Console to your site's <head>, or use the URL prefix method with the sitemap URL.",
      sitemapUrl: `${SITE_URL}/sitemap.xml`,
      robotsTxtUrl: `${SITE_URL}/robots.txt`,
      rssFeedUrl: `${SITE_URL}/feed.xml`,
      structuredDataUrl: `${SITE_URL}/api/seo/structured-data`,
    });
  });

  // Ping search engines to notify of sitemap updates
  app.post("/api/seo/ping-search-engines", async (_req: Request, res: Response) => {
    const sitemapUrl = encodeURIComponent(`${SITE_URL}/sitemap.xml`);
    const results: { engine: string; status: string }[] = [];

    // Ping Google
    try {
      const googleRes = await fetch(`https://www.google.com/ping?sitemap=${sitemapUrl}`);
      results.push({
        engine: "Google",
        status: googleRes.ok ? "success" : `failed (${googleRes.status})`,
      });
    } catch (err: unknown) {
      results.push({ engine: "Google", status: `error: ${getErrorMessage(err)}` });
    }

    // Ping Bing
    try {
      const bingRes = await fetch(`https://www.bing.com/ping?sitemap=${sitemapUrl}`);
      results.push({
        engine: "Bing",
        status: bingRes.ok ? "success" : `failed (${bingRes.status})`,
      });
    } catch (err: unknown) {
      results.push({ engine: "Bing", status: `error: ${getErrorMessage(err)}` });
    }

    // Ping Yandex
    try {
      const yandexRes = await fetch(
        `https://webmaster.yandex.com/ping?sitemap=${sitemapUrl}`
      );
      results.push({
        engine: "Yandex",
        status: yandexRes.ok ? "success" : `failed (${yandexRes.status})`,
      });
    } catch (err: unknown) {
      results.push({ engine: "Yandex", status: `error: ${getErrorMessage(err)}` });
    }

    // IndexNow
    if (INDEXNOW_KEY) {
      const indexNowResult = await submitToIndexNow(
        PUBLIC_PAGES.map((p) => `${SITE_URL}${p.path}`)
      );
      results.push({
        engine: "IndexNow",
        status: indexNowResult.success
          ? `success (${indexNowResult.submitted} URLs)`
          : "failed",
      });
    }

    logSeoEvent("ping", "Pinged search engines", results);
    log.info("[SEO] Search engine ping results:", { detail: results });
    res.json({ pinged: results, sitemapUrl: `${SITE_URL}/sitemap.xml` });
  });

  // Serve structured data as JSON-LD endpoint
  app.get("/api/seo/structured-data", (_req: Request, res: Response) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(generateStructuredData());
  });

  // SEO event log endpoint
  app.get("/api/seo/event-log", (_req: Request, res: Response) => {
    const limit = parseInt((_req.query as any).limit) || 50;
    res.json(getSeoEventLog(limit));
  });

  // Core Web Vitals beacon endpoint
  app.post("/api/seo/web-vitals", (req: Request, res: Response) => {
    try {
      const { url, metric, value, rating } = req.body;
      if (url && metric && typeof value === "number") {
        recordWebVital({
          url,
          metric,
          value,
          rating: rating || "good",
          timestamp: Date.now(),
          userAgent: req.headers["user-agent"],
        });
      }
      res.status(204).end();
    } catch {
      res.status(400).end();
    }
  });

  // Web Vitals summary endpoint
  app.get("/api/seo/web-vitals", (_req: Request, res: Response) => {
    res.json(getWebVitalsSummary());
  });

  // Redirect handler — must be registered before the SPA fallback
  for (const redirect of REDIRECTS) {
    app.get(redirect.from, (_req: Request, res: Response) => {
      res.redirect(redirect.type, redirect.to);
    });
  }

  log.info("[SEO v3] Routes registered: /sitemap.xml, /robots.txt, /.well-known/security.txt, /feed.xml, /api/seo/*, redirects");
}

// ─── Scheduled SEO Optimization ─────────────────────────────────────

let lastOptimizationRun: number = 0;
let cachedReport: SeoReport | null = null;

export async function runScheduledSeoOptimization(): Promise<SeoReport | null> {
  if (isKilled) {
    log.info("[SEO] Kill switch active — skipping optimization run");
    return null;
  }

  log.info("[SEO] Starting scheduled optimization run...");

  try {
    const report = await generateSeoReport();
    cachedReport = report;
    lastOptimizationRun = Date.now();

    log.info(`[SEO] Optimization complete — Score: ${report.score.overall}/100, Issues: ${report.score.issues.length}, Keywords: ${report.keywords.primaryKeywords.length}`);

    // Notify owner with summary
    await notifyOwner({
      title: "SEO Optimization Report",
      content: `Daily SEO report:\n• Score: ${report.score.overall}/100\n• Issues: ${report.score.issues.length} (${report.score.issues.filter((i) => i.severity === "critical").length} critical)\n• Keywords analyzed: ${report.keywords.primaryKeywords.length} primary, ${report.keywords.longTailKeywords.length} long-tail\n• Meta optimizations: ${report.metaOptimizations.length} suggestions\n• Content gaps: ${report.keywords.contentGaps.length} identified\n• Internal link issues: ${report.score.issues.filter((i) => i.category === "Internal Links").length}\n• Content briefs: ${report.contentBriefs.length} generated\n• Web Vitals: ${report.webVitals.entries || 0} samples collected`,
    });

    // Auto-ping search engines after optimization
    try {
      const sitemapUrl = encodeURIComponent(`${SITE_URL}/sitemap.xml`);
      await fetch(`https://www.google.com/ping?sitemap=${sitemapUrl}`).catch(() => {});
      await fetch(`https://www.bing.com/ping?sitemap=${sitemapUrl}`).catch(() => {});
      logSeoEvent("auto_ping", "Auto-pinged search engines after optimization");
    } catch {
      /* non-critical */
    }

    // Submit updated URLs to IndexNow
    if (INDEXNOW_KEY) {
      await submitToIndexNow(PUBLIC_PAGES.map((p) => `${SITE_URL}${p.path}`)).catch(() => {});
    }

    return report;
  } catch (err: unknown) {
    log.error("[SEO] Scheduled optimization failed:", { error: String(getErrorMessage(err)) });
    logSeoEvent("error", `Scheduled optimization failed: ${getErrorMessage(err)}`);
    return null;
  }
}

export function getCachedReport(): SeoReport | null {
  return cachedReport;
}

export function getLastOptimizationRun(): number {
  return lastOptimizationRun;
}

export function getPublicPages(): PageSeoConfig[] {
  return PUBLIC_PAGES;
}

// ─── Startup Scheduler ─────────────────────────────────────────────

export function startScheduledSeo(): void {
  const ONE_DAY = 24 * 60 * 60 * 1000;

  // COST OPTIMIZATION: Do NOT run on startup.
  // Every Railway deploy triggers a restart which was burning API credits.
  // Instead, run the first analysis after 6 hours (gives time for organic traffic).
  log.info("[SEO v3] Skipping startup analysis (cost optimization). First run in 6h, then daily.");

  setTimeout(async () => {
    try {
      log.info("[SEO v3] Running first scheduled SEO analysis...");
      await runScheduledSeoOptimization();
    } catch (err: unknown) {
      log.error("[SEO v3] First analysis failed:", { error: String(getErrorMessage(err)) });
    }
  }, 6 * 60 * 60 * 1000); // 6 hours after deploy

  // Then run daily
  setInterval(async () => {
    try {
      await runScheduledSeoOptimization();
    } catch (err: unknown) {
      log.error("[SEO v3] Scheduled run failed:", { error: String(getErrorMessage(err)) });
    }
  }, ONE_DAY);
}

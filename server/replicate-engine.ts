/**
 * Website Replicate Engine v1.0
 *
 * Orchestrates the full research → analysis → plan → build workflow
 * for cloning/replicating existing websites and applications.
 *
 * Workflow:
 * 1. Research: Fetch target site, extract content, analyze structure
 * 2. Analyze: LLM-powered feature analysis producing structured report
 * 3. Plan: Generate complete build plan with file structure, steps, data models
 * 4. Build: Execute build steps in user's sandbox (write files, run commands)
 * 5. Brand: Apply custom branding (name, colors, logo, tagline)
 * 6. Integrate: Wire up Stripe payment if keys provided
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  replicateProjects,
  sandboxes,
  type ReplicateProject,
  type InsertReplicateProject,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import {
  createSandbox,
  executeCommand,
  writeFile as sandboxWriteFile,
  listFiles,
  readFile,
  persistWorkspace,
  writeBinaryFile,
} from "./sandbox-engine";
import { enforceCloneSafety, checkScrapedContent } from "./clone-safety";
import { storagePut } from "./storage";
import { scrapeProductCatalog, type CatalogResult, type ScrapedProduct, type SiteType } from "./product-scraper";
import { getErrorMessage } from "./_core/errors.js";
import { getUserOpenAIKey, getUserGithubPat } from "./user-secrets-router";
import { isBlockedCloneTarget } from "./anti-replication-guard";

// ─── Types ──────────────────────────────────────────────────────────

export interface ResearchResult {
  appName: string;
  description: string;
  targetAudience: string;
  coreFeatures: string[];
  uiPatterns: string[];
  techStackGuess: string[];
  dataModels: string[];
  apiEndpoints: string[];
  authMethod: string;
  monetization: string;
  keyDifferentiators: string[];
  suggestedTechStack: string;
  estimatedComplexity: string;
  mvpFeatures: string[];
  fullFeatures: string[];
}

export interface BuildPlan {
  projectName: string;
  description: string;
  techStack: { frontend: string; backend: string; database: string; other: string };
  fileStructure: Array<{ path: string; description: string; priority: number }>;
  buildSteps: Array<{ step: number; description: string; files: string[]; commands: string[] }>;
  dataModels: Array<{ name: string; fields: string[] }>;
  apiRoutes: Array<{ method: string; path: string; description: string }>;
  estimatedFiles: number;
  estimatedTimeMinutes: number;
}

export interface BrandConfig {
  brandName?: string;
  brandColors?: { primary: string; secondary: string; accent: string; background: string; text: string };
  brandLogo?: string;
  brandTagline?: string;
}

export interface StripeConfig {
  publishableKey?: string;
  secretKey?: string;
  priceIds?: string[];
}

export interface BuildLogEntry {
  step: number;
  status: "pending" | "running" | "success" | "error";
  message: string;
  timestamp: string;
}

// ─── Project CRUD ───────────────────────────────────────────────────

export async function createProject(
  userId: number,
  targetUrl: string,
  targetName: string,
  options?: {
    priority?: "mvp" | "full";
    branding?: BrandConfig;
    stripe?: StripeConfig;
    githubPat?: string;
  }
): Promise<ReplicateProject> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // ─── Anti-Self-Replication Guard ─────────────────────────────
  if (isBlockedCloneTarget(targetUrl)) {
    throw new Error("BLOCKED: Cannot clone the Titan platform itself. This action violates the anti-self-replication security policy.");
  }

  // Ensure the replicate_projects table exists (auto-create if missing)
  try {
    await db.execute(sql`SELECT 1 FROM replicate_projects LIMIT 1`);
  } catch {
    console.log("[Clone] replicate_projects table missing, creating...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS replicate_projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        sandboxId INT,
        targetUrl VARCHAR(2048) NOT NULL,
        targetName VARCHAR(256) NOT NULL,
        targetDescription TEXT,
        researchData JSON,
        buildPlan JSON,
        brandName VARCHAR(256),
        brandColors JSON,
        brandLogo TEXT,
        brandTagline VARCHAR(512),
        stripePublishableKey TEXT,
        stripeSecretKey TEXT,
        stripePriceIds JSON,
        githubPat TEXT,
        githubRepoUrl TEXT,
        status ENUM('researching','research_complete','planning','plan_complete','building','build_complete','branded','pushing','pushed','deploying','deployed','testing','complete','error') NOT NULL DEFAULT 'researching',
        currentStep INT NOT NULL DEFAULT 0,
        totalSteps INT NOT NULL DEFAULT 0,
        statusMessage TEXT,
        errorMessage TEXT,
        buildLog JSON,
        outputFiles JSON,
        previewUrl TEXT,
        priority ENUM('mvp','full') NOT NULL DEFAULT 'mvp',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      )
    `);
  }

  try {
    const result = await db
      .insert(replicateProjects)
      .values({
        userId,
        targetUrl,
        targetName,
        status: "researching",
        priority: options?.priority ?? "mvp",
        brandName: options?.branding?.brandName ?? null,
        brandColors: options?.branding?.brandColors ?? null,
        brandLogo: options?.branding?.brandLogo ?? null,
        brandTagline: options?.branding?.brandTagline ?? null,
        stripePublishableKey: options?.stripe?.publishableKey ?? null,
        stripeSecretKey: options?.stripe?.secretKey ?? null,
        stripePriceIds: options?.stripe?.priceIds ?? null,
        githubPat: options?.githubPat ?? null,
        buildLog: [],
      });

    const insertId = result[0].insertId;

    const [project] = await db
      .select()
      .from(replicateProjects)
      .where(eq(replicateProjects.id, insertId));

    if (!project) throw new Error(`Project insert succeeded (id=${insertId}) but SELECT returned nothing`);
    return project;
  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    console.error("[Clone] createProject DB error:", msg, e);
    throw new Error(`Database error creating clone project: ${msg}`);
  }
}

export async function getProject(
  projectId: number,
  userId: number
): Promise<ReplicateProject | null> {
  const db = await getDb();
  if (!db) return null;

  const [project] = await db
    .select()
    .from(replicateProjects)
    .where(
      and(
        eq(replicateProjects.id, projectId),
        eq(replicateProjects.userId, userId)
      )
    );

  return project ?? null;
}

export async function listProjects(userId: number): Promise<ReplicateProject[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(replicateProjects)
    .where(eq(replicateProjects.userId, userId))
    .orderBy(desc(replicateProjects.createdAt));
}

export async function updateProjectStatus(
  projectId: number,
  status: ReplicateProject["status"],
  message?: string,
  extra?: Partial<InsertReplicateProject>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(replicateProjects)
    .set({
      status,
      statusMessage: message,
      ...extra,
    })
    .where(eq(replicateProjects.id, projectId));
}

export async function deleteProject(
  projectId: number,
  userId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [result] = await db
    .delete(replicateProjects)
    .where(
      and(
        eq(replicateProjects.id, projectId),
        eq(replicateProjects.userId, userId)
      )
    );

  return (result as any)?.affectedRows > 0;
}

// ─── Step 1: Research ───────────────────────────────────────────────


// ─── Deep Crawl: Follow internal links and scrape subpages ─────────
async function deepCrawlSite(
  baseUrl: string,
  rawHtml: string,
  maxPages: number = 20
): Promise<Array<{ url: string; html: string; title: string }>> {
  const pages: Array<{ url: string; html: string; title: string }> = [];
  const visited = new Set<string>();
  const baseOrigin = new URL(baseUrl).origin;

  // Extract all internal links from the homepage
  const linkRegex = /href=["']([^"'#]+)["']/gi;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(rawHtml)) !== null) {
    let href = match[1];
    if (href.startsWith("/")) href = baseOrigin + href;
    try {
      const linkUrl = new URL(href);
      if (linkUrl.origin === baseOrigin && !visited.has(linkUrl.pathname)) {
        links.push(linkUrl.href);
        visited.add(linkUrl.pathname);
      }
    } catch { /* skip invalid URLs */ }
  }

  // Prioritize important pages
  const priorityPatterns = [
    /menu/i, /product/i, /shop/i, /store/i, /catalog/i, /pricing/i,
    /about/i, /contact/i, /service/i, /feature/i, /blog/i, /faq/i,
    /gallery/i, /portfolio/i, /team/i, /testimonial/i,
  ];
  links.sort((a, b) => {
    const aScore = priorityPatterns.filter(p => p.test(a)).length;
    const bScore = priorityPatterns.filter(p => p.test(b)).length;
    return bScore - aScore;
  });

  // Fetch subpages (up to maxPages)
  const toFetch = links.slice(0, maxPages);
  for (const link of toFetch) {
    try {
      const resp = await fetch(link, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : link;
      pages.push({ url: link, html, title });
    } catch { /* skip failed fetches */ }
  }
  return pages;
}

// ─── Extract ALL images from HTML (comprehensive) ────────────────
function extractImages(html: string, baseUrl: string): Array<{ src: string; alt: string; context: string }> {
  const images: Array<{ src: string; alt: string; context: string }> = [];
  const seen = new Set<string>();
  const baseOrigin = new URL(baseUrl).origin;

  // Helper: normalize a URL
  const normalize = (raw: string): string | null => {
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.length < 5) return null;
    let src = raw.trim();
    if (src.startsWith("//")) src = "https:" + src;
    else if (src.startsWith("/")) src = baseOrigin + src;
    else if (!src.startsWith("http")) {
      try { src = new URL(src, baseUrl).href; } catch { return null; }
    }
    return src;
  };

  // Helper: classify image context from surrounding HTML
  const classify = (tag: string, alt: string): string => {
    const t = (tag + " " + alt).toLowerCase();
    if (t.includes("logo") || t.includes("brand")) return "logo";
    if (t.includes("hero") || t.includes("banner") || t.includes("slider") || t.includes("carousel") || t.includes("jumbotron")) return "hero";
    if (t.includes("product") || t.includes("item") || t.includes("menu-item") || t.includes("card") || t.includes("thumbnail") || t.includes("catalog")) return "product";
    if (t.includes("team") || t.includes("avatar") || t.includes("staff") || t.includes("author")) return "team";
    if (t.includes("gallery") || t.includes("lightbox") || t.includes("portfolio")) return "gallery";
    if (t.includes("icon") || t.includes("svg")) return "icon";
    if (t.includes("testimonial") || t.includes("review")) return "testimonial";
    return "general";
  };

  const addImage = (src: string | null, alt: string, context: string) => {
    if (!src) return;
    if (seen.has(src)) return;
    seen.add(src);
    images.push({ src, alt, context });
  };

  let match;

  // 1. Standard <img> tags — src attribute
  const imgRegex = /<img[^>]*>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : "";
    const context = classify(tag, alt);

    if (srcMatch) addImage(normalize(srcMatch[1]), alt, context);

    // 2. Lazy-loaded images: data-src, data-lazy-src, data-original, loading="lazy"
    const lazySrcMatch = tag.match(/\bdata-(?:src|lazy-src|original|lazy|srcset|bg|image)=["']([^"']+)["']/i);
    if (lazySrcMatch) addImage(normalize(lazySrcMatch[1]), alt, context);

    // 3. srcset — extract ALL resolutions (pick the largest)
    const srcsetMatch = tag.match(/\bsrcset=["']([^"']+)["']/i);
    if (srcsetMatch) {
      const srcsetParts = srcsetMatch[1].split(",").map(s => s.trim());
      for (const part of srcsetParts) {
        const url = part.split(/\s+/)[0];
        addImage(normalize(url), alt, context);
      }
    }
  }

  // 4. <picture> / <source> elements
  const sourceRegex = /<source[^>]*srcset=["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceRegex.exec(html)) !== null) {
    const srcsetParts = match[1].split(",").map(s => s.trim());
    for (const part of srcsetParts) {
      const url = part.split(/\s+/)[0];
      addImage(normalize(url), "", "general");
    }
  }

  // 5. Open Graph & Twitter Card images
  const metaImgRegex = /<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  while ((match = metaImgRegex.exec(html)) !== null) {
    addImage(normalize(match[1]), "", "hero");
  }
  // Also match reversed attribute order
  const metaImgRegex2 = /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/gi;
  while ((match = metaImgRegex2.exec(html)) !== null) {
    addImage(normalize(match[1]), "", "hero");
  }

  // 6. Favicon and apple-touch-icon
  const iconRegex = /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((match = iconRegex.exec(html)) !== null) {
    addImage(normalize(match[1]), "favicon", "logo");
  }

  // 7. CSS background-image in <style> blocks
  const bgRegex = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    addImage(normalize(match[1]), "", "background");
  }

  // 8. Inline style background-image on elements
  const inlineStyleRegex = /style=["'][^"']*background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)[^"']*["']/gi;
  while ((match = inlineStyleRegex.exec(html)) !== null) {
    addImage(normalize(match[1]), "", "background");
  }

  // 9. <video> poster images
  const posterRegex = /<video[^>]*poster=["']([^"']+)["'][^>]*>/gi;
  while ((match = posterRegex.exec(html)) !== null) {
    addImage(normalize(match[1]), "", "hero");
  }

  // 10. JSON-LD image fields (products, organizations, etc.)
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const extractJsonImages = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        if (typeof obj.image === "string") addImage(normalize(obj.image), obj.name || "", "product");
        if (Array.isArray(obj.image)) obj.image.forEach((i: any) => {
          if (typeof i === "string") addImage(normalize(i), obj.name || "", "product");
          else if (i?.url) addImage(normalize(i.url), obj.name || "", "product");
        });
        if (obj.logo) addImage(normalize(typeof obj.logo === "string" ? obj.logo : obj.logo?.url), "", "logo");
        if (obj.thumbnailUrl) addImage(normalize(obj.thumbnailUrl), obj.name || "", "product");
        if (Array.isArray(obj["@graph"])) obj["@graph"].forEach(extractJsonImages);
        if (Array.isArray(obj.itemListElement)) obj.itemListElement.forEach((item: any) => extractJsonImages(item.item || item));
      };
      extractJsonImages(data);
    } catch { /* skip invalid JSON-LD */ }
  }

  return images;
}

// ─── Extract product/menu items from HTML ──────────────────────────
function extractProductData(html: string): string {
  // Look for structured data (JSON-LD)
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const structuredData: string[] = [];
  for (const m of jsonLdMatches) {
    const content = m.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const parsed = JSON.parse(content);
      if (parsed["@type"] === "Product" || parsed["@type"] === "Menu" || 
          parsed["@type"] === "ItemList" || parsed["@type"] === "Restaurant" ||
          parsed["@type"] === "FoodEstablishment" || parsed["@type"] === "Store" ||
          (Array.isArray(parsed["@graph"]) && parsed["@graph"].length > 0)) {
        structuredData.push(JSON.stringify(parsed, null, 2).substring(0, 3000));
      }
    } catch { /* skip invalid JSON-LD */ }
  }

  // Look for Open Graph product data
  const ogMatches = html.match(/<meta[^>]*property=["'](?:og:product|product:)[^"']*["'][^>]*>/gi) || [];
  const ogData = ogMatches.map(m => {
    const prop = m.match(/property=["']([^"']*)["']/i)?.[1] || "";
    const val = m.match(/content=["']([^"']*)["']/i)?.[1] || "";
    return `${prop}: ${val}`;
  });

  // Look for price patterns in the text
  const priceRegex = /\$[\d,]+\.?\d{0,2}|USD\s*[\d,]+|£[\d,]+\.?\d{0,2}|€[\d,]+\.?\d{0,2}/g;
  const prices = html.match(priceRegex) || [];

  let result = "";
  if (structuredData.length > 0) {
    result += "\n\nSTRUCTURED DATA (JSON-LD):\n" + structuredData.join("\n---\n");
  }
  if (ogData.length > 0) {
    result += "\n\nOPEN GRAPH PRODUCT DATA:\n" + ogData.join("\n");
  }
  if (prices.length > 0) {
    result += "\n\nPRICES FOUND: " + [...new Set(prices)].slice(0, 30).join(", ");
  }
  return result;
}

// ─── Download images and store them for the build ──────────────────
async function downloadImages(
  images: Array<{ src: string; alt: string; context: string }>,
  maxImages: number = 200
): Promise<Array<{ originalSrc: string; localPath: string; alt: string; context: string }>> {
  const downloaded: Array<{ originalSrc: string; localPath: string; alt: string; context: string }> = [];
  const toDownload = images.slice(0, maxImages);

  for (const img of toDownload) {
    try {
      const resp = await fetch(img.src, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) continue;

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 100) continue; // skip tiny/broken images
      if (buffer.length > 5 * 1024 * 1024) continue; // skip >5MB images

      // Determine file extension
      let ext = "jpg";
      if (contentType.includes("png")) ext = "png";
      else if (contentType.includes("svg")) ext = "svg";
      else if (contentType.includes("webp")) ext = "webp";
      else if (contentType.includes("gif")) ext = "gif";

      // Generate a clean filename from the URL
      const urlPath = new URL(img.src).pathname;
      const baseName = urlPath.split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") || `image_${downloaded.length}`;
      const fileName = baseName.includes(".") ? baseName : `${baseName}.${ext}`;
      const localPath = `images/${img.context}/${fileName}`;

      downloaded.push({
        originalSrc: img.src,
        localPath,
        alt: img.alt,
        context: img.context,
      });
    } catch { /* skip failed downloads */ }
  }
  return downloaded;
}

export async function researchTarget(
  projectId: number,
  userId: number
): Promise<ResearchResult> {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Project not found");

  await updateProjectStatus(projectId, "researching", "Fetching target website...");
  appendBuildLog(projectId, { step: 0, status: "running", message: "Fetching target website...", timestamp: new Date().toISOString() });

  // Fetch the target page
  let targetUrl = project.targetUrl;
  if (!targetUrl.startsWith("http")) {
    // Search for the app to find its URL
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl + " official website")}`;
      const resp = await fetch(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await resp.text();
      const urlMatch = html.match(/uddg=([^&"]*)/);
      if (urlMatch) {
        targetUrl = decodeURIComponent(urlMatch[1]);
      } else {
        targetUrl = `https://${targetUrl.toLowerCase().replace(/\s+/g, "")}.com`;
      }
    } catch {
      targetUrl = `https://${targetUrl.toLowerCase().replace(/\s+/g, "")}.com`;
    }
  }

  let pageContent = "";
  let pageTitle = "";
  let rawHtml = "";
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    rawHtml = await resp.text();
    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : project.targetName;

    // Extract meta description
    const metaDesc = rawHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);

    // Extract text content
    pageContent = rawHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);

    if (metaDesc) {
      pageContent = `Meta description: ${metaDesc[1]}\n\n${pageContent}`;
    }
  } catch (err: unknown) {
    await updateProjectStatus(projectId, "error", `Failed to fetch ${targetUrl}: ${getErrorMessage(err)}`, {
      errorMessage: getErrorMessage(err),
    });
    throw new Error(`Failed to fetch ${targetUrl}: ${getErrorMessage(err)}`);
  }

  // ═══ SAFETY CHECK: Block prohibited content ═══
  const safetyResult = checkScrapedContent(targetUrl, project.targetName, rawHtml, false);
  if (!safetyResult.allowed) {
    await updateProjectStatus(projectId, "error", safetyResult.reason || "Content blocked by safety filter");
    throw new Error(safetyResult.reason || "This website cannot be cloned due to safety restrictions.");
  }

  // ═══ DEEP CRAWL: Fetch subpages for complete content ═══
  appendBuildLog(projectId, { step: 0, status: "running", message: "Deep crawling subpages...", timestamp: new Date().toISOString() });
  const subpages = await deepCrawlSite(targetUrl, rawHtml, 20);
  const allPagesHtml = [rawHtml, ...subpages.map(p => p.html)].join("\n");

  // ═══ DEEP PRODUCT CATALOG SCRAPING ═══
  appendBuildLog(projectId, { step: 0, status: "running", message: "Deep scraping product catalog (this may take a few minutes)...", timestamp: new Date().toISOString() });
  let catalogResult: CatalogResult | null = null;
  try {
    catalogResult = await scrapeProductCatalog(targetUrl, rawHtml, {
      maxPages: 100,
      maxProducts: 500,
      maxImages: 200,
      onProgress: (msg) => {
        appendBuildLog(projectId, { step: 0, status: "running", message: `[Catalog] ${msg}`, timestamp: new Date().toISOString() });
      },
    });
    appendBuildLog(projectId, { step: 0, status: "running", message: `Catalog scraped: ${catalogResult.products.length} products, ${catalogResult.downloadedImages.length} images, ${catalogResult.pagesScraped} pages`, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    appendBuildLog(projectId, { step: 0, status: "running", message: `Catalog scrape warning: ${getErrorMessage(err)} — falling back to basic extraction`, timestamp: new Date().toISOString() });
  }

  // ═══ EXTRACT IMAGES from all pages (fallback + supplement) ═══
  appendBuildLog(projectId, { step: 0, status: "running", message: `Found ${subpages.length} subpages. Extracting images and product data...`, timestamp: new Date().toISOString() });
  const allImages = extractImages(allPagesHtml, targetUrl);
  // Download ALL extracted images — products, heroes, logos, backgrounds, etc.
  // Prioritize product images first, then hero/logo, then general
  const priorityOrder: Record<string, number> = { product: 0, hero: 1, logo: 2, gallery: 3, background: 4, team: 5, testimonial: 6, icon: 7, general: 8 };
  allImages.sort((a, b) => (priorityOrder[a.context] ?? 9) - (priorityOrder[b.context] ?? 9));
  const downloadedImages = await downloadImages(allImages, 200);

  // ═══ EXTRACT PRODUCT/MENU DATA (basic fallback) ═══
  const productData = extractProductData(allPagesHtml);

  // Build subpage content summary for the LLM
  const subpageSummary = subpages.map(p => {
    const text = p.html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 2000);
    return `\n--- PAGE: ${p.title} (${p.url}) ---\n${text}`;
  }).join("\n");

  // Build image inventory for the LLM
  const imageInventory = downloadedImages.length > 0
    ? "\n\nIMAGE INVENTORY:\n" + downloadedImages.map(i => `- ${i.localPath} (${i.context}): ${i.alt || "no alt text"} [original: ${i.originalSrc}]`).join("\n")
    : "";

  // Extract structural hints from HTML
  const structuralHints = extractStructuralHints(rawHtml);

  appendBuildLog(projectId, { step: 0, status: "running", message: `Analyzing with AI... (${subpages.length + 1} pages, ${downloadedImages.length} images)`, timestamp: new Date().toISOString() });

  // Pull user's own OpenAI key from their vault — required for clone feature
  const userApiKey = await getUserOpenAIKey(userId) || undefined;

  // LLM analysis
  const analysis = await invokeLLM({
    systemTag: "chat",
    userApiKey,
    messages: [
      {
        role: "system",
        content: `You are an expert software analyst specializing in reverse-engineering web applications. Analyze the given web application and produce a detailed feature analysis report. Be thorough and specific — identify every feature, UI pattern, data model, and API endpoint you can infer. Return a JSON object with this structure:
{
  "appName": "Name of the app",
  "description": "One-paragraph description of what the app does",
  "targetAudience": "Who uses this app",
  "coreFeatures": ["feature 1", "feature 2", ...],
  "uiPatterns": ["pattern 1", "pattern 2", ...],
  "techStackGuess": ["technology 1", "technology 2", ...],
  "dataModels": ["model 1: description", "model 2: description", ...],
  "apiEndpoints": ["endpoint 1: description", ...],
  "authMethod": "How users authenticate",
  "monetization": "How the app makes money",
  "keyDifferentiators": ["what makes it unique 1", ...],
  "suggestedTechStack": "Recommended tech stack for building a clone",
  "estimatedComplexity": "low | medium | high | very_high",
  "mvpFeatures": ["minimum features for a working clone"],
  "fullFeatures": ["all features for complete parity"]
}`,
      },
      {
        role: "user",
        content: `Analyze this application for COMPLETE REPLICATION. Include EVERY product, menu item, page, and feature.\n\n**URL:** ${targetUrl}\n**Title:** ${pageTitle}\n**Structural hints:** ${structuralHints}\n**Homepage Content:**\n${pageContent}\n\n**Subpages Found (${subpages.length}):**\n${subpageSummary.substring(0, 6000)}${productData}${imageInventory}\n\nIMPORTANT: List EVERY product/menu item with exact names, descriptions, and prices. This must be a COMPLETE mimic — every page, every item, every feature.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "app_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            appName: { type: "string" },
            description: { type: "string" },
            targetAudience: { type: "string" },
            coreFeatures: { type: "array", items: { type: "string" } },
            uiPatterns: { type: "array", items: { type: "string" } },
            techStackGuess: { type: "array", items: { type: "string" } },
            dataModels: { type: "array", items: { type: "string" } },
            apiEndpoints: { type: "array", items: { type: "string" } },
            authMethod: { type: "string" },
            monetization: { type: "string" },
            keyDifferentiators: { type: "array", items: { type: "string" } },
            suggestedTechStack: { type: "string" },
            estimatedComplexity: { type: "string" },
            mvpFeatures: { type: "array", items: { type: "string" } },
            fullFeatures: { type: "array", items: { type: "string" } },
          },
          required: [
            "appName", "description", "targetAudience", "coreFeatures",
            "uiPatterns", "techStackGuess", "dataModels", "apiEndpoints",
            "authMethod", "monetization", "keyDifferentiators",
            "suggestedTechStack", "estimatedComplexity", "mvpFeatures", "fullFeatures",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = analysis?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    await updateProjectStatus(projectId, "error", "LLM analysis failed — no response");
    throw new Error("LLM analysis failed");
  }

  const research: ResearchResult = JSON.parse(rawContent);

  // Enhance research with crawl metadata
  (research as any).pagesFound = subpages.length + 1;
  (research as any).imagesFound = downloadedImages.length;
  (research as any).imageInventory = downloadedImages.map(i => ({
    localPath: i.localPath,
    alt: i.alt,
    context: i.context,
    originalSrc: i.originalSrc,
  }));
  (research as any).productDataRaw = productData.substring(0, 5000);
  (research as any).subpageUrls = subpages.map(p => ({ url: p.url, title: p.title }));

  // Add deep catalog data if available
  if (catalogResult) {
    (research as any).catalogProducts = catalogResult.products.map(p => ({
      name: p.name,
      description: p.description?.substring(0, 200),
      price: p.price,
      originalPrice: p.originalPrice,
      currency: p.currency,
      category: p.category,
      subcategory: p.subcategory,
      images: p.images.slice(0, 3),
      sizes: p.sizes,
      colors: p.colors,
      sku: p.sku,
      url: p.url,
      inStock: p.inStock,
      brand: p.brand,
    }));
    (research as any).catalogCategories = catalogResult.categories;
    (research as any).catalogStats = {
      totalProducts: catalogResult.totalProductsFound,
      totalImages: catalogResult.totalImagesFound,
      pagesScraped: catalogResult.pagesScraped,
      downloadedImages: catalogResult.downloadedImages.length,
    };
    // Store image buffers reference for the build phase
    (research as any).catalogImageBuffers = catalogResult.downloadedImages.map(i => ({
      localPath: i.localPath,
      associatedName: i.associatedName,
      originalUrl: i.originalUrl,
      contentType: i.contentType,
      size: i.imageBuffer.length,
    }));

    // Store all content types from the universal scraper
    (research as any).siteType = catalogResult.siteType;
    (research as any).siteMetadata = catalogResult.siteMetadata;

    // Real estate listings
    if (catalogResult.listings.length > 0) {
      (research as any).catalogListings = catalogResult.listings.map(l => ({
        title: l.title,
        description: l.description?.substring(0, 300),
        price: l.price,
        priceType: l.priceType,
        address: l.address,
        city: l.city,
        state: l.state,
        zip: l.zip,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: l.sqft,
        lotSize: l.lotSize,
        yearBuilt: l.yearBuilt,
        propertyType: l.propertyType,
        listingType: l.listingType,
        mlsNumber: l.mlsNumber,
        agent: l.agent,
        images: l.images.slice(0, 5),
        url: l.url,
        amenities: l.amenities?.slice(0, 15),
      }));
    }

    // Restaurant menu items
    if (catalogResult.menuItems.length > 0) {
      (research as any).catalogMenuItems = catalogResult.menuItems.map(m => ({
        name: m.name,
        description: m.description?.substring(0, 200),
        price: m.price,
        category: m.category,
        image: m.image,
        dietary: m.dietary,
        spicy: m.spicy,
      }));
    }

    // Job listings
    if (catalogResult.jobs.length > 0) {
      (research as any).catalogJobs = catalogResult.jobs.map(j => ({
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        type: j.type,
        description: j.description?.substring(0, 300),
        url: j.url,
        postedDate: j.postedDate,
      }));
    }

    // Articles / blog posts
    if (catalogResult.articles.length > 0) {
      (research as any).catalogArticles = catalogResult.articles.map(a => ({
        title: a.title,
        author: a.author,
        date: a.date,
        excerpt: a.excerpt?.substring(0, 300),
        image: a.image,
        category: a.category,
        url: a.url,
        tags: a.tags?.slice(0, 5),
      }));
    }
  }

  const totalItems = catalogResult?.totalProductsFound || 0;
  const totalCatalogImages = catalogResult?.downloadedImages.length || 0;
  const detectedType = catalogResult?.siteType || "generic";
  const listingCount = catalogResult?.listings.length || 0;
  const menuCount = catalogResult?.menuItems.length || 0;
  const jobCount = catalogResult?.jobs.length || 0;
  const articleCount = catalogResult?.articles.length || 0;
  const productCount = catalogResult?.products.length || 0;

  // Build a human-readable content summary
  const contentParts: string[] = [];
  if (productCount > 0) contentParts.push(`${productCount} products`);
  if (listingCount > 0) contentParts.push(`${listingCount} listings`);
  if (menuCount > 0) contentParts.push(`${menuCount} menu items`);
  if (jobCount > 0) contentParts.push(`${jobCount} jobs`);
  if (articleCount > 0) contentParts.push(`${articleCount} articles`);
  const contentSummary = contentParts.length > 0 ? contentParts.join(", ") : "no catalog items";

  // Update the project with research data
  await updateProjectStatus(projectId, "research_complete", `Research complete [${detectedType.toUpperCase()}]: ${research.coreFeatures.length} features, ${subpages.length + 1} pages, ${downloadedImages.length + totalCatalogImages} images, ${contentSummary}`, {
    targetUrl,
    targetDescription: research.description,
    researchData: research,
  });

  appendBuildLog(projectId, { step: 0, status: "success", message: `Research complete: ${research.appName} [${detectedType.toUpperCase()}] — ${research.coreFeatures.length} features, ${subpages.length + 1} pages, ${downloadedImages.length + totalCatalogImages} images, ${contentSummary}, complexity: ${research.estimatedComplexity}`, timestamp: new Date().toISOString() });

  return research;
}

// ─── Step 2: Generate Build Plan ────────────────────────────────────

export async function generateBuildPlan(
  projectId: number,
  userId: number,
  options?: {
    features?: string[];
    techStack?: string;
  }
): Promise<BuildPlan> {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Project not found");
  if (!project.researchData) throw new Error("Research not complete — run research first");

  await updateProjectStatus(projectId, "planning", "Generating build plan...");
  appendBuildLog(projectId, { step: 1, status: "running", message: "Generating build plan with AI...", timestamp: new Date().toISOString() });

  const research = project.researchData;
  const features = options?.features ?? (project.priority === "mvp" ? research.mvpFeatures : research.fullFeatures);
  const techStack = options?.techStack ?? research.suggestedTechStack;

  // Include branding and Stripe context in the plan
  const brandingContext = project.brandName
    ? `\n\n**Custom Branding:**
- Brand Name: ${project.brandName}
- Tagline: ${project.brandTagline || "N/A"}
- Colors: ${project.brandColors ? JSON.stringify(project.brandColors) : "Use modern defaults"}
- Logo: ${project.brandLogo || "Generate a text-based logo"}`
    : "";

  const stripeContext = project.stripePublishableKey
    ? `\n\n**Stripe Payment Integration Required:**
- Include Stripe checkout for payments
- Add pricing page with plans
- Wire up webhook handler for payment events
- Use environment variables for Stripe keys (STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY)`
    : "";

  // Pull user's own OpenAI key from their vault
  const userApiKey = await getUserOpenAIKey(userId) || undefined;

  const buildPlanResponse = await invokeLLM({
    systemTag: "chat",
    userApiKey,
    messages: [
      {
        role: "system",
        content: `You are an expert full-stack developer. Generate a detailed, practical build plan for a web application clone. The plan must be immediately executable — each step should produce working code. Return a JSON object with this structure:
{
  "projectName": "kebab-case project name",
  "description": "What this app does",
  "techStack": {
    "frontend": "React + Tailwind CSS + Vite",
    "backend": "Node.js + Express",
    "database": "SQLite (file-based, no setup needed)",
    "other": "any other tools"
  },
  "fileStructure": [
    { "path": "relative/file/path", "description": "what this file does", "priority": 1 }
  ],
  "buildSteps": [
    { "step": 1, "description": "what to do", "files": ["files to create/modify"], "commands": ["shell commands to run"] }
  ],
  "dataModels": [
    { "name": "ModelName", "fields": ["field1: type", "field2: type"] }
  ],
  "apiRoutes": [
    { "method": "GET|POST|PUT|DELETE", "path": "/api/route", "description": "what it does" }
  ],
  "estimatedFiles": 15,
  "estimatedTimeMinutes": 30
}

IMPORTANT RULES:
- First build step MUST be project initialization (npm init, install deps)
- Use React + Vite for frontend, Express for backend, SQLite for database
- Include complete package.json with all dependencies
- Each file's content should be complete and working
- Include proper error handling and loading states
- Make the UI responsive and professional
- Include a README.md with setup instructions`,
      },
      {
        role: "user",
        content: `Generate a build plan for cloning: "${research.appName}"

**Original description:** ${research.description}
**Target audience:** ${research.targetAudience}

**Features to implement (${project.priority} priority):**
${features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

**UI Patterns to replicate:** ${research.uiPatterns.join(", ")}
**Data Models:** ${research.dataModels.join(", ")}
**API Endpoints:** ${research.apiEndpoints.join(", ")}

**Tech stack:** ${techStack}${brandingContext}${stripeContext}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "build_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            projectName: { type: "string" },
            description: { type: "string" },
            techStack: {
              type: "object",
              properties: {
                frontend: { type: "string" },
                backend: { type: "string" },
                database: { type: "string" },
                other: { type: "string" },
              },
              required: ["frontend", "backend", "database", "other"],
              additionalProperties: false,
            },
            fileStructure: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "integer" },
                },
                required: ["path", "description", "priority"],
                additionalProperties: false,
              },
            },
            buildSteps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  step: { type: "integer" },
                  description: { type: "string" },
                  files: { type: "array", items: { type: "string" } },
                  commands: { type: "array", items: { type: "string" } },
                },
                required: ["step", "description", "files", "commands"],
                additionalProperties: false,
              },
            },
            dataModels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  fields: { type: "array", items: { type: "string" } },
                },
                required: ["name", "fields"],
                additionalProperties: false,
              },
            },
            apiRoutes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  method: { type: "string" },
                  path: { type: "string" },
                  description: { type: "string" },
                },
                required: ["method", "path", "description"],
                additionalProperties: false,
              },
            },
            estimatedFiles: { type: "integer" },
            estimatedTimeMinutes: { type: "integer" },
          },
          required: [
            "projectName", "description", "techStack", "fileStructure",
            "buildSteps", "dataModels", "apiRoutes", "estimatedFiles", "estimatedTimeMinutes",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = buildPlanResponse?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    await updateProjectStatus(projectId, "error", "Failed to generate build plan");
    throw new Error("Failed to generate build plan");
  }

  const plan: BuildPlan = JSON.parse(rawContent);

  await updateProjectStatus(projectId, "plan_complete", `Build plan ready: ${plan.buildSteps.length} steps, ${plan.estimatedFiles} files`, {
    buildPlan: plan,
    totalSteps: plan.buildSteps.length,
  });

  appendBuildLog(projectId, { step: 1, status: "success", message: `Build plan generated: ${plan.buildSteps.length} steps, ~${plan.estimatedTimeMinutes} min`, timestamp: new Date().toISOString() });

  return plan;
}

// ─── Step 3: Execute Build ──────────────────────────────────────────

export async function executeBuild(
  projectId: number,
  userId: number
): Promise<{ success: boolean; message: string }> {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Project not found");
  if (!project.buildPlan) throw new Error("Build plan not generated — run generateBuildPlan first");

  const plan = project.buildPlan;

  // Pull user's own OpenAI key from their vault for LLM calls during build
  const userApiKey = await getUserOpenAIKey(userId) || undefined;

  // Create or reuse sandbox
  let sandboxId = project.sandboxId;
  if (!sandboxId) {
    const sandbox = await createSandbox(userId, `replicate-${plan.projectName}`, {
      memoryMb: 1024,
      diskMb: 4096,
    });
    sandboxId = sandbox.id;
    await updateProjectStatus(projectId, "building", "Sandbox created, starting build...", {
      sandboxId: sandbox.id,
    });
  } else {
    await updateProjectStatus(projectId, "building", "Starting build in existing sandbox...");
  }

  appendBuildLog(projectId, { step: 2, status: "running", message: "Starting build execution...", timestamp: new Date().toISOString() });

  // Execute each build step
  for (let i = 0; i < plan.buildSteps.length; i++) {
    const step = plan.buildSteps[i];
    const stepNum = i + 1;

    await updateProjectStatus(projectId, "building", `Step ${stepNum}/${plan.buildSteps.length}: ${step.description}`, {
      currentStep: stepNum,
    });

    appendBuildLog(projectId, {
      step: stepNum + 1,
      status: "running",
      message: `Step ${stepNum}: ${step.description}`,
      timestamp: new Date().toISOString(),
    });

    // Generate file contents for this step
    if (step.files.length > 0) {
      try {
        const fileContents = await generateFileContents(
          plan,
          step,
          project.researchData!,
          {
            brandName: project.brandName ?? undefined,
            brandColors: project.brandColors ?? undefined,
            brandLogo: project.brandLogo ?? undefined,
            brandTagline: project.brandTagline ?? undefined,
          },
          project.stripePublishableKey ? {
            publishableKey: project.stripePublishableKey,
            secretKey: project.stripeSecretKey ?? undefined,
            priceIds: project.stripePriceIds ?? undefined,
          } : undefined,
          userApiKey
        );

        // Write each file to the sandbox
        for (const file of fileContents) {
          await sandboxWriteFile(sandboxId, userId, file.path, file.content);
        }
      } catch (err: unknown) {
        appendBuildLog(projectId, {
          step: stepNum + 1,
          status: "error",
          message: `File generation failed: ${getErrorMessage(err)}`,
          timestamp: new Date().toISOString(),
        });
        // Continue with commands even if file generation partially fails
      }
    }

    // Execute commands
    for (const cmd of step.commands) {
      try {
        const result = await executeCommand(sandboxId, userId, cmd, {
          timeoutMs: 120000,
          triggeredBy: "system",
          workingDirectory: `/home/sandbox/${plan.projectName}`,
        });

        if (result.exitCode !== 0 && !cmd.includes("mkdir")) {
          appendBuildLog(projectId, {
            step: stepNum + 1,
            status: "error",
            message: `Command failed (exit ${result.exitCode}): ${cmd}\n${result.output.substring(0, 500)}`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err: unknown) {
        appendBuildLog(projectId, {
          step: stepNum + 1,
          status: "error",
          message: `Command error: ${cmd} — ${getErrorMessage(err)}`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    appendBuildLog(projectId, {
      step: stepNum + 1,
      status: "success",
      message: `Step ${stepNum} complete`,
      timestamp: new Date().toISOString(),
    });
  }

  // Write downloaded images to sandbox
  appendBuildLog(projectId, {
    step: plan.buildSteps.length + 1,
    status: "running",
    message: "Writing images to project...",
    timestamp: new Date().toISOString(),
  });

  // Retrieve images from the research phase and write them to the sandbox
  try {
    // Create image directories
    await executeCommand(sandboxId, userId, `mkdir -p /home/sandbox/${plan.projectName}/public/images/{products,hero,logo,general,background,team,gallery,icon,testimonial,product}`, {
      timeoutMs: 5000,
      triggeredBy: "system",
    });

    // ═══ PHASE A: Write ALL basic extracted images (hero, logo, background, product, team, gallery, general) ═══
    const basicImageRefs = (project.researchData as any)?.imageInventory || [];
    let imagesWritten = 0;
    let imagesFailed = 0;

    if (basicImageRefs.length > 0) {
      appendBuildLog(projectId, {
        step: plan.buildSteps.length + 1,
        status: "running",
        message: `Re-downloading ${basicImageRefs.length} site images (heroes, logos, backgrounds, products)...`,
        timestamp: new Date().toISOString(),
      });

      for (const imgRef of basicImageRefs) {
        try {
          const resp = await fetch(imgRef.originalSrc, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) { imagesFailed++; continue; }
          const buffer = Buffer.from(await resp.arrayBuffer());
          if (buffer.length < 200) { imagesFailed++; continue; }

          // Write directly via filesystem — avoids shell command length limits for large images
          const imgPath = `/home/sandbox/${plan.projectName}/public/${imgRef.localPath}`;
          const written = await writeBinaryFile(sandboxId, userId, imgPath, buffer);
          if (written) {
            imagesWritten++;
          } else {
            imagesFailed++;
            continue;
          }

          if (imagesWritten % 25 === 0) {
            appendBuildLog(projectId, {
              step: plan.buildSteps.length + 1,
              status: "running",
              message: `Written ${imagesWritten}/${basicImageRefs.length} site images...`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          imagesFailed++;
        }
      }
    }

    appendBuildLog(projectId, {
      step: plan.buildSteps.length + 1,
      status: "running",
      message: `Site images: ${imagesWritten} written, ${imagesFailed} failed`,
      timestamp: new Date().toISOString(),
    });

    // ═══ PHASE B: Write deep catalog product images (from product-scraper) ═══
    const catalogImageRefs = (project.researchData as any)?.catalogImageBuffers || [];
    let catalogImagesWritten = 0;

    if (catalogImageRefs.length > 0) {
      appendBuildLog(projectId, {
        step: plan.buildSteps.length + 1,
        status: "running",
        message: `Re-downloading ${catalogImageRefs.length} catalog product images...`,
        timestamp: new Date().toISOString(),
      });

      for (const imgRef of catalogImageRefs) {
        try {
          const resp = await fetch(imgRef.originalUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) continue;
          const buffer = Buffer.from(await resp.arrayBuffer());
          if (buffer.length < 200) continue;

          // Write directly via filesystem — avoids shell command length limits
          const catImgPath = `/home/sandbox/${plan.projectName}/public/${imgRef.localPath}`;
          const catWritten = await writeBinaryFile(sandboxId, userId, catImgPath, buffer);
          if (catWritten) {
            catalogImagesWritten++;
          } else {
            continue;
          }

          if (catalogImagesWritten % 25 === 0) {
            appendBuildLog(projectId, {
              step: plan.buildSteps.length + 1,
              status: "running",
              message: `Written ${catalogImagesWritten}/${catalogImageRefs.length} catalog images...`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          // Skip failed image downloads
        }
      }
    }

    const totalImagesWritten = imagesWritten + catalogImagesWritten;
    appendBuildLog(projectId, {
      step: plan.buildSteps.length + 1,
      status: "success",
      message: `Written ${totalImagesWritten} total images to project (${imagesWritten} site + ${catalogImagesWritten} catalog)`,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical — continue
  }

  // Persist workspace to S3 so files survive server restarts
  appendBuildLog(projectId, {
    step: plan.buildSteps.length + 2,
    status: "running",
    message: "Persisting project files to cloud storage...",
    timestamp: new Date().toISOString(),
  });

  try {
    await persistWorkspace(sandboxId, userId);

    // Also index all built files into the sandboxFiles table for the Project Files viewer
    const builtFiles = await listFiles(sandboxId, userId, "/");
    const db = await getDb();
    if (db && builtFiles.length > 0) {
      const { sandboxFiles } = await import("../drizzle/schema");
      for (const file of builtFiles) {
        if (!file.isDirectory) {
          try {
            const content = await readFile(sandboxId, userId, file.path);
            if (content !== null) {
              const s3Key = `projects/${userId}/${projectId}/${file.path.replace(/^\//, "")}`;
              await storagePut(s3Key, Buffer.from(content, "utf-8"), "text/plain");
              await db.insert(sandboxFiles).values({
                sandboxId,
                filePath: file.path,
                s3Key,
                fileSize: Buffer.byteLength(content, "utf-8"),
                content: content.length <= 65535 ? content : null,
              });
            }
          } catch {
            // Non-critical — continue indexing other files
          }
        }
      }
    }

    appendBuildLog(projectId, {
      step: plan.buildSteps.length + 2,
      status: "success",
      message: `Persisted ${builtFiles.length} files to cloud storage`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    appendBuildLog(projectId, {
      step: plan.buildSteps.length + 2,
      status: "error",
      message: `Persistence warning: ${getErrorMessage(err)}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Store output file list on the project
  const outputFileList = plan.fileStructure.map(f => f.path);

  // Mark build complete
  await updateProjectStatus(projectId, "build_complete", "Build complete! All steps executed.", {
    currentStep: plan.buildSteps.length,
    outputFiles: outputFileList,
  });

  appendBuildLog(projectId, {
    step: plan.buildSteps.length + 3,
    status: "success",
    message: "Build complete! Project is ready.",
    timestamp: new Date().toISOString(),
  });

  return { success: true, message: `Build complete: ${plan.buildSteps.length} steps executed` };
}

// ─── Step 4: Update Branding ────────────────────────────────────────

export async function updateBranding(
  projectId: number,
  userId: number,
  branding: BrandConfig
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(replicateProjects)
    .set({
      brandName: branding.brandName,
      brandColors: branding.brandColors,
      brandLogo: branding.brandLogo,
      brandTagline: branding.brandTagline,
    })
    .where(
      and(
        eq(replicateProjects.id, projectId),
        eq(replicateProjects.userId, userId)
      )
    );
}

// ─── Step 5: Update Stripe Config ───────────────────────────────────

export async function updateStripeConfig(
  projectId: number,
  userId: number,
  stripe: StripeConfig
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(replicateProjects)
    .set({
      stripePublishableKey: stripe.publishableKey,
      stripeSecretKey: stripe.secretKey,
      stripePriceIds: stripe.priceIds,
    })
    .where(
      and(
        eq(replicateProjects.id, projectId),
        eq(replicateProjects.userId, userId)
      )
    );
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractStructuralHints(html: string): string {
  const hints: string[] = [];

  // Count major sections
  const navCount = (html.match(/<nav/gi) || []).length;
  const headerCount = (html.match(/<header/gi) || []).length;
  const footerCount = (html.match(/<footer/gi) || []).length;
  const formCount = (html.match(/<form/gi) || []).length;
  const buttonCount = (html.match(/<button/gi) || []).length;
  const inputCount = (html.match(/<input/gi) || []).length;
  const imgCount = (html.match(/<img/gi) || []).length;

  hints.push(`Navigation bars: ${navCount}`);
  hints.push(`Headers: ${headerCount}`);
  hints.push(`Footers: ${footerCount}`);
  hints.push(`Forms: ${formCount}`);
  hints.push(`Buttons: ${buttonCount}`);
  hints.push(`Input fields: ${inputCount}`);
  hints.push(`Images: ${imgCount}`);

  // Detect frameworks
  if (html.includes("react") || html.includes("__NEXT_DATA__")) hints.push("Framework: React/Next.js detected");
  if (html.includes("vue") || html.includes("__vue__")) hints.push("Framework: Vue.js detected");
  if (html.includes("angular")) hints.push("Framework: Angular detected");
  if (html.includes("stripe")) hints.push("Payment: Stripe integration detected");
  if (html.includes("firebase")) hints.push("Backend: Firebase detected");
  if (html.includes("supabase")) hints.push("Backend: Supabase detected");

  // Detect common patterns
  if (html.includes("login") || html.includes("sign-in") || html.includes("signin")) hints.push("Auth: Login page detected");
  if (html.includes("pricing") || html.includes("plan")) hints.push("Monetization: Pricing/plans detected");
  if (html.includes("dashboard")) hints.push("UI: Dashboard pattern detected");
  if (html.includes("chat") || html.includes("message")) hints.push("Feature: Chat/messaging detected");

  return hints.join("; ");
}

async function generateFileContents(
  plan: BuildPlan,
  step: BuildPlan["buildSteps"][0],
  research: ResearchResult,
  branding?: BrandConfig,
  stripe?: StripeConfig,
  userApiKey?: string
): Promise<Array<{ path: string; content: string }>> {
  const brandingInfo = branding?.brandName
    ? `\nBranding: name="${branding.brandName}", tagline="${branding.brandTagline || ""}", colors=${branding.brandColors ? JSON.stringify(branding.brandColors) : "modern defaults"}`
    : "";

  const stripeInfo = stripe?.publishableKey
    ? `\nStripe Integration: The USER's own Stripe keys are provided. Use env vars STRIPE_PUBLISHABLE_KEY="${stripe.publishableKey}" and STRIPE_SECRET_KEY. Include complete checkout flow, product listing with prices, cart, and webhook handler. All payments go to the USER's Stripe account.`
    : "";

  // Include image inventory and product data from research
  const imageInfo = (research as any).imageInventory?.length > 0
    ? `\n\nAVAILABLE IMAGES:\n${(research as any).imageInventory.map((i: any) => `- /public/${i.localPath}: ${i.alt || i.context} [from ${i.originalSrc}]`).join("\n")}`
    : "";
  const productInfo = (research as any).productDataRaw
    ? `\n\nPRODUCT/MENU DATA FROM ORIGINAL SITE:\n${(research as any).productDataRaw}`
    : "";
  const subpageInfo = (research as any).subpageUrls?.length > 0
    ? `\n\nSUBPAGES FOUND:\n${(research as any).subpageUrls.map((p: any) => `- ${p.title}: ${p.url}`).join("\n")}`
    : "";

  // Include deep catalog data if available — all content types
  const catalogProducts = (research as any).catalogProducts || [];
  const catalogListings = (research as any).catalogListings || [];
  const catalogMenuItems = (research as any).catalogMenuItems || [];
  const catalogJobs = (research as any).catalogJobs || [];
  const catalogArticles = (research as any).catalogArticles || [];
  const detectedSiteType = (research as any).siteType || "generic";
  const siteMetadataInfo = (research as any).siteMetadata;

  let catalogInfo = "";

  // Site metadata
  if (siteMetadataInfo) {
    catalogInfo += `\n\n═══ SITE METADATA ═══\nSite Type: ${detectedSiteType.toUpperCase()}\nTitle: ${siteMetadataInfo.title || "N/A"}\nDescription: ${siteMetadataInfo.description || "N/A"}\nPhone: ${siteMetadataInfo.phone || "N/A"}\nEmail: ${siteMetadataInfo.email || "N/A"}\nAddress: ${siteMetadataInfo.address || "N/A"}\nHours: ${siteMetadataInfo.hours || "N/A"}\nSocial: ${(siteMetadataInfo.socialLinks || []).join(", ") || "N/A"}`;
  }

  // Products (retail)
  if (catalogProducts.length > 0) {
    catalogInfo += `\n\n═══ FULL PRODUCT CATALOG (${catalogProducts.length} products) ═══\nYou MUST include ALL of these products in the database seed data and product listing pages.\n${catalogProducts.slice(0, 200).map((p: any, i: number) => 
      `${i + 1}. "${p.name}" | Price: ${p.price} ${p.currency} | Category: ${p.category || "General"} | Brand: ${p.brand || ""} | Images: ${(p.images || []).slice(0, 2).join(", ") || "use placeholder"} | Sizes: ${(p.sizes || []).join(", ") || "N/A"} | Colors: ${(p.colors || []).join(", ") || "N/A"} | SKU: ${p.sku || ""}`
    ).join("\n")}\n\n═══ PRODUCT CATEGORIES ═══\n${((research as any).catalogCategories || []).map((c: any) => `- ${c.name} (${c.productCount} products): ${c.url}`).join("\n") || "No categories extracted"}`;
  }

  // Real estate listings
  if (catalogListings.length > 0) {
    catalogInfo += `\n\n═══ PROPERTY LISTINGS (${catalogListings.length} listings) ═══\nYou MUST include ALL of these listings in the database seed data and listing pages. Include BOTH for-sale and for-rent properties.\n${catalogListings.slice(0, 200).map((l: any, i: number) => 
      `${i + 1}. "${l.title}" | Price: ${l.price} (${l.listingType || "sale"}) | Type: ${l.propertyType || "house"} | Beds: ${l.bedrooms || "?"} | Baths: ${l.bathrooms || "?"} | SqFt: ${l.sqft || "?"} | Address: ${[l.address, l.city, l.state, l.zip].filter(Boolean).join(", ")} | Agent: ${l.agent || "N/A"} | Images: ${(l.images || []).slice(0, 2).join(", ") || "use placeholder"} | Amenities: ${(l.amenities || []).slice(0, 5).join(", ") || "N/A"}`
    ).join("\n")}`;
  }

  // Restaurant menu items
  if (catalogMenuItems.length > 0) {
    catalogInfo += `\n\n═══ FULL MENU (${catalogMenuItems.length} items) ═══\nYou MUST include ALL of these menu items in the database seed data and menu pages.\n${catalogMenuItems.slice(0, 200).map((m: any, i: number) => 
      `${i + 1}. "${m.name}" | Price: ${m.price} | Category: ${m.category || "General"} | Description: ${m.description || ""} | Dietary: ${(m.dietary || []).join(", ") || "none"} | ${m.spicy ? "SPICY" : ""} | Image: ${m.image || "use placeholder"}`
    ).join("\n")}`;
  }

  // Job listings
  if (catalogJobs.length > 0) {
    catalogInfo += `\n\n═══ JOB LISTINGS (${catalogJobs.length} jobs) ═══\nYou MUST include ALL of these job listings in the database seed data and job board pages.\n${catalogJobs.slice(0, 200).map((j: any, i: number) => 
      `${i + 1}. "${j.title}" | Company: ${j.company} | Location: ${j.location} | Salary: ${j.salary || "Not specified"} | Type: ${j.type || "Full-time"} | Posted: ${j.postedDate || "Recent"}`
    ).join("\n")}`;
  }

  // Articles / blog posts
  if (catalogArticles.length > 0) {
    catalogInfo += `\n\n═══ ARTICLES / BLOG POSTS (${catalogArticles.length} articles) ═══\nYou MUST include ALL of these articles in the database seed data and blog/news pages.\n${catalogArticles.slice(0, 100).map((a: any, i: number) => 
      `${i + 1}. "${a.title}" | Author: ${a.author || "Staff"} | Date: ${a.date || "Recent"} | Category: ${a.category || "General"} | Excerpt: ${a.excerpt?.substring(0, 150) || ""} | Image: ${a.image || "use placeholder"}`
    ).join("\n")}`;
  }

  const response = await invokeLLM({
    systemTag: "chat",
    userApiKey,
    messages: [
      {
        role: "system",
        content: `You are an expert full-stack developer building a COMPLETE MIMIC of a website. Generate the complete file contents for the given build step.

CRITICAL RULES:
- Return a JSON array of objects with "path" and "content" fields
- Each file must be COMPLETE, WORKING code — NO placeholders, NO TODOs, NO "add more here"
- Include ALL content from the original site: products, property listings, menu items, job listings, articles — with their EXACT names, descriptions, prices, images, and details
- Include ALL pages found during research — not just the homepage
- For real estate: include BOTH for-sale and for-rent listings with full property details (beds, baths, sqft, photos, amenities)
- For restaurants: include the FULL menu with categories, prices, descriptions, dietary info
- For retail: include ALL products with sizes, colors, prices, images, categories
- For job boards: include ALL job listings with company, salary, location, type
- Use the exact branding provided (colors, name, tagline) — this replaces the original branding
- Wire up the payment system with the USER's Stripe keys (not the original site's)

IMAGE RULES (CRITICAL — the clone MUST look identical to the original):
- ALL images have been downloaded and are available at /public/images/{context}/ directories
- Context folders: products/, hero/, logo/, general/, background/, team/, gallery/, icon/, testimonial/, product/
- Use the LOCAL paths from the AVAILABLE IMAGES list below — these are REAL files on disk
- For EVERY product, listing, menu item, or article: use the image path provided in the catalog data
- For hero banners, logos, and backgrounds: use the local paths from the image inventory
- If a local path is not available for a specific image, use the ORIGINAL URL as a direct fallback (hotlink)
- NEVER use placeholder images (like via.placeholder.com or placehold.it) — always use real images
- Include ALL product images in product cards, detail pages, and galleries
- Make it production-ready, responsive, and SEO-optimized
- Include proper meta tags, Open Graph tags, and structured data${brandingInfo}${stripeInfo}${imageInfo}`,
      },
      {
        role: "user",
        content: `Generate file contents for build step ${step.step}: "${step.description}"

**Project:** ${plan.projectName} — ${plan.description}
**Tech Stack:** Frontend: ${plan.techStack.frontend}, Backend: ${plan.techStack.backend}, DB: ${plan.techStack.database}
**Files to create:** ${step.files.join(", ")}

**Full file structure for context:**
${plan.fileStructure.map(f => `- ${f.path}: ${f.description}`).join("\n")}

**Data models:**
${plan.dataModels.map(m => `- ${m.name}: ${m.fields.join(", ")}`).join("\n")}

**API routes:**
${plan.apiRoutes.map(r => `- ${r.method} ${r.path}: ${r.description}`).join("\n")}${productInfo}${subpageInfo}${catalogInfo}

Return ONLY a JSON array: [{"path": "file/path", "content": "full file content"}, ...]`,
      },
    ],
    maxTokens: 32000,
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    return [];
  }

  // Try to parse the JSON array from the response
  try {
    // The LLM might wrap it in markdown code blocks
    const jsonStr = rawContent.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const files = JSON.parse(jsonStr);
    if (Array.isArray(files)) {
      return files.filter(f => f.path && f.content);
    }
  } catch {
    // Try to extract JSON array from the response
    const match = rawContent.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const files = JSON.parse(match[0]);
        if (Array.isArray(files)) {
          return files.filter(f => f.path && f.content);
        }
      } catch {
        // Fall through
      }
    }
  }

  return [];
}


// ─── Step 5: Push to GitHub ────────────────────────────────────────
export async function pushToGithub(
  projectId: number,
  userId: number,
  repoName: string
): Promise<{ success: boolean; repoUrl: string; message: string }> {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Project not found");
  if (project.status !== "build_complete" && project.status !== "branded") {
    throw new Error("Build must be complete before pushing to GitHub");
  }

  const plan = project.buildPlan;
  if (!plan) throw new Error("No build plan found");

  // Use the per-project GitHub PAT, or fall back to user's vault PAT
  let githubToken = project.githubPat;
  if (!githubToken) {
    // Auto-pull from user's saved secrets vault
    githubToken = await getUserGithubPat(userId);
  }
  if (!githubToken) {
    throw new Error("No GitHub PAT found. Please save a GitHub Personal Access Token in your API Keys settings, or provide one when creating the clone.");
  }

  await updateProjectStatus(projectId, "pushing", `Pushing to GitHub: ${repoName}...`);
  appendBuildLog(projectId, {
    step: 99,
    status: "running",
    message: `Creating GitHub repository: ${repoName}`,
    timestamp: new Date().toISOString(),
  });

  try {
    // 1. Create the GitHub repo
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        name: repoName,
        description: project.targetDescription || `Clone of ${project.targetUrl}`,
        private: false,
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      // If repo already exists, that's okay
      if (createRes.status !== 422) {
        throw new Error(`Failed to create repo: ${(err as any).message || createRes.statusText}`);
      }
    }

    const repoData = await createRes.json();
    const owner = (repoData as any).owner?.login || (repoData as any).full_name?.split("/")[0];
    const repoFullName = `${owner}/${repoName}`;

    // 2. Get the sandbox files
    const sandboxId = project.sandboxId;
    if (!sandboxId) throw new Error("No sandbox found for this project");

    // Read all files from the sandbox
    const projectDir = `/home/sandbox/${plan.projectName}`;
    const lsResult = await executeCommand(sandboxId, userId, `find ${projectDir} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | head -200`, {
      timeoutMs: 30000,
      triggeredBy: "system",
    });

    const filePaths = lsResult.output.trim().split("\n").filter(Boolean);
    if (filePaths.length === 0) throw new Error("No files found in sandbox");

    appendBuildLog(projectId, {
      step: 99,
      status: "running",
      message: `Found ${filePaths.length} files. Pushing to ${repoFullName}...`,
      timestamp: new Date().toISOString(),
    });

    // 3. Push files using the GitHub API (tree/blob/commit approach)
    // Get the default branch SHA
    const refRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/ref/heads/main`, {
      headers: { Authorization: `token ${githubToken}`, Accept: "application/vnd.github.v3+json" },
    });
    
    let baseSha: string;
    let baseTreeSha: string;
    
    if (refRes.ok) {
      const refData = await refRes.json() as any;
      baseSha = refData.object.sha;
      const commitRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/commits/${baseSha}`, {
        headers: { Authorization: `token ${githubToken}`, Accept: "application/vnd.github.v3+json" },
      });
      const commitData = await commitRes.json() as any;
      baseTreeSha = commitData.tree.sha;
    } else {
      // Empty repo — create initial commit
      baseSha = "";
      baseTreeSha = "";
    }

    // Create blobs for each file
    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    
    for (const filePath of filePaths) {
      try {
        const catResult = await executeCommand(sandboxId, userId, `cat "${filePath}" | base64`, {
          timeoutMs: 15000,
          triggeredBy: "system",
        });
        
        const base64Content = catResult.output.trim();
        if (!base64Content) continue;

        const blobRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/blobs`, {
          method: "POST",
          headers: {
            Authorization: `token ${githubToken}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify({
            content: base64Content,
            encoding: "base64",
          }),
        });

        if (blobRes.ok) {
          const blobData = await blobRes.json() as any;
          const relativePath = filePath.replace(`${projectDir}/`, "");
          treeItems.push({
            path: relativePath,
            mode: "100644",
            type: "blob",
            sha: blobData.sha,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (treeItems.length === 0) throw new Error("No files could be read from sandbox");

    // Create tree
    const treeBody: any = { tree: treeItems };
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;

    const treeRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/trees`, {
      method: "POST",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(treeBody),
    });

    if (!treeRes.ok) throw new Error("Failed to create git tree");
    const treeData = await treeRes.json() as any;

    // Create commit
    const commitBody: any = {
      message: `Clone of ${project.targetUrl} — built by Archibald Titan`,
      tree: treeData.sha,
    };
    if (baseSha) commitBody.parents = [baseSha];

    const commitRes2 = await fetch(`https://api.github.com/repos/${repoFullName}/git/commits`, {
      method: "POST",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(commitBody),
    });

    if (!commitRes2.ok) throw new Error("Failed to create commit");
    const newCommit = await commitRes2.json() as any;

    // Update ref
    const updateRefRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/main`, {
      method: "PATCH",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ sha: newCommit.sha, force: true }),
    });

    if (!updateRefRes.ok) {
      // Try creating the ref instead
      await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
        method: "POST",
        headers: {
          Authorization: `token ${githubToken}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({ ref: "refs/heads/main", sha: newCommit.sha }),
      });
    }

    const repoUrl = `https://github.com/${repoFullName}`;
    
    await updateProjectStatus(projectId, "pushed", `Pushed ${treeItems.length} files to ${repoUrl}`, {
      githubRepoUrl: repoUrl,
    });

    appendBuildLog(projectId, {
      step: 99,
      status: "success",
      message: `Pushed ${treeItems.length} files to ${repoUrl}`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, repoUrl, message: `Pushed ${treeItems.length} files to ${repoUrl}` };
  } catch (err: unknown) {
    await updateProjectStatus(projectId, "build_complete", `GitHub push failed: ${getErrorMessage(err)}`);
    appendBuildLog(projectId, {
      step: 99,
      status: "error",
      message: `GitHub push failed: ${getErrorMessage(err)}`,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

async function appendBuildLog(projectId: number, entry: BuildLogEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [project] = await db
    .select({ buildLog: replicateProjects.buildLog })
    .from(replicateProjects)
    .where(eq(replicateProjects.id, projectId));

  const log = project?.buildLog ?? [];
  log.push(entry);

  await db
    .update(replicateProjects)
    .set({ buildLog: log })
    .where(eq(replicateProjects.id, projectId));
}

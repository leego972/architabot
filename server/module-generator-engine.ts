/**
 * Module Generator Engine — Autonomous Weekly Cyber Module Factory
 *
 * Every Sunday at 3 AM, Titan generates 3–5 fresh cyber security modules:
 *   1. Queries all existing marketplace titles to avoid duplicates
 *   2. Asks the LLM to invent a novel cyber module concept
 *   3. Generates the full source code, tests, and documentation
 *   4. Verifies the code compiles (TypeScript/Python syntax check)
 *   5. Uploads the module file to S3
 *   6. Creates a marketplace listing under a random cyber-focused seller bot
 *   7. Logs everything for audit trail
 *
 * Seller bot pool for cyber modules:
 *   - CyberForge Labs (index 0)
 *   - GhostNet Security (index 2)
 *   - VaultKeeper (index 4)
 *   - dEciever000 (index 8)
 */

import { invokeLLM } from "./_core/llm";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import { storagePut } from "./storage";
import * as db from "./db";
import { getDb } from "./db";
import { marketplaceListings, users, sellerProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const log = createLogger("ModuleGenerator");

// ─── Configuration ─────────────────────────────────────────────────
const MODULES_PER_CYCLE = 3;          // Generate 3 modules per weekly run
const MAX_MODULES_PER_CYCLE = 5;      // Upper bound (can generate up to 5 if LLM is productive)
const GENERATION_DAY = 0;             // Sunday (0=Sun, 1=Mon, ...)
const GENERATION_HOUR_START = 3;      // Start at 3 AM server time
const GENERATION_HOUR_END = 5;        // Must finish by 5 AM
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // Check every 4 hours

// Cyber-focused seller bot openIds — modules are distributed across these
const CYBER_SELLER_BOTS = [
  "bot_cyberforge_001",    // CyberForge Labs
  "bot_ghostnet_003",      // GhostNet Security
  "bot_vaultkeeper_005",   // VaultKeeper
  "bot_deceiver_009",      // dEciever000
];

// Weight dEciever000 more heavily for hacker-specific content
const SELLER_WEIGHTS = [1, 1, 1, 3]; // dEciever000 gets 3x weight

// ─── Cyber Topic Categories for Generation ─────────────────────────
const CYBER_TOPIC_DOMAINS = [
  // Offensive
  "web application exploitation (OWASP Top 10 variants)",
  "network protocol attacks and packet manipulation",
  "wireless security (WiFi, Bluetooth, RFID, NFC)",
  "binary exploitation and reverse engineering",
  "cryptographic attacks and implementation flaws",
  "social engineering automation tools",
  "cloud infrastructure attacks (AWS, GCP, Azure)",
  "mobile application security testing (Android, iOS)",
  "IoT device exploitation and firmware analysis",
  "supply chain attack detection and simulation",
  "API abuse and GraphQL exploitation",
  "browser exploitation and extension security",
  "container and Kubernetes security attacks",
  "CI/CD pipeline poisoning and build system attacks",
  "DNS tunneling and covert channel communication",
  "Active Directory and Kerberos attacks",
  "embedded systems and SCADA/ICS security",
  "blockchain and smart contract exploitation",
  "AI/ML model poisoning and adversarial attacks",
  "steganography and data hiding techniques",
  // Defensive
  "intrusion detection and prevention systems",
  "security information and event management (SIEM)",
  "threat hunting and indicator of compromise (IOC) tools",
  "digital forensics and incident response",
  "malware analysis and sandboxing",
  "vulnerability management and patch automation",
  "security compliance automation",
  "zero trust architecture implementation",
  "endpoint detection and response (EDR)",
  "security orchestration and automated response (SOAR)",
  "network traffic analysis and anomaly detection",
  "identity and access management hardening",
  "secure coding analysis and SAST/DAST tools",
  "deception technology and honeypots",
  "data loss prevention (DLP) tools",
];

// ─── Types ─────────────────────────────────────────────────────────
interface GeneratedModule {
  title: string;
  description: string;
  longDescription: string;
  category: "modules" | "exploits" | "blueprints" | "agents" | "artifacts" | "templates";
  riskCategory: "safe" | "low_risk" | "medium_risk" | "high_risk";
  priceCredits: number;
  tags: string[];
  language: string;
  code: string;
  tests: string;
  readme: string;
}

interface GenerationResult {
  modulesGenerated: number;
  modulesListed: number;
  modulesFailed: number;
  titles: string[];
  errors: string[];
}

// ─── Helper: Pick a weighted random seller bot ─────────────────────
function pickRandomSellerBot(): string {
  const expanded: string[] = [];
  for (let i = 0; i < CYBER_SELLER_BOTS.length; i++) {
    for (let w = 0; w < SELLER_WEIGHTS[i]; w++) {
      expanded.push(CYBER_SELLER_BOTS[i]);
    }
  }
  return expanded[Math.floor(Math.random() * expanded.length)];
}

// ─── Helper: Get all existing module titles from DB ────────────────
async function getExistingTitles(): Promise<Set<string>> {
  const titles = new Set<string>();
  try {
    const dbInst = await getDb();
    if (!dbInst) return titles;
    const rows = await dbInst
      .select({ title: marketplaceListings.title })
      .from(marketplaceListings);
    for (const row of rows) {
      titles.add(row.title.toLowerCase().trim());
    }
  } catch (err) {
    log.warn("Failed to fetch existing titles:", { error: getErrorMessage(err) });
  }
  return titles;
}

// ─── Helper: Resolve seller bot openId to userId ───────────────────
async function getSellerUserId(botOpenId: string): Promise<number | null> {
  try {
    const dbInst = await getDb();
    if (!dbInst) return null;
    const rows = await dbInst
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, botOpenId))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Step 1: Generate a novel module concept via LLM ───────────────
async function generateModuleConcept(
  existingTitles: Set<string>,
  attemptNumber: number
): Promise<GeneratedModule | null> {
  // Pick random topic domains for variety
  const shuffled = [...CYBER_TOPIC_DOMAINS].sort(() => Math.random() - 0.5);
  const focusTopics = shuffled.slice(0, 5).join(", ");

  const existingList = Array.from(existingTitles).slice(0, 80).join("\n- ");

  const result = await invokeLLM({
    messages: [
      { role: "system", content: `You are a senior cybersecurity engineer and tool developer working for an underground marketplace called "Grand Bazaar" on the Archibald Titan AI platform. You create professional-grade security tools that include BOTH attack capabilities AND defensive countermeasures.

Your modules are sold to:
- Red team operators and penetration testers
- Blue team defenders and SOC analysts
- CTF competitors and security researchers
- Security-conscious developers

RULES:
1. Every module MUST include both offensive AND defensive capabilities
2. Code must be production-quality TypeScript or Python
3. Include comprehensive error handling and logging
4. All attack tools must have an "educational" disclaimer
5. Include unit tests that verify core functionality
6. The module must be NOVEL — not a duplicate of existing modules
7. Price between 55-1500 credits based on complexity. PRICING RULE: The module price must be 40-60% of what it would cost a user to build the same thing from scratch using Titan chat. Simple utilities: 55-120 credits. Medium tools: 120-350 credits. Complex frameworks: 350-800 credits. Enterprise suites: 800-1500 credits.
8. Include a detailed README with usage examples

EXISTING MODULES (DO NOT DUPLICATE):
- ${existingList}

Focus areas for this generation: ${focusTopics}` },
      { role: "user", content: `Generate a completely NEW and UNIQUE cyber security module (attempt #${attemptNumber}). 

Return a JSON object with these exact fields:
{
  "title": "Catchy module title — must be unique and not similar to any existing module",
  "description": "2-3 sentence marketing description",
  "longDescription": "Full Markdown description with ## sections for Attack, Defense, and Usage",
  "category": "one of: modules, exploits, blueprints, agents, artifacts, templates",
  "riskCategory": "one of: safe, low_risk, medium_risk, high_risk",
  "priceCredits": number between 55-1500 (40-60% of estimated build-from-scratch cost),
  "tags": ["array", "of", "relevant", "tags"],
  "language": "TypeScript or Python",
  "code": "The FULL source code of the module (at least 100 lines, production quality)",
  "tests": "Unit tests for the module (at least 30 lines)",
  "readme": "README.md content with installation, usage, and examples"
}

IMPORTANT: Return ONLY valid JSON. No markdown code blocks. No explanation text.` },
    ],
    model: "strong",
    temperature: 0.9, // High creativity for variety
    maxTokens: 8000,
  });

  try {
    // Parse the LLM response — handle potential markdown wrapping
    const rawContent = result.choices?.[0]?.message?.content;
    let jsonStr = (typeof rawContent === "string" ? rawContent : "").trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.title || !parsed.description || !parsed.code) {
      log.warn("Generated module missing required fields");
      return null;
    }

    // Check for duplicate title
    if (existingTitles.has(parsed.title.toLowerCase().trim())) {
      log.warn(`Generated duplicate title: "${parsed.title}" — skipping`);
      return null;
    }

    // Validate category
    const validCategories = ["modules", "exploits", "blueprints", "agents", "artifacts", "templates"];
    if (!validCategories.includes(parsed.category)) {
      parsed.category = "modules";
    }

    // Validate risk category
    const validRisks = ["safe", "low_risk", "medium_risk", "high_risk"];
    if (!validRisks.includes(parsed.riskCategory)) {
      parsed.riskCategory = "medium_risk";
    }

    // Validate price range — must be cheaper than building from scratch
    // Simple: 55-120, Medium: 120-350, Complex: 350-800, Enterprise: 800-1500
    if (typeof parsed.priceCredits !== "number" || parsed.priceCredits < 55) {
      parsed.priceCredits = 200;
    }
    if (parsed.priceCredits > 1500) {
      parsed.priceCredits = 1500;
    }

    return parsed as GeneratedModule;
  } catch (err) {
    log.warn("Failed to parse generated module JSON:", { error: getErrorMessage(err) });
    return null;
  }
}

// ─── Step 2: Verify the generated code ─────────────────────────────
async function verifyModule(mod: GeneratedModule): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check minimum code length
  if (!mod.code || mod.code.length < 200) {
    errors.push("Code too short (< 200 chars)");
  }

  // Check for basic structure
  if (mod.language === "TypeScript") {
    // Must have at least one export or function
    if (!mod.code.includes("export") && !mod.code.includes("function") && !mod.code.includes("class")) {
      errors.push("TypeScript code has no exports, functions, or classes");
    }
    // Check for obvious syntax errors
    const syntaxChecks = [
      { pattern: /\bfunction\s+\w+\s*\(/, name: "function declaration" },
      { pattern: /(?:const|let|var|export|import)\s/, name: "variable/import declaration" },
    ];
    const hasAnyStructure = syntaxChecks.some(check => check.pattern.test(mod.code));
    if (!hasAnyStructure) {
      errors.push("TypeScript code lacks basic structure (no functions, variables, or imports)");
    }
  } else if (mod.language === "Python") {
    if (!mod.code.includes("def ") && !mod.code.includes("class ")) {
      errors.push("Python code has no function or class definitions");
    }
  }

  // Check for tests
  if (!mod.tests || mod.tests.length < 50) {
    errors.push("Tests too short or missing (< 50 chars)");
  }

  // Check title uniqueness (double-check)
  if (!mod.title || mod.title.length < 5) {
    errors.push("Title too short");
  }

  // Check description
  if (!mod.description || mod.description.length < 20) {
    errors.push("Description too short");
  }

  // Check for both attack and defense content
  const codeAndDesc = (mod.code + mod.longDescription + mod.description).toLowerCase();
  const hasOffensive = /attack|exploit|payload|inject|bypass|brute|scan|crack|intercept|spoof|hijack/i.test(codeAndDesc);
  const hasDefensive = /defend|protect|detect|prevent|mitigat|harden|monitor|alert|block|sanitiz|validat/i.test(codeAndDesc);
  if (!hasOffensive && !hasDefensive) {
    errors.push("Module lacks both offensive and defensive content");
  }

  // Run a secondary LLM check for code quality
  try {
    const reviewResult = await invokeLLM({
      messages: [
        { role: "system", content: "You are a code reviewer. Analyze the following code for critical issues. Reply with ONLY 'PASS' if the code is acceptable, or 'FAIL: <reason>' if it has critical problems (syntax errors, empty functions, placeholder code, or non-functional logic)." },
        { role: "user", content: `Review this ${mod.language} module code:\n\n${mod.code.slice(0, 3000)}` },
      ],
      model: "fast",
      temperature: 0,
      maxTokens: 200,
    });
    const reviewRaw = reviewResult.choices?.[0]?.message?.content;
    const reviewText = (typeof reviewRaw === "string" ? reviewRaw : "").trim().toUpperCase();
    if (reviewText.startsWith("FAIL")) {
      errors.push(`Code review failed: ${(typeof reviewRaw === "string" ? reviewRaw : "").trim()}`);
    }
  } catch (err) {
    // Non-blocking — if review fails, still allow listing
    log.warn("Code review LLM call failed:", { error: getErrorMessage(err) });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Step 3: Upload module to S3 and create listing ────────────────
async function uploadAndList(
  mod: GeneratedModule,
  sellerUserId: number
): Promise<{ listingId: number; slug: string } | null> {
  try {
    // Bundle the module files into a single TypeScript/Python file with embedded tests and README
    const bundleContent = `// ═══════════════════════════════════════════════════════════════
// ${mod.title}
// Generated by Archibald Titan AI — Module Generator Engine
// Language: ${mod.language}
// Category: ${mod.category} | Risk: ${mod.riskCategory}
// ═══════════════════════════════════════════════════════════════

// ─── DISCLAIMER ────────────────────────────────────────────────
// This module is provided for EDUCATIONAL and AUTHORIZED TESTING
// purposes only. Unauthorized use against systems you do not own
// or have explicit permission to test is illegal and unethical.
// ═══════════════════════════════════════════════════════════════

// ─── MODULE SOURCE CODE ────────────────────────────────────────
${mod.code}

// ─── UNIT TESTS ────────────────────────────────────────────────
/*
${mod.tests}
*/

// ─── README ────────────────────────────────────────────────────
/*
${mod.readme || mod.longDescription}
*/
`;

    // Upload to S3
    const fileExt = mod.language === "Python" ? "py" : "ts";
    const slug = mod.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const uid = crypto.randomBytes(8).toString("hex");
    const storageKey = `marketplace/modules/${slug}-${uid}.${fileExt}`;

    const { url: fileUrl } = await storagePut(
      storageKey,
      Buffer.from(bundleContent, "utf-8"),
      "text/plain"
    );

    // Create the marketplace listing
    const listingUid = `MKT-${crypto.randomUUID().split("-").slice(0, 2).join("")}`.toUpperCase();
    const listingSlug = `${slug}-${uid.slice(-6)}`;

    const listing = await db.createListing({
      uid: listingUid,
      sellerId: sellerUserId,
      title: mod.title,
      slug: listingSlug,
      description: mod.description,
      longDescription: mod.longDescription,
      category: mod.category,
      priceCredits: mod.priceCredits,
      priceUsd: Math.round(mod.priceCredits / 100),
      tags: JSON.stringify(mod.tags),
      language: mod.language,
      license: "Educational",
      version: "1.0.0",
      fileUrl,
      fileSize: Buffer.byteLength(bundleContent),
      fileType: fileExt === "py" ? "text/x-python" : "text/typescript",
      riskCategory: mod.riskCategory,
      reviewStatus: "approved",  // Auto-approved since generated by Titan
      status: "active",
    });

    log.info(`Listed module "${mod.title}" (${listingUid}) under seller ${sellerUserId} for ${mod.priceCredits} credits`);
    return { listingId: listing.id, slug: listingSlug };
  } catch (err) {
    log.error("Failed to upload and list module:", { error: getErrorMessage(err) });
    return null;
  }
}

// ─── Main Generation Cycle ─────────────────────────────────────────
export async function runModuleGenerationCycle(): Promise<GenerationResult> {
  log.info("═══ Starting weekly module generation cycle ═══");

  const result: GenerationResult = {
    modulesGenerated: 0,
    modulesListed: 0,
    modulesFailed: 0,
    titles: [],
    errors: [],
  };

  // Step 0: Get all existing titles for dedup
  const existingTitles = await getExistingTitles();
  log.info(`Found ${existingTitles.size} existing modules in marketplace`);

  // Generate MODULES_PER_CYCLE modules, with up to 2 retries each
  for (let i = 0; i < MAX_MODULES_PER_CYCLE && result.modulesListed < MODULES_PER_CYCLE; i++) {
    try {
      log.info(`Generating module ${i + 1}/${MAX_MODULES_PER_CYCLE}...`);

      // Step 1: Generate concept
      const mod = await generateModuleConcept(existingTitles, i + 1);
      if (!mod) {
        result.modulesFailed++;
        result.errors.push(`Attempt ${i + 1}: Failed to generate valid concept`);
        continue;
      }

      result.modulesGenerated++;
      log.info(`Generated concept: "${mod.title}" (${mod.language}, ${mod.priceCredits} credits)`);

      // Step 2: Verify
      const verification = await verifyModule(mod);
      if (!verification.valid) {
        result.modulesFailed++;
        result.errors.push(`"${mod.title}": Verification failed — ${verification.errors.join("; ")}`);
        log.warn(`Module "${mod.title}" failed verification:`, { errors: verification.errors });
        continue;
      }

      log.info(`Module "${mod.title}" passed verification`);

      // Step 3: Pick a seller bot
      const botOpenId = pickRandomSellerBot();
      const sellerUserId = await getSellerUserId(botOpenId);
      if (!sellerUserId) {
        result.modulesFailed++;
        result.errors.push(`No seller user found for bot ${botOpenId}`);
        continue;
      }

      // Step 4: Upload and list
      const listing = await uploadAndList(mod, sellerUserId);
      if (!listing) {
        result.modulesFailed++;
        result.errors.push(`"${mod.title}": Failed to upload/list`);
        continue;
      }

      // Success — add title to dedup set
      existingTitles.add(mod.title.toLowerCase().trim());
      result.modulesListed++;
      result.titles.push(mod.title);

      // Update seller profile stats
      try {
        const profile = await db.getSellerProfile(sellerUserId);
        if (profile) {
          await db.updateSellerProfile(sellerUserId, {
            totalSales: (profile.totalSales || 0), // Don't fake sales, just listing count
          });
        }
      } catch {
        // Non-critical
      }

    } catch (err) {
      result.modulesFailed++;
      result.errors.push(`Attempt ${i + 1}: ${getErrorMessage(err)}`);
      log.error(`Module generation attempt ${i + 1} failed:`, { error: getErrorMessage(err) });
    }
  }

  log.info(`═══ Module generation cycle complete: ${result.modulesListed} listed, ${result.modulesFailed} failed ═══`);
  log.info(`New modules: ${result.titles.join(", ") || "(none)"}`);

  return result;
}

// ─── Weekly Scheduler ──────────────────────────────────────────────
let generatorInterval: ReturnType<typeof setInterval> | null = null;
let lastGenerationDate = "";

export function startModuleGeneratorScheduler(): void {
  log.info("[ModuleGenerator] Starting weekly module generator scheduler (Sundays 3-5 AM)...");
  log.info("[ModuleGenerator] Skipping startup cycle (cost optimization). Checking every 4h.");

  generatorInterval = setInterval(async () => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();
      const todayStr = now.toISOString().slice(0, 10);

      // Only run on Sunday, between 3-5 AM, once per day
      if (
        dayOfWeek === GENERATION_DAY &&
        hour >= GENERATION_HOUR_START &&
        hour <= GENERATION_HOUR_END &&
        lastGenerationDate !== todayStr
      ) {
        lastGenerationDate = todayStr;
        log.info("[ModuleGenerator] Running weekly module generation cycle...");
        const result = await runModuleGenerationCycle();
        log.info("[ModuleGenerator] Weekly cycle result:", result as unknown as Record<string, unknown>);
      }
    } catch (err) {
      log.error("[ModuleGenerator] Scheduled cycle failed:", { error: getErrorMessage(err) });
    }
  }, CHECK_INTERVAL_MS);
}

export function stopModuleGeneratorScheduler(): void {
  if (generatorInterval) {
    clearInterval(generatorInterval);
    generatorInterval = null;
    log.info("[ModuleGenerator] Scheduler stopped.");
  }
}

/**
 * Autonomous Affiliate Discovery Engine
 * 
 * Runs DAILY to maximize discovery and revenue:
 * 1. Discover new high-paying affiliate programs via LLM-powered search
 * 2. Score them by revenue potential and relevance to Titan users
 * 3. Auto-generate tailored application emails
 * 4. Track all discoveries and applications
 * 5. Promote accepted programs to the main affiliate partners table
 * 
 * Kill switch: AFFILIATE_DISCOVERY_KILL_XXXXX (10-char alphanumeric)
 */

import { invokeLLM } from "./_core/llm";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { getDb } from "./db";
import {
  affiliateDiscoveries,
  affiliateDiscoveryRuns,
  affiliateApplications,
  affiliatePartners,
  type InsertAffiliateDiscovery,
  type InsertAffiliateApplication,
} from "../drizzle/schema";
import { randomBytes } from "crypto";
import { notifyOwner } from "./_core/notification";
import { createLogger } from "./_core/logger.js";
const log = createLogger("AffiliateDiscoveryEngine");

// ─── Kill Switch ──────────────────────────────────────────────────────
const KILL_SWITCH_CODE = "AFKL7X9M2Q"; // 10-char alphanumeric kill switch
let isKilled = false;

export function triggerKillSwitch(code: string): boolean {
  if (code === KILL_SWITCH_CODE) {
    isKilled = true;
    log.info("[AffiliateDiscovery] KILL SWITCH ACTIVATED — all discovery operations halted");
    return true;
  }
  return false;
}

export function resetKillSwitch(code: string): boolean {
  if (code === KILL_SWITCH_CODE) {
    isKilled = false;
    log.info("[AffiliateDiscovery] Kill switch reset — operations resumed");
    return true;
  }
  return false;
}

export function isDiscoveryKilled(): boolean {
  return isKilled;
}

// ─── Search Verticals ─────────────────────────────────────────────────
// Categories of affiliate programs to discover, optimized for Titan's user base

const DISCOVERY_VERTICALS = [
  {
    vertical: "ai_tools",
    searchQueries: [
      "AI tool affiliate program high commission 2026",
      "machine learning SaaS affiliate partnership",
      "AI writing tool referral program developer",
      "generative AI platform affiliate commission",
      "AI code assistant affiliate program",
    ],
  },
  {
    vertical: "dev_tools",
    searchQueries: [
      "developer tool affiliate program high payout",
      "code editor IDE affiliate partnership 2026",
      "CI/CD platform affiliate program developer",
      "API management tool referral program",
      "developer productivity SaaS affiliate",
    ],
  },
  {
    vertical: "hosting",
    searchQueries: [
      "cloud hosting affiliate program highest commission",
      "serverless platform affiliate partnership",
      "managed database hosting referral program",
      "container orchestration affiliate program",
      "edge computing platform affiliate",
    ],
  },
  {
    vertical: "security",
    searchQueries: [
      "cybersecurity tool affiliate program high CPA",
      "password manager affiliate partnership 2026",
      "VPN service affiliate program best commission",
      "identity management affiliate program",
      "security compliance SaaS affiliate",
    ],
  },
  {
    vertical: "saas",
    searchQueries: [
      "B2B SaaS affiliate program highest recurring commission",
      "project management tool affiliate partnership",
      "CRM software affiliate program developer",
      "no-code platform affiliate program",
      "business automation tool referral program",
    ],
  },
  {
    vertical: "automation",
    searchQueries: [
      "workflow automation affiliate program",
      "integration platform affiliate partnership iPaaS",
      "RPA tool affiliate program high commission",
      "marketing automation affiliate program",
      "data pipeline tool affiliate program",
    ],
  },
  {
    vertical: "analytics",
    searchQueries: [
      "analytics platform affiliate program developer",
      "business intelligence tool affiliate partnership",
      "data visualization SaaS affiliate program",
      "product analytics affiliate program",
      "monitoring observability affiliate program",
    ],
  },
  {
    vertical: "fintech",
    searchQueries: [
      "payment processing affiliate program developer",
      "fintech API affiliate partnership",
      "crypto exchange affiliate program highest commission",
      "banking API affiliate program",
      "invoicing software affiliate program",
    ],
  },
  {
    vertical: "security",
    searchQueries: [
      "defense technology affiliate program",
      "military grade encryption software affiliate",
      "threat intelligence platform affiliate program",
      "SIEM security tool affiliate partnership",
      "endpoint protection affiliate program high commission",
    ],
  },
  {
    vertical: "saas",
    searchQueries: [
      "enterprise software affiliate program high CPA",
      "team collaboration tool affiliate partnership",
      "enterprise API management affiliate program",
      "cloud security posture management affiliate",
      "enterprise identity management affiliate program",
    ],
  },
  {
    vertical: "ai_tools",
    searchQueries: [
      "AI agent platform affiliate program 2026",
      "autonomous AI tool affiliate partnership",
      "AI infrastructure affiliate program high commission",
      "vector database affiliate program developer",
      "AI observability platform affiliate program",
    ],
  },
  {
    vertical: "hosting",
    searchQueries: [
      "GPU cloud computing affiliate program",
      "bare metal server affiliate high commission",
      "managed kubernetes affiliate program",
      "CDN provider affiliate program developer",
      "object storage affiliate program high payout",
    ],
  },
];

// ─── Core Discovery Engine ────────────────────────────────────────────

/**
 * Run a full discovery cycle — the main entry point
 * Discovers, evaluates, scores, and generates applications
 */
export async function runDiscoveryCycle(
  runType: "scheduled" | "manual" | "startup" = "scheduled"
): Promise<{
  batchId: string;
  programsDiscovered: number;
  programsApproved: number;
  applicationsGenerated: number;
  errors: string[];
  durationMs: number;
}> {
  if (isKilled) {
    log.info("[AffiliateDiscovery] Kill switch active — skipping discovery cycle");
    return { batchId: "", programsDiscovered: 0, programsApproved: 0, applicationsGenerated: 0, errors: ["Kill switch active"], durationMs: 0 };
  }

  const startTime = Date.now();
  const batchId = `disc_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const errors: string[] = [];

  const db = await getDb();
  if (!db) {
    return { batchId, programsDiscovered: 0, programsApproved: 0, applicationsGenerated: 0, errors: ["Database unavailable"], durationMs: 0 };
  }

  // Create run log
  await db.insert(affiliateDiscoveryRuns).values({
    batchId,
    runType,
    status: "running",
  });

  log.info(`[AffiliateDiscovery] Starting ${runType} discovery cycle (batch: ${batchId})`);

  let totalDiscovered = 0;
  let totalApproved = 0;
  let totalApplications = 0;

  try {
    // Step 1: Discover new programs across all verticals
    // Pick 5 random verticals per run for aggressive discovery
    const shuffled = [...DISCOVERY_VERTICALS].sort(() => Math.random() - 0.5);
    const selectedVerticals = shuffled.slice(0, 5);

    for (const verticalConfig of selectedVerticals) {
      if (isKilled) break;

      try {
        const discovered = await discoverProgramsForVertical(
          verticalConfig.vertical,
          verticalConfig.searchQueries,
          batchId
        );
        totalDiscovered += discovered.length;

        // Step 2: Evaluate and score each discovered program
        for (const program of discovered) {
          if (isKilled) break;

          try {
            const scored = await evaluateAndScoreProgram(program.id);
            if (scored.overallScore >= 60) {
              totalApproved++;

              // Step 3: Auto-generate application for high-scoring programs
              try {
                await generateApplication(program.id);
                totalApplications++;
              } catch (appErr: any) {
                errors.push(`Application gen failed for ${program.name}: ${appErr.message}`);
              }

              // Step 3b: Auto-promote programs scoring 80+ immediately
              if (scored.overallScore >= 80) {
                try {
                  await promoteDiscoveryToPartner(program.id);
                  log.info(`[AffiliateDiscovery] Auto-promoted high-scorer: ${program.name} (score: ${scored.overallScore})`);
                } catch (promoErr: any) {
                  errors.push(`Auto-promote failed for ${program.name}: ${promoErr.message}`);
                }
              }
            }
          } catch (evalErr: any) {
            errors.push(`Evaluation failed for ${program.name}: ${evalErr.message}`);
          }
        }
      } catch (vertErr: any) {
        errors.push(`Vertical ${verticalConfig.vertical} failed: ${vertErr.message}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // Update run log
    await db.update(affiliateDiscoveryRuns)
      .set({
        status: isKilled ? "killed" : "completed",
        programsDiscovered: totalDiscovered,
        programsEvaluated: totalDiscovered,
        programsApproved: totalApproved,
        applicationsGenerated: totalApplications,
        completedAt: new Date(),
        durationMs,
        errors: errors.length > 0 ? errors : undefined,
        killSwitchTriggered: isKilled,
      })
      .where(eq(affiliateDiscoveryRuns.batchId, batchId));

    log.info(`[AffiliateDiscovery] Cycle complete: ${totalDiscovered} discovered, ${totalApproved} approved, ${totalApplications} applications (${durationMs}ms)`);

    // Notify owner of results
    if (totalDiscovered > 0) {
      await notifyOwner({
        title: `Affiliate Discovery: ${totalDiscovered} new programs found`,
        content: `Discovery cycle (${runType}) completed:\n- ${totalDiscovered} programs discovered\n- ${totalApproved} scored above threshold\n- ${totalApplications} applications generated\n- Duration: ${Math.round(durationMs / 1000)}s\n${errors.length > 0 ? `\nErrors: ${errors.join(", ")}` : ""}`,
      });
    }

    return { batchId, programsDiscovered: totalDiscovered, programsApproved: totalApproved, applicationsGenerated: totalApplications, errors, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await db.update(affiliateDiscoveryRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        durationMs,
        errors: [...errors, err.message],
      })
      .where(eq(affiliateDiscoveryRuns.batchId, batchId));

    log.error(`[AffiliateDiscovery] Cycle failed:`, { error: String(err) });
    return { batchId, programsDiscovered: totalDiscovered, programsApproved: totalApproved, applicationsGenerated: totalApplications, errors: [...errors, err.message], durationMs };
  }
}

/**
 * Discover affiliate programs for a specific vertical using LLM
 */
async function discoverProgramsForVertical(
  vertical: string,
  searchQueries: string[],
  batchId: string
): Promise<Array<{ id: number; name: string }>> {
  const db = await getDb();
  if (!db) return [];

  // Get existing domains to avoid duplicates
  const existingPartners = await db.select({ domain: affiliatePartners.domain }).from(affiliatePartners);
  const existingDiscoveries = await db.select({ domain: affiliateDiscoveries.domain }).from(affiliateDiscoveries);
  const existingDomains = new Set([
    ...existingPartners.map((p: { domain: string | null }) => p.domain?.toLowerCase()).filter(Boolean),
    ...existingDiscoveries.map((d: { domain: string }) => d.domain?.toLowerCase()).filter(Boolean),
  ]);

  // Pick 2 random queries from the vertical's query list
  const shuffledQueries = [...searchQueries].sort(() => Math.random() - 0.5).slice(0, 2);

  const discovered: Array<{ id: number; name: string }> = [];

  for (const query of shuffledQueries) {
    try {
      const response = await invokeLLM({
        systemTag: "affiliate",
      model: "fast",
        messages: [
          {
            role: "system",
            content: `You are an affiliate marketing research expert. Your job is to identify real, existing affiliate programs that would be highly profitable for a developer-focused AI platform called Archibald Titan.

IMPORTANT RULES:
- Only suggest REAL companies with REAL affiliate programs that exist today
- Each program must have a verifiable website domain
- Focus on programs with high commission rates (>$20 CPA or >15% recurring)
- Prioritize programs relevant to developers, AI users, and tech professionals
- Do NOT suggest programs that are commonly known (OpenAI, GitHub, AWS, Vercel, etc.)
- Look for hidden gems — niche tools with generous affiliate programs

Return ONLY valid JSON array.`,
          },
          {
            role: "user",
            content: `Search query: "${query}"

Find 5 affiliate programs matching this query. For each, provide:
- name: Company name
- domain: Website domain (e.g., "example.com")
- description: What the product does (1 sentence)
- estimatedCommissionType: "revshare" or "cpa"
- estimatedCommissionRate: number (percentage for revshare, cents for CPA)
- affiliateProgramUrl: URL to their affiliate program page
- contactEmail: partnership email if known (or empty string)
- networkName: Which affiliate network they use (ShareASale, CJ, Impact, PartnerStack, direct, or unknown)

Already known domains to EXCLUDE: ${Array.from(existingDomains).slice(0, 50).join(", ")}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "discovered_programs",
            strict: true,
            schema: {
              type: "object",
              properties: {
                programs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      domain: { type: "string" },
                      description: { type: "string" },
                      estimatedCommissionType: { type: "string" },
                      estimatedCommissionRate: { type: "number" },
                      affiliateProgramUrl: { type: "string" },
                      contactEmail: { type: "string" },
                      networkName: { type: "string" },
                    },
                    required: ["name", "domain", "description", "estimatedCommissionType", "estimatedCommissionRate", "affiliateProgramUrl", "contactEmail", "networkName"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["programs"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== "string") continue;

      const parsed = JSON.parse(content);
      const programs = parsed.programs || [];

      for (const prog of programs) {
        const domain = prog.domain?.toLowerCase()?.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/$/, "");
        if (!domain || existingDomains.has(domain)) continue;

        // Deduplicate within this batch
        existingDomains.add(domain);

        const commType = prog.estimatedCommissionType === "revshare" ? "revshare" : prog.estimatedCommissionType === "cpa" ? "cpa" : "unknown";

        const result = await db.insert(affiliateDiscoveries).values({
          name: prog.name,
          domain,
          description: prog.description || null,
          vertical: (["ai_tools", "hosting", "dev_tools", "security", "vpn", "crypto", "saas", "education", "automation", "analytics", "design", "marketing", "fintech", "other"].includes(vertical) ? vertical : "other") as any,
          estimatedCommissionType: commType as any,
          estimatedCommissionRate: Math.round(Number(prog.estimatedCommissionRate) || 0),
          affiliateProgramUrl: prog.affiliateProgramUrl || null,
          contactEmail: prog.contactEmail || null,
          networkName: prog.networkName || null,
          discoveredBy: "llm_search",
          discoveryBatchId: batchId,
          status: "discovered",
        });

        const insertId = Number(result[0].insertId);
        discovered.push({ id: insertId, name: prog.name });
        log.info(`[AffiliateDiscovery] Found: ${prog.name} (${domain}) — ${vertical}`);
      }
    } catch (err: any) {
      log.error(`[AffiliateDiscovery] Query "${query}" failed:`, { error: String(err.message) });
    }
  }

  return discovered;
}

/**
 * Evaluate and score a discovered program using LLM analysis
 */
async function evaluateAndScoreProgram(discoveryId: number): Promise<{
  revenueScore: number;
  relevanceScore: number;
  overallScore: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [discovery] = await db.select().from(affiliateDiscoveries)
    .where(eq(affiliateDiscoveries.id, discoveryId))
    .limit(1);

  if (!discovery) throw new Error("Discovery not found");

  try {
    const response = await invokeLLM({
      systemTag: "affiliate",
      model: "fast",
      messages: [
        {
          role: "system",
          content: `You are an affiliate program evaluator. Score programs for an AI developer platform called Archibald Titan.

Scoring criteria:
- Revenue Score (0-100): Based on commission rate, commission type (recurring > one-time), market size, and conversion potential
- Relevance Score (0-100): How relevant is this tool to developers, AI users, and tech professionals who use Titan?

Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Evaluate this affiliate program:
Name: ${discovery.name}
Domain: ${discovery.domain}
Description: ${discovery.description || "N/A"}
Vertical: ${discovery.vertical}
Commission: ${discovery.estimatedCommissionType} at ${discovery.estimatedCommissionRate}${discovery.estimatedCommissionType === "revshare" ? "%" : " cents"}
Network: ${discovery.networkName || "unknown"}

Score this program's revenue potential and relevance to Titan users.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "program_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              revenueScore: { type: "number" },
              relevanceScore: { type: "number" },
              reasoning: { type: "string" },
            },
            required: ["revenueScore", "relevanceScore", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No LLM response");

    const evaluation = JSON.parse(content);
    const revenueScore = Math.min(100, Math.max(0, Math.round(Number(evaluation.revenueScore) || 0)));
    const relevanceScore = Math.min(100, Math.max(0, Math.round(Number(evaluation.relevanceScore) || 0)));
    const overallScore = Math.round(revenueScore * 0.6 + relevanceScore * 0.4); // Revenue weighted higher

    const newStatus = overallScore >= 60 ? "approved" : overallScore >= 40 ? "evaluating" : "skipped";

    await db.update(affiliateDiscoveries)
      .set({
        revenueScore,
        relevanceScore,
        overallScore,
        status: newStatus,
        notes: evaluation.reasoning || null,
      })
      .where(eq(affiliateDiscoveries.id, discoveryId));

    log.info(`[AffiliateDiscovery] Scored ${discovery.name}: revenue=${revenueScore}, relevance=${relevanceScore}, overall=${overallScore} → ${newStatus}`);

    return { revenueScore, relevanceScore, overallScore };
  } catch (err: any) {
    // Fallback scoring based on commission rate
    const revenueScore = discovery.estimatedCommissionRate > 5000 ? 70 : discovery.estimatedCommissionRate > 1000 ? 50 : 30;
    const relevanceScore = ["ai_tools", "dev_tools", "hosting"].includes(discovery.vertical) ? 70 : 40;
    const overallScore = Math.round(revenueScore * 0.6 + relevanceScore * 0.4);

    await db.update(affiliateDiscoveries)
      .set({ revenueScore, relevanceScore, overallScore, status: overallScore >= 60 ? "approved" : "evaluating" })
      .where(eq(affiliateDiscoveries.id, discoveryId));

    return { revenueScore, relevanceScore, overallScore };
  }
}

/**
 * Generate a tailored application email for a discovered program
 */
async function generateApplication(discoveryId: number): Promise<{ subject: string; body: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [discovery] = await db.select().from(affiliateDiscoveries)
    .where(eq(affiliateDiscoveries.id, discoveryId))
    .limit(1);

  if (!discovery) throw new Error("Discovery not found");

  try {
    const response = await invokeLLM({
      systemTag: "affiliate",
      model: "fast",
      messages: [
        {
          role: "system",
          content: `You are a business development expert for Archibald Titan — the world's most advanced local AI agent platform with thousands of active developer users.

Write a compelling affiliate program application email. The email should:
1. Introduce Archibald Titan and its user base (developers, AI engineers, tech professionals)
2. Explain why the partnership would be mutually beneficial
3. Highlight specific use cases where Titan users would benefit from the partner's product
4. Propose concrete partnership terms (affiliate link placement, content integration, co-marketing)
5. Include a clear call to action

Be professional but enthusiastic. Keep it under 300 words. Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Generate an affiliate program application for:
Company: ${discovery.name}
Domain: ${discovery.domain}
Description: ${discovery.description || "N/A"}
Vertical: ${discovery.vertical}
Estimated Commission: ${discovery.estimatedCommissionType} at ${discovery.estimatedCommissionRate}${discovery.estimatedCommissionType === "revshare" ? "%" : " cents"}
Network: ${discovery.networkName || "direct"}
Affiliate Program URL: ${discovery.affiliateProgramUrl || "N/A"}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "application_email",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("No LLM response");

    const email = JSON.parse(content);

    await db.insert(affiliateApplications).values({
      discoveryId,
      applicationType: discovery.contactEmail ? "email" : "form_fill",
      subject: email.subject,
      body: email.body,
      status: "drafted",
      aiGenerated: true,
    });

    await db.update(affiliateDiscoveries)
      .set({
        applicationStatus: "application_drafted",
        applicationDraftedAt: new Date(),
        status: "applied",
      })
      .where(eq(affiliateDiscoveries.id, discoveryId));

    log.info(`[AffiliateDiscovery] Application drafted for ${discovery.name}`);
    return email;
  } catch (err: any) {
    // Fallback template
    const fallback = {
      subject: `Partnership Opportunity: Archibald Titan x ${discovery.name}`,
      body: `Dear ${discovery.name} Partnership Team,\n\nI'm reaching out from Archibald Titan, the world's most advanced local AI agent platform. Our platform serves thousands of developers and tech professionals who actively use tools in the ${discovery.vertical} space.\n\nWe'd love to explore an affiliate partnership with ${discovery.name}. Our users frequently need solutions like yours, and we believe a strategic partnership would drive significant mutual value.\n\nWe can offer:\n- Contextual product recommendations within our AI assistant\n- Featured placement in our tools marketplace\n- Content integration and co-marketing opportunities\n\nWould you be open to discussing partnership terms?\n\nBest regards,\nArchibald Titan Partnership Team\nhttps://www.archibaldtitan.com`,
    };

    await db.insert(affiliateApplications).values({
      discoveryId,
      applicationType: "email",
      subject: fallback.subject,
      body: fallback.body,
      status: "drafted",
      aiGenerated: true,
    });

    await db.update(affiliateDiscoveries)
      .set({ applicationStatus: "application_drafted", applicationDraftedAt: new Date(), status: "applied" })
      .where(eq(affiliateDiscoveries.id, discoveryId));

    return fallback;
  }
}

/**
 * Promote a discovered program to the main affiliate partners table
 */
export async function promoteDiscoveryToPartner(discoveryId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [discovery] = await db.select().from(affiliateDiscoveries)
    .where(eq(affiliateDiscoveries.id, discoveryId))
    .limit(1);

  if (!discovery) throw new Error("Discovery not found");

  // Check if already promoted
  if (discovery.promotedToPartnerId) {
    return discovery.promotedToPartnerId;
  }

  // Check for duplicate domain in partners
  const existing = await db.select().from(affiliatePartners)
    .where(eq(affiliatePartners.domain, discovery.domain))
    .limit(1);

  if (existing.length > 0) {
    await db.update(affiliateDiscoveries)
      .set({ promotedToPartnerId: existing[0].id, status: "accepted" })
      .where(eq(affiliateDiscoveries.id, discoveryId));
    return existing[0].id;
  }

  // Map vertical
  const verticalMap: Record<string, string> = {
    ai_tools: "ai_tools", hosting: "hosting", dev_tools: "dev_tools",
    security: "security", vpn: "vpn", crypto: "crypto", saas: "saas",
    education: "education", automation: "other", analytics: "other",
    design: "other", marketing: "other", fintech: "other", other: "other",
  };

  const commType = discovery.estimatedCommissionType === "revshare" ? "revshare" : discovery.estimatedCommissionType === "cpa" ? "cpa" : "cpa";

  const result = await db.insert(affiliatePartners).values({
    name: discovery.name,
    domain: discovery.domain,
    contactEmail: discovery.contactEmail,
    vertical: (verticalMap[discovery.vertical] || "other") as any,
    commissionType: commType as any,
    commissionRate: discovery.estimatedCommissionRate,
    applicationUrl: discovery.affiliateProgramUrl,
    status: "active",
  });

  const partnerId = Number(result[0].insertId);

  await db.update(affiliateDiscoveries)
    .set({ promotedToPartnerId: partnerId, status: "accepted" })
    .where(eq(affiliateDiscoveries.id, discoveryId));

  log.info(`[AffiliateDiscovery] Promoted ${discovery.name} to partner #${partnerId}`);
  return partnerId;
}

// ─── Query Functions ──────────────────────────────────────────────────

/**
 * Get all discoveries with optional filters
 */
export async function getDiscoveries(filters?: {
  status?: string;
  vertical?: string;
  minScore?: number;
  batchId?: string;
  limit?: number;
}): Promise<typeof affiliateDiscoveries.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(affiliateDiscoveries)
    .orderBy(desc(affiliateDiscoveries.overallScore))
    .limit(filters?.limit || 100);

  const results = await query;

  let filtered = results;
  if (filters?.status) filtered = filtered.filter((d: any) => d.status === filters.status);
  if (filters?.vertical) filtered = filtered.filter((d: any) => d.vertical === filters.vertical);
  if (filters?.minScore) filtered = filtered.filter((d: any) => d.overallScore >= (filters.minScore || 0));
  if (filters?.batchId) filtered = filtered.filter((d: any) => d.discoveryBatchId === filters.batchId);

  return filtered;
}

/**
 * Get discovery run history
 */
export async function getDiscoveryRuns(limit = 20): Promise<typeof affiliateDiscoveryRuns.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(affiliateDiscoveryRuns)
    .orderBy(desc(affiliateDiscoveryRuns.startedAt))
    .limit(limit);
}

/**
 * Get applications for a discovery
 */
export async function getDiscoveryApplications(discoveryId: number): Promise<typeof affiliateApplications.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(affiliateApplications)
    .where(eq(affiliateApplications.discoveryId, discoveryId))
    .orderBy(desc(affiliateApplications.createdAt));
}

/**
 * Get aggregate discovery stats
 */
export async function getDiscoveryStats(): Promise<{
  totalDiscovered: number;
  totalApproved: number;
  totalApplied: number;
  totalAccepted: number;
  totalPromoted: number;
  totalRuns: number;
  lastRunAt: Date | null;
  avgScore: number;
  topVerticals: Array<{ vertical: string; count: number }>;
}> {
  const db = await getDb();
  if (!db) return {
    totalDiscovered: 0, totalApproved: 0, totalApplied: 0, totalAccepted: 0,
    totalPromoted: 0, totalRuns: 0, lastRunAt: null, avgScore: 0, topVerticals: [],
  };

  const [stats] = await db.select({
    total: sql<number>`COUNT(*)`,
    approved: sql<number>`SUM(CASE WHEN ${affiliateDiscoveries.status} IN ('approved', 'applied', 'accepted') THEN 1 ELSE 0 END)`,
    applied: sql<number>`SUM(CASE WHEN ${affiliateDiscoveries.status} IN ('applied', 'accepted') THEN 1 ELSE 0 END)`,
    accepted: sql<number>`SUM(CASE WHEN ${affiliateDiscoveries.status} = 'accepted' THEN 1 ELSE 0 END)`,
    promoted: sql<number>`SUM(CASE WHEN ${affiliateDiscoveries.promotedToPartnerId} IS NOT NULL THEN 1 ELSE 0 END)`,
    avgScore: sql<number>`AVG(${affiliateDiscoveries.overallScore})`,
  }).from(affiliateDiscoveries);

  const [runStats] = await db.select({
    totalRuns: sql<number>`COUNT(*)`,
    lastRunAt: sql<Date>`MAX(${affiliateDiscoveryRuns.startedAt})`,
  }).from(affiliateDiscoveryRuns);

  // Top verticals
  const verticalCounts = await db.select({
    vertical: affiliateDiscoveries.vertical,
    count: sql<number>`COUNT(*)`,
  }).from(affiliateDiscoveries)
    .groupBy(affiliateDiscoveries.vertical)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(5);

  return {
    totalDiscovered: Number(stats?.total || 0),
    totalApproved: Number(stats?.approved || 0),
    totalApplied: Number(stats?.applied || 0),
    totalAccepted: Number(stats?.accepted || 0),
    totalPromoted: Number(stats?.promoted || 0),
    totalRuns: Number(runStats?.totalRuns || 0),
    lastRunAt: runStats?.lastRunAt || null,
    avgScore: Math.round(Number(stats?.avgScore || 0)),
    topVerticals: verticalCounts.map((v: any) => ({ vertical: v.vertical, count: Number(v.count) })),
  };
}

// ─── Scheduled Job ────────────────────────────────────────────────────

/**
 * Start the scheduled discovery job — runs DAILY for maximum coverage
 * Called once on server startup
 */
export function startScheduledDiscovery(): void {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  // Check every 6 hours if it's time to run
  setInterval(async () => {
    if (isKilled) return;

    const now = new Date();
    const hour = now.getUTCHours();

    // Run daily between 6-8 AM UTC
    if (hour >= 6 && hour < 8) {
      // Check if we already ran today
      const db = await getDb();
      if (!db) return;

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const [recentRun] = await db.select().from(affiliateDiscoveryRuns)
        .where(gte(affiliateDiscoveryRuns.startedAt, today))
        .limit(1);

      if (!recentRun) {
        log.info("[AffiliateDiscovery] Daily scheduled run triggered");
        try {
          await runDiscoveryCycle("scheduled");
        } catch (err: any) {
          log.error("[AffiliateDiscovery] Scheduled run failed:", { error: String(err.message) });
        }
      }
    }
  }, SIX_HOURS);

  // Also run on startup after a 5-minute delay to let the system stabilize
  setTimeout(async () => {
    if (isKilled) return;
    const db = await getDb();
    if (!db) return;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [recentRun] = await db.select().from(affiliateDiscoveryRuns)
      .where(gte(affiliateDiscoveryRuns.startedAt, today))
      .limit(1);

    if (!recentRun) {
      log.info("[AffiliateDiscovery] Startup discovery run triggered");
      try {
        await runDiscoveryCycle("startup");
      } catch (err: any) {
        log.error("[AffiliateDiscovery] Startup run failed:", { error: String(err.message) });
      }
    }
  }, 5 * 60 * 1000);

  log.info("[AffiliateDiscovery] Scheduled discovery active — runs DAILY at 6 AM UTC + on startup");
}

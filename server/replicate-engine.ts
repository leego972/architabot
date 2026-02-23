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

import { eq, and, desc } from "drizzle-orm";
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
} from "./sandbox-engine";

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
  }
): Promise<ReplicateProject> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(replicateProjects)
    .values({
      userId,
      targetUrl,
      targetName,
      status: "researching",
      priority: options?.priority ?? "mvp",
      brandName: options?.branding?.brandName,
      brandColors: options?.branding?.brandColors,
      brandLogo: options?.branding?.brandLogo,
      brandTagline: options?.branding?.brandTagline,
      stripePublishableKey: options?.stripe?.publishableKey,
      stripeSecretKey: options?.stripe?.secretKey,
      stripePriceIds: options?.stripe?.priceIds,
      buildLog: [],
    })
    .$returningId();

  const [project] = await db
    .select()
    .from(replicateProjects)
    .where(eq(replicateProjects.id, row.id));

  return project;
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
  } catch (err: any) {
    await updateProjectStatus(projectId, "error", `Failed to fetch ${targetUrl}: ${err.message}`, {
      errorMessage: err.message,
    });
    throw new Error(`Failed to fetch ${targetUrl}: ${err.message}`);
  }

  // Extract structural hints from HTML
  const structuralHints = extractStructuralHints(rawHtml);

  appendBuildLog(projectId, { step: 0, status: "running", message: "Analyzing with AI...", timestamp: new Date().toISOString() });

  // LLM analysis
  const analysis = await invokeLLM({
    systemTag: "chat",
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
        content: `Analyze this application:\n\n**URL:** ${targetUrl}\n**Title:** ${pageTitle}\n**Structural hints:** ${structuralHints}\n**Page Content:**\n${pageContent}`,
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

  // Update the project with research data
  await updateProjectStatus(projectId, "research_complete", `Research complete: ${research.coreFeatures.length} core features identified`, {
    targetUrl,
    targetDescription: research.description,
    researchData: research,
  });

  appendBuildLog(projectId, { step: 0, status: "success", message: `Research complete: ${research.appName} — ${research.coreFeatures.length} features, complexity: ${research.estimatedComplexity}`, timestamp: new Date().toISOString() });

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

  const buildPlanResponse = await invokeLLM({
    systemTag: "chat",
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
          } : undefined
        );

        // Write each file to the sandbox
        for (const file of fileContents) {
          await sandboxWriteFile(sandboxId, userId, file.path, file.content);
        }
      } catch (err: any) {
        appendBuildLog(projectId, {
          step: stepNum + 1,
          status: "error",
          message: `File generation failed: ${err.message}`,
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
      } catch (err: any) {
        appendBuildLog(projectId, {
          step: stepNum + 1,
          status: "error",
          message: `Command error: ${cmd} — ${err.message}`,
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

  // Mark build complete
  await updateProjectStatus(projectId, "build_complete", "Build complete! All steps executed.", {
    currentStep: plan.buildSteps.length,
  });

  appendBuildLog(projectId, {
    step: plan.buildSteps.length + 2,
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
  stripe?: StripeConfig
): Promise<Array<{ path: string; content: string }>> {
  const brandingInfo = branding?.brandName
    ? `\nBranding: name="${branding.brandName}", tagline="${branding.brandTagline || ""}", colors=${branding.brandColors ? JSON.stringify(branding.brandColors) : "modern defaults"}`
    : "";

  const stripeInfo = stripe?.publishableKey
    ? `\nStripe Integration: Use env vars STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY. Include checkout flow and webhook handler.`
    : "";

  const response = await invokeLLM({
    systemTag: "chat",
    messages: [
      {
        role: "system",
        content: `You are an expert full-stack developer. Generate the complete file contents for the given build step. Return a JSON array of objects with "path" and "content" fields. Each file must be complete, working code with no placeholders or TODOs. Use modern best practices.${brandingInfo}${stripeInfo}`,
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
${plan.apiRoutes.map(r => `- ${r.method} ${r.path}: ${r.description}`).join("\n")}

Return ONLY a JSON array: [{"path": "file/path", "content": "full file content"}, ...]`,
      },
    ],
    maxTokens: 8000,
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

  // Get user's GitHub PAT from secrets
  const db = getDb();
  const secrets = await db.query.userSecrets.findFirst({
    where: (s: any, { eq: eqOp }: any) => eqOp(s.userId, userId),
  });
  const githubToken = secrets?.githubToken;
  if (!githubToken) {
    throw new Error("GitHub Personal Access Token not found. Please add it in Account Settings.");
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
  } catch (err: any) {
    await updateProjectStatus(projectId, "build_complete", `GitHub push failed: ${err.message}`);
    appendBuildLog(projectId, {
      step: 99,
      status: "error",
      message: `GitHub push failed: ${err.message}`,
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

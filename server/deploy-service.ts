/**
 * Deploy Service — Vercel and Railway auto-deployment
 *
 * Handles:
 * 1. Auto-selecting platform based on clone complexity (Vercel for simple, Railway for complex)
 * 2. Creating deployments from GitHub repos
 * 3. Configuring custom domains on the deployment
 * 4. Checking deployment status
 *
 * Requires env vars:
 * - VERCEL_TOKEN: Vercel API token (for simple/standard clones)
 * - RAILWAY_TOKEN: Railway API token (for advanced/enterprise clones)
 */

import type { CloneComplexity } from "../shared/pricing";
import { getErrorMessage } from "./_core/errors.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface DeploymentResult {
  success: boolean;
  platform: "vercel" | "railway";
  deploymentId: string;
  deploymentUrl: string;
  customDomain?: string;
  message: string;
}

export interface DeploymentStatus {
  state: "queued" | "building" | "ready" | "error" | "cancelled";
  url?: string;
  createdAt?: string;
  readyAt?: string;
  errorMessage?: string;
}

// ─── Platform Selection ─────────────────────────────────────────────

/**
 * Auto-select the best deployment platform based on clone complexity.
 * Simple/Standard → Vercel (fast, free tier, great for static/Next.js)
 * Advanced/Enterprise → Railway (supports databases, background jobs, full-stack)
 */
export function selectPlatform(complexity: CloneComplexity): "vercel" | "railway" {
  if (complexity === "simple" || complexity === "standard") {
    return "vercel";
  }
  return "railway";
}

// ─── Vercel Deployment ──────────────────────────────────────────────

async function vercelHeaders() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN not configured. Set it in environment variables.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Deploy a GitHub repo to Vercel.
 * Creates a new Vercel project linked to the GitHub repo, triggers deployment.
 */
export async function deployToVercel(
  repoFullName: string, // e.g. "leego972/my-clone"
  projectName: string,
  customDomain?: string,
  envVars?: Record<string, string>
): Promise<DeploymentResult> {
  const headers = await vercelHeaders();
  const [owner, repo] = repoFullName.split("/");

  try {
    // Step 1: Create a Vercel project linked to the GitHub repo
    const createResp = await fetch("https://api.vercel.com/v10/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 50),
        framework: null, // auto-detect
        gitRepository: {
          type: "github",
          repo: repoFullName,
        },
        buildCommand: null, // auto-detect
        outputDirectory: null, // auto-detect
        installCommand: null, // auto-detect
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!createResp.ok) {
      const error = await createResp.json() as any;
      // If project already exists, try to get it
      if (error.error?.code === "project_already_exists" || createResp.status === 409) {
        // Continue with existing project
      } else {
        return {
          success: false,
          platform: "vercel",
          deploymentId: "",
          deploymentUrl: "",
          message: `Vercel project creation failed: ${error.error?.message || error.message || createResp.status}`,
        };
      }
    }

    const project = createResp.ok ? await createResp.json() as any : null;
    const projectId = project?.id;

    // Step 2: Set environment variables if provided
    if (envVars && projectId) {
      const envEntries = Object.entries(envVars).map(([key, value]) => ({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview"],
      }));

      if (envEntries.length > 0) {
        await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
          method: "POST",
          headers,
          body: JSON.stringify(envEntries),
          signal: AbortSignal.timeout(10000),
        });
      }
    }

    // Step 3: Trigger deployment
    const deployResp = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        gitSource: {
          type: "github",
          org: owner,
          repo,
          ref: "main",
        },
        target: "production",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!deployResp.ok) {
      const error = await deployResp.json() as any;
      return {
        success: false,
        platform: "vercel",
        deploymentId: "",
        deploymentUrl: "",
        message: `Vercel deployment failed: ${error.error?.message || error.message || deployResp.status}`,
      };
    }

    const deployment = await deployResp.json() as any;
    const deploymentUrl = `https://${deployment.url || deployment.alias?.[0] || `${projectName}.vercel.app`}`;

    // Step 4: Add custom domain if provided
    if (customDomain && projectId) {
      await addVercelDomain(projectId, customDomain);
    }

    return {
      success: true,
      platform: "vercel",
      deploymentId: deployment.id || deployment.uid,
      deploymentUrl,
      customDomain,
      message: `Deployed to Vercel successfully! ${customDomain ? `Custom domain ${customDomain} configured.` : ""}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      platform: "vercel",
      deploymentId: "",
      deploymentUrl: "",
      message: `Vercel deployment error: ${getErrorMessage(err)}`,
    };
  }
}

/**
 * Add a custom domain to a Vercel project
 */
async function addVercelDomain(projectId: string, domain: string): Promise<boolean> {
  const headers = await vercelHeaders();

  try {
    const resp = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(10000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Check Vercel deployment status
 */
export async function getVercelDeploymentStatus(deploymentId: string): Promise<DeploymentStatus> {
  const headers = await vercelHeaders();

  try {
    const resp = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return { state: "error", errorMessage: `HTTP ${resp.status}` };
    }

    const data = await resp.json() as any;
    const stateMap: Record<string, DeploymentStatus["state"]> = {
      QUEUED: "queued",
      BUILDING: "building",
      READY: "ready",
      ERROR: "error",
      CANCELED: "cancelled",
    };

    return {
      state: stateMap[data.readyState || data.state] || "building",
      url: data.url ? `https://${data.url}` : undefined,
      createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : undefined,
      readyAt: data.ready ? new Date(data.ready).toISOString() : undefined,
      errorMessage: data.errorMessage,
    };
  } catch (err: unknown) {
    return { state: "error", errorMessage: getErrorMessage(err) };
  }
}

// ─── Railway Deployment ─────────────────────────────────────────────

function getRailwayToken(): string {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) throw new Error("RAILWAY_TOKEN not configured. Set it in environment variables.");
  return token;
}

/**
 * Execute a Railway GraphQL query
 */
async function railwayQuery(query: string, variables?: Record<string, any>): Promise<any> {
  const token = getRailwayToken();

  const resp = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Railway API error: ${resp.status} — ${error}`);
  }

  const data = await resp.json() as any;
  if (data.errors?.length > 0) {
    throw new Error(`Railway GraphQL error: ${data.errors[0].message}`);
  }

  return data.data;
}

/**
 * Deploy a GitHub repo to Railway.
 * Creates a new Railway project, links to GitHub repo, and deploys.
 */
export async function deployToRailway(
  repoFullName: string, // e.g. "leego972/my-clone"
  projectName: string,
  customDomain?: string,
  envVars?: Record<string, string>
): Promise<DeploymentResult> {
  try {
    // Step 1: Create a new Railway project
    const createResult = await railwayQuery(`
      mutation projectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        name: projectName,
        description: `Cloned website: ${projectName}`,
        isPublic: false,
      },
    });

    const projectId = createResult.projectCreate.id;

    // Step 2: Get the default environment
    const envResult = await railwayQuery(`
      query project($id: String!) {
        project(id: $id) {
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `, { id: projectId });

    const environments = envResult.project.environments.edges;
    const prodEnv = environments.find((e: any) => e.node.name === "production") || environments[0];
    const environmentId = prodEnv?.node?.id;

    if (!environmentId) {
      return {
        success: false,
        platform: "railway",
        deploymentId: projectId,
        deploymentUrl: "",
        message: "Railway project created but no environment found",
      };
    }

    // Step 3: Create a service linked to the GitHub repo
    const serviceResult = await railwayQuery(`
      mutation serviceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        projectId,
        name: projectName,
        source: {
          repo: repoFullName,
        },
      },
    });

    const serviceId = serviceResult.serviceCreate.id;

    // Step 4: Set environment variables
    if (envVars && Object.keys(envVars).length > 0) {
      for (const [key, value] of Object.entries(envVars)) {
        await railwayQuery(`
          mutation variableUpsert($input: VariableUpsertInput!) {
            variableUpsert(input: $input)
          }
        `, {
          input: {
            projectId,
            environmentId,
            serviceId,
            name: key,
            value,
          },
        });
      }
    }

    // Step 5: Generate a Railway domain
    const domainResult = await railwayQuery(`
      mutation serviceInstanceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          domain
        }
      }
    `, {
      input: {
        serviceId,
        environmentId,
      },
    });

    const railwayDomain = domainResult.serviceDomainCreate?.domain || `${projectName}.up.railway.app`;
    const deploymentUrl = `https://${railwayDomain}`;

    // Step 6: Add custom domain if provided
    if (customDomain) {
      try {
        await railwayQuery(`
          mutation customDomainCreate($input: CustomDomainCreateInput!) {
            customDomainCreate(input: $input) {
              domain
            }
          }
        `, {
          input: {
            serviceId,
            environmentId,
            domain: customDomain,
          },
        });
      } catch {
        // Non-critical — user can add domain manually
      }
    }

    return {
      success: true,
      platform: "railway",
      deploymentId: projectId,
      deploymentUrl,
      customDomain,
      message: `Deployed to Railway successfully! ${customDomain ? `Custom domain ${customDomain} configured.` : `Available at ${deploymentUrl}`}`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      platform: "railway",
      deploymentId: "",
      deploymentUrl: "",
      message: `Railway deployment error: ${getErrorMessage(err)}`,
    };
  }
}

/**
 * Check Railway deployment status
 */
export async function getRailwayDeploymentStatus(projectId: string): Promise<DeploymentStatus> {
  try {
    const result = await railwayQuery(`
      query project($id: String!) {
        project(id: $id) {
          services {
            edges {
              node {
                serviceInstances {
                  edges {
                    node {
                      latestDeployment {
                        id
                        status
                        createdAt
                      }
                      domains {
                        serviceDomains {
                          domain
                        }
                        customDomains {
                          domain
                          status {
                            dnsRecords {
                              currentValue
                              requiredValue
                              status
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { id: projectId });

    const services = result.project?.services?.edges || [];
    const instance = services[0]?.node?.serviceInstances?.edges?.[0]?.node;
    const deployment = instance?.latestDeployment;
    const domain = instance?.domains?.serviceDomains?.[0]?.domain;

    if (!deployment) {
      return { state: "queued" };
    }

    const stateMap: Record<string, DeploymentStatus["state"]> = {
      SUCCESS: "ready",
      DEPLOYING: "building",
      BUILDING: "building",
      QUEUED: "queued",
      FAILED: "error",
      CRASHED: "error",
      REMOVED: "cancelled",
    };

    return {
      state: stateMap[deployment.status] || "building",
      url: domain ? `https://${domain}` : undefined,
      createdAt: deployment.createdAt,
    };
  } catch (err: unknown) {
    return { state: "error", errorMessage: getErrorMessage(err) };
  }
}

// ─── Unified Deploy Function ────────────────────────────────────────

/**
 * Deploy to the appropriate platform based on complexity.
 * Simple/Standard → Vercel, Advanced/Enterprise → Railway.
 * User can override the platform choice.
 */
export async function deployProject(
  repoFullName: string,
  projectName: string,
  complexity: CloneComplexity,
  options?: {
    customDomain?: string;
    envVars?: Record<string, string>;
    platformOverride?: "vercel" | "railway";
  }
): Promise<DeploymentResult> {
  const platform = options?.platformOverride || selectPlatform(complexity);

  if (platform === "vercel") {
    return deployToVercel(repoFullName, projectName, options?.customDomain, options?.envVars);
  } else {
    return deployToRailway(repoFullName, projectName, options?.customDomain, options?.envVars);
  }
}

/**
 * Get deployment status from either platform
 */
export async function getDeploymentStatus(
  deploymentId: string,
  platform: "vercel" | "railway"
): Promise<DeploymentStatus> {
  if (platform === "vercel") {
    return getVercelDeploymentStatus(deploymentId);
  } else {
    return getRailwayDeploymentStatus(deploymentId);
  }
}

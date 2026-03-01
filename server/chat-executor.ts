/**
 * Chat Tool Executor — Executes LLM tool calls against real backend data.
 *
 * Each function here maps a tool name to a real database query or action.
 * The executor receives the parsed arguments from the LLM and returns
 * a JSON-serializable result that gets fed back to the LLM as a tool response.
 */

import { getDb } from "./db";
import { storagePut } from "./storage";
import { chatConversations } from "../drizzle/schema";
import {
  fetcherJobs,
  fetcherTasks,
  fetcherCredentials,
  fetcherSettings,
  fetcherProxies,
  fetcherKillSwitch,
  apiKeys,
  teamMembers,
  users,
  credentialWatches,
  bulkSyncJobs,
  syncSchedules,
  leakScans,
  leakFindings,
  vaultItems,
  vaultAccessLog,
  providerHealthSnapshots,
  fetchRecommendations,
  auditLogs,
  builderActivityLog,
  sandboxFiles,
  marketplaceListings,
  sellerProfiles,
  userSecrets,
} from "../drizzle/schema";
import { eq, and, desc, isNull, sql, gte, like, or } from "drizzle-orm";
import { safeSqlIdentifier } from "./_core/sql-sanitize.js";
import { PROVIDERS } from "../shared/fetcher";
import {
  getDecryptedCredentials,
  exportCredentials as exportCredsDb,
  getCredentials,
  getJobs,
  getJob,
  getJobTasks,
  activateKillSwitch as activateKS,
  encrypt,
  decrypt,
  storeManualCredential,
} from "./fetcher-db";
import { getUserPlan, enforceFeature, enforceFetchLimit, enforceProviderAccess, canUseCloneWebsite, isFeatureAllowed } from "./subscription-gate";
import {
  readFile as selfReadFileImpl,
  listFiles as selfListFilesImpl,
  applyModifications,
  applyModificationsDeferred,
  runHealthCheck,
  runQuickHealthCheck,
  runTypeCheck,
  runTests,
  rollbackToSnapshot,
  rollbackToLastGood,
  saveCheckpoint,
  listCheckpoints,
  rollbackToCheckpoint,
  requestRestart,
  stageRestart,
  isDeferredMode,
  getModificationHistory,
  getProtectedFiles,
  getAllowedDirectories,
  validateModifications,
} from "./self-improvement-engine";
import { queryAuditLogs } from "./audit-log-db";
import { logAudit } from "./audit-log-db";
import { callDataApi } from "./_core/dataApi";
import crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  createSandbox,
  getSandbox,
  listSandboxes,
  executeCommand,
  listFiles as sandboxListFilesImpl,
  readFile as sandboxReadFileImpl,
  writeFile as sandboxWriteFileImpl,
} from "./sandbox-engine";
import {
  runPassiveWebScan,
  analyzeCodeSecurity,
  generateSecurityReport,
  runPortScan,
  checkSSL,
} from "./security-tools";
import {
  fixSingleVulnerability,
  fixAllVulnerabilities,
  generateFixReport,
} from "./auto-fix-engine";
import { invokeLLM } from "./_core/llm";
import { sandboxes } from "../drizzle/schema";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import { validateToolCallNotSelfReplication } from "./anti-replication-guard";
import { runVaultBridge, getVaultBridgeStatus } from "./vault-bridge";
import { getAutonomousSystemStatus } from "./autonomous-sync";
const log = createLogger("ChatExecutor");

// ─── Types ──────────────────────────────────────────────────────────

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Main Executor ──────────────────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  userId: number,
  userName?: string,
  userEmail?: string,
  userApiKey?: string | null
,
  conversationId?: number): Promise<ToolExecutionResult> {
  try {
    // ── Subscription Tier Gating ──────────────────────────────────
    // Premium tools accessed through AI chat must respect the same
    // tier restrictions as their direct API counterparts.
    const plan = await getUserPlan(userId);
    const planId = plan.planId;

    // Helper: return a friendly gating error instead of throwing
    const gateResult = (feature: string, label: string): ToolExecutionResult | null => {
      if (!isFeatureAllowed(planId, feature)) {
        return {
          success: false,
          error: `${label} is not available on the ${plan.tier.name} plan. Upgrade to unlock this feature at /pricing.`,
        };
      }
      return null;
    };

    // ── Anti-Self-Replication Guard ────────────────────────────
    // Block any tool call that attempts to clone, copy, or export
    // the Titan platform itself. Enforced at runtime.
    const replicationBlock = validateToolCallNotSelfReplication(toolName, args);
    if (replicationBlock) {
      log.warn(`SELF-REPLICATION BLOCKED: user=${userId} tool=${toolName}`, { args });
      return { success: false, error: replicationBlock };
    }

    switch (toolName) {
      // ── Credentials & Fetching ──────────────────────────────────
  
    // ─── Navigation ────────────────────────────────────────────────
    case "navigate_to_page": {
      const page = args.page as string;
      const reason = args.reason as string;
      if (!page) return { success: false, error: "Page path is required" };
      
      // Normalize the path
      const normalizedPath = page.startsWith("/") ? page : `/${page}`;
      
      // Validate against known pages
      const validPages = [
        // Core
        "/dashboard", "/dashboard/credits", "/dashboard/subscription",
        "/pricing", "/contact", "/sandbox", "/project-files",
        // Fetcher / Credential Management
        "/fetcher/new", "/fetcher/jobs", "/fetcher/credentials",
        "/fetcher/export", "/fetcher/import", "/fetcher/api-access",
        "/fetcher/smart-fetch", "/fetcher/cli",
        "/fetcher/watchdog", "/fetcher/provider-health", "/fetcher/health-trends",
        "/fetcher/credential-health",
        "/fetcher/leak-scanner", "/fetcher/bulk-sync", "/fetcher/auto-sync",
        "/fetcher/onboarding", "/fetcher/team", "/fetcher/team-vault",
        "/fetcher/totp-vault", "/fetcher/notifications",
        "/fetcher/history", "/fetcher/audit-logs", "/fetcher/developer-docs",
        "/fetcher/webhooks", "/fetcher/api-analytics", "/fetcher/account",
        "/fetcher/settings", "/fetcher/killswitch", "/fetcher/releases",
        "/fetcher/admin", "/fetcher/self-improvement",
        // Marketplace & Business
        "/marketplace", "/replicate", "/companies", "/business-plans",
        "/grants", "/grant-applications", "/crowdfunding",
        "/referrals", "/affiliate",
        // Marketing & Content
        "/blog", "/blog-admin", "/seo", "/marketing", "/advertising",
      ];
      
      if (!validPages.includes(normalizedPath)) {
        return { success: false, error: `Unknown page: ${page}. Valid pages: ${validPages.join(", ")}` };
      }
      
      return {
        success: true,
        data: {
          action: "navigate",
          path: normalizedPath,
          reason: reason || "Navigate to page",
          message: `Navigate to [${normalizedPath}](${normalizedPath}): ${reason || ""}`
        },
      };
    }

    // ─── Web Research ──────────────────────────────────────────────
    case "web_search": {
      const query = args.query as string;
      if (!query) return { success: false, error: "Search query is required" };
      try {
        // Use DuckDuckGo HTML search as a simple, free search API
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const resp = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        const html = await resp.text();
        // Parse results from DuckDuckGo HTML
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        let count = 0;
        while ((match = resultRegex.exec(html)) !== null && count < 8) {
          const rawUrl = match[1];
          const title = match[2].replace(/<[^>]*>/g, "").trim();
          const snippet = match[3].replace(/<[^>]*>/g, "").trim();
          // DuckDuckGo wraps URLs in a redirect - extract the actual URL
          let url = rawUrl;
          const uddgMatch = rawUrl.match(/uddg=([^&]*)/);
          if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
          }
          if (title && url) {
            results.push({ title, url, snippet });
            count++;
          }
        }
        // Fallback: try simpler regex if the above didn't match
        if (results.length === 0) {
          const simpleRegex = /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
          const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          const urlRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*/g;
          const titles: string[] = [];
          const urls: string[] = [];
          const snippets: string[] = [];
          let m;
          while ((m = simpleRegex.exec(html)) !== null) titles.push(m[1].replace(/<[^>]*>/g, "").trim());
          while ((m = urlRegex.exec(html)) !== null) {
            let u = m[1];
            const uddg = u.match(/uddg=([^&]*)/);
            if (uddg) u = decodeURIComponent(uddg[1]);
            urls.push(u);
          }
          while ((m = snippetRegex.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]*>/g, "").trim());
          for (let i = 0; i < Math.min(titles.length, urls.length, 8); i++) {
            results.push({ title: titles[i], url: urls[i], snippet: snippets[i] || "" });
          }
        }
        if (results.length === 0) {
          return { success: true, data: { message: "No results found. Try a different search query.", query } };
        }
        return { success: true, data: { query, resultCount: results.length, results } };
      } catch (err: unknown) {
        return { success: false, error: `Search failed: ${getErrorMessage(err)}` };
      }
    }

    case "web_page_read": {
      const url = args.url as string;
      if (!url) return { success: false, error: "URL is required" };
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          return { success: false, error: `Failed to fetch page: ${resp.status} ${resp.statusText}` };
        }
        const html = await resp.text();
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "Untitled";
        // Remove script, style, nav, header, footer tags
        let text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ")
          .trim();
        // Truncate to ~4000 chars to fit in context
        if (text.length > 4000) {
          text = text.substring(0, 4000) + "... [truncated]";
        }
        return { success: true, data: { title, url, contentLength: text.length, content: text } };
      } catch (err: unknown) {
        return { success: false, error: `Failed to read page: ${getErrorMessage(err)}` };
      }
    }

    case "list_credentials":
        return await execListCredentials(userId);

      case "reveal_credential":
        return await execRevealCredential(userId, args.credentialId as number);

      case "export_credentials":
        return await execExportCredentials(userId, args.format as string);

      case "create_fetch_job":
        return await execCreateFetchJob(userId, args.providerIds as string[]);

      case "list_jobs":
        return await execListJobs(userId);

      case "get_job_details":
        return await execGetJobDetails(userId, args.jobId as number);

      case "list_providers":
        return execListProviders();

      // ── API Keys (Pro+) ──────────────────────────────────────────
      case "list_api_keys": {
        const gate = gateResult("api_access", "API Access");
        if (gate) return gate;
        return await execListApiKeys(userId);
      }

      case "create_api_key": {
        const gate = gateResult("api_access", "API Access");
        if (gate) return gate;
        return await execCreateApiKey(userId, args as any, userName, userEmail);
      }

      case "revoke_api_key": {
        const gate = gateResult("api_access", "API Access");
        if (gate) return gate;
        return await execRevokeApiKey(userId, args.keyId as number, userName, userEmail);
      }

      // ── Leak Scanner (Cyber+) ─────────────────────────────────
      case "start_leak_scan": {
        const gate = gateResult("leak_scanner", "Credential Leak Scanner");
        if (gate) return gate;
        return await execStartLeakScan(userId);
      }

      case "get_leak_scan_results": {
        const gate = gateResult("leak_scanner", "Credential Leak Scanner");
        if (gate) return gate;
        return await execGetLeakScanResults(userId);
      }

      // ── Vault ───────────────────────────────────────────────────
      case "list_vault_entries":
        return await execListVaultEntries(userId);

      case "add_vault_entry":
        return await execAddVaultEntry(userId, args as any, userName);

      // ── Save Credential (manual input via chat) ─────────────────
      case "save_credential":
        return await execSaveCredential(userId, args as any, userName, userEmail);

      // ── Bulk Sync (Pro+) ──────────────────────────────────────────
      case "trigger_bulk_sync": {
        const gate = gateResult("scheduled_fetches", "Bulk Sync");
        if (gate) return gate;
        return await execTriggerBulkSync(userId, args.providerIds as string[] | undefined);
      }

      case "get_bulk_sync_status": {
        const gate = gateResult("scheduled_fetches", "Bulk Sync");
        if (gate) return gate;
        return await execGetBulkSyncStatus(userId);
      }

      // ── Team (Enterprise+) ──────────────────────────────────────
      case "list_team_members": {
        const gate = gateResult("team_management", "Team Management");
        if (gate) return gate;
        return await execListTeamMembers(userId);
      }

      case "add_team_member": {
        const gate = gateResult("team_management", "Team Management");
        if (gate) return gate;
        return await execAddTeamMember(userId, args as any, userName, userEmail);
      }

      case "remove_team_member": {
        const gate = gateResult("team_management", "Team Management");
        if (gate) return gate;
        return await execRemoveTeamMember(userId, args.memberId as number, userName, userEmail);
      }

      case "update_team_member_role": {
        const gate = gateResult("team_management", "Team Management");
        if (gate) return gate;
        return await execUpdateTeamMemberRole(userId, args as any, userName, userEmail);
      }

      // ── Scheduler (Pro+) ──────────────────────────────────────────
      case "list_schedules": {
        const gate = gateResult("scheduled_fetches", "Scheduled Fetches");
        if (gate) return gate;
        return await execListSchedules(userId);
      }

      case "create_schedule": {
        const gate = gateResult("scheduled_fetches", "Scheduled Fetches");
        if (gate) return gate;
        return await execCreateSchedule(userId, args as any);
      }

      case "delete_schedule": {
        const gate = gateResult("scheduled_fetches", "Scheduled Fetches");
        if (gate) return gate;
        return await execDeleteSchedule(userId, args.scheduleId as number);
      }

      // ── Watchdog ────────────────────────────────────────────────
      case "get_watchdog_summary":
        return await execGetWatchdogSummary(userId);

      // ── Provider Health ─────────────────────────────────────────
      case "check_provider_health":
        return await execCheckProviderHealth(userId);

      // ── Recommendations ─────────────────────────────────────────
      case "get_recommendations":
        return await execGetRecommendations(userId);

      // ── Audit (Enterprise+) ────────────────────────────────────
      case "get_audit_logs": {
        const gate = gateResult("audit_logs", "Audit Logs");
        if (gate) return gate;
        return await execGetAuditLogs(args as any);
      }

      // ── Kill Switch (Pro+) ──────────────────────────────────────
      case "activate_kill_switch": {
        const gate = gateResult("kill_switch", "Kill Switch");
        if (gate) return gate;
        return await execActivateKillSwitch(userId, args.code as string);
      }

      // ── System ──────────────────────────────────────────────────
      case "get_system_status":
        return await execGetSystemStatus(userId);

      case "get_plan_usage":
        return await execGetPlanUsage(userId);

      // ── Self-Improvement ────────────────────────────────────────
      case "self_read_file":
        return execSelfReadFile(args.filePath as string);

      case "self_list_files":
        return execSelfListFiles(args.dirPath as string);

      case "self_modify_file":
        return await execSelfModifyFile(userId, args as any, userName);

      case "self_health_check":
        return await execSelfHealthCheck({
          skipTests: args.skipTests as boolean | undefined,
          skipTypeCheck: args.skipTypeCheck as boolean | undefined,
        });

      case "self_rollback":
        return await execSelfRollback(userId, args.snapshotId as number | undefined, userName);

      case "self_restart":
        return await execSelfRestart(userId, args.reason as string);

      case "self_modification_history":
        return await execSelfModificationHistory(args.limit as number | undefined);

      case "self_get_protected_files":
        return execSelfGetProtectedFiles();

      // ── Builder Tools ──────────────────────────────────────────────
      case "self_type_check":
        return await execSelfTypeCheck(userId);
      case "self_run_tests":
        return await execSelfRunTests(args.testPattern as string | undefined, userId);
      case "self_multi_file_modify":
        return await execSelfMultiFileModify(userId, args.modifications as any[], userName);
      // ── Professional Builder Tools ──────────────────────────────────
      case "self_dependency_audit":
        return await execSelfDependencyAudit(args.focus as string | undefined);
      case "self_grep_codebase":
        return await execSelfGrepCodebase(args.pattern as string, args.filePattern as string | undefined, args.maxResults as number | undefined);
      case "self_git_diff":
        return await execSelfGitDiff(args.filePath as string | undefined, args.staged as boolean | undefined);
      case "self_env_check":
        return await execSelfEnvCheck();
      case "self_db_schema_inspect":
        return await execSelfDbSchemaInspect(args.table as string | undefined);
      case "self_code_stats":
        return await execSelfCodeStats(args.directory as string | undefined);
      case "self_deployment_check":
        return await execSelfDeploymentCheck(args.quick as boolean | undefined);
      // ── Checkpoint Tools ───────────────────────────────────────
      case "self_save_checkpoint":
        return await execSelfSaveCheckpoint(args.name as string, userId, userName);
      case "self_list_checkpoints":
        return await execSelfListCheckpoints(args.limit as number | undefined);
      case "self_rollback_to_checkpoint":
        return await execSelfRollbackToCheckpoint(args.checkpointId as number | undefined, userId, userName);
      case "self_analyze_file":
        return await execSelfAnalyzeFile(args.filePath as string);
      case "self_find_dead_code":
        return await execSelfFindDeadCode(args.directory as string | undefined);
      case "self_api_map":
        return await execSelfApiMap();
      // ── Sandbox Tools ────────────────────────────────────────────
      case "sandbox_exec":
        return await execSandboxCommand(userId, args);
      case "sandbox_write_file":
        return await execSandboxWriteFile(userId, args);
      case "sandbox_read_file":
        return await execSandboxReadFile(userId, args);
      case "sandbox_list_files":
        return await execSandboxListFiles(userId, args);

      // ── Security Tools (Cyber+) ──────────────────────────────────
      case "security_scan": {
        const gate = gateResult("security_tools", "Security Scan");
        if (gate) return gate;
        return await execSecurityScan(args);
      }
      case "code_security_review": {
        const gate = gateResult("security_tools", "Code Security Review");
        if (gate) return gate;
        return await execCodeSecurityReview(args);
      }
      case "port_scan": {
        const gate = gateResult("security_tools", "Port Scan");
        if (gate) return gate;
        return await execPortScan(args);
      }
      case "ssl_check": {
        const gate = gateResult("security_tools", "SSL Check");
        if (gate) return gate;
        return await execSSLCheck(args);
      }

      // ── Auto-Fix Tools (Cyber+) ─────────────────────────────────
      case "auto_fix_vulnerability": {
        const gate = gateResult("security_tools", "Auto-Fix Vulnerability");
        if (gate) return gate;
        return await execAutoFixVulnerability(args);
      }
      case "auto_fix_all_vulnerabilities": {
        const gate = gateResult("security_tools", "Auto-Fix All Vulnerabilities");
        if (gate) return gate;
        return await execAutoFixAll(args);
      }

      // ── App Research & Clone ───────────────────────────────────
      case "app_research":
        return await execAppResearch(args, userApiKey || undefined);
      case "app_clone":
        return await execAppClone(userId, args, userApiKey || undefined);
      case "website_replicate": {
        const hasAccess = await canUseCloneWebsite(userId);
        if (!hasAccess) {
          return {
            success: false,
            error: "Website Clone is an exclusive feature for Cyber+ and Titan subscribers. Upgrade at /pricing to unlock this capability.",
          };
        }
        return await execWebsiteReplicate(userId, args);
      }

      // ── Project Builder Tools ─────────────────────────────────
      case "create_file":
        return await execCreateFile(userId, args, conversationId);
      case "create_github_repo":
        return await execCreateGithubRepo(userId, args, conversationId);
      case "push_to_github":
        return await execPushToGithub(userId, args, conversationId);
      case "read_uploaded_file":
        return await execReadUploadedFile(args);
      case "search_bazaar":
        return await execSearchBazaar(args);
      // ── Autonomous System Management ────────────────────────────────
      case "get_autonomous_status":
        return await execGetAutonomousStatus();
      case "get_channel_status":
        return await execGetChannelStatus();
      case "refresh_vault_bridge":
        return await execRefreshVaultBridge(args.force as boolean | undefined);
      case "get_vault_bridge_info":
        return await execGetVaultBridgeInfo();
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: unknown) {
    log.error(`[ChatExecutor] Error executing ${toolName}:`, { error: String(err) });
    return {
      success: false,
      error: getErrorMessage(err) || `Failed to execute ${toolName}`,
    };
  }
}

// ─── Implementation Functions ────────────────────────────────────────

async function execListCredentials(userId: number): Promise<ToolExecutionResult> {
  const creds = await getCredentials(userId);
  return {
    success: true,
    data: {
      count: creds.length,
      credentials: creds.map((c: any) => ({
        id: c.id,
        provider: c.providerName || c.providerId,
        providerId: c.providerId,
        keyType: c.keyType,
        label: c.keyLabel || "—",
        createdAt: c.createdAt,
      })),
    },
  };
}

async function execRevealCredential(userId: number, credentialId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const rows = await db
    .select()
    .from(fetcherCredentials)
    .where(and(eq(fetcherCredentials.id, credentialId), eq(fetcherCredentials.userId, userId)))
    .limit(1);

  if (rows.length === 0) {
    return { success: false, error: "Credential not found or access denied" };
  }

  const cred = rows[0];
  let value: string;
  try {
    value = decrypt(cred.encryptedValue);
  } catch {
    value = "[decryption failed]";
  }

  return {
    success: true,
    data: {
      id: cred.id,
      provider: cred.providerName,
      keyType: cred.keyType,
      label: cred.keyLabel,
      value,
    },
  };
}

async function execExportCredentials(userId: number, format: string): Promise<ToolExecutionResult> {
  if (!["json", "env", "csv"].includes(format)) {
    return { success: false, error: "Invalid format. Use: json, env, or csv" };
  }
  const data = await exportCredsDb(userId, format as "json" | "env" | "csv");
  return { success: true, data: { format, content: data } };
}

async function execCreateFetchJob(userId: number, providerIds: string[]): Promise<ToolExecutionResult> {
  if (!providerIds || providerIds.length === 0) {
    return { success: false, error: "No providers specified. Use list_providers to see available options." };
  }

  // Validate provider IDs
  const invalid = providerIds.filter((id) => !PROVIDERS[id]);
  if (invalid.length > 0) {
    return { success: false, error: `Unknown provider IDs: ${invalid.join(", ")}. Use list_providers to see valid IDs.` };
  }

  // Note: actual job creation requires email/password for the provider portals.
  // The chat assistant can't collect those securely, so we return guidance.
  return {
    success: true,
    data: {
      message: `To create a fetch job for ${providerIds.length} provider(s) (${providerIds.join(", ")}), please use the Fetcher page in the dashboard. The fetch process requires your provider login credentials which must be entered securely through the UI.`,
      providers: providerIds.map((id) => ({
        id,
        name: PROVIDERS[id]?.name || id,
        url: PROVIDERS[id]?.loginUrl || "",
      })),
      tip: "Navigate to Dashboard → Fetcher → New Fetch to start a job.",
    },
  };
}

async function execListJobs(userId: number): Promise<ToolExecutionResult> {
  const jobs = await getJobs(userId);
  return {
    success: true,
    data: {
      count: jobs.length,
      jobs: jobs.slice(0, 10).map((j: any) => ({
        id: j.id,
        status: j.status,
        completedProviders: j.completedProviders,
        totalProviders: j.totalProviders,
        failedProviders: j.failedProviders,
        completedAt: j.completedAt,
        createdAt: j.createdAt,
      })),
    },
  };
}

async function execGetJobDetails(userId: number, jobId: number): Promise<ToolExecutionResult> {
  const job = await getJob(jobId, userId);
  if (!job) return { success: false, error: "Job not found" };

  const tasks = await getJobTasks(jobId);
  return {
    success: true,
    data: {
      job: {
        id: job.id,
        status: job.status,
        completedProviders: job.completedProviders,
        totalProviders: job.totalProviders,
        failedProviders: job.failedProviders,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      },
      tasks: tasks.map((t: any) => ({
        id: t.id,
        providerId: t.providerId,
        status: t.status,
        message: t.message,
      })),
    },
  };
}

function execListProviders(): ToolExecutionResult {
  const providers = Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    keyTypes: p.keyTypes,
    description: p.description,
    requiresProxy: p.requiresResidentialProxy,
  }));
  return { success: true, data: { count: providers.length, providers } };
}

async function execListApiKeys(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      usageCount: apiKeys.usageCount,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  return {
    success: true,
    data: {
      count: keys.length,
      activeCount: keys.filter((k) => !k.revokedAt).length,
      keys: keys.map((k) => ({
        ...k,
        status: k.revokedAt ? "revoked" : k.expiresAt && k.expiresAt < new Date() ? "expired" : "active",
      })),
    },
  };
}

async function execCreateApiKey(
  userId: number,
  args: { name: string; scopes: string[]; expiresInDays?: number },
  userName?: string,
  userEmail?: string
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Check active key count
  const activeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  if (activeCount[0].count >= 10) {
    return { success: false, error: "Maximum of 10 active API keys. Revoke an existing key first." };
  }

  const raw = `at_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = raw.substring(0, 11);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = args.expiresInDays
    ? new Date(Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await db.insert(apiKeys).values({
    userId,
    name: args.name,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: args.scopes,
    expiresAt,
  });

  await logAudit({
    userId,
    userName: userName || undefined,
    userEmail: userEmail || undefined,
    action: "apiKey.create",
    resource: "apiKey",
    details: { name: args.name, scopes: args.scopes, source: "titan_assistant" },
  });

  return {
    success: true,
    data: {
      key: raw,
      prefix,
      name: args.name,
      scopes: args.scopes,
      expiresAt,
      warning: "This is the only time the full key will be shown. Save it securely.",
    },
  };
}

async function execRevokeApiKey(
  userId: number,
  keyId: number,
  userName?: string,
  userEmail?: string
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

  await logAudit({
    userId,
    userName: userName || undefined,
    userEmail: userEmail || undefined,
    action: "apiKey.revoke",
    resource: "apiKey",
    resourceId: keyId.toString(),
    details: { source: "titan_assistant" },
  });

  return { success: true, data: { message: `API key #${keyId} has been revoked.` } };
}

async function execStartLeakScan(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Create a new scan record
  const scanId = crypto.randomUUID();
  await db.insert(leakScans).values({
    userId,
    status: "scanning",
  });

  return {
    success: true,
    data: {
      message: "Leak scan started. It will check your stored credentials against known breach databases and public code repositories.",
      tip: "Check results with get_leak_scan_results or visit the Leak Scanner page.",
    },
  };
}

async function execGetLeakScanResults(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const scans = await db
    .select()
    .from(leakScans)
    .where(eq(leakScans.userId, userId))
    .orderBy(desc(leakScans.createdAt))
    .limit(5);

  if (scans.length === 0) {
    return { success: true, data: { message: "No leak scans found. Use start_leak_scan to run one." } };
  }

  const latestScan = scans[0];
  const findings = await db
    .select()
    .from(leakFindings)
    .where(eq(leakFindings.scanId, latestScan.id))
    .orderBy(desc(leakFindings.createdAt));

  return {
    success: true,
    data: {
      latestScan: {
        id: latestScan.id,
        status: latestScan.status,
        sourcesScanned: latestScan.sourcesScanned,
        leaksFound: latestScan.leaksFound,
        createdAt: latestScan.createdAt,
      },
      findings: findings.map((f: any) => ({
        id: f.id,
        severity: f.severity,
        source: f.source,
        description: f.description,
        status: f.status,
        credentialId: f.credentialId,
      })),
      totalScans: scans.length,
    },
  };
}

async function execListVaultEntries(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const items = await db
    .select({
      id: vaultItems.id,
      name: vaultItems.name,
      credentialType: vaultItems.credentialType,
      createdByUserId: vaultItems.createdByUserId,
      notes: vaultItems.notes,
      createdAt: vaultItems.createdAt,
      updatedAt: vaultItems.updatedAt,
    })
    .from(vaultItems)
    .where(eq(vaultItems.teamOwnerId, userId))
    .orderBy(desc(vaultItems.createdAt));

  return {
    success: true,
    data: {
      count: items.length,
      entries: items,
    },
  };
}

async function execAddVaultEntry(
  userId: number,
  args: { name: string; value: string; category?: string; notes?: string },
  userName?: string
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const encryptedValue = encrypt(args.value);

  await db.insert(vaultItems).values({
    teamOwnerId: userId,
    createdByUserId: userId,
    name: args.name,
    encryptedValue,
    credentialType: args.category || "other",
    notes: args.notes || null,
  });

  return {
    success: true,
    data: {
      message: `Vault entry "${args.name}" created successfully.`,
      category: args.category || "other",
    },
  };
}

async function execSaveCredential(
  userId: number,
  args: { providerId: string; providerName: string; keyType: string; value: string; label?: string },
  userName?: string,
  userEmail?: string
): Promise<ToolExecutionResult> {
  if (!args.value || !args.value.trim()) {
    return { success: false, error: "Credential value cannot be empty" };
  }
  if (!args.providerId || !args.providerName || !args.keyType) {
    return { success: false, error: "Provider ID, provider name, and key type are required" };
  }

  const trimmedValue = args.value.trim();
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  try {
    // ── Map provider IDs to userSecrets secretType ──────────────────
    // This ensures every token is stored in userSecrets so ALL systems
    // (Builder, Deploy, Replicate, etc.) can find them.
    const secretTypeMap: Record<string, string> = {
      github: "github_pat",
      openai: "openai_api_key",
      anthropic: "anthropic_api_key",
      stripe: "stripe_secret_key",
      sendgrid: "sendgrid_api_key",
      twilio: "twilio_auth_token",
      aws: "aws_access_key",
      cloudflare: "cloudflare_api_token",
      heroku: "heroku_api_key",
      digitalocean: "digitalocean_api_token",
      firebase: "firebase_api_key",
      google_cloud: "google_cloud_api_key",
      huggingface: "huggingface_api_token",
      discord: "discord_bot_token",
      slack: "slack_bot_token",
      vercel: "vercel_api_token",
      netlify: "netlify_api_token",
      railway: "railway_api_token",
      supabase: "supabase_api_key",
      replicate: "replicate_api_token",
      // Marketing channels (vault-bridge compatible)
      devto: "devto_api_key",
      hashnode: "hashnode_api_key",
      medium: "medium_access_token",
      telegram: "telegram_bot_token",
      mastodon: "mastodon_access_token",
      tiktok: "tiktok_access_token",
      pinterest: "pinterest_access_token",
      meta: "meta_access_token",
      google_ads: "google_ads_dev_token",
      whatsapp: "whatsapp_access_token",
      youtube: "youtube_api_key",
      skool: "skool_api_key",
      reddit: "reddit_client_id",
      linkedin: "linkedin_access_token",
      x: "x_api_key",
      twitter: "x_api_key",
      snapchat: "snapchat_access_token",
      indiehackers: "indiehackers_username",
    };

    let validationMessage = "";
    let maskedValue = trimmedValue.length > 8
      ? `${trimmedValue.slice(0, 4)}...${trimmedValue.slice(-4)}`
      : "****";

    // ── Special handling: GitHub PAT validation ─────────────────────
    if (args.providerId === "github" || trimmedValue.startsWith("ghp_") || trimmedValue.startsWith("github_pat_")) {
      try {
        const testResp = await fetch("https://api.github.com/user", {
          headers: { Authorization: `token ${trimmedValue}`, "User-Agent": "ArchibaldTitan" },
          signal: AbortSignal.timeout(10000),
        });
        if (testResp.ok) {
          const userData = await testResp.json() as any;
          const ghUsername = userData.login || "unknown";
          maskedValue = `ghp_...${trimmedValue.slice(-4)} (${ghUsername})`;
          validationMessage = ` Validated against GitHub API — connected as @${ghUsername}.`;
        } else {
          validationMessage = ` Warning: GitHub returned ${testResp.status} — token may be invalid or expired. Saved anyway.`;
        }
      } catch {
        validationMessage = " Could not validate against GitHub API — saved anyway.";
      }
      // Force correct provider ID for GitHub tokens
      args.providerId = "github";
      args.providerName = "GitHub";
      args.keyType = "personal_access_token";
    }

    // ── Special handling: OpenAI key validation ─────────────────────
    if (args.providerId === "openai" || trimmedValue.startsWith("sk-")) {
      validationMessage = validationMessage || " OpenAI key detected.";
      args.providerId = args.providerId || "openai";
      args.providerName = args.providerName || "OpenAI";
      args.keyType = args.keyType || "api_key";
    }

    // ── 1. Save to userSecrets (primary vault — used by Builder, Deploy, etc.) ──
    const secretType = secretTypeMap[args.providerId] || `${args.providerId}_${args.keyType}`;
    const encryptedValue = encrypt(trimmedValue);
    const label = args.label || `${args.providerName} ${args.keyType} (via chat)`;
    const displayLabel = maskedValue || label;
    let savedToUserSecrets = false;

    try {
      const existing = await db
        .select({ id: userSecrets.id })
        .from(userSecrets)
        .where(
          and(
            eq(userSecrets.userId, userId),
            eq(userSecrets.secretType, secretType)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Don't set updatedAt — MySQL ON UPDATE CURRENT_TIMESTAMP handles it
        await db
          .update(userSecrets)
          .set({ encryptedValue, label: displayLabel })
          .where(eq(userSecrets.id, existing[0].id));
      } else {
        await db.insert(userSecrets).values({
          userId,
          secretType,
          encryptedValue,
          label: displayLabel,
        });
      }
      savedToUserSecrets = true;
    } catch (secretErr: unknown) {
      // If drizzle ORM fails, try raw SQL as fallback
      try {
        await db.execute(
          sql`INSERT INTO user_secrets (userId, secretType, encryptedValue, label)
              VALUES (${userId}, ${secretType}, ${encryptedValue}, ${displayLabel})
              ON DUPLICATE KEY UPDATE encryptedValue = VALUES(encryptedValue), label = VALUES(label)`
        );
        savedToUserSecrets = true;
      } catch {
        // Log but don't fail — we'll try fetcher credentials next
        console.error("[save_credential] userSecrets save failed:", getErrorMessage(secretErr));
      }
    }

    // ── 2. Also save to fetcher credentials (for the Fetcher system) ──
    let savedToFetcher = false;
    try {
      await storeManualCredential(
        userId,
        args.providerId,
        args.providerName,
        args.keyType,
        trimmedValue,
        args.label,
      );
      savedToFetcher = true;
    } catch {
      // Fetcher credential storage is best-effort
    }

    // At least one vault must succeed
    if (!savedToUserSecrets && !savedToFetcher) {
      return { success: false, error: "Failed to save credential to any vault. Please try again or save manually at /fetcher/credentials." };
    }

    // ── Audit log ──────────────────────────────────────────────────
    try {
      await logAudit({
        userId,
        action: "credential.manual_save",
        resource: `${args.providerName} (${args.keyType})`,
        details: { method: "chat", provider: args.providerName, keyType: args.keyType, secretType, label: label, savedToUserSecrets, savedToFetcher },
        ipAddress: "chat",
        userAgent: "Titan Assistant",
      });
    } catch { /* audit logging is best-effort */ }

    const storedIn: string[] = [];
    if (savedToUserSecrets) storedIn.push("System Vault (Builder/Deploy/System)");
    if (savedToFetcher) storedIn.push("Fetcher Vault");

    // ── 3. Refresh vault bridge so marketing channels pick up the new token immediately ──
    let vaultBridgeRefreshed = false;
    try {
      const bridgeResult = await runVaultBridge(true); // force=true to pick up the new token
      vaultBridgeRefreshed = bridgeResult.patched.length > 0;
      if (vaultBridgeRefreshed) {
        storedIn.push(`Vault Bridge (patched ${bridgeResult.patched.join(", ")} into ENV)`);
      }
    } catch { /* vault bridge is best-effort */ }

    return {
      success: true,
      data: {
        message: `Credential saved successfully! Your ${args.providerName} ${args.keyType} has been encrypted with AES-256-GCM and stored securely.${validationMessage}`,
        provider: args.providerName,
        keyType: args.keyType,
        secretType,
        label: displayLabel,
        storedIn,
        tip: "I can now access this token for any operation that needs it — Builder, Deploy, Fetcher, etc. You can also view your credentials at /fetcher/credentials or /account.",
        vaultBridgeRefreshed,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Failed to save credential: ${getErrorMessage(err)}` };
  }
}

async function execTriggerBulkSync(userId: number, providerIds?: string[]): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const providers = providerIds || Object.keys(PROVIDERS);
  const providerNames = providers.map((id) => PROVIDERS[id]?.name || id);

  await db.insert(bulkSyncJobs).values({
    userId,
    status: "queued",
    totalProviders: providers.length,
    completedProviders: 0,
    failedProviders: 0,
  });

  return {
    success: true,
    data: {
      message: `Bulk sync triggered for ${providers.length} providers: ${providerNames.join(", ")}.`,
      tip: "Note: Bulk sync requires saved provider credentials. Check status with get_bulk_sync_status.",
    },
  };
}

async function execGetBulkSyncStatus(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const jobs = await db
    .select()
    .from(bulkSyncJobs)
    .where(eq(bulkSyncJobs.userId, userId))
    .orderBy(desc(bulkSyncJobs.createdAt))
    .limit(5);

  return {
    success: true,
    data: {
      count: jobs.length,
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        totalProviders: j.totalProviders,
        completedProviders: j.completedProviders,
        failedProviders: j.failedProviders,
        createdAt: j.createdAt,
      })),
    },
  };
}

async function execListTeamMembers(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      inviteEmail: teamMembers.inviteEmail,
      inviteStatus: teamMembers.inviteStatus,
      joinedAt: teamMembers.joinedAt,
      createdAt: teamMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamOwnerId, userId))
    .orderBy(desc(teamMembers.createdAt));

  return {
    success: true,
    data: {
      count: members.length,
      members: members.map((m) => ({
        id: m.id,
        name: m.userName || m.inviteEmail || "Unknown",
        email: m.userEmail || m.inviteEmail,
        role: m.role,
        status: m.inviteStatus,
        joinedAt: m.joinedAt,
      })),
    },
  };
}

async function execAddTeamMember(
  userId: number,
  args: { email: string; role?: string },
  userName?: string,
  userEmail?: string
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Find user by email
  const targetUser = await db
    .select()
    .from(users)
    .where(eq(users.email, args.email))
    .limit(1);

  if (targetUser.length === 0) {
    return { success: false, error: `No user found with email "${args.email}". They must sign up first.` };
  }

  const target = targetUser[0];
  if (target.id === userId) {
    return { success: false, error: "You cannot add yourself to your team." };
  }

  // Check if already a member
  const existing = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamOwnerId, userId), eq(teamMembers.userId, target.id)))
    .limit(1);

  if (existing.length > 0) {
    return { success: false, error: "This user is already a team member." };
  }

  const role = (args.role || "member") as "admin" | "member" | "viewer";
  await db.insert(teamMembers).values({
    teamOwnerId: userId,
    userId: target.id,
    role,
    invitedByUserId: userId,
    inviteEmail: args.email,
    inviteStatus: "accepted",
  });

  await logAudit({
    userId,
    userName: userName || undefined,
    userEmail: userEmail || undefined,
    action: "team.addMember",
    resource: "teamMember",
    details: { email: args.email, role, source: "titan_assistant" },
  });

  return {
    success: true,
    data: { message: `${target.name || args.email} added to team as ${role}.` },
  };
}

async function execRemoveTeamMember(
  userId: number,
  memberId: number,
  userName?: string,
  userEmail?: string
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const member = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamOwnerId, userId)))
    .limit(1);

  if (member.length === 0) {
    return { success: false, error: "Team member not found." };
  }

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamOwnerId, userId)));

  await logAudit({
    userId,
    userName: userName || undefined,
    userEmail: userEmail || undefined,
    action: "team.removeMember",
    resource: "teamMember",
    resourceId: memberId.toString(),
    details: { source: "titan_assistant" },
  });

  return { success: true, data: { message: `Team member #${memberId} removed.` } };
}

async function execUpdateTeamMemberRole(
  userId: number,
  args: { memberId: number; role: string },
  userName?: string,
  userEmail?: string
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const newRole = args.role as "admin" | "member" | "viewer";
  await db
    .update(teamMembers)
    .set({ role: newRole })
    .where(and(eq(teamMembers.id, args.memberId), eq(teamMembers.teamOwnerId, userId)));

  await logAudit({
    userId,
    userName: userName || undefined,
    userEmail: userEmail || undefined,
    action: "team.updateRole",
    resource: "teamMember",
    resourceId: args.memberId.toString(),
    details: { newRole: args.role, source: "titan_assistant" },
  });

  return { success: true, data: { message: `Team member #${args.memberId} role updated to ${args.role}.` } };
}

async function execListSchedules(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const schedules = await db
    .select()
    .from(syncSchedules)
    .where(eq(syncSchedules.userId, userId))
    .orderBy(desc(syncSchedules.createdAt));

  return {
    success: true,
    data: {
      count: schedules.length,
      schedules: schedules.map((s: any) => ({
        id: s.id,
        name: s.name,
        frequency: s.frequency,
        providerIds: s.providerIds,
        enabled: s.enabled,
        lastRunAt: s.lastRunAt,
        nextRunAt: s.nextRunAt,
        createdAt: s.createdAt,
      })),
    },
  };
}

async function execCreateSchedule(
  userId: number,
  args: { name: string; providerIds: string[]; frequency: string }
): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  // Calculate next run
  const frequencyMs: Record<string, number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    biweekly: 14 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const freq = args.frequency as "daily" | "weekly" | "biweekly" | "monthly";
  const nextRunAt = new Date(Date.now() + (frequencyMs[freq] || frequencyMs.daily));

  await db.insert(syncSchedules).values({
    userId,
    name: args.name,
    frequency: freq,
    providerIds: args.providerIds,
    timeOfDay: "09:00",
    enabled: 1,
    nextRunAt,
  });

  return {
    success: true,
    data: {
      message: `Schedule "${args.name}" created. Will run ${args.frequency} for ${args.providerIds.length} providers.`,
      nextRunAt,
    },
  };
}

async function execDeleteSchedule(userId: number, scheduleId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  await db
    .delete(syncSchedules)
    .where(and(eq(syncSchedules.id, scheduleId), eq(syncSchedules.userId, userId)));

  return { success: true, data: { message: `Schedule #${scheduleId} deleted.` } };
}

async function execGetWatchdogSummary(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const watches = await db
    .select()
    .from(credentialWatches)
    .where(eq(credentialWatches.userId, userId));

  const now = new Date();
  const expiringSoon = watches.filter((w) => {
    const daysUntil = Math.ceil(
      (new Date(w.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    return daysUntil > 0 && daysUntil <= w.alertDaysBefore;
  });
  const expired = watches.filter((w) => new Date(w.expiresAt).getTime() <= now.getTime());
  const healthy = watches.filter((w) => {
    const daysUntil = Math.ceil(
      (new Date(w.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    return daysUntil > w.alertDaysBefore;
  });

  return {
    success: true,
    data: {
      totalWatches: watches.length,
      healthy: healthy.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
      details: expiringSoon.map((w) => ({
        id: w.id,
        credentialId: w.credentialId,
        expiresAt: w.expiresAt,
        daysRemaining: Math.ceil(
          (new Date(w.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        ),
      })),
    },
  };
}

async function execCheckProviderHealth(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const snapshots = await db
    .select()
    .from(providerHealthSnapshots)
    .where(eq(providerHealthSnapshots.userId, userId))
    .orderBy(desc(providerHealthSnapshots.createdAt));

  // Group by provider, take latest
  const providerMap = new Map<string, any>();
  for (const s of snapshots) {
    if (!providerMap.has(s.providerId)) {
      providerMap.set(s.providerId, s);
    }
  }

  const providers = Array.from(providerMap.values()).map((s: any) => ({
    providerId: s.providerId,
    name: PROVIDERS[s.providerId]?.name || s.providerId,
    status: s.status,
    successRate: s.successRate,
    avgResponseTime: s.avgResponseTime,
    lastChecked: s.createdAt,
  }));

  return {
    success: true,
    data: {
      totalProviders: providers.length,
      online: providers.filter((p) => p.status === "online").length,
      degraded: providers.filter((p) => p.status === "degraded").length,
      offline: providers.filter((p) => p.status === "offline").length,
      providers,
    },
  };
}

async function execGetRecommendations(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const recs = await db
    .select()
    .from(fetchRecommendations)
    .where(and(eq(fetchRecommendations.userId, userId), eq(fetchRecommendations.dismissed, 0)))
    .orderBy(desc(fetchRecommendations.createdAt))
    .limit(10);

  return {
    success: true,
    data: {
      count: recs.length,
      recommendations: recs.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        priority: r.priority,
        actionLabel: r.actionLabel,
      })),
    },
  };
}

async function execGetAuditLogs(args: { action?: string; limit?: number }): Promise<ToolExecutionResult> {
  const result = await queryAuditLogs({
    action: args.action,
    limit: args.limit || 20,
    offset: 0,
  });

  return {
    success: true,
    data: {
      total: result.total,
      entries: result.logs.map((l: any) => ({
        id: l.id,
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId,
        userName: l.userName,
        userEmail: l.userEmail,
        details: l.details,
        createdAt: l.createdAt,
      })),
    },
  };
}

async function execActivateKillSwitch(userId: number, code: string): Promise<ToolExecutionResult> {
  const success = await activateKS(userId, code);
  if (success) {
    return {
      success: true,
      data: { message: "KILL SWITCH ACTIVATED. All running jobs and automations have been halted immediately." },
    };
  }
  return { success: false, error: "Invalid kill switch code. Please check your code and try again." };
}

async function execGetSystemStatus(userId: number): Promise<ToolExecutionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const plan = await getUserPlan(userId);

  // Credential count
  const creds = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fetcherCredentials)
    .where(eq(fetcherCredentials.userId, userId));

  // Job count
  const jobs = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fetcherJobs)
    .where(eq(fetcherJobs.userId, userId));

  // Proxy count
  const proxies = await db
    .select({
      total: sql<number>`COUNT(*)`,
      healthy: sql<number>`SUM(CASE WHEN healthy = 1 THEN 1 ELSE 0 END)`,
    })
    .from(fetcherProxies)
    .where(eq(fetcherProxies.userId, userId));

  // Watchdog
  const watches = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(credentialWatches)
    .where(eq(credentialWatches.userId, userId));

  // API keys
  const keys = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  // ─── Autonomous Systems Status ──────────────────────────────────
  let autonomousStatus = null;
  try {
    const { getAutonomousSystemStatus } = await import("./autonomous-sync");
    autonomousStatus = await getAutonomousSystemStatus();
  } catch {
    // Non-critical — module may not be loaded yet
  }

  return {
    success: true,
    data: {
      plan: { id: plan.planId, name: plan.tier.name, status: plan.status },
      credentials: creds[0].count,
      totalJobs: jobs[0].count,
      proxies: { total: proxies[0].total, healthy: proxies[0].healthy || 0 },
      watchdogAlerts: watches[0].count,
      activeApiKeys: keys[0].count,
      autonomousSystems: autonomousStatus ? {
        summary: autonomousStatus.summary,
        systems: autonomousStatus.systems.map((s: any) => ({
          name: s.name,
          category: s.category,
          status: s.status,
          schedule: s.schedule,
          reason: s.reason,
        })),
        channels: autonomousStatus.channels.map((c: any) => ({
          channel: c.channel,
          configured: c.configured,
          impact: c.impact,
          freeToSetup: c.freeToSetup,
          envVars: c.envVars,
          setupUrl: c.setupUrl,
        })),
        recommendations: autonomousStatus.recommendations,
      } : "Autonomous sync module not loaded yet",
    },
  };
}

async function execGetPlanUsage(userId: number): Promise<ToolExecutionResult> {
  const plan = await getUserPlan(userId);
  return {
    success: true,
    data: {
      planId: plan.planId,
      planName: plan.tier.name,
      status: plan.status,
      isActive: plan.isActive,
      limits: plan.tier.limits,
      features: plan.tier.features,
    },
  };
}


// ─── Self-Improvement Executor Functions ─────────────────────────────

function execSelfReadFile(filePath: string): ToolExecutionResult {
  if (!filePath) return { success: false, error: "filePath is required" };
  const result = selfReadFileImpl(filePath);
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: {
      filePath,
      content: result.content,
      length: result.content?.length || 0,
    },
  };
}

function execSelfListFiles(dirPath: string): ToolExecutionResult {
  if (!dirPath) return { success: false, error: "dirPath is required" };
  const result = selfListFilesImpl(dirPath);
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: {
      directory: dirPath,
      files: result.files,
      count: result.files?.length || 0,
    },
  };
}

async function execSelfModifyFile(
  userId: number,
  args: { filePath: string; action: "modify" | "create" | "delete" | "patch"; content?: string; patches?: Array<{ search: string; replace: string }>; description: string },
  userName?: string
): Promise<ToolExecutionResult> {
  if (!args.filePath || !args.action || !args.description) {
    return { success: false, error: "filePath, action, and description are required" };
  }

  // Handle patch action — apply search-and-replace patches to existing file
  if (args.action === "patch") {
    if (!args.patches || args.patches.length === 0) {
      return { success: false, error: "patches array is required for patch action. Each patch needs {search, replace}." };
    }
    // Read the current file content
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.join(process.cwd(), args.filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${args.filePath}. Use 'create' action for new files.` };
    }
    let content = fs.readFileSync(fullPath, "utf-8");
    const patchResults: string[] = [];

    // Helper: normalize whitespace for fuzzy matching
    const normalizeWS = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();

    // Helper: try to find the search text with flexible whitespace matching
    const fuzzyFind = (haystack: string, needle: string): { start: number; end: number } | null => {
      // 1. Exact match first
      const exactIdx = haystack.indexOf(needle);
      if (exactIdx !== -1) return { start: exactIdx, end: exactIdx + needle.length };

      // 2. Try trimmed match (LLM often adds/removes leading/trailing whitespace)
      const trimmedNeedle = needle.trim();
      const trimmedIdx = haystack.indexOf(trimmedNeedle);
      if (trimmedIdx !== -1) return { start: trimmedIdx, end: trimmedIdx + trimmedNeedle.length };

      // 3. Try normalized whitespace match
      const normHaystack = normalizeWS(haystack);
      const normNeedle = normalizeWS(needle);
      const normIdx = normHaystack.indexOf(normNeedle);
      if (normIdx !== -1) {
        // Map back to original positions by finding the closest match
        // Search for the first line of the needle in the original
        const firstLine = needle.trim().split("\n")[0].trim();
        const lineIdx = haystack.indexOf(firstLine);
        if (lineIdx !== -1) {
          // Find the last line to determine the end
          const lastLine = needle.trim().split("\n").pop()?.trim() || firstLine;
          const lastLineIdx = haystack.indexOf(lastLine, lineIdx);
          if (lastLineIdx !== -1) {
            return { start: lineIdx, end: lastLineIdx + lastLine.length };
          }
          return { start: lineIdx, end: lineIdx + firstLine.length };
        }
      }

      // 4. Try matching just the first significant line (for single-line searches like tag names)
      const significantLines = needle.trim().split("\n").map(l => l.trim()).filter(l => l.length > 3);
      if (significantLines.length === 1) {
        const singleIdx = haystack.indexOf(significantLines[0]);
        if (singleIdx !== -1) return { start: singleIdx, end: singleIdx + significantLines[0].length };
      }

      return null;
    };

    for (let i = 0; i < args.patches.length; i++) {
      const patch = args.patches[i];
      const match = fuzzyFind(content, patch.search);
      if (!match) {
        patchResults.push(`Patch ${i + 1}: FAILED — search text not found in file. Make sure the search text matches exactly (including whitespace).`);
        continue;
      }
      // Replace the matched region with the replacement text
      content = content.substring(0, match.start) + patch.replace + content.substring(match.end);
      patchResults.push(`Patch ${i + 1}: Applied successfully`);
    }
    const failedPatches = patchResults.filter(r => r.includes("FAILED"));
    if (failedPatches.length === args.patches.length) {
      return { success: false, error: `All ${args.patches.length} patches failed:\n${patchResults.join("\n")}` };
    }
    // Now apply the patched content as a modify action
    args.action = "modify";
    args.content = content;
  }

  if ((args.action === "modify" || args.action === "create") && !args.content) {
    return { success: false, error: "content is required for modify/create actions" };
  }

  const result = await applyModificationsDeferred(
    [
      {
        filePath: args.filePath,
        action: args.action as "modify" | "create" | "delete",
        content: args.content,
        description: args.description,
      },
    ],
    userId,
    userName || "titan_assistant"
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      data: {
        validationErrors: result.validationResult?.errors,
        validationWarnings: result.validationResult?.warnings,
        rolledBack: result.rolledBack,
        healthCheckPassed: result.healthCheckPassed,
      },
    };
  }

  return {
    success: true,
    data: {
      snapshotId: result.snapshotId,
      modifications: result.modifications,
      healthCheckPassed: result.healthCheckPassed,
      message: `Successfully ${args.action === "create" ? "created" : args.action === "delete" ? "deleted" : "modified"} ${args.filePath}. Snapshot #${result.snapshotId} saved for rollback if needed.`,
    },
  };
}

async function execSelfHealthCheck(options?: {
  skipTests?: boolean;
  skipTypeCheck?: boolean;
}): Promise<ToolExecutionResult> {
  const health = await runQuickHealthCheck(options);
  return {
    success: true,
    data: {
      healthy: health.healthy,
      checks: health.checks,
      summary: health.healthy
        ? "All systems operational"
        : `${health.checks.filter((c) => !c.passed).length} issue(s) detected`,
    },
  };
}

async function execSelfRollback(
  userId: number,
  snapshotId?: number,
  userName?: string
): Promise<ToolExecutionResult> {
  if (snapshotId) {
    const result = await rollbackToSnapshot(snapshotId);
    return {
      success: result.success,
      data: {
        snapshotId,
        filesRestored: result.filesRestored,
        message: result.success
          ? `Rolled back to snapshot #${snapshotId}. ${result.filesRestored} file(s) restored.`
          : undefined,
      },
      error: result.error,
    };
  }

  // Roll back to last known good
  const result = await rollbackToLastGood();
  return {
    success: result.success,
    data: {
      snapshotId: result.snapshotId,
      filesRestored: result.filesRestored,
      message: result.success
        ? `Rolled back to last known good snapshot #${result.snapshotId}. ${result.filesRestored} file(s) restored.`
        : undefined,
    },
    error: result.error,
  };
}

async function execSelfRestart(
  userId: number,
  reason: string
): Promise<ToolExecutionResult> {
  if (!reason) {
    return { success: false, error: "A reason for the restart is required" };
  }

  // In deferred mode, stage the restart for after flush
  if (isDeferredMode()) {
    stageRestart(reason, userId);
    return {
      success: true,
      data: { message: "Restart staged — will execute after all changes are flushed to disk." },
    };
  }

  const result = await requestRestart(reason, userId);
  return {
    success: result.success,
    data: { message: result.message },
    error: result.success ? undefined : result.message,
  };
}

async function execSelfModificationHistory(
  limit?: number
): Promise<ToolExecutionResult> {
  const result = await getModificationHistory(limit || 20);
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: {
      count: result.entries?.length || 0,
      entries: result.entries,
    },
  };
}

function execSelfGetProtectedFiles(): ToolExecutionResult {
  return {
    success: true,
    data: {
      protectedFiles: getProtectedFiles(),
      allowedDirectories: getAllowedDirectories(),
      message:
        "Protected files cannot be modified by the self-improvement engine. Only files in allowed directories can be changed.",
    },
  };
}


// ─── Builder Tool Executor Functions ─────────────────────────────────

async function execSelfTypeCheck(userId?: number): Promise<ToolExecutionResult> {
  const start = Date.now();
  const result = await runTypeCheck();
  const durationMs = Date.now() - start;
  const summary = result.passed
    ? "TypeScript: 0 errors — all types are valid"
    : `TypeScript: ${result.errorCount} error(s) found`;

  // Log to builder_activity_log
  try {
    const db = await getDb();
    if (db) {
      await db.insert(builderActivityLog).values({
        userId: userId ?? 0,
        tool: "self_type_check",
        status: result.passed ? "success" : "failure",
        summary,
        durationMs,
        details: { errorCount: result.errorCount, output: result.output?.slice(0, 2000) },
      });
    }
  } catch (e) { /* non-critical */ }

  return {
    success: true,
    data: {
      passed: result.passed,
      errorCount: result.errorCount,
      output: result.output,
      summary,
    },
  };
}

async function execSelfRunTests(
  testPattern?: string,
  userId?: number
): Promise<ToolExecutionResult> {
  const start = Date.now();
  const result = await runTests(testPattern);
  const durationMs = Date.now() - start;
  const summary = result.passed
    ? `Tests: all ${result.totalTests} passed`
    : `Tests: ${result.failedTests} of ${result.totalTests} failed`;

  // Log to builder_activity_log
  try {
    const db = await getDb();
    if (db) {
      await db.insert(builderActivityLog).values({
        userId: userId ?? 0,
        tool: "self_run_tests",
        status: result.passed ? "success" : "failure",
        summary,
        durationMs,
        details: { totalTests: result.totalTests, failedTests: result.failedTests, pattern: testPattern },
      });
    }
  } catch (e) { /* non-critical */ }

  return {
    success: true,
    data: {
      passed: result.passed,
      totalTests: result.totalTests,
      failedTests: result.failedTests,
      output: result.output,
      summary,
    },
  };
}

// ─── Professional Builder Executor Functions ─────────────────────────

const PROJ_ROOT = process.cwd();

async function execSelfDependencyAudit(
  focus?: string
): Promise<ToolExecutionResult> {
  try {
    const pkgPath = path.join(PROJ_ROOT, "package.json");
    if (!fs.existsSync(pkgPath)) {
      return { success: false, error: "No package.json found in project root" };
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const totalDeps = Object.keys(deps).length;

    // Security patterns to flag
    const securityFlags: Array<{ pkg: string; issue: string; severity: string }> = [];
    const knownRisky = [
      { pattern: /^node-ipc$/i, issue: "Known supply-chain attack vector (protestware)", severity: "critical" },
      { pattern: /^event-stream$/i, issue: "Historical supply-chain compromise", severity: "high" },
      { pattern: /^colors$/i, issue: "Historical protestware incident", severity: "medium" },
      { pattern: /^faker$/i, issue: "Historical protestware incident", severity: "medium" },
    ];
    for (const [name] of Object.entries(deps)) {
      for (const risky of knownRisky) {
        if (risky.pattern.test(name)) {
          securityFlags.push({ pkg: name, issue: risky.issue, severity: risky.severity });
        }
      }
    }

    // Check for wildcard or git versions (risky)
    const riskyVersions: Array<{ pkg: string; version: string; issue: string }> = [];
    for (const [name, version] of Object.entries(deps)) {
      const v = version as string;
      if (v === "*" || v === "latest") {
        riskyVersions.push({ pkg: name, version: v, issue: "Wildcard version — unpinned, could break on any update" });
      } else if (v.startsWith("git") || v.startsWith("http") || v.includes("github")) {
        riskyVersions.push({ pkg: name, version: v, issue: "Git/URL dependency — not auditable via npm registry" });
      } else if (!v.match(/^[\^~]?\d/)) {
        riskyVersions.push({ pkg: name, version: v, issue: "Non-standard version specifier" });
      }
    }

    // Run npm audit if available
    let auditResult: string | null = null;
    try {
      const output = execSync("npm audit --json 2>/dev/null", { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 15000 });
      const audit = JSON.parse(output);
      const vulns = audit.metadata?.vulnerabilities || {};
      auditResult = `critical: ${vulns.critical || 0}, high: ${vulns.high || 0}, moderate: ${vulns.moderate || 0}, low: ${vulns.low || 0}`;
    } catch (e: unknown) {
      // npm audit returns non-zero when vulns found, parse anyway
      try {
        const audit = JSON.parse((e as any).stdout || "{}");
        const vulns = audit.metadata?.vulnerabilities || {};
        auditResult = `critical: ${vulns.critical || 0}, high: ${vulns.high || 0}, moderate: ${vulns.moderate || 0}, low: ${vulns.low || 0}`;
      } catch { auditResult = "npm audit unavailable"; }
    }

    // Check for outdated lockfile
    const lockExists = fs.existsSync(path.join(PROJ_ROOT, "package-lock.json")) || fs.existsSync(path.join(PROJ_ROOT, "pnpm-lock.yaml"));

    return {
      success: true,
      data: {
        totalDependencies: totalDeps,
        productionDeps: Object.keys(pkg.dependencies || {}).length,
        devDeps: Object.keys(pkg.devDependencies || {}).length,
        securityFlags: securityFlags.length > 0 ? securityFlags : "No known risky packages detected",
        riskyVersions: riskyVersions.length > 0 ? riskyVersions : "All versions properly pinned",
        npmAudit: auditResult,
        lockfilePresent: lockExists,
        nodeEngine: pkg.engines?.node || "not specified",
        summary: `${totalDeps} dependencies audited. ${securityFlags.length} security flags, ${riskyVersions.length} risky versions.`,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Dependency audit failed: ${getErrorMessage(err)}` };
  }
}

async function execSelfGrepCodebase(
  pattern: string,
  filePattern?: string,
  maxResults?: number
): Promise<ToolExecutionResult> {
  try {
    const limit = Math.min(maxResults || 50, 100);
    const include = filePattern ? `--include='${filePattern}'` : "--include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' --include='*.css' --include='*.md'";
    const cmd = `grep -rn ${include} --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git -E '${pattern.replace(/'/g, "'\\''")}' . | head -${limit}`;
    const output = execSync(cmd, { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 10000 }).trim();
    const lines = output ? output.split("\n") : [];
    const results = lines.map(line => {
      const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
      if (match) return { file: match[1], line: parseInt(match[2]), content: match[3].trim() };
      return { file: "unknown", line: 0, content: line };
    });
    return {
      success: true,
      data: {
        pattern,
        matchCount: results.length,
        truncated: results.length >= limit,
        results,
      },
    };
  } catch (err: unknown) {
    // grep returns exit code 1 when no matches found
    if ((err as any).status === 1) {
      return { success: true, data: { pattern, matchCount: 0, results: [], message: "No matches found" } };
    }
    return { success: false, error: `Grep failed: ${getErrorMessage(err)}` };
  }
}

async function execSelfGitDiff(
  filePath?: string,
  staged?: boolean
): Promise<ToolExecutionResult> {
  try {
    const stagedFlag = staged ? "--cached" : "";
    const fileArg = filePath ? `-- ${filePath}` : "";
    const diffCmd = `git diff ${stagedFlag} --stat ${fileArg} 2>/dev/null`;
    const stat = execSync(diffCmd, { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    const fullDiffCmd = `git diff ${stagedFlag} ${fileArg} 2>/dev/null | head -500`;
    const diff = execSync(fullDiffCmd, { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    // Get status
    const statusCmd = `git status --porcelain ${fileArg} 2>/dev/null`;
    const status = execSync(statusCmd, { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 5000 }).trim();
    const changedFiles = status ? status.split("\n").map(l => ({
      status: l.substring(0, 2).trim(),
      file: l.substring(3),
    })) : [];
    return {
      success: true,
      data: {
        changedFiles,
        fileCount: changedFiles.length,
        stat: stat || "No changes",
        diff: diff || "No diff available",
        truncated: diff.split("\n").length >= 500,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Git diff failed: ${getErrorMessage(err)}` };
  }
}

async function execSelfEnvCheck(): Promise<ToolExecutionResult> {
  try {
    // Define required env vars by service category
    const envChecks: Record<string, { vars: string[]; critical: boolean }> = {
      database: { vars: ["DATABASE_URL"], critical: true },
      auth: { vars: ["SESSION_SECRET", "JWT_SECRET"], critical: true },
      github: { vars: ["GITHUB_PAT", "GITHUB_REPO"], critical: false },
      stripe: { vars: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"], critical: false },
      openai: { vars: ["OPENAI_API_KEY"], critical: false },
      email: { vars: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"], critical: false },
      binance: { vars: ["BINANCE_PAY_API_KEY", "BINANCE_PAY_SECRET_KEY"], critical: false },
      google: { vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], critical: false },
      server: { vars: ["PORT", "NODE_ENV"], critical: false },
    };

    const results: Record<string, { status: string; missing: string[]; set: string[] }> = {};
    let criticalMissing = 0;
    let totalMissing = 0;
    let totalSet = 0;

    for (const [service, config] of Object.entries(envChecks)) {
      const missing: string[] = [];
      const set: string[] = [];
      for (const v of config.vars) {
        if (process.env[v] && process.env[v]!.length > 0) {
          set.push(v);
          totalSet++;
        } else {
          missing.push(v);
          totalMissing++;
          if (config.critical) criticalMissing++;
        }
      }
      results[service] = {
        status: missing.length === 0 ? "\u2705 configured" : config.critical ? "\u274c CRITICAL — missing" : "\u26a0\ufe0f optional — missing",
        missing,
        set: set.map(v => `${v} (${process.env[v]!.length} chars)`), // length only, never the value
      };
    }

    return {
      success: true,
      data: {
        services: results,
        summary: {
          totalChecked: totalSet + totalMissing,
          configured: totalSet,
          missing: totalMissing,
          criticalMissing,
          nodeEnv: process.env.NODE_ENV || "not set",
          platform: process.platform,
          nodeVersion: process.version,
        },
        healthy: criticalMissing === 0,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Env check failed: ${getErrorMessage(err)}` };
  }
}

async function execSelfDbSchemaInspect(
  table?: string
): Promise<ToolExecutionResult> {
  try {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };

    if (table) {
      // Validate table name to prevent SQL injection
      const safeTable = safeSqlIdentifier(table, "table");
      // Inspect specific table
      const [columns] = await db.execute(sql`SHOW COLUMNS FROM ${sql.raw(safeTable)}`) as any;
      const [indexes] = await db.execute(sql`SHOW INDEX FROM ${sql.raw(safeTable)}`) as any;
      const [createStmt] = await db.execute(sql`SHOW CREATE TABLE ${sql.raw(safeTable)}`) as any;
      return {
        success: true,
        data: {
          table,
          columns: Array.isArray(columns) ? columns : [],
          indexes: Array.isArray(indexes) ? indexes : [],
          createStatement: createStmt?.[0]?.["Create Table"] || "unavailable",
        },
      };
    } else {
      // List all tables with row counts
      const [tables] = await db.execute(sql`SHOW TABLES`) as any;
      const tableNames = Array.isArray(tables) ? tables.map((t: any) => Object.values(t)[0] as string) : [];
      const tableInfo: Array<{ name: string; columns: number; rows: string }> = [];
      for (const tName of tableNames.slice(0, 50)) { // cap at 50 tables
        try {
          const safeName = safeSqlIdentifier(tName, "table");
          const [cols] = await db.execute(sql`SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_name = ${tName}`) as any;
          const [rowCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM ${sql.raw(safeName)}`) as any;
          tableInfo.push({
            name: tName,
            columns: cols?.[0]?.cnt || 0,
            rows: String(rowCount?.[0]?.cnt || 0),
          });
        } catch { tableInfo.push({ name: tName, columns: 0, rows: "error" }); }
      }
      return {
        success: true,
        data: {
          tableCount: tableNames.length,
          tables: tableInfo,
        },
      };
    }
  } catch (err: unknown) {
    return { success: false, error: `DB schema inspect failed: ${getErrorMessage(err)}` };
  }
}

async function execSelfCodeStats(
  directory?: string
): Promise<ToolExecutionResult> {
  try {
    const targetDir = directory ? path.join(PROJ_ROOT, directory) : PROJ_ROOT;
    if (!fs.existsSync(targetDir)) {
      return { success: false, error: `Directory not found: ${directory}` };
    }

    // Count files and lines by extension
    const cmd = `find ${targetDir} -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.css' -o -name '*.json' -o -name '*.md' \) -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' | head -1000`;
    const files = execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim().split("\n").filter(Boolean);

    const stats: Record<string, { files: number; lines: number; largest: { file: string; lines: number } }> = {};
    let totalLines = 0;
    let totalFiles = 0;
    const largestFiles: Array<{ file: string; lines: number }> = [];

    for (const file of files) {
      try {
        const ext = path.extname(file) || "other";
        const content = fs.readFileSync(file, "utf-8");
        const lineCount = content.split("\n").length;
        totalLines += lineCount;
        totalFiles++;
        const relPath = path.relative(PROJ_ROOT, file);
        largestFiles.push({ file: relPath, lines: lineCount });

        if (!stats[ext]) stats[ext] = { files: 0, lines: 0, largest: { file: "", lines: 0 } };
        stats[ext].files++;
        stats[ext].lines += lineCount;
        if (lineCount > stats[ext].largest.lines) {
          stats[ext].largest = { file: relPath, lines: lineCount };
        }
      } catch { /* skip unreadable files */ }
    }

    largestFiles.sort((a, b) => b.lines - a.lines);

    // Count functions/exports
    let functionCount = 0;
    let exportCount = 0;
    try {
      const funcCmd = `grep -rn --include='*.ts' --include='*.tsx' -E '(function |const .+ = (async )?\\(|=>)' ${targetDir} --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | wc -l`;
      functionCount = parseInt(execSync(funcCmd, { encoding: "utf-8", timeout: 10000 }).trim()) || 0;
      const exportCmd = `grep -rn --include='*.ts' --include='*.tsx' -E '^export ' ${targetDir} --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | wc -l`;
      exportCount = parseInt(execSync(exportCmd, { encoding: "utf-8", timeout: 10000 }).trim()) || 0;
    } catch { /* non-critical */ }

    return {
      success: true,
      data: {
        directory: directory || "project root",
        totalFiles,
        totalLines,
        byExtension: stats,
        top10LargestFiles: largestFiles.slice(0, 10),
        approximateFunctions: functionCount,
        exports: exportCount,
        summary: `${totalFiles} files, ${totalLines.toLocaleString()} lines of code, ~${functionCount} functions`,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Code stats failed: ${getErrorMessage(err)}` };
  }
}

async function execSelfDeploymentCheck(
  quick?: boolean
): Promise<ToolExecutionResult> {
  try {
    const checks: Array<{ name: string; status: string; passed: boolean; detail?: string }> = [];

    // 1. Environment variables (always)
    const criticalEnvVars = ["DATABASE_URL", "SESSION_SECRET"];
    const missingEnv = criticalEnvVars.filter(v => !process.env[v]);
    checks.push({
      name: "Critical Environment Variables",
      status: missingEnv.length === 0 ? "PASS" : "FAIL",
      passed: missingEnv.length === 0,
      detail: missingEnv.length === 0 ? "All critical env vars set" : `Missing: ${missingEnv.join(", ")}`,
    });

    // 2. Database connectivity (always)
    try {
      const db = await getDb();
      if (db) {
        await db.execute(sql`SELECT 1`);
        checks.push({ name: "Database Connectivity", status: "PASS", passed: true, detail: "Connected successfully" });
      } else {
        checks.push({ name: "Database Connectivity", status: "FAIL", passed: false, detail: "getDb() returned null" });
      }
    } catch (dbErr: unknown) {
      checks.push({ name: "Database Connectivity", status: "FAIL", passed: false, detail: getErrorMessage(dbErr) });
    }

    // 3. TypeScript compilation (always)
    try {
      const tscOutput = execSync("npx tsc --noEmit 2>&1", { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 30000 });
      checks.push({ name: "TypeScript Compilation", status: "PASS", passed: true, detail: "No type errors" });
    } catch (tscErr: unknown) {
      const errorCount = ((tscErr as any).stdout || "").split("\n").filter((l: string) => l.includes("error TS")).length;
      checks.push({ name: "TypeScript Compilation", status: "FAIL", passed: false, detail: `${errorCount} type error(s)` });
    }

    if (!quick) {
      // 4. Package.json validity
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(PROJ_ROOT, "package.json"), "utf-8"));
        checks.push({ name: "Package.json Valid", status: "PASS", passed: true, detail: `${pkg.name}@${pkg.version}` });
      } catch {
        checks.push({ name: "Package.json Valid", status: "FAIL", passed: false, detail: "Invalid or missing package.json" });
      }

      // 5. Critical files exist
      const criticalFiles = ["server/_core/index.ts", "client/src/App.tsx", "drizzle/schema.ts", "server/chat-router.ts"];
      const missingFiles = criticalFiles.filter(f => !fs.existsSync(path.join(PROJ_ROOT, f)));
      checks.push({
        name: "Critical Files Present",
        status: missingFiles.length === 0 ? "PASS" : "FAIL",
        passed: missingFiles.length === 0,
        detail: missingFiles.length === 0 ? `All ${criticalFiles.length} critical files present` : `Missing: ${missingFiles.join(", ")}`,
      });

      // 6. Git status
      try {
        const gitStatus = execSync("git status --porcelain 2>/dev/null", { cwd: PROJ_ROOT, encoding: "utf-8", timeout: 5000 }).trim();
        const uncommitted = gitStatus ? gitStatus.split("\n").length : 0;
        checks.push({
          name: "Git Status",
          status: uncommitted === 0 ? "PASS" : "WARN",
          passed: true, // warning, not failure
          detail: uncommitted === 0 ? "Clean working tree" : `${uncommitted} uncommitted change(s)`,
        });
      } catch {
        checks.push({ name: "Git Status", status: "SKIP", passed: true, detail: "Git not available" });
      }

      // 7. Disk space
      try {
        const df = execSync("df -h / | tail -1", { encoding: "utf-8", timeout: 5000 }).trim();
        const parts = df.split(/\s+/);
        const usePercent = parseInt(parts[4] || "0");
        checks.push({
          name: "Disk Space",
          status: usePercent < 90 ? "PASS" : "WARN",
          passed: usePercent < 95,
          detail: `${parts[4]} used (${parts[3]} available)`,
        });
      } catch { /* skip */ }
    }

    const passed = checks.filter(c => c.passed).length;
    const failed = checks.filter(c => !c.passed).length;
    const allPassed = failed === 0;

    return {
      success: true,
      data: {
        deployReady: allPassed,
        checks,
        summary: allPassed
          ? `\u2705 DEPLOY READY — All ${passed} checks passed`
          : `\u274c NOT READY — ${failed} check(s) failed out of ${checks.length}`,
        recommendation: allPassed
          ? "Safe to deploy. All critical systems verified."
          : "Fix the failing checks before deploying to avoid downtime.",
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Deployment check failed: ${getErrorMessage(err)}` };
  }
}

// ─── Checkpoint Executor Functions ──────────────────────────────

async function execSelfSaveCheckpoint(
  name: string,
  userId: number,
  userName?: string
): Promise<ToolExecutionResult> {
  if (!name || name.trim().length === 0) {
    return { success: false, error: "Checkpoint name is required. Provide a descriptive name like 'before-auth-refactor'." };
  }

  const start = Date.now();
  const result = await saveCheckpoint(name.trim(), userName || "user");
  const durationMs = Date.now() - start;

  // Log to builder_activity_log
  try {
    const db = await getDb();
    if (db) {
      await db.insert(builderActivityLog).values({
        userId,
        tool: "self_save_checkpoint",
        status: result.success ? "success" : "failure",
        summary: result.success
          ? `Checkpoint '${name}' saved — ${result.fileCount} files captured (ID: ${result.snapshotId})`
          : `Checkpoint save failed: ${result.error}`,
        durationMs,
        details: { name, snapshotId: result.snapshotId, fileCount: result.fileCount },
      });
    }
  } catch { /* non-critical */ }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      checkpointId: result.snapshotId,
      name,
      fileCount: result.fileCount,
      message: `\u2705 Checkpoint '${name}' saved successfully. ${result.fileCount} files captured. ID: ${result.snapshotId}. Use self_rollback_to_checkpoint to restore this state.`,
    },
  };
}

async function execSelfListCheckpoints(
  limit?: number
): Promise<ToolExecutionResult> {
  const result = await listCheckpoints(limit || 20);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      count: result.checkpoints?.length || 0,
      checkpoints: result.checkpoints,
      message: result.checkpoints && result.checkpoints.length > 0
        ? `Found ${result.checkpoints.length} checkpoint(s). Use the ID to rollback.`
        : "No checkpoints found. Use self_save_checkpoint to create one.",
    },
  };
}

async function execSelfRollbackToCheckpoint(
  checkpointId: number | undefined,
  userId: number,
  userName?: string
): Promise<ToolExecutionResult> {
  const start = Date.now();
  const result = await rollbackToCheckpoint(checkpointId);
  const durationMs = Date.now() - start;

  // Log to builder_activity_log
  try {
    const db = await getDb();
    if (db) {
      await db.insert(builderActivityLog).values({
        userId,
        tool: "self_rollback_to_checkpoint",
        status: result.success ? "success" : "failure",
        summary: result.success
          ? `Rolled back to checkpoint '${result.name}' (ID: ${result.snapshotId}) — ${result.filesRestored} files restored`
          : `Rollback failed: ${result.error}`,
        durationMs,
        details: { checkpointId, restoredId: result.snapshotId, name: result.name, filesRestored: result.filesRestored },
      });
    }
  } catch { /* non-critical */ }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      checkpointId: result.snapshotId,
      name: result.name,
      filesRestored: result.filesRestored,
      message: `\u2705 Rolled back to checkpoint '${result.name}' (ID: ${result.snapshotId}). ${result.filesRestored} files restored. A backup of the pre-rollback state was saved automatically.`,
    },
  };
}

// ─── Advanced Analysis Executor Functions ───────────────────────────────

async function execSelfAnalyzeFile(filePath: string): Promise<ToolExecutionResult> {
  try {
    const rootDir = process.cwd();
    const fullPath = path.join(rootDir, filePath);
    if (!fs.existsSync(fullPath)) return { success: false, error: `File not found: ${filePath}` };

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    const analysis: any = {
      path: filePath,
      lines: lines.length,
      sizeBytes: Buffer.byteLength(content, "utf-8"),
      imports: [] as string[],
      exports: [] as string[],
      functions: [] as string[],
      classes: [] as string[],
      issues: [] as string[],
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Imports
      if (line.startsWith("import ")) {
        analysis.imports.push(line.length > 100 ? line.slice(0, 100) + "..." : line);
      }

      // Exports
      if (/^export\s+(default\s+)?(function|const|class|type|interface|enum|async)/.test(line)) {
        const match = line.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/);
        if (match) analysis.exports.push(match[1]);
      }

      // Functions
      const funcMatch = line.match(/(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) analysis.functions.push(`${funcMatch[1]} (line ${lineNum})`);
      const arrowMatch = line.match(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/);
      if (arrowMatch) analysis.functions.push(`${arrowMatch[1]} (line ${lineNum})`);

      // Classes
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) analysis.classes.push(`${classMatch[1]} (line ${lineNum})`);

      // Issues detection
      if (line.includes("any") && /:\s*any\b/.test(line)) {
        analysis.issues.push(`Line ${lineNum}: 'any' type — consider using a specific type`);
      }
      if (line.includes("console.log") && !filePath.includes("test")) {
        analysis.issues.push(`Line ${lineNum}: console.log — consider using structured logging`);
      }
      if (line.includes("TODO") || line.includes("FIXME") || line.includes("HACK")) {
        analysis.issues.push(`Line ${lineNum}: ${line.trim().slice(0, 80)}`);
      }
      if (/catch\s*\(\s*\)/.test(line) || /catch\s*\{/.test(line)) {
        analysis.issues.push(`Line ${lineNum}: Empty catch block — errors swallowed silently`);
      }
    }

    // Limit issues to top 20
    if (analysis.issues.length > 20) {
      analysis.issues = [...analysis.issues.slice(0, 20), `... and ${analysis.issues.length - 20} more`];
    }

    return {
      success: true,
      data: {
        ...analysis,
        summary: `${filePath}: ${lines.length} lines, ${analysis.imports.length} imports, ${analysis.exports.length} exports, ${analysis.functions.length} functions, ${analysis.issues.length} potential issues`,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

async function execSelfFindDeadCode(directory?: string): Promise<ToolExecutionResult> {
  try {
    const rootDir = process.cwd();
    const targetDir = directory || "server";
    const fullDir = path.join(rootDir, targetDir);
    if (!fs.existsSync(fullDir)) return { success: false, error: `Directory not found: ${targetDir}` };

    // Collect all exports from all .ts/.tsx files in the target directory
    const exports: Array<{ name: string; file: string; line: number }> = [];
    const allFiles: string[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          allFiles.push(full);
        }
      }
    };
    walk(fullDir);

    // Also scan client and shared for import checking
    const importSearchDirs = ["server", "client/src", "shared"].map(d => path.join(rootDir, d)).filter(d => fs.existsSync(d));
    const allProjectFiles: string[] = [];
    for (const searchDir of importSearchDirs) {
      const walkAll = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
            walkAll(full);
          } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
            allProjectFiles.push(full);
          }
        }
      };
      walkAll(searchDir);
    }

    // Find exports
    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/);
          if (match) {
            exports.push({ name: match[1], file: path.relative(rootDir, file), line: i + 1 });
          }
        }
      } catch { /* skip */ }
    }

    // Check which exports are never imported
    const deadExports: typeof exports = [];
    for (const exp of exports) {
      let found = false;
      for (const projectFile of allProjectFiles) {
        if (projectFile === path.join(rootDir, exp.file)) continue; // skip self
        try {
          const content = fs.readFileSync(projectFile, "utf-8");
          if (content.includes(exp.name)) { found = true; break; }
        } catch { /* skip */ }
      }
      if (!found) deadExports.push(exp);
    }

    return {
      success: true,
      data: {
        scannedDirectory: targetDir,
        totalExports: exports.length,
        deadExports: deadExports.length,
        items: deadExports.slice(0, 50).map(e => `${e.file}:${e.line} — ${e.name}`),
        note: deadExports.length > 50 ? `Showing first 50 of ${deadExports.length} dead exports` : undefined,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

async function execSelfApiMap(): Promise<ToolExecutionResult> {
  try {
    const rootDir = process.cwd();
    const results: any = { trpcProcedures: [], expressRoutes: [], webhooks: [] };

    // Scan for tRPC procedures in server/*.ts
    const serverDir = path.join(rootDir, "server");
    if (fs.existsSync(serverDir)) {
      const files = fs.readdirSync(serverDir).filter(f => f.endsWith(".ts"));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(serverDir, file), "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // tRPC procedures: publicProcedure, protectedProcedure, adminProcedure
            const procMatch = line.match(/(\w+):\s*(public|protected|admin)Procedure/);
            if (procMatch) {
              const isQuery = lines.slice(i, i + 5).some(l => l.includes(".query("));
              const isMutation = lines.slice(i, i + 5).some(l => l.includes(".mutation("));
              results.trpcProcedures.push({
                name: procMatch[1],
                auth: procMatch[2],
                type: isMutation ? "mutation" : isQuery ? "query" : "unknown",
                file: `server/${file}`,
                line: i + 1,
              });
            }
            // Express routes
            const expressMatch = line.match(/app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
            if (expressMatch) {
              results.expressRoutes.push({
                method: expressMatch[1].toUpperCase(),
                path: expressMatch[2],
                file: `server/${file}`,
                line: i + 1,
              });
            }
            // Webhooks
            if (line.includes("webhook") && /app\.(post|get)/.test(line)) {
              const whMatch = line.match(/['"]([^'"]*webhook[^'"]*)['"]/);
              if (whMatch) {
                results.webhooks.push({
                  path: whMatch[1],
                  file: `server/${file}`,
                  line: i + 1,
                });
              }
            }
          }
        } catch { /* skip */ }
      }
    }

    // Also check _core/index.ts for Express routes
    const coreIndex = path.join(rootDir, "server/_core/index.ts");
    if (fs.existsSync(coreIndex)) {
      try {
        const content = fs.readFileSync(coreIndex, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const expressMatch = line.match(/app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
          if (expressMatch) {
            results.expressRoutes.push({
              method: expressMatch[1].toUpperCase(),
              path: expressMatch[2],
              file: "server/_core/index.ts",
              line: i + 1,
            });
          }
        }
      } catch { /* skip */ }
    }

    return {
      success: true,
      data: {
        summary: `${results.trpcProcedures.length} tRPC procedures, ${results.expressRoutes.length} Express routes, ${results.webhooks.length} webhooks`,
        ...results,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

// ─── Sandbox Executor Functions ─────────────────────────────────────

async function getOrCreateDefaultSandbox(userId: number, sandboxId?: number): Promise<number> {
  if (sandboxId) return sandboxId;

  // Find existing default sandbox
  const existing = await listSandboxes(userId);
  if (existing.length > 0) return existing[0].id;

  // Create a new default sandbox
  const sandbox = await createSandbox(userId, "Default Workspace");
  return sandbox.id;
}

async function execSandboxCommand(
  userId: number,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const command = args.command as string;
  if (!command) return { success: false, error: "Command is required" };

  const sbId = await getOrCreateDefaultSandbox(userId, args.sandboxId as number | undefined);
  const result = await executeCommand(sbId, userId, command, {
    timeoutMs: (args.timeoutMs as number) || 60_000,
    triggeredBy: "ai",
  });

  return {
    success: result.exitCode === 0,
    data: {
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      workingDirectory: result.workingDirectory,
    },
    error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
  };
}

async function execSandboxWriteFile(
  userId: number,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const filePath = args.path as string;
  const content = args.content as string;
  if (!filePath || content === undefined) return { success: false, error: "Path and content are required" };

  const sbId = await getOrCreateDefaultSandbox(userId, args.sandboxId as number | undefined);
  const success = await sandboxWriteFileImpl(sbId, userId, filePath, content);

  return {
    success,
    data: { path: filePath, bytesWritten: content.length },
    error: success ? undefined : "Failed to write file",
  };
}

async function execSandboxReadFile(
  userId: number,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const filePath = args.path as string;
  if (!filePath) return { success: false, error: "Path is required" };

  const sbId = await getOrCreateDefaultSandbox(userId, args.sandboxId as number | undefined);
  const content = await sandboxReadFileImpl(sbId, userId, filePath);

  if (content === null) return { success: false, error: `File not found: ${filePath}` };
  return { success: true, data: { path: filePath, content } };
}

async function execSandboxListFiles(
  userId: number,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const dirPath = (args.path as string) || "/home/sandbox";
  const sbId = await getOrCreateDefaultSandbox(userId, args.sandboxId as number | undefined);
  const files = await sandboxListFilesImpl(sbId, userId, dirPath);

  return {
    success: true,
    data: {
      path: dirPath,
      files: files.map((f) => ({
        name: f.name,
        path: f.path,
        type: f.isDirectory ? "directory" : "file",
        size: f.size,
      })),
    },
  };
}

// ─── Security Executor Functions ────────────────────────────────────

async function execSecurityScan(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const target = args.target as string;
  if (!target) return { success: false, error: "Target URL is required" };

  const scanResult = await runPassiveWebScan(target);
  const report = generateSecurityReport({
    target,
    scanDate: new Date().toISOString(),
    scanResult,
  });

  return {
    success: true,
    data: {
      score: scanResult.score,
      findings: scanResult.findings,
      securityHeaders: scanResult.securityHeaders,
      report,
    },
  };
}

async function execCodeSecurityReview(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const files = args.files as Array<{ filename: string; content: string }>;
  if (!files || files.length === 0) return { success: false, error: "Files array is required" };

  const review = await analyzeCodeSecurity(files);
  return {
    success: true,
    data: review,
  };
}

async function execPortScan(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const host = args.host as string;
  if (!host) return { success: false, error: "Host is required" };

  const ports = args.ports as number[] | undefined;
  const result = await runPortScan(host, ports);

  return {
    success: true,
    data: result,
  };
}

async function execSSLCheck(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const host = args.host as string;
  if (!host) return { success: false, error: "Host is required" };

  const result = await checkSSL(host);
  return {
    success: true,
    data: result,
  };
}

async function execSelfMultiFileModify(
  userId: number,
  modifications: Array<{
    filePath: string;
    action: "modify" | "create" | "delete";
    content?: string;
    description: string;
  }>,
  userName?: string
): Promise<ToolExecutionResult> {
  if (!modifications || modifications.length === 0) {
    return { success: false, error: "No modifications provided" };
  }

  const start = Date.now();
  const db = await getDb();
  if (db && userName) {
    await logAudit({
      userId,
      userName: userName || "titan_assistant",
      action: "self_multi_file_modify",
      resource: "codebase",
      details: {
        fileCount: modifications.length,
        files: modifications.map((m) => `${m.action}: ${m.filePath}`),
      },
    });
  }

  const result = await applyModificationsDeferred(modifications, userId, "titan_assistant");
  const durationMs = Date.now() - start;
  const summary = result.success
    ? `${result.modifications.filter((m) => m.applied).length} file(s) modified successfully. Health check passed.`
    : result.rolledBack
      ? `Changes rolled back — ${result.error}`
      : `Failed: ${result.error}`;

  // Log to builder_activity_log
  try {
    if (db) {
      await db.insert(builderActivityLog).values({
        userId,
        tool: "self_multi_file_modify",
        status: result.success ? "success" : "failure",
        summary,
        durationMs,
        details: {
          fileCount: modifications.length,
          files: modifications.map((m) => m.filePath),
          rolledBack: result.rolledBack,
        },
      });
    }
  } catch (e) { /* non-critical */ }

  return {
    success: result.success,
    data: {
      snapshotId: result.snapshotId,
      modifications: result.modifications,
      healthCheckPassed: result.healthCheckPassed,
      rolledBack: result.rolledBack,
      validationErrors: result.validationResult?.errors,
      validationWarnings: result.validationResult?.warnings,
      summary,
    },
    error: result.error,
  };
}

// ─── Auto-Fix Executor Functions ────────────────────────────────────

async function execAutoFixVulnerability(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const filename = args.filename as string;
  const code = args.code as string;
  if (!filename || !code) return { success: false, error: "Filename and code are required" };

  const issue = {
    title: args.issueTitle as string || "Unknown vulnerability",
    severity: ((args.issueSeverity as string) || "medium") as "critical" | "high" | "medium" | "low",
    category: ((args.issueCategory as string) || "security") as "security" | "performance" | "best-practices" | "maintainability",
    description: (args.issueDescription as string) || "",
    suggestion: (args.issueSuggestion as string) || "",
    file: filename,
    line: args.issueLine as number | undefined,
  };

  const fix = await fixSingleVulnerability({ code, filename, issue });

  return {
    success: fix.confidence > 0,
    data: {
      issueTitle: fix.issueTitle,
      severity: fix.severity,
      file: fix.file,
      confidence: fix.confidence,
      breakingChange: fix.breakingChange,
      explanation: fix.explanation,
      diffSummary: fix.diffSummary,
      testSuggestion: fix.testSuggestion,
      fixedCode: fix.fixedCode,
      codeChanged: fix.fixedCode !== fix.originalCode,
    },
  };
}

async function execAutoFixAll(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const files = args.files as Array<{ filename: string; content: string }>;
  const issues = args.issues as Array<{
    title: string;
    severity: string;
    category: string;
    description: string;
    suggestion: string;
    file: string;
    line?: number;
  }>;

  if (!files || files.length === 0) return { success: false, error: "Files array is required" };
  if (!issues || issues.length === 0) return { success: false, error: "Issues array is required" };

  const typedIssues = issues.map((i) => ({
    ...i,
    severity: i.severity as "critical" | "high" | "medium" | "low",
    category: (i.category || "security") as "security" | "performance" | "best-practices" | "maintainability",
  }));

  const result = await fixAllVulnerabilities({
    files,
    report: {
      overallScore: 0,
      issues: typedIssues,
      summary: `Batch fix for ${typedIssues.length} vulnerabilities`,
      strengths: [],
      recommendations: [],
    },
  });

  const report = generateFixReport(result);

  return {
    success: result.fixedCount > 0,
    data: {
      totalIssues: result.totalIssues,
      fixedCount: result.fixedCount,
      skippedCount: result.skippedCount,
      overallSummary: result.overallSummary,
      fixes: result.fixes.map((f) => ({
        issueTitle: f.issueTitle,
        severity: f.severity,
        file: f.file,
        confidence: f.confidence,
        breakingChange: f.breakingChange,
        explanation: f.explanation,
        diffSummary: f.diffSummary,
        fixedCode: f.fixedCode,
      })),
      skipped: result.skipped,
      report,
    },
  };
}

// ─── App Research & Clone Executor Functions ────────────────────────

async function execAppResearch(
  args: Record<string, unknown>,
  userApiKey?: string
): Promise<ToolExecutionResult> {
  const target = args.target as string;
  if (!target) return { success: false, error: "Target app URL or name is required" };

  const focusAreas = args.focusAreas as string[] | undefined;

  // Step 1: Determine the URL to research
  let targetUrl = target;
  if (!target.startsWith("http")) {
    // Search for the app to find its URL
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(target + " official website")}`;
      const resp = await fetch(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await resp.text();
      const urlMatch = html.match(/uddg=([^&"]*)/);
      if (urlMatch) {
        targetUrl = decodeURIComponent(urlMatch[1]);
      } else {
        targetUrl = `https://${target.toLowerCase().replace(/\s+/g, "")}.com`;
      }
    } catch {
      targetUrl = `https://${target.toLowerCase().replace(/\s+/g, "")}.com`;
    }
  }

  // Step 2: Fetch and analyze the target app's homepage
  let pageContent = "";
  let pageTitle = "";
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : target;
    // Extract text content
    pageContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 6000);
  } catch (err: unknown) {
    return { success: false, error: `Failed to fetch ${targetUrl}: ${getErrorMessage(err)}` };
  }

  // Step 3: Use LLM to analyze the app's features
  const focusPrompt = focusAreas && focusAreas.length > 0
    ? `\nFocus especially on these areas: ${focusAreas.join(", ")}`
    : "";

  const analysis = await invokeLLM({
    priority: "chat",
    ...(userApiKey ? { userApiKey } : {}),
    messages: [
      {
        role: "system",
        content: `You are an expert software analyst. Analyze the given web application and produce a detailed feature analysis report. Return a JSON object with this structure:
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
        content: `Analyze this application:\n\n**URL:** ${targetUrl}\n**Title:** ${pageTitle}\n**Page Content:**\n${pageContent}${focusPrompt}`,
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
    return { success: false, error: "LLM analysis failed — no response" };
  }

  try {
    const parsed = JSON.parse(rawContent);
    return {
      success: true,
      data: {
        url: targetUrl,
        ...parsed,
        message: `Research complete for ${parsed.appName}. Found ${parsed.coreFeatures.length} core features, estimated complexity: ${parsed.estimatedComplexity}. Use app_clone to start building.`,
      },
    };
  } catch {
    return { success: false, error: "Failed to parse LLM analysis response" };
  }
}

async function execAppClone(
  userId: number,
  args: Record<string, unknown>,
  userApiKey?: string
): Promise<ToolExecutionResult> {
  const appName = args.appName as string;
  const features = args.features as string[];
  const techStack = (args.techStack as string) || "React + Node.js + Express + SQLite";
  const priority = (args.priority as string) || "mvp";

  if (!appName) return { success: false, error: "App name is required" };
  if (!features || features.length === 0) return { success: false, error: "Features list is required" };

  // Use LLM to generate a complete build plan
  const buildPlan = await invokeLLM({
    priority: "chat",
    ...(userApiKey ? { userApiKey } : {}),
    messages: [
      {
        role: "system",
        content: `You are an expert full-stack developer. Generate a detailed build plan for a web application clone. Return a JSON object with this structure:
{
  "projectName": "kebab-case project name",
  "description": "What this app does",
  "techStack": {
    "frontend": "framework and libraries",
    "backend": "framework and libraries",
    "database": "database choice",
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
  "estimatedFiles": 10,
  "estimatedTimeMinutes": 30
}

Generate a practical, buildable plan. Each build step should be concrete and executable. Include package.json, all source files, and setup commands.`,
      },
      {
        role: "user",
        content: `Generate a build plan for: "${appName}"

**Features to implement (${priority} priority):**
${features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

**Tech stack:** ${techStack}
**Priority:** ${priority === "mvp" ? "MVP — core features only, get it working fast" : "Full — implement all features for complete parity"}`,
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

  const rawContent = buildPlan?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    return { success: false, error: "Failed to generate build plan" };
  }

  try {
    const plan = JSON.parse(rawContent);
    return {
      success: true,
      data: {
        ...plan,
        message: `Build plan generated for "${appName}" with ${plan.buildSteps.length} steps and ${plan.estimatedFiles} files. Estimated time: ${plan.estimatedTimeMinutes} minutes. The AI assistant will now execute each build step in your sandbox using sandbox_exec and sandbox_write_file tools.`,
        nextAction: "The assistant should now iterate through buildSteps, using sandbox_write_file to create each file and sandbox_exec to run each command. Start with step 1.",
      },
    };
  } catch {
    return { success: false, error: "Failed to parse build plan" };
  }
}

async function execWebsiteReplicate(
  userId: number,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const targetUrl = args.targetUrl as string;
  const targetName = args.targetName as string;
  const priority = (args.priority as string) || "mvp";
  const brandName = args.brandName as string | undefined;
  const brandTagline = args.brandTagline as string | undefined;
  const autoResearch = args.autoResearch !== false; // default true

  if (!targetUrl) return { success: false, error: "Target URL or app name is required" };
  if (!targetName) return { success: false, error: "Project name is required" };

  try {
    // Dynamically import the replicate engine
    const {
      createProject,
      researchTarget,
    } = await import("./replicate-engine");

    // Create the project
    const project = await createProject(userId, targetUrl, targetName, {
      priority: priority as "mvp" | "full",
      branding: brandName ? { brandName, brandTagline } : undefined,
    });

    let researchData = null;
    if (autoResearch) {
      try {
        researchData = await researchTarget(project.id, userId);
      } catch (err: unknown) {
        return {
          success: true,
          data: {
            projectId: project.id,
            status: "created_research_failed",
            message: `Project created (ID: ${project.id}) but research failed: ${getErrorMessage(err)}. The user can retry research from the Website Replicate page (/replicate).`,
            navigateTo: "/replicate",
          },
        };
      }
    }

    return {
      success: true,
      data: {
        projectId: project.id,
        status: autoResearch ? "research_complete" : "created",
        targetUrl,
        targetName,
        priority,
        research: researchData
          ? {
              appName: researchData.appName,
              description: researchData.description,
              coreFeatures: researchData.coreFeatures,
              estimatedComplexity: researchData.estimatedComplexity,
              mvpFeatures: researchData.mvpFeatures,
              fullFeatures: researchData.fullFeatures,
            }
          : null,
        message: autoResearch && researchData
          ? `Website Replicate project "${targetName}" created and research complete! Found ${researchData.coreFeatures.length} core features (complexity: ${researchData.estimatedComplexity}). The user can view the full analysis and generate a build plan on the Website Replicate page. Use navigate_to_page with page="replicate" to send them there.`
          : `Website Replicate project "${targetName}" created (ID: ${project.id}). Use navigate_to_page with page="replicate" to send the user to start research.`,
        navigateTo: "/replicate",
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Failed to create replicate project: ${getErrorMessage(err)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Project Builder Tool Implementations
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a file in the user's project — stored in S3 with a downloadable URL.
 * This is the core builder tool that replaces sandbox_write_file for user-facing projects.
 */
async function execCreateFile(
  userId: number,
  args: Record<string, unknown>,
  conversationId?: number
): Promise<ToolExecutionResult> {
  const fileName = args.fileName as string;
  const content = args.content as string;
  const language = (args.language as string) || detectLanguage(fileName);

  if (!fileName || content === undefined) {
    return { success: false, error: "fileName and content are required" };
  }

  try {
    // Upload to S3 for permanent cloud storage
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._\/-]/g, "_");
    const s3Key = `projects/${userId}/${conversationId || "general"}/${timestamp}-${safeFileName}`;
    const contentType = getContentType(fileName);
    let url = "";
    try {
      const result = await storagePut(s3Key, content, contentType, safeFileName);
      url = result.url;
    } catch (s3Err: unknown) {
      log.warn("[CreateFile] S3 upload failed (non-fatal):", { error: getErrorMessage(s3Err) });
    }

    // Store in sandboxFiles table (reuse existing table)
    const db = await getDb();
    const sbId = await getOrCreateDefaultSandbox(userId);
    if (db) {
      await db.insert(sandboxFiles).values({
        sandboxId: sbId,
        filePath: fileName,
        content: content.length <= 65000 ? content : null,
        s3Key: s3Key,
        fileSize: Buffer.byteLength(content, "utf-8"),
        isDirectory: 0,
      });
    }

    // ALSO write to the sandbox filesystem so files appear in the Project Files viewer
    try {
      await sandboxWriteFileImpl(sbId, userId, `/home/sandbox/projects/${fileName}`, content);
    } catch (fsErr: unknown) {
      // Non-fatal: the file is still in S3 and the database
      log.warn("[CreateFile] Sandbox filesystem write failed (non-fatal):", { error: getErrorMessage(fsErr) });
    }

    return {
      success: true,
      data: {
        fileName,
        url,
        size: Buffer.byteLength(content, "utf-8"),
        language,
        projectPath: `/home/sandbox/projects/${fileName}`,
        message: `File created: ${fileName} (${formatFileSize(Buffer.byteLength(content, "utf-8"))})`,
      },
    };
  } catch (err: unknown) {
    log.error("[CreateFile] Error:", { error: String(err) });
    return { success: false, error: `Failed to create file: ${getErrorMessage(err)}` };
  }
}

/**
 * Create a GitHub repository for the user's project.
 */
async function execCreateGithubRepo(
  userId: number,
  args: Record<string, unknown>,
  conversationId?: number
): Promise<ToolExecutionResult> {
  const repoName = args.name as string;
  const description = (args.description as string) || "Created by Titan Builder";
  const isPrivate = args.isPrivate !== false; // default true

  if (!repoName) {
    return { success: false, error: "Repository name is required" };
  }

  try {
    // Get user's GitHub PAT from user_secrets
    const githubToken = await getUserGithubToken(userId);
    if (!githubToken) {
      return {
        success: false,
        error: "No GitHub token found. Please add your GitHub Personal Access Token in Account Settings to use this feature.",
      };
    }

    // Create repo via GitHub API
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        name: repoName,
        description,
        private: isPrivate,
        auto_init: false,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `GitHub API error: ${(err as any).message || response.statusText}`,
      };
    }

    const repo = await response.json() as any;

    return {
      success: true,
      data: {
        repoUrl: repo.html_url,
        repoFullName: repo.full_name,
        cloneUrl: repo.clone_url,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch || "main",
        message: `Repository created: ${repo.full_name} (${repo.private ? "private" : "public"})`,
      },
    };
  } catch (err: unknown) {
    log.error("[CreateGithubRepo] Error:", { error: String(err) });
    return { success: false, error: `Failed to create repo: ${getErrorMessage(err)}` };
  }
}

/**
 * Push all project files from the current conversation to a GitHub repo.
 */
async function execPushToGithub(
  userId: number,
  args: Record<string, unknown>,
  conversationId?: number
): Promise<ToolExecutionResult> {
  const repoFullName = args.repoFullName as string;
  const commitMessage = (args.commitMessage as string) || "Initial commit from Titan Builder";

  if (!repoFullName) {
    return { success: false, error: "repoFullName is required (e.g., 'username/repo-name')" };
  }

  try {
    const githubToken = await getUserGithubToken(userId);
    if (!githubToken) {
      return {
        success: false,
        error: "No GitHub token found. Please add your GitHub PAT in Account Settings.",
      };
    }

    // Get all project files for this user's sandbox
    const db = await getDb();
    if (!db) return { success: false, error: "Database unavailable" };

    const sbId = await getOrCreateDefaultSandbox(userId);
    const files = await db
      .select()
      .from(sandboxFiles)
      .where(and(eq(sandboxFiles.sandboxId, sbId), eq(sandboxFiles.isDirectory, 0)));

    if (files.length === 0) {
      return { success: false, error: "No files to push. Create files first using the create_file tool." };
    }

    // Push files using GitHub API (create tree + commit)
    const pushed = await pushFilesToGithub(githubToken, repoFullName, files, commitMessage);

    return {
      success: true,
      data: {
        repoFullName,
        repoUrl: `https://github.com/${repoFullName}`,
        filesPushed: pushed,
        commitMessage,
        message: `Pushed ${pushed} files to ${repoFullName}`,
      },
    };
  } catch (err: unknown) {
    log.error("[PushToGithub] Error:", { error: String(err) });
    return { success: false, error: `Failed to push: ${getErrorMessage(err)}` };
  }
}

/**
 * Read content from an uploaded file URL.
 */
async function execReadUploadedFile(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const url = args.url as string;
  if (!url) return { success: false, error: "URL is required" };

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch file: ${response.statusText}` };
    }
    const content = await response.text();
    return {
      success: true,
      data: {
        content: content.slice(0, 100000), // Limit to 100KB
        size: content.length,
        truncated: content.length > 100000,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: `Failed to read file: ${getErrorMessage(err)}` };
  }
}

// ─── GitHub Helper Functions ─────────────────────────────────────────

async function getUserGithubToken(userId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const secrets = await db
      .select()
      .from(userSecrets)
      .where(and(eq(userSecrets.userId, userId), eq(userSecrets.secretType, "github_pat")));
    if (secrets.length === 0) return null;
    return decrypt(secrets[0].encryptedValue);
  } catch {
    return null;
  }
}

async function pushFilesToGithub(
  token: string,
  repoFullName: string,
  files: Array<{ filePath: string; content: string | null; s3Key: string | null }>,
  commitMessage: string
): Promise<number> {
  const headers = {
    Authorization: `token ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };

  // Get the default branch ref
  let sha: string | null = null;
  try {
    const refResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/ref/heads/main`, { headers });
    if (refResp.ok) {
      const refData = await refResp.json() as any;
      sha = refData.object?.sha;
    }
  } catch {}

  // Create blobs for each file
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];

  for (const file of files) {
    let content = file.content;
    if (!content && file.s3Key) {
      // Fetch from S3
      try {
        const { storageGet } = await import("./storage");
        const data = await storageGet(file.s3Key);
        content = typeof data === "string" ? data : Buffer.from(data as any).toString("utf-8");
      } catch {
        continue;
      }
    }
    if (!content) continue;

    // Create blob
    const blobResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    if (!blobResp.ok) continue;
    const blobData = await blobResp.json() as any;

    treeItems.push({
      path: file.filePath.replace(/^\//, ""),
      mode: "100644",
      type: "blob",
      sha: blobData.sha,
    });
  }

  if (treeItems.length === 0) return 0;

  // Create tree
  const treeBody: any = { tree: treeItems };
  if (sha) treeBody.base_tree = sha;

  const treeResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify(treeBody),
  });
  if (!treeResp.ok) throw new Error("Failed to create git tree");
  const treeData = await treeResp.json() as any;

  // Create commit
  const commitBody: any = {
    message: commitMessage,
    tree: treeData.sha,
  };
  if (sha) commitBody.parents = [sha];

  const commitResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify(commitBody),
  });
  if (!commitResp.ok) throw new Error("Failed to create commit");
  const commitData = await commitResp.json() as any;

  // Update ref (or create if new repo)
  if (sha) {
    await fetch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/main`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: commitData.sha }),
    });
  } else {
    await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: "refs/heads/main", sha: commitData.sha }),
    });
  }

  return treeItems.length;
}

// ─── File Utility Functions ──────────────────────────────────────────

function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    html: "html", css: "css", scss: "scss", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", sql: "sql", sh: "bash", bash: "bash",
    xml: "xml", svg: "svg", txt: "text",
  };
  return map[ext] || "text";
}

function getContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    ts: "text/typescript", tsx: "text/typescript", json: "application/json",
    py: "text/x-python", md: "text/markdown", svg: "image/svg+xml",
    xml: "application/xml", yaml: "text/yaml", yml: "text/yaml",
    txt: "text/plain", sh: "text/x-shellscript",
  };
  return map[ext] || "text/plain";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}


// ─── Grand Bazaar Search ─────────────────────────────────────────────
// Searches the marketplace for existing modules matching the user's needs.
// Returns matching listings so Titan can recommend buying instead of building.

async function execSearchBazaar(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = String(args.query || "").trim();
  if (!query) {
    return { success: false, error: "Search query is required" };
  }

  const maxResults = Math.min(Number(args.maxResults) || 5, 10);
  const category = args.category ? String(args.category) : undefined;

  try {
    const dbInst = await getDb();
    if (!dbInst) {
      return { success: false, error: "Database not available" };
    }

    // Build search conditions: only active, approved listings
    const conditions: any[] = [
      eq(marketplaceListings.status, "active"),
      eq(marketplaceListings.reviewStatus, "approved"),
    ];

    // Add category filter if specified
    if (category) {
      conditions.push(eq(marketplaceListings.category, category as any));
    }

    // Split query into keywords for broader matching
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);

    // Search across title, description, tags, and longDescription
    if (keywords.length > 0) {
      const keywordConditions = keywords.map(kw =>
        or(
          like(marketplaceListings.title, `%${kw}%`),
          like(marketplaceListings.description, `%${kw}%`),
          like(marketplaceListings.tags, `%${kw}%`),
        )
      );
      // At least one keyword must match
      conditions.push(or(...keywordConditions));
    }

    // Query with seller profile join for seller name
    const results = await dbInst
      .select({
        id: marketplaceListings.id,
        title: marketplaceListings.title,
        slug: marketplaceListings.slug,
        description: marketplaceListings.description,
        category: marketplaceListings.category,
        riskCategory: marketplaceListings.riskCategory,
        priceCredits: marketplaceListings.priceCredits,
        language: marketplaceListings.language,
        tags: marketplaceListings.tags,
        avgRating: marketplaceListings.avgRating,
        totalSales: marketplaceListings.totalSales,
        version: marketplaceListings.version,
        sellerId: marketplaceListings.sellerId,
      })
      .from(marketplaceListings)
      .where(and(...conditions))
      .orderBy(desc(marketplaceListings.totalSales))
      .limit(maxResults);

    if (results.length === 0) {
      return {
        success: true,
        data: {
          query,
          matchCount: 0,
          listings: [],
          message: "No matching modules found in the Grand Bazaar. You can proceed to build this from scratch.",
        },
      };
    }

    // Get seller names for the results
    const sellerIds = [...new Set(results.map(r => r.sellerId))];
    const sellerRows = await dbInst
      .select({
        userId: sellerProfiles.userId,
        displayName: sellerProfiles.displayName,
        verified: sellerProfiles.verified,
      })
      .from(sellerProfiles)
      .where(or(...sellerIds.map(id => eq(sellerProfiles.userId, id))));

    const sellerMap = new Map(sellerRows.map(s => [s.userId, s]));

    // Calculate estimated build cost for comparison
    // Simple: ~100cr, Medium: ~200cr, Complex: ~400cr, Enterprise: ~800cr
    const estimateBuildCost = (price: number): number => {
      if (price <= 100) return Math.round(price * 2.2);
      if (price <= 300) return Math.round(price * 2.0);
      if (price <= 1000) return Math.round(price * 1.8);
      return Math.round(price * 1.6);
    };

    const listings = results.map(r => {
      const seller = sellerMap.get(r.sellerId);
      const buildCost = estimateBuildCost(r.priceCredits);
      const savings = buildCost - r.priceCredits;
      const savingsPercent = Math.round((savings / buildCost) * 100);

      return {
        title: r.title,
        description: r.description,
        category: r.category,
        riskCategory: r.riskCategory,
        priceCredits: r.priceCredits,
        language: r.language,
        tags: r.tags ? JSON.parse(r.tags) : [],
        rating: r.avgRating ? `${(r.avgRating / 10).toFixed(1)}/5.0` : "No ratings yet",
        totalSales: r.totalSales,
        version: r.version,
        seller: seller?.displayName || "Unknown",
        sellerVerified: seller?.verified || false,
        estimatedBuildCost: buildCost,
        savingsVsBuild: `${savings} credits (${savingsPercent}% cheaper than building)`,
        bazaarLink: `/marketplace/${r.slug}`,
      };
    });

    return {
      success: true,
      data: {
        query,
        matchCount: listings.length,
        listings,
        recommendation: listings.length > 0
          ? `Found ${listings.length} existing module(s) in the Grand Bazaar that match your needs. Buying a pre-built module is significantly cheaper and faster than building from scratch. I recommend checking these out before we build anything custom.`
          : "No exact matches found.",
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Bazaar search failed: ${getErrorMessage(err)}`,
    };
  }
}

// ─── Autonomous System Management Executors ──────────────────────────

async function execGetAutonomousStatus(): Promise<ToolExecutionResult> {
  try {
    const status = await getAutonomousSystemStatus();
    return {
      success: true,
      data: {
        summary: status.summary,
        systems: status.systems.map(s => ({
          name: s.name,
          category: s.category,
          status: s.status,
          schedule: s.schedule,
          reason: s.reason,
          nextAction: s.nextAction,
        })),
        connectedChannels: status.channels.filter(c => c.configured).map(c => c.channel),
        disconnectedChannels: status.channels.filter(c => !c.configured).map(c => ({
          channel: c.channel,
          impact: c.impact,
          freeToSetup: c.freeToSetup,
          setupUrl: c.setupUrl,
          envVars: c.envVars,
        })),
        recommendations: status.recommendations,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to get autonomous status: ${getErrorMessage(err)}` };
  }
}

async function execGetChannelStatus(): Promise<ToolExecutionResult> {
  try {
    const status = await getAutonomousSystemStatus();
    const channels = status.channels.map(c => ({
      channel: c.channel,
      connected: c.configured,
      impact: c.impact,
      freeToSetup: c.freeToSetup,
      description: c.description,
      setupUrl: c.setupUrl,
      requiredEnvVars: c.envVars,
    }));

    const connected = channels.filter(c => c.connected);
    const disconnected = channels.filter(c => !c.connected);
    const freeToSetup = disconnected.filter(c => c.freeToSetup);
    const highImpactMissing = disconnected.filter(c => c.impact === "high");

    return {
      success: true,
      data: {
        totalChannels: channels.length,
        connectedCount: connected.length,
        disconnectedCount: disconnected.length,
        connected: connected.map(c => c.channel),
        disconnected,
        freeToSetup: freeToSetup.map(c => ({
          channel: c.channel,
          setupUrl: c.setupUrl,
          impact: c.impact,
        })),
        highImpactMissing: highImpactMissing.map(c => c.channel),
        tip: disconnected.length > 0
          ? `To connect a channel, paste the API token in chat and I'll save it to your vault. The vault bridge will automatically make it available to all marketing systems.`
          : "All channels are connected! Your marketing engine is running at full capacity.",
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to get channel status: ${getErrorMessage(err)}` };
  }
}

async function execRefreshVaultBridge(force?: boolean): Promise<ToolExecutionResult> {
  try {
    const result = await runVaultBridge(force ?? false);
    return {
      success: true,
      data: {
        ownerUserId: result.ownerUserId,
        totalSecrets: result.totalSecrets,
        patched: result.patched,
        skipped: result.skipped,
        failed: result.failed,
        unmapped: result.unmapped,
        message: result.patched.length > 0
          ? `Vault bridge refreshed! Patched ${result.patched.length} token(s) into ENV: ${result.patched.join(", ")}. These channels are now active.`
          : result.totalSecrets === 0
            ? "No secrets found in the vault. Save API tokens via chat and I'll bridge them to the marketing systems."
            : `Vault bridge refreshed. ${result.skipped.length} token(s) already set via env vars, ${result.unmapped.length} unmapped.`,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to refresh vault bridge: ${getErrorMessage(err)}` };
  }
}

async function execGetVaultBridgeInfo(): Promise<ToolExecutionResult> {
  try {
    const status = getVaultBridgeStatus();
    return {
      success: true,
      data: {
        lastRun: status.lastRun?.toISOString() || "Never (bridge hasn't run yet)",
        ownerUserId: status.ownerUserId,
        totalMappings: status.totalMappings,
        activeSecrets: status.activeSecrets,
        channelsUnlocked: status.channelsUnlocked,
        channelsStillMissing: status.channelsStillMissing,
        howItWorks: "The vault bridge reads encrypted API tokens from the owner's userSecrets table and patches them into the runtime ENV object. This allows all marketing channels to access tokens stored via chat without needing Railway env vars.",
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to get vault bridge info: ${getErrorMessage(err)}` };
  }
}

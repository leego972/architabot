/**
 * Chat Tool Definitions — LLM function-calling schemas for Titan Assistant.
 *
 * Each tool maps to a real backend action (tRPC procedure or DB query).
 * The LLM receives these schemas and can invoke them to execute actions
 * on behalf of the user.
 */

import type { Tool } from "./_core/llm";

// ─── Credential & Fetch Tools ───────────────────────────────────────

const listCredentials: Tool = {
  type: "function",
  function: {
    name: "list_credentials",
    description:
      "List all stored credentials for the current user. Returns provider name, key type, label, and creation date. Does NOT reveal the actual secret values.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const revealCredential: Tool = {
  type: "function",
  function: {
    name: "reveal_credential",
    description:
      "Reveal the decrypted value of a specific credential by its ID. Use this when the user asks to see or copy a specific credential.",
    parameters: {
      type: "object",
      properties: {
        credentialId: {
          type: "number",
          description: "The ID of the credential to reveal",
        },
      },
      required: ["credentialId"],
    },
  },
};

const exportCredentials: Tool = {
  type: "function",
  function: {
    name: "export_credentials",
    description:
      "Export all credentials in a specified format (json, env, or csv). Returns the formatted export data.",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "env", "csv"],
          description: "Export format",
        },
      },
      required: ["format"],
    },
  },
};

const createFetchJob: Tool = {
  type: "function",
  function: {
    name: "create_fetch_job",
    description:
      "Create a new credential fetch job. Specify which providers to fetch from. The job runs asynchronously and retrieves API keys/credentials from the selected providers using the stealth browser.",
    parameters: {
      type: "object",
      properties: {
        providerIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of provider IDs to fetch from (e.g. ['openai', 'aws', 'github']). Use list_providers to see available IDs.",
        },
      },
      required: ["providerIds"],
    },
  },
};

const listJobs: Tool = {
  type: "function",
  function: {
    name: "list_jobs",
    description:
      "List recent fetch jobs with their status, progress, and results summary.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const getJobDetails: Tool = {
  type: "function",
  function: {
    name: "get_job_details",
    description:
      "Get detailed information about a specific fetch job including per-provider task status.",
    parameters: {
      type: "object",
      properties: {
        jobId: {
          type: "number",
          description: "The ID of the job to inspect",
        },
      },
      required: ["jobId"],
    },
  },
};

const listProviders: Tool = {
  type: "function",
  function: {
    name: "list_providers",
    description:
      "List all available credential providers with their IDs, names, categories, and key types. Use this to help the user choose which providers to fetch from.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── API Key Management Tools ────────────────────────────────────────

const listApiKeys: Tool = {
  type: "function",
  function: {
    name: "list_api_keys",
    description:
      "List all API keys for the current user, showing name, prefix, scopes, usage count, and status.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const createApiKey: Tool = {
  type: "function",
  function: {
    name: "create_api_key",
    description:
      "Create a new API key with specified name, scopes, and optional expiration. Returns the raw key (shown only once).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A descriptive name for the API key",
        },
        scopes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "credentials:read",
              "credentials:export",
              "jobs:read",
              "jobs:create",
            ],
          },
          description: "Permission scopes for the key",
        },
        expiresInDays: {
          type: "number",
          description:
            "Number of days until the key expires (1-365). Omit for no expiration.",
        },
      },
      required: ["name", "scopes"],
    },
  },
};

const revokeApiKey: Tool = {
  type: "function",
  function: {
    name: "revoke_api_key",
    description: "Revoke an API key by its ID, permanently disabling it.",
    parameters: {
      type: "object",
      properties: {
        keyId: {
          type: "number",
          description: "The ID of the API key to revoke",
        },
      },
      required: ["keyId"],
    },
  },
};

// ─── Leak Scanner Tools ──────────────────────────────────────────────

const startLeakScan: Tool = {
  type: "function",
  function: {
    name: "start_leak_scan",
    description:
      "Start a credential leak scan. Searches public sources (GitHub, Pastebin, etc.) for exposed credentials matching the user's stored keys.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const getLeakScanResults: Tool = {
  type: "function",
  function: {
    name: "get_leak_scan_results",
    description:
      "Get the results of leak scans including findings, severity, and affected credentials.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Vault Tools ─────────────────────────────────────────────────────

const listVaultEntries: Tool = {
  type: "function",
  function: {
    name: "list_vault_entries",
    description:
      "List all entries in the Team Vault, showing name, category, who added it, and sharing status.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const addVaultEntry: Tool = {
  type: "function",
  function: {
    name: "add_vault_entry",
    description:
      "Add a new secret to the Team Vault with a name, value, optional category, and optional notes.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name/label for the secret",
        },
        value: {
          type: "string",
          description: "The secret value to store (will be encrypted)",
        },
        category: {
          type: "string",
          description:
            "Category for organization (e.g. 'api_key', 'password', 'token', 'certificate', 'other')",
        },
        notes: {
          type: "string",
          description: "Optional notes about this secret",
        },
      },
      required: ["name", "value"],
    },
  },
};

const saveCredential: Tool = {
  type: "function",
  function: {
    name: "save_credential",
    description:
      "Save a credential (API key, token, secret, password, etc.) to the user's encrypted vault. Use this when the user provides a credential and wants to store it. Auto-detect the provider and key type from the value format when possible. Common patterns: 'sk-...' = OpenAI API key, 'AKIA...' = AWS Access Key ID, 'ghp_...' = GitHub Personal Access Token, 'SG....' = SendGrid API key, 'xoxb-...' = Slack Bot Token. If you can't detect the provider, ask the user or use 'custom' as the providerId.",
    parameters: {
      type: "object",
      properties: {
        providerId: {
          type: "string",
          description:
            "Provider ID (e.g. 'openai', 'aws', 'github', 'stripe', 'anthropic', 'cloudflare', 'sendgrid', 'twilio', 'heroku', 'digitalocean', 'godaddy', 'firebase', 'google_cloud', 'huggingface', 'mailgun', 'meta', 'tiktok', 'google_ads', 'snapchat', 'discord', 'roblox', or 'custom' for unknown providers)",
        },
        providerName: {
          type: "string",
          description:
            "Human-readable provider name (e.g. 'OpenAI', 'AWS', 'GitHub'). Use the official name.",
        },
        keyType: {
          type: "string",
          description:
            "Type of credential (e.g. 'api_key', 'secret_key', 'access_token', 'personal_access_token', 'bot_token', 'password', 'oauth_client_id', 'oauth_client_secret', 'webhook_url')",
        },
        value: {
          type: "string",
          description: "The actual credential value to store (will be encrypted with AES-256-GCM)",
        },
        label: {
          type: "string",
          description:
            "Optional label to identify this credential (e.g. 'Production key', 'My personal token', 'Staging environment')",
        },
      },
      required: ["providerId", "providerName", "keyType", "value"],
    },
  },
};

// ─── Bulk Sync Tools ─────────────────────────────────────────────────

const triggerBulkSync: Tool = {
  type: "function",
  function: {
    name: "trigger_bulk_sync",
    description:
      "Trigger a bulk sync job that re-fetches credentials from all or specified providers to keep them up to date.",
    parameters: {
      type: "object",
      properties: {
        providerIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional array of provider IDs to sync. If omitted, syncs all providers.",
        },
      },
      required: [],
    },
  },
};

const getBulkSyncStatus: Tool = {
  type: "function",
  function: {
    name: "get_bulk_sync_status",
    description:
      "Get the status of recent bulk sync jobs, showing progress and results.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Team Management Tools ───────────────────────────────────────────

const listTeamMembers: Tool = {
  type: "function",
  function: {
    name: "list_team_members",
    description:
      "List all team members with their roles, email, and join date.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const addTeamMember: Tool = {
  type: "function",
  function: {
    name: "add_team_member",
    description:
      "Add a user to the team by their email address with a specified role.",
    parameters: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address of the user to add",
        },
        role: {
          type: "string",
          enum: ["admin", "member", "viewer"],
          description: "Role to assign (default: member)",
        },
      },
      required: ["email"],
    },
  },
};

const removeTeamMember: Tool = {
  type: "function",
  function: {
    name: "remove_team_member",
    description: "Remove a team member by their member ID.",
    parameters: {
      type: "object",
      properties: {
        memberId: {
          type: "number",
          description: "The ID of the team member to remove",
        },
      },
      required: ["memberId"],
    },
  },
};

const updateTeamMemberRole: Tool = {
  type: "function",
  function: {
    name: "update_team_member_role",
    description: "Update the role of an existing team member.",
    parameters: {
      type: "object",
      properties: {
        memberId: {
          type: "number",
          description: "The ID of the team member",
        },
        role: {
          type: "string",
          enum: ["admin", "member", "viewer"],
          description: "New role to assign",
        },
      },
      required: ["memberId", "role"],
    },
  },
};

// ─── Scheduler Tools ─────────────────────────────────────────────────

const listSchedules: Tool = {
  type: "function",
  function: {
    name: "list_schedules",
    description:
      "List all scheduled auto-sync jobs with their frequency, next run time, and status.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const createSchedule: Tool = {
  type: "function",
  function: {
    name: "create_schedule",
    description:
      "Create a new scheduled auto-sync that periodically fetches credentials from specified providers.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the schedule",
        },
        providerIds: {
          type: "array",
          items: { type: "string" },
          description: "Provider IDs to include in the schedule",
        },
        frequency: {
          type: "string",
          enum: ["hourly", "daily", "weekly", "monthly"],
          description: "How often to run the sync",
        },
      },
      required: ["name", "providerIds", "frequency"],
    },
  },
};

const deleteSchedule: Tool = {
  type: "function",
  function: {
    name: "delete_schedule",
    description: "Delete a scheduled auto-sync by its ID.",
    parameters: {
      type: "object",
      properties: {
        scheduleId: {
          type: "number",
          description: "The ID of the schedule to delete",
        },
      },
      required: ["scheduleId"],
    },
  },
};

// ─── Watchdog Tools ──────────────────────────────────────────────────

const getWatchdogSummary: Tool = {
  type: "function",
  function: {
    name: "get_watchdog_summary",
    description:
      "Get a summary of credential expiration watches — how many are active, expiring soon, or already expired.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Provider Health Tools ───────────────────────────────────────────

const checkProviderHealth: Tool = {
  type: "function",
  function: {
    name: "check_provider_health",
    description:
      "Check the health status of all credential providers — shows which are online, degraded, or offline, with success rates.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Recommendations Tools ───────────────────────────────────────────

const getRecommendations: Tool = {
  type: "function",
  function: {
    name: "get_recommendations",
    description:
      "Get AI-generated recommendations for improving credential security, rotation schedules, and setup optimization.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Audit Log Tools ─────────────────────────────────────────────────

const getAuditLogs: Tool = {
  type: "function",
  function: {
    name: "get_audit_logs",
    description:
      "Retrieve recent audit log entries showing all actions taken in the account.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Filter by action type (e.g. 'apiKey.create', 'team.addMember'). Omit for all.",
        },
        limit: {
          type: "number",
          description: "Number of entries to return (default: 20, max: 100)",
        },
      },
      required: [],
    },
  },
};

// ─── Kill Switch Tool ────────────────────────────────────────────────

const activateKillSwitch: Tool = {
  type: "function",
  function: {
    name: "activate_kill_switch",
    description:
      "EMERGENCY: Activate the kill switch to immediately halt all running fetch jobs and automations. Requires a 10-digit alphanumeric confirmation code. Only use when the user explicitly requests emergency shutdown.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "10-digit alphanumeric confirmation code. Ask the user for their kill switch code before activating.",
        },
      },
      required: ["code"],
    },
  },
};

// ─── System Status Tool ──────────────────────────────────────────────

const getSystemStatus: Tool = {
  type: "function",
  function: {
    name: "get_system_status",
    description:
      "Get a comprehensive system status overview: plan info, usage stats, credential count, job count, proxy health, watchdog alerts, provider health, AND full autonomous systems status (SEO engines, advertising orchestrator, affiliate engines, content generators, marketing channels, connected/disconnected channels with setup instructions, and recommendations for maximizing traffic).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Plan & Usage Tool ───────────────────────────────────────────────

const getPlanUsage: Tool = {
  type: "function",
  function: {
    name: "get_plan_usage",
    description:
      "Get the current subscription plan details and usage statistics — fetches used, credentials stored, proxy slots, export formats available.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Self-Improvement Tools ─────────────────────────────────────────

const selfReadFile: Tool = {
  type: "function",
  function: {
    name: "self_read_file",
    description:
      "Read the contents of a source file in YOUR OWN project codebase. You have FULL ACCESS to all files in server/, client/src/, client/public/, shared/, scripts/, electron/. You are NEVER locked out — if you think you cannot access a file, you are wrong. Use this to inspect code before making modifications. For CSS/visual issues, ALWAYS start by reading client/src/index.css.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description:
            "Relative path to the file from project root (e.g. 'server/chat-router.ts', 'client/src/pages/ChatPage.tsx', 'client/src/index.css')",
        },
      },
      required: ["filePath"],
    },
  },
};

const selfListFiles: Tool = {
  type: "function",
  function: {
    name: "self_list_files",
    description:
      "List files in YOUR OWN project directory. You have FULL ACCESS to explore the entire codebase. Use this to discover what files exist before reading or modifying them.",
    parameters: {
      type: "object",
      properties: {
        dirPath: {
          type: "string",
          description:
            "Relative path to the directory (e.g. 'server/' or 'client/src/pages/')",
        },
      },
      required: ["dirPath"],
    },
  },
};

const selfModifyFile: Tool = {
  type: "function",
  function: {
    name: "self_modify_file",
    description:
      "Modify, create, or delete a source file in YOUR OWN project codebase. You have FULL ACCESS to modify any file in server/, client/src/, client/public/, shared/, scripts/, electron/. SAFETY: A snapshot is automatically taken before any change and automatic rollback occurs if the system breaks. Protected files (auth, encryption, schema, payment) cannot be modified. For CSS/theme fixes, modify client/src/index.css. For mobile layout fixes, modify client/src/pages/ChatPage.tsx. ALWAYS use action='patch' for targeted edits to existing files.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the file",
        },
        action: {
          type: "string",
          enum: ["modify", "create", "delete", "patch"],
          description: "What to do with the file. Use 'patch' for targeted edits to existing files (preferred for large files) — provide search_replace pairs instead of full content.",
        },
        content: {
          type: "string",
          description:
            "The COMPLETE file content (required for modify/create, ignored for delete/patch). CRITICAL: For 'modify' action, this MUST be the ENTIRE file — all original lines plus your additions. Partial snippets will be REJECTED. For large files, prefer 'patch' action instead.",
        },
        patches: {
          type: "array",
          description: "Array of search-and-replace patches (required for 'patch' action only). Each patch finds exact text and replaces it.",
          items: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "Exact text to find in the file (must match precisely, including whitespace and newlines)",
              },
              replace: {
                type: "string",
                description: "Replacement text",
              },
            },
            required: ["search", "replace"],
          },
        },
        description: {
          type: "string",
          description: "Brief description of what this change does and why",
        },
      },
      required: ["filePath", "action", "description"],
    },
  },
};

const selfHealthCheck: Tool = {
  type: "function",
  function: {
    name: "self_health_check",
    description:
      "Run a comprehensive health check on the system — verifies critical files exist, syntax is valid, database is accessible, self-improvement engine is intact, and optionally runs TypeScript type checking and test suite.",
    parameters: {
      type: "object",
      properties: {
        skipTests: {
          type: "boolean",
          description: "Skip running the test suite (faster check). Default: false.",
        },
        skipTypeCheck: {
          type: "boolean",
          description: "Skip TypeScript type checking (faster check). Default: false.",
        },
      },
      required: [],
    },
  },
};

const selfRollback: Tool = {
  type: "function",
  function: {
    name: "self_rollback",
    description:
      "Roll back to the last known good state. Use this if something is broken and needs to be reverted. Can also roll back to a specific snapshot by ID.",
    parameters: {
      type: "object",
      properties: {
        snapshotId: {
          type: "number",
          description:
            "Optional: specific snapshot ID to roll back to. If omitted, rolls back to the last known good snapshot.",
        },
      },
      required: [],
    },
  },
};

const selfRestart: Tool = {
  type: "function",
  function: {
    name: "self_restart",
    description:
      "Request a service restart. Use this after making code changes that require a server restart to take effect.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the restart is needed",
        },
      },
      required: ["reason"],
    },
  },
};

const selfModificationHistory: Tool = {
  type: "function",
  function: {
    name: "self_modification_history",
    description:
      "View the history of all self-modifications — what was changed, when, by whom, and whether it was rolled back.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of entries to return (default: 20)",
        },
      },
      required: [],
    },
  },
};

// ─── Builder Tools ──────────────────────────────────────────────────

const selfTypeCheck: Tool = {
  type: "function",
  function: {
    name: "self_type_check",
    description:
      "Run the TypeScript compiler in check-only mode (tsc --noEmit). Returns pass/fail status with error count and detailed output. ALWAYS run this after modifying any .ts or .tsx file.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const selfRunTests: Tool = {
  type: "function",
  function: {
    name: "self_run_tests",
    description:
      "Run the vitest test suite and return results. Optionally pass a test pattern to run specific tests. ALWAYS run this after making code changes to verify nothing is broken.",
    parameters: {
      type: "object",
      properties: {
        testPattern: {
          type: "string",
          description:
            "Optional test file pattern to run specific tests (e.g. 'auth.logout' or 'chat-router'). If omitted, runs all tests.",
        },
      },
      required: [],
    },
  },
};

const selfMultiFileModify: Tool = {
  type: "function",
  function: {
    name: "self_multi_file_modify",
    description:
      "Atomically modify multiple files in YOUR OWN project codebase in a single operation. You have FULL ACCESS to all files in server/, client/src/, client/public/, shared/. All changes succeed or all are rolled back. SAFETY: Snapshot is taken before changes, health check runs after, automatic rollback on failure. Use this instead of multiple self_modify_file calls when changes span multiple files. This is the PREFERRED tool for multi-file fixes like CSS + layout changes.",
    parameters: {
      type: "object",
      properties: {
        modifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filePath: {
                type: "string",
                description: "Relative path to the file",
              },
              action: {
                type: "string",
                enum: ["modify", "create", "delete"],
                description: "What to do with the file",
              },
              content: {
                type: "string",
                description:
                  "The COMPLETE file content (required for modify/create, ignored for delete). For 'modify', MUST be the ENTIRE file with all original lines plus additions.",
              },
              description: {
                type: "string",
                description: "Brief description of what this change does",
              },
            },
            required: ["filePath", "action", "description"],
          },
          description:
            "Array of file modifications to apply atomically",
        },
      },
      required: ["modifications"],
    },
  },
};

const selfGetProtectedFiles: Tool = {
  type: "function",
  function: {
    name: "self_get_protected_files",
    description:
      "List all protected files that cannot be modified by the self-improvement engine. These are critical security, auth, and infrastructure files.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};


// ─── Navigation Tool ────────────────────────────────────────────────

const navigateToPage: Tool = {
  type: "function",
  function: {
    name: "navigate_to_page",
    description:
      "Navigate the user to a specific page within the Archibald Titan app. Use this when the user asks about a feature, wants to set something up, or needs to go somewhere. Returns a clickable link. Available pages: CORE: dashboard, dashboard/credits, dashboard/subscription, project-files, sandbox, pricing, contact. FETCHER: fetcher/new, fetcher/jobs, fetcher/credentials, fetcher/export, fetcher/import, fetcher/api-access, fetcher/smart-fetch, fetcher/cli, fetcher/watchdog, fetcher/provider-health, fetcher/health-trends, fetcher/credential-health, fetcher/leak-scanner, fetcher/bulk-sync, fetcher/auto-sync, fetcher/onboarding, fetcher/team, fetcher/team-vault, fetcher/totp-vault, fetcher/notifications, fetcher/history, fetcher/audit-logs, fetcher/developer-docs, fetcher/webhooks, fetcher/api-analytics, fetcher/account, fetcher/settings, fetcher/killswitch, fetcher/releases, fetcher/admin, fetcher/self-improvement. BUSINESS: marketplace, replicate, companies, business-plans, grants, grant-applications, crowdfunding, referrals, affiliate. MARKETING: blog, blog-admin, seo, marketing, advertising.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description:
            "The page path to navigate to (e.g. 'fetcher/account' for Account Settings & 2FA, 'fetcher/credentials' for Credentials, 'dashboard' for Titan Assistant)",
        },
        reason: {
          type: "string",
          description:
            "Brief explanation of why navigating there (shown to user)",
        },
      },
      required: ["page", "reason"],
    },
  },
};

// ─── Web Research ────────────────────────────────────────────────────

const webSearch: Tool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current information, news, facts, documentation, or any topic. Use this PROACTIVELY whenever the user asks about anything that benefits from up-to-date information, factual data, research, or real-world references. Use multiple searches with different query phrasings for comprehensive research. After searching, ALWAYS use web_page_read on at least 2-3 results to get full details. Cite sources with URLs in your response. Returns search results with titles, snippets, and URLs.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Be specific and use keywords for best results.",
        },
      },
      required: ["query"],
    },
  },
};

const webPageRead: Tool = {
  type: "function",
  function: {
    name: "web_page_read",
    description:
      "Read and extract the main text content from a web page URL. Use this after web_search to get full details from search results. Read at least 2-3 pages for comprehensive research. Cross-validate information across multiple sources. Returns the page title and main text content.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the web page to read.",
        },
      },
      required: ["url"],
    },
  },
};

// ─── Sandbox Tools ─────────────────────────────────────────────────

const sandboxExec: Tool = {
  type: "function",
  function: {
    name: "sandbox_exec",
    description:
      "Execute a shell command in the user's persistent sandbox environment. The sandbox is a Linux environment with Python 3.11 and pre-installed cybersecurity tools (nmap, scapy, requests, beautifulsoup4, paramiko, cryptography, pycryptodome). You can run any command: compile code, install packages (pip install), run scripts, use security tools, etc. Output is captured and returned. Use this to actually RUN code you've built, test applications, execute security scans, or run any command-line tool. Always test your code after writing it.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute (e.g., 'python3 scanner.py', 'npm test', 'nmap -sV target.com')",
        },
        sandboxId: {
          type: "number",
          description: "The sandbox ID to execute in. If not provided, uses the user's default sandbox (auto-created if needed).",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds (default: 60000, max: 300000)",
        },
      },
      required: ["command"],
    },
  },
};

const sandboxWriteFile: Tool = {
  type: "function",
  function: {
    name: "sandbox_write_file",
    description:
      "Write a file to the user's sandbox environment. Use this to create scripts, config files, source code, or any file that can then be executed with sandbox_exec. The file persists across sessions.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path within the sandbox (e.g., '/home/sandbox/scanner.py')",
        },
        content: {
          type: "string",
          description: "The file content to write",
        },
        sandboxId: {
          type: "number",
          description: "The sandbox ID. If not provided, uses the user's default sandbox.",
        },
      },
      required: ["path", "content"],
    },
  },
};

const sandboxReadFile: Tool = {
  type: "function",
  function: {
    name: "sandbox_read_file",
    description:
      "Read a file from the user's sandbox environment. Use this to check output files, read logs, or inspect code that was generated.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path within the sandbox to read",
        },
        sandboxId: {
          type: "number",
          description: "The sandbox ID. If not provided, uses the user's default sandbox.",
        },
      },
      required: ["path"],
    },
  },
};

const sandboxListFiles: Tool = {
  type: "function",
  function: {
    name: "sandbox_list_files",
    description:
      "List files and directories in the user's sandbox. Use this to explore the sandbox filesystem.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (default: /home/sandbox)",
        },
        sandboxId: {
          type: "number",
          description: "The sandbox ID. If not provided, uses the user's default sandbox.",
        },
      },
      required: [],
    },
  },
};

// ─── Security Tools ────────────────────────────────────────────────

const securityScan: Tool = {
  type: "function",
  function: {
    name: "security_scan",
    description:
      "Run a passive security scan on a target URL. Analyzes HTTP security headers, cookies, SSL/TLS configuration, and generates a professional security report. This is a non-intrusive scan that only sends HEAD requests.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "The target URL or domain to scan (e.g., 'example.com' or 'https://example.com')",
        },
      },
      required: ["target"],
    },
  },
};

const codeSecurityReview: Tool = {
  type: "function",
  function: {
    name: "code_security_review",
    description:
      "Perform an AI-powered security code review on provided source files. Analyzes for SQL injection, XSS, CSRF, authentication bypasses, insecure crypto, hardcoded secrets, path traversal, command injection, and more. Returns a detailed report with severity ratings and fix suggestions.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string", description: "The filename" },
              content: { type: "string", description: "The file content to review" },
            },
            required: ["filename", "content"],
          },
          description: "Array of files to review",
        },
      },
      required: ["files"],
    },
  },
};

const portScan: Tool = {
  type: "function",
  function: {
    name: "port_scan",
    description:
      "Scan common ports on a target host to discover open services. Checks 21 common ports (FTP, SSH, HTTP, HTTPS, MySQL, PostgreSQL, Redis, MongoDB, etc.) and identifies running services.",
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "The target hostname or IP address to scan",
        },
        ports: {
          type: "array",
          items: { type: "number" },
          description: "Optional: specific port numbers to scan. If not provided, scans 21 common ports.",
        },
      },
      required: ["host"],
    },
  },
};

const sslCheck: Tool = {
  type: "function",
  function: {
    name: "ssl_check",
    description:
      "Check the SSL/TLS certificate of a target host. Returns certificate details including issuer, validity dates, days until expiry, TLS version, and any security issues.",
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "The target hostname to check (e.g., 'example.com')",
        },
      },
      required: ["host"],
    },
  },
};

// ─── Auto-Fix Tools ────────────────────────────────────────────────

const autoFixVulnerability: Tool = {
  type: "function",
  function: {
    name: "auto_fix_vulnerability",
    description:
      "Automatically fix a single vulnerability found by the code security reviewer. Takes source code and a specific vulnerability, uses AI to generate patched code with explanations and confidence scores.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "The filename of the code to fix" },
        code: { type: "string", description: "The full source code of the file" },
        issueTitle: { type: "string", description: "Title of the vulnerability" },
        issueSeverity: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Severity level" },
        issueCategory: { type: "string", description: "Category (e.g., sql_injection, xss)" },
        issueDescription: { type: "string", description: "Detailed description" },
        issueSuggestion: { type: "string", description: "Suggested fix from code review" },
        issueLine: { type: "number", description: "Line number (optional)" },
      },
      required: ["filename", "code", "issueTitle", "issueSeverity", "issueCategory", "issueDescription", "issueSuggestion"],
    },
  },
};

const autoFixAll: Tool = {
  type: "function",
  function: {
    name: "auto_fix_all_vulnerabilities",
    description:
      "Automatically fix ALL vulnerabilities in one batch. Takes source files and the full review report, generates patched code for every fixable issue. Fixes applied cumulatively (critical first).",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              content: { type: "string" },
            },
            required: ["filename", "content"],
          },
          description: "Array of source files to fix",
        },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
              category: { type: "string" },
              description: { type: "string" },
              suggestion: { type: "string" },
              file: { type: "string" },
              line: { type: "number" },
            },
            required: ["title", "severity", "category", "description", "suggestion", "file"],
          },
          description: "Array of vulnerability issues from code review",
        },
      },
      required: ["files", "issues"],
    },
  },
};

// ─── App Research & Clone Tools ────────────────────────────────────

const appResearch: Tool = {
  type: "function",
  function: {
    name: "app_research",
    description:
      "Research an existing application by analyzing its website, features, UI patterns, and functionality. Produces a structured feature analysis report. Use before app_clone.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "URL or name of the app to research" },
        focusAreas: { type: "array", items: { type: "string" }, description: "Specific features to focus on (optional)" },
      },
      required: ["target"],
    },
  },
};

const appClone: Tool = {
  type: "function",
  function: {
    name: "app_clone",
    description:
      "Generate a complete build plan and start building a clone of an application based on research results. Creates the full project structure and builds it step by step in the sandbox.",
    parameters: {
      type: "object",
      properties: {
        appName: { type: "string", description: "Name for the clone project" },
        features: { type: "array", items: { type: "string" }, description: "Features to implement" },
        techStack: { type: "string", description: "Preferred tech stack (optional)" },
        priority: { type: "string", enum: ["mvp", "full"], description: "mvp for core features, full for complete parity" },
      },
      required: ["appName", "features"],
    },
  },
};

const websiteReplicate: Tool = {
  type: "function",
  function: {
    name: "website_replicate",
    description:
      "Create a Website Replicate project that researches a target website/app, analyzes its features, generates a build plan, and builds a working clone with custom branding and optional Stripe payment integration. This is the full-featured replication workflow. Use navigate_to_page to send the user to /replicate to view their projects.",
    parameters: {
      type: "object",
      properties: {
        targetUrl: { type: "string", description: "URL or name of the website/app to replicate" },
        targetName: { type: "string", description: "Name for the replicate project" },
        priority: { type: "string", enum: ["mvp", "full"], description: "mvp for core features only, full for complete feature parity" },
        brandName: { type: "string", description: "Custom brand name to use instead of the original (optional)" },
        brandTagline: { type: "string", description: "Custom tagline for the clone (optional)" },
        autoResearch: { type: "boolean", description: "If true, automatically start research after creating the project (default: true)" },
      },
      required: ["targetUrl", "targetName"],
    },
  },
};

// ─── Professional Builder Tools ─────────────────────────────────────

const selfDependencyAudit: Tool = {
  type: "function",
  function: {
    name: "self_dependency_audit",
    description:
      "Audit project dependencies for known vulnerabilities, outdated packages, and license issues. Scans package.json and reports security advisories, version drift, and upgrade recommendations. Use this before deploying or after adding new packages.",
    parameters: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["security", "outdated", "all"],
          description: "Focus area: 'security' for CVEs only, 'outdated' for version drift, 'all' for comprehensive audit (default: all)",
        },
      },
      required: [],
    },
  },
};

const selfGrepCodebase: Tool = {
  type: "function",
  function: {
    name: "self_grep_codebase",
    description:
      "Search the entire codebase for a pattern using regex. Returns matching lines with file paths and line numbers. Useful for finding usages, dead code, hardcoded secrets, TODO/FIXME comments, deprecated API calls, or tracing how a function/variable is used across the project. Excludes node_modules and dist.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for (e.g., 'TODO|FIXME|HACK', 'password.*=.*[\"\']', 'console\\.log')",
        },
        filePattern: {
          type: "string",
          description: "Glob pattern to filter files (e.g., '*.ts', '*.tsx', 'server/**/*.ts'). Default: all source files",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
        },
      },
      required: ["pattern"],
    },
  },
};

const selfGitDiff: Tool = {
  type: "function",
  function: {
    name: "self_git_diff",
    description:
      "Preview the current uncommitted changes in the codebase. Shows a git-style diff of all modified, added, and deleted files. Use this to review staged changes before flushing or pushing to GitHub, or to verify what modifications were made during a build session.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Optional: show diff for a specific file only. If omitted, shows all changes.",
        },
        staged: {
          type: "boolean",
          description: "If true, show only staged (git add) changes. Default: show all working tree changes.",
        },
      },
      required: [],
    },
  },
};

const selfEnvCheck: Tool = {
  type: "function",
  function: {
    name: "self_env_check",
    description:
      "Verify that all required environment variables are set and valid. Checks for missing variables, empty values, and common misconfigurations. Reports which services are properly configured (database, API keys, GitHub, Stripe, etc.) without revealing actual secret values.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const selfDbSchemaInspect: Tool = {
  type: "function",
  function: {
    name: "self_db_schema_inspect",
    description:
      "Inspect the current database schema. Lists all tables with their columns, types, indexes, and foreign keys. Use this to understand the data model before making changes, to verify migrations ran correctly, or to plan new features that need database changes.",
    parameters: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Optional: inspect a specific table only. If omitted, lists all tables with summary.",
        },
      },
      required: [],
    },
  },
};

const selfCodeStats: Tool = {
  type: "function",
  function: {
    name: "self_code_stats",
    description:
      "Get comprehensive codebase statistics: total lines of code, file counts by type, largest files, function counts, import analysis, and complexity indicators. Use this to understand project scale, identify bloated files, or track growth over time.",
    parameters: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Optional: analyze a specific directory (e.g., 'server', 'client/src'). Default: entire project.",
        },
      },
      required: [],
    },
  },
};

const selfDeploymentCheck: Tool = {
  type: "function",
  function: {
    name: "self_deployment_check",
    description:
      "Run a comprehensive pre-deployment readiness check. Validates: TypeScript compilation, environment variables, database connectivity, API endpoint health, critical file integrity, and configuration consistency. Returns a pass/fail report with actionable fix suggestions for any issues found.",
    parameters: {
      type: "object",
      properties: {
        quick: {
          type: "boolean",
          description: "If true, run only critical checks (env + db + types). Default: full check.",
        },
      },
      required: [],
    },
  },
};

// ─── Checkpoint Tools────────────────────────────────────────────────────

const selfSaveCheckpoint: Tool = {
  type: "function",
  function: {
    name: "self_save_checkpoint",
    description:
      "Save a named checkpoint of the entire project. Captures ALL source files (server, client, shared, drizzle, configs) so the project can be fully restored later. Use this BEFORE making risky changes, after completing a major feature, or when the user asks to save progress. The checkpoint is stored in the database and marked as known-good.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "A descriptive name for this checkpoint. Examples: 'before-auth-refactor', 'marketplace-v2-complete', 'pre-deploy-feb-20'. Keep it short and meaningful.",
        },
      },
      required: ["name"],
    },
  },
};

const selfListCheckpoints: Tool = {
  type: "function",
  function: {
    name: "self_list_checkpoints",
    description:
      "List all saved checkpoints (most recent first). Shows checkpoint name, file count, status, and creation date. Use this to find a checkpoint ID before rolling back.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of checkpoints to return. Default: 20.",
        },
      },
      required: [],
    },
  },
};

const selfRollbackToCheckpoint: Tool = {
  type: "function",
  function: {
    name: "self_rollback_to_checkpoint",
    description:
      "Rollback the entire project to a saved checkpoint. Restores ALL files that were captured in that checkpoint. If no checkpoint ID is provided, rolls back to the most recent checkpoint. SAFETY: Automatically saves a backup of the current state before rolling back, so you can always undo the rollback.",
    parameters: {
      type: "object",
      properties: {
        checkpointId: {
          type: "number",
          description:
            "The checkpoint ID to roll back to. Use self_list_checkpoints to find available IDs. If omitted, rolls back to the most recent checkpoint.",
        },
      },
      required: [],
    },
  },
};

// ─── Advanced Builder Analysis Tools ──────────────────────────────────────

const selfAnalyzeFile: Tool = {
  type: "function",
  function: {
    name: "self_analyze_file",
    description:
      "Deep analysis of a source file: lists all imports, exports, functions, classes, and identifies potential issues like missing error handling, unused variables, or security concerns. Use this BEFORE modifying any file to understand its structure.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the file to analyze (e.g. 'server/chat-router.ts')",
        },
      },
      required: ["filePath"],
    },
  },
};

const selfFindDeadCode: Tool = {
  type: "function",
  function: {
    name: "self_find_dead_code",
    description:
      "Scan the codebase for dead code: exported functions/constants that are never imported anywhere else. Helps identify cleanup opportunities and reduce bundle size.",
    parameters: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directory to scan (default: 'server'). Options: 'server', 'client/src', 'shared'",
        },
      },
      required: [],
    },
  },
};

const selfApiMap: Tool = {
  type: "function",
  function: {
    name: "self_api_map",
    description:
      "Map all API endpoints in the project: tRPC procedures (with auth level), Express routes, and webhook handlers. Essential before adding or modifying any API endpoint to avoid conflicts and understand the full API surface.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};


// ─── Project Builder Tools (create real downloadable files) ──────────
const createProjectFile: Tool = {
  type: "function",
  function: {
    name: "create_file",
    description:
      "Create a file in the user's project. The file is stored permanently and the user can view, download, and push it to GitHub. ALWAYS use this tool instead of pasting code in your message. The user CANNOT copy code from chat — they need actual files.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          description: "File name with path (e.g., 'src/index.html', 'package.json', 'styles/main.css')",
        },
        content: {
          type: "string",
          description: "The complete file content",
        },
        language: {
          type: "string",
          description: "Programming language for syntax highlighting (e.g., 'html', 'css', 'javascript', 'typescript', 'python', 'json')",
        },
      },
      required: ["fileName", "content"],
    },
  },
};
const createGithubRepo: Tool = {
  type: "function",
  function: {
    name: "create_github_repo",
    description:
      "Create a new GitHub repository for the user's project. Requires the user to have connected their GitHub PAT in settings. Returns the repo URL.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Repository name (lowercase, hyphens allowed, e.g., 'my-landing-page')",
        },
        description: {
          type: "string",
          description: "Short description of the repository",
        },
        isPrivate: {
          type: "boolean",
          description: "Whether the repo should be private (default: true)",
        },
      },
      required: ["name"],
    },
  },
};
const pushToGithubRepo: Tool = {
  type: "function",
  function: {
    name: "push_to_github",
    description:
      "Push all project files from the current conversation to a GitHub repository. The repo must have been created first with create_github_repo, or the user can provide an existing repo name.",
    parameters: {
      type: "object",
      properties: {
        repoFullName: {
          type: "string",
          description: "Full repo name (e.g., 'username/repo-name'). If not provided, uses the last created repo.",
        },
        commitMessage: {
          type: "string",
          description: "Git commit message (default: 'Initial commit from Titan Builder')",
        },
      },
      required: [],
    },
  },
};
const readUploadedFile: Tool = {
  type: "function",
  function: {
    name: "read_uploaded_file",
    description:
      "Read the content of a file that the user uploaded to the chat. Use this when the user uploads a file and you need to read its contents to understand what they want.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the uploaded file (provided in the user's message as [Attached file: ...])",
        },
      },
      required: ["url"],
    },
  },
};

// ─── Grand Bazaar Search ───────────────────────────────────────────────

const searchBazaar: Tool = {
  type: "function",
  function: {
    name: "search_bazaar",
    description:
      "Search the Grand Bazaar marketplace for existing modules, blueprints, agents, exploits, and templates that match the user's needs. IMPORTANT: You MUST call this tool BEFORE building anything from scratch. If a matching module exists, recommend it to the user — buying is always cheaper and faster than building. Returns matching listings with title, description, price in credits, seller name, rating, and category.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords describing what the user wants to build or needs. Examples: 'SQL injection scanner', 'password manager', 'API security testing', 'phishing detection', 'SIEM pipeline'",
        },
        category: {
          type: "string",
          enum: ["agents", "modules", "blueprints", "artifacts", "exploits", "templates", "datasets", "other"],
          description: "Optional category filter to narrow results",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default 5, max 10)",
        },
      },
      required: ["query"],
    },
  },
};

// ─── Autonomous System Management Tools ─────────────────────────────────

const getAutonomousStatus: Tool = {
  type: "function",
  function: {
    name: "get_autonomous_status",
    description:
      "Get the full status of all autonomous systems (SEO, advertising, affiliate, content generation, security sweeps, marketplace). Shows which systems are active, degraded, or blocked, which marketing channels are connected, content queue size, and recommendations. Use this when the user asks about system health, what's running, or channel status.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const getChannelStatus: Tool = {
  type: "function",
  function: {
    name: "get_channel_status",
    description:
      "Get the connection status of all marketing/advertising channels. Shows which channels have API tokens configured and which are missing. Includes setup URLs for easy configuration. Use when the user asks which channels are active or what tokens are needed.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const refreshVaultBridge: Tool = {
  type: "function",
  function: {
    name: "refresh_vault_bridge",
    description:
      "Refresh the vault-to-ENV bridge. This re-reads all API tokens from the owner's encrypted vault and patches them into the runtime environment so marketing channels can use them. Call this after saving a new credential to make it immediately available to all autonomous systems.",
    parameters: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "If true, overwrite existing ENV values with vault values. Default false (only fills empty values).",
        },
      },
      required: [],
    },
  },
};

const getVaultBridgeInfo: Tool = {
  type: "function",
  function: {
    name: "get_vault_bridge_info",
    description:
      "Get information about the vault-to-ENV bridge — shows which channels are unlocked via vault tokens, which are still missing, and when the bridge last ran. Use this to diagnose why a channel isn't working or to check if a newly saved token has been picked up.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// ─── Export All Tools ────────────────────────────────────────────────────

export const TITAN_TOOLS: Tool[] = [
  // Navigation
  navigateToPage,
  // Web Research
  webSearch,
  webPageRead,
  // Credentials & Fetching
  listCredentials,
  revealCredential,
  exportCredentials,
  createFetchJob,
  listJobs,
  getJobDetails,
  listProviders,
  // API Keys
  listApiKeys,
  createApiKey,
  revokeApiKey,
  // Leak Scanner
  startLeakScan,
  getLeakScanResults,
  // Vault
  listVaultEntries,
  addVaultEntry,
  // Save Credential (manual input via chat)
  saveCredential,
  // Bulk Sync
  triggerBulkSync,
  getBulkSyncStatus,
  // Team
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  // Scheduler
  listSchedules,
  createSchedule,
  deleteSchedule,
  // Watchdog
  getWatchdogSummary,
  // Provider Health
  checkProviderHealth,
  // Recommendations
  getRecommendations,
  // Audit
  getAuditLogs,
  // Kill Switch
  activateKillSwitch,
  // System
  getSystemStatus,
  getPlanUsage,
  // Sandbox
  sandboxExec,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  // Security
  securityScan,
  codeSecurityReview,
  portScan,
  sslCheck,
  // Auto-Fix
  autoFixVulnerability,
  autoFixAll,
  // Grand Bazaar — search before building
  searchBazaar,
  // App Research & Clone
  appResearch,
  appClone,
  websiteReplicate,
  // Project Builder (create real downloadable files)
  createProjectFile,
  createGithubRepo,
  pushToGithubRepo,
  readUploadedFile,
  // Self-Improvement
  selfReadFile,
  selfListFiles,
  selfModifyFile,
  selfHealthCheck,
  selfRollback,
  selfRestart,
  selfModificationHistory,
  selfGetProtectedFiles,
  // Builder Tools
  selfTypeCheck,
  selfRunTests,
  selfMultiFileModify,
  // Autonomous System Management
  getAutonomousStatus,
  getChannelStatus,
  refreshVaultBridge,
  getVaultBridgeInfo,
  // Advanced Builder Tools
  selfDependencyAudit,
  selfGrepCodebase,
  selfGitDiff,
  selfEnvCheck,
  selfDbSchemaInspect,
  selfCodeStats,
  selfDeploymentCheck,
  selfSaveCheckpoint,
  selfListCheckpoints,
  selfRollbackToCheckpoint,
  selfAnalyzeFile,
  selfFindDeadCode,
  selfApiMap,
];

// Focused tool subset for build/research requests — fewer tools = less model confusion
// IMPORTANT: Do NOT include sandbox tools here — they confuse the LLM into writing
// to /home/sandbox/ instead of using self_modify_file for actual source code changes.
export const BUILDER_TOOLS: Tool[] = [
  // Navigation
  navigateToPage,
  // Web Research
  webSearch,
  webPageRead,
  // Self-Improvement / Builder — THE ONLY file tools for code modifications
  selfReadFile,
  selfListFiles,
  selfModifyFile,
  selfMultiFileModify,
  selfHealthCheck,
  selfRollback,
  selfRestart,
  selfModificationHistory,
  selfGetProtectedFiles,
  // Builder verification tools
  selfTypeCheck,
  selfRunTests,
  // Grand Bazaar — search before building
  searchBazaar,
  // Professional builder tools — engineering competence
  selfDependencyAudit,
  selfGrepCodebase,
  selfGitDiff,
  selfEnvCheck,
  selfDbSchemaInspect,
  selfCodeStats,
  selfDeploymentCheck,
  // Checkpoint tools — save and restore project state
  selfSaveCheckpoint,
  selfListCheckpoints,
  selfRollbackToCheckpoint,
  // Advanced analysis tools
  selfAnalyzeFile,
  selfFindDeadCode,
  selfApiMap,
  // System
  getSystemStatus,
];

// Focused tool subset for EXTERNAL project building — creates real files the user can download
// Now includes sandbox tools so the builder can actually run, test, and install dependencies
export const EXTERNAL_BUILD_TOOLS: Tool[] = [
  // Core builder tools — create real files
  createProjectFile,
  readUploadedFile,
  // Sandbox tools — execute code, read/write/list files in the sandbox
  sandboxExec,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  // Web Research
  webSearch,
  webPageRead,
  // Grand Bazaar — search before building
  searchBazaar,
  // GitHub integration
  createGithubRepo,
  pushToGithubRepo,
  // Credentials — access saved fetcher tokens and user-provided API keys
  listCredentials,
  revealCredential,
  listVaultEntries,
  // Navigation
  navigateToPage,
  // System
  getSystemStatus,
];

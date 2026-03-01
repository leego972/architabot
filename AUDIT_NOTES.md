# Audit Notes - Chat Executor Subscription Gating

## Issue Found
The `chat-executor.ts` `executeToolCall` function has NO subscription tier gating.
All premium features are accessible through AI chat regardless of user plan.

## Tools That Need Gating

### Security Tools (Cyber+ tier: cyber, cyber_plus, titan)
- `start_leak_scan` → enforceFeature(planId, "leak_scanner", "Leak Scanner")
- `get_leak_scan_results` → enforceFeature(planId, "leak_scanner", "Leak Scanner")
- `security_scan` → enforceFeature(planId, "security_tools", "Security Scan")
- `code_security_review` → enforceFeature(planId, "security_tools", "Code Security Review")
- `port_scan` → enforceFeature(planId, "security_tools", "Port Scan")
- `ssl_check` → enforceFeature(planId, "security_tools", "SSL Check")
- `auto_fix_vulnerability` → enforceFeature(planId, "security_tools", "Auto-Fix")
- `auto_fix_all_vulnerabilities` → enforceFeature(planId, "security_tools", "Auto-Fix All")

### Clone Website (Cyber+ and Titan only)
- `website_replicate` → canUseCloneWebsite(userId)

### Team Management (Enterprise+)
- `list_team_members` → enforceFeature(planId, "team_management", "Team Management")
- `add_team_member` → enforceFeature(planId, "team_management", "Team Management")
- `remove_team_member` → enforceFeature(planId, "team_management", "Team Management")
- `update_team_member_role` → enforceFeature(planId, "team_management", "Team Management")

### Pro+ Features
- `activate_kill_switch` → enforceFeature(planId, "kill_switch", "Kill Switch")
- `trigger_bulk_sync` → enforceFeature(planId, "scheduled_fetches", "Bulk Sync")
- `create_schedule` → enforceFeature(planId, "scheduled_fetches", "Scheduled Fetches")
- `get_audit_logs` → enforceFeature(planId, "audit_logs", "Audit Logs")
- `create_api_key` → enforceFeature(planId, "api_access", "API Access")
- `list_api_keys` → enforceFeature(planId, "api_access", "API Access")
- `revoke_api_key` → enforceFeature(planId, "api_access", "API Access")

### Free tier tools (no gating needed)
- `navigate_to_page`, `web_search`, `web_page_read`
- `list_credentials`, `reveal_credential`, `export_credentials`
- `create_fetch_job` (but needs enforceFetchLimit + enforceProviderAccess)
- `list_jobs`, `get_job_details`, `list_providers`
- `list_vault_entries`, `add_vault_entry`
- `get_watchdog_summary`, `check_provider_health`, `get_recommendations`
- `get_system_status`, `get_plan_usage`
- `sandbox_*` tools, `create_file`, `create_github_repo`, `push_to_github`
- `self_*` tools (already gated by admin check in chat-router.ts)

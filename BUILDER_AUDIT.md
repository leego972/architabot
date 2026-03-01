# Builder & Self-Modification Audit

## sandbox-engine.ts — AUDIT RESULTS

### Functions Verified:
1. ✅ `createSandbox()` — Creates workspace dir, DB record, sets status to running
2. ✅ `getSandbox()` — Verifies ownership via userId
3. ✅ `listSandboxes()` — Ordered by lastActiveAt
4. ✅ `deleteSandbox()` — Cleans up workspace + DB records
5. ✅ `executeCommand()` — Full command execution with:
   - Blocked command checking
   - Working directory tracking (cd handling)
   - Timeout enforcement
   - Output truncation at 100KB
   - Environment variable injection
   - Command history logging
6. ✅ `getCommandHistory()` — Returns last N commands
7. ✅ `listFiles()` — Directory listing with size/type
8. ✅ `readFile()` — File reading with 1MB limit
9. ✅ `writeFile()` — File writing with auto-mkdir
10. ✅ `persistWorkspace()` — Tarball to S3
11. ✅ `updateEnvVars()` — Merge env vars
12. ✅ `installPackage()` — apt/pip/npm with tracking

### Potential Issues Found:
- ISSUE 1: `executeCommand` line 319 — `error.code` may be undefined for non-exit errors, falls back to 1 (acceptable)
- ISSUE 2: No workspace restoration from S3 — `persistWorkspace` saves but there's no `restoreWorkspace` function
- ISSUE 3: `installPackage` runs commands like `sudo apt-get install` which won't work in the sandboxed temp dir (no real sudo)
- ISSUE 4: PATH includes sandbox-local bin but doesn't include node_modules/.bin
- ISSUE 5: No `deleteFile` function exported

## Needs:
- Add `restoreWorkspace()` function to load workspace from S3
- Add `deleteFile()` function
- Fix PATH to include node_modules/.bin for npm scripts

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const fs = require("fs");

// Use sql.js (pure JS SQLite) instead of better-sqlite3 (native C++ addon)
// This ensures cross-platform compatibility — no native binary compilation needed
let initSqlJs;
try {
  initSqlJs = require("sql.js");
} catch (e) {
  console.error("[Titan] Failed to load sql.js:", e.message);
  process.exit(1);
}

const DATA_DIR = path.join(os.homedir(), ".archibald-titan");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "titan.db");
const LICENSE_PATH = path.join(DATA_DIR, "license.json");
const REMOTE_URL = "https://archibaldtitan.com";

let db = null, server = null, port = 0;
let cachedLicense = null;

// ─── Bundle Sync ────────────────────────────────────────────────────
const BUNDLE_DIR = path.join(DATA_DIR, "bundle");
const BUNDLE_VERSION_PATH = path.join(DATA_DIR, "bundle-version.json");
let syncStatus = { status: "idle", version: null, lastCheck: null, error: null };

function getLocalBundleVersion() {
  try {
    if (fs.existsSync(BUNDLE_VERSION_PATH)) {
      return JSON.parse(fs.readFileSync(BUNDLE_VERSION_PATH, "utf8"));
    }
  } catch {}
  return null;
}

function saveLocalBundleVersion(manifest) {
  fs.writeFileSync(BUNDLE_VERSION_PATH, JSON.stringify(manifest, null, 2));
}

async function checkAndSyncBundle() {
  try {
    syncStatus = { ...syncStatus, status: "checking", lastCheck: new Date().toISOString() };
    console.log("[BundleSync] Checking for updates...");

    const res = await fetch(REMOTE_URL + "/api/desktop/bundle-manifest");
    if (!res.ok) {
      syncStatus = { ...syncStatus, status: "idle", error: "Manifest fetch failed: " + res.status };
      return;
    }
    const manifest = await res.json();
    const local = getLocalBundleVersion();

    // Skip if same hash
    if (local && local.hash === manifest.hash) {
      syncStatus = { ...syncStatus, status: "up-to-date", version: manifest.version };
      console.log("[BundleSync] Already up to date (" + manifest.version + ")");
      return;
    }

    // Download new bundle
    console.log("[BundleSync] New version available: " + manifest.version + " (hash: " + manifest.hash + ")");
    syncStatus = { ...syncStatus, status: "downloading", version: manifest.version };

    const tarRes = await fetch(REMOTE_URL + "/api/desktop/bundle.tar.gz");
    if (!tarRes.ok) {
      syncStatus = { ...syncStatus, status: "error", error: "Download failed: " + tarRes.status };
      return;
    }

    const tarBuffer = Buffer.from(await tarRes.arrayBuffer());
    console.log("[BundleSync] Downloaded " + (tarBuffer.length / 1024 / 1024).toFixed(1) + "MB");

    // Extract to a temp dir first, then swap
    const tmpDir = path.join(DATA_DIR, "bundle-tmp-" + Date.now());
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmpTar = path.join(DATA_DIR, "bundle-download.tar.gz");
    fs.writeFileSync(tmpTar, tarBuffer);

    const { execSync } = require("child_process");
    try {
      execSync(`tar -xzf "${tmpTar}" -C "${tmpDir}"`, { timeout: 30000 });
    } catch (e) {
      syncStatus = { ...syncStatus, status: "error", error: "Extract failed: " + e.message };
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      try { fs.unlinkSync(tmpTar); } catch {}
      return;
    }

    // Verify extraction produced an index.html
    if (!fs.existsSync(path.join(tmpDir, "index.html"))) {
      syncStatus = { ...syncStatus, status: "error", error: "Invalid bundle: no index.html" };
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      try { fs.unlinkSync(tmpTar); } catch {}
      return;
    }

    // Atomic swap: remove old bundle, rename tmp to bundle
    syncStatus = { ...syncStatus, status: "installing" };
    const oldBundle = path.join(DATA_DIR, "bundle-old-" + Date.now());
    if (fs.existsSync(BUNDLE_DIR)) {
      fs.renameSync(BUNDLE_DIR, oldBundle);
    }
    fs.renameSync(tmpDir, BUNDLE_DIR);

    // Clean up
    try { fs.rmSync(oldBundle, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(tmpTar); } catch {}

    // Save version info
    saveLocalBundleVersion(manifest);
    syncStatus = { status: "synced", version: manifest.version, lastCheck: new Date().toISOString(), error: null };
    console.log("[BundleSync] Successfully synced to v" + manifest.version);

    // Notify renderer
    if (typeof sendToMainWindow === "function") sendToMainWindow("bundle-synced", manifest);
  } catch (e) {
    console.error("[BundleSync] Error:", e.message);
    syncStatus = { ...syncStatus, status: "error", error: e.message };
  }
}

// ─── SSE Bundle Stream: Instant deploy notifications ───────────────
let bundleStreamRetryTimeout = null;
function connectBundleStream() {
  const url = REMOTE_URL + "/api/desktop/bundle-stream";
  console.log("[BundleStream] Connecting to " + url);

  fetch(url, { headers: { "Accept": "text/event-stream" } })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        console.warn("[BundleStream] Connection failed: " + res.status);
        scheduleBundleStreamReconnect();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      console.log("[BundleStream] Connected — listening for deploy notifications");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "bundle-updated") {
                console.log("[BundleStream] New deploy detected: v" + event.version + " (" + event.hash + ")");
                checkAndSyncBundle();
              }
            } catch {}
          }
        }
      }
      // Stream ended — reconnect
      scheduleBundleStreamReconnect();
    })
    .catch((e) => {
      console.warn("[BundleStream] Error: " + e.message);
      scheduleBundleStreamReconnect();
    });
}

function scheduleBundleStreamReconnect() {
  if (bundleStreamRetryTimeout) clearTimeout(bundleStreamRetryTimeout);
  bundleStreamRetryTimeout = setTimeout(() => {
    console.log("[BundleStream] Reconnecting...");
    connectBundleStream();
  }, 15000); // Retry every 15 seconds
}

// Allow main.js to set a callback for notifying the renderer
let sendToMainWindow = null;
function setSendToMainWindow(fn) { sendToMainWindow = fn; }

// ─── Device ID ──────────────────────────────────────────────────────
function getDeviceId() {
  const idPath = path.join(DATA_DIR, "device-id");
  if (fs.existsSync(idPath)) return fs.readFileSync(idPath, "utf8").trim();
  const id = crypto.randomUUID();
  fs.writeFileSync(idPath, id);
  return id;
}

// ─── License persistence ────────────────────────────────────────────
function saveLicense(data) {
  cachedLicense = data;
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2));
}

function loadLicense() {
  if (cachedLicense) return cachedLicense;
  if (!fs.existsSync(LICENSE_PATH)) return null;
  try {
    cachedLicense = JSON.parse(fs.readFileSync(LICENSE_PATH, "utf8"));
    return cachedLicense;
  } catch { return null; }
}

function clearLicense() {
  cachedLicense = null;
  if (fs.existsSync(LICENSE_PATH)) fs.unlinkSync(LICENSE_PATH);
}

// ─── Remote API calls ───────────────────────────────────────────────
async function remoteActivate(email, password) {
  const deviceId = getDeviceId();
  const res = await fetch(REMOTE_URL + "/api/trpc/desktopLicense.activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json: { email, password, deviceId, deviceName: os.hostname(), platform: process.platform }
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Activation failed");
  return data.result?.data?.json || data.result?.data;
}

async function remoteValidate(licenseKey) {
  const deviceId = getDeviceId();
  const res = await fetch(REMOTE_URL + "/api/trpc/desktopLicense.validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { licenseKey, deviceId } }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Validation failed");
  return data.result?.data?.json || data.result?.data;
}

async function remoteDeactivate(licenseKey) {
  const deviceId = getDeviceId();
  await fetch(REMOTE_URL + "/api/trpc/desktopLicense.deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { licenseKey, deviceId } }),
  }).catch(() => {});
}

// ─── Auth middleware ─────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const license = loadLicense();
  if (!license || !license.user) {
    return res.status(401).json({ error: "Not authenticated. Please log in." });
  }
  req.titanUser = license.user;
  req.titanCredits = license.credits;
  req.titanPlan = license.plan;
  next();
}

// ─── sql.js helper: run a statement ─────────────────────────────────
function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function dbInsert(sql, params = []) {
  db.run(sql, params);
  const lastId = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0;
  saveDB();
  return lastId;
}

function saveDB() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error("[Titan] Failed to save DB:", e.message);
  }
}

// ─── Local DB ───────────────────────────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } catch (e) {
      console.warn("[Titan] Corrupt DB, creating fresh:", e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA journal_mode = WAL");
  db.run(`CREATE TABLE IF NOT EXISTS credentials (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, provider TEXT DEFAULT 'manual', credential_type TEXT DEFAULT 'api_key', encrypted_value TEXT NOT NULL, iv TEXT NOT NULL, metadata TEXT DEFAULT '{}', tags TEXT DEFAULT '[]', is_favorite INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_rotated TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', credentials TEXT DEFAULT '[]', env_template TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL, tool_calls TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);

  const encKeyRow = dbGet("SELECT value FROM settings WHERE key = 'enc_key'");
  if (!encKeyRow) {
    dbRun("INSERT INTO settings (key, value) VALUES (?, ?)", ["enc_key", crypto.randomBytes(32).toString("hex")]);
  }
  saveDB();
}

function getEncKey() {
  const row = dbGet("SELECT value FROM settings WHERE key = 'enc_key'");
  return Buffer.from(row.value, "hex");
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncKey(), iv);
  let enc = cipher.update(text, "utf8", "hex") + cipher.final("hex") + cipher.getAuthTag().toString("hex");
  return { encrypted: enc, iv: iv.toString("hex") };
}

function decrypt(encHex, ivHex) {
  const iv = Buffer.from(ivHex, "hex"), tag = Buffer.from(encHex.slice(-32), "hex"), content = encHex.slice(0, -32);
  const d = crypto.createDecipheriv("aes-256-gcm", getEncKey(), iv);
  d.setAuthTag(tag);
  return d.update(content, "hex", "utf8") + d.final("utf8");
}

function logActivity(action, details) {
  dbRun("INSERT INTO activity_log (action, details) VALUES (?, ?)", [action, details]);
}

// ─── Server ─────────────────────────────────────────────────────────
function startServer() {
  return new Promise(async (resolve) => {
    await initDB();
    const app = express();
    app.use(express.json());
    const publicDir = path.join(__dirname, "public");
    if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

    // ── Health ──
    app.get("/api/health", (_, res) => {
      const bundleVer = getLocalBundleVersion();
      const pkgVersion = require("./package.json").version || "8.1.0";
      res.json({ status: "ok", mode: "desktop", version: pkgVersion, bundleVersion: bundleVer?.version || "built-in", bundleHash: bundleVer?.hash || null });
    });

    // ── Bundle Sync Status ──
    app.get("/api/desktop/sync-status", (_, res) => res.json(syncStatus));
    app.post("/api/desktop/sync-now", async (_, res) => {
      checkAndSyncBundle();
      res.json({ started: true });
    });

    // ── Mode: Get/Set online/offline ──
    app.get("/api/desktop/mode", (_, res) => {
      const modePath = path.join(DATA_DIR, "mode.json");
      let mode = "online";
      try {
        if (fs.existsSync(modePath)) {
          const data = JSON.parse(fs.readFileSync(modePath, "utf8"));
          if (data.mode === "online" || data.mode === "offline") mode = data.mode;
        }
      } catch {}
      res.json({ mode });
    });
    app.post("/api/desktop/mode", (req, res) => {
      const { mode } = req.body;
      if (mode !== "online" && mode !== "offline") {
        return res.status(400).json({ error: "Mode must be 'online' or 'offline'" });
      }
      const modePath = path.join(DATA_DIR, "mode.json");
      fs.writeFileSync(modePath, JSON.stringify({ mode }, null, 2));
      logActivity("mode_changed", "Switched to " + mode + " mode");
      res.json({ success: true, mode });
    });

    // ── Auth: Login (activate license) ──
    app.post("/api/desktop/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email and password required" });
        const result = await remoteActivate(email, password);
        saveLicense(result);
        logActivity("login", "Desktop login: " + email);
        res.json({ success: true, user: result.user, credits: result.credits, plan: result.plan });
      } catch (e) {
        res.status(401).json({ error: e.message || "Login failed" });
      }
    });

    // ── Auth: Logout (deactivate license) ──
    app.post("/api/desktop/logout", async (_, res) => {
      const license = loadLicense();
      if (license?.licenseKey) {
        await remoteDeactivate(license.licenseKey);
      }
      clearLicense();
      logActivity("logout", "Desktop logout");
      res.json({ success: true });
    });

    // ── Auth: Check session ──
    app.get("/api/desktop/session", (_, res) => {
      const license = loadLicense();
      if (!license || !license.user) return res.json({ authenticated: false });
      res.json({ authenticated: true, user: license.user, credits: license.credits, plan: license.plan, expiresAt: license.expiresAt });
    });

    // ── Auth: Validate & refresh license (called periodically) ──
    app.post("/api/desktop/refresh", async (_, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const result = await remoteValidate(license.licenseKey);
        saveLicense(result);
        res.json({ success: true, user: result.user, credits: result.credits, plan: result.plan });
      } catch (e) {
        clearLicense();
        res.status(401).json({ error: "License expired or revoked. Please log in again." });
      }
    });

    // ── Auth.me (tRPC-compatible for frontend) ──
    app.get("/api/trpc/auth.me", (_, res) => {
      const license = loadLicense();
      if (!license || !license.user) {
        return res.json({ result: { data: { json: null } } });
      }
      res.json({ result: { data: { json: license.user } } });
    });

    // ── Credits: Get balance (tRPC-compatible) ──
    app.get("/api/trpc/credits.getBalance", requireAuth, (req, res) => {
      const license = loadLicense();
      res.json({ result: { data: { json: license?.credits || { balance: 0, isUnlimited: false } } } });
    });

    // ── Local credentials (require auth) ──
    app.get("/api/local/credentials", requireAuth, (_, res) => {
      const rows = dbAll("SELECT * FROM credentials ORDER BY created_at DESC");
      res.json(rows.map(r => ({ ...r, value: decrypt(r.encrypted_value, r.iv), metadata: JSON.parse(r.metadata || "{}"), tags: JSON.parse(r.tags || "[]") })));
    });
    app.post("/api/local/credentials", requireAuth, (req, res) => {
      const { name, provider, credential_type, value, metadata, tags } = req.body;
      const { encrypted, iv } = encrypt(value || "");
      const id = dbInsert("INSERT INTO credentials (name, provider, credential_type, encrypted_value, iv, metadata, tags) VALUES (?,?,?,?,?,?,?)", [name, provider || "manual", credential_type || "api_key", encrypted, iv, JSON.stringify(metadata || {}), JSON.stringify(tags || [])]);
      logActivity("credential_added", "Added " + name);
      res.json({ id, success: true });
    });
    app.put("/api/local/credentials/:id", requireAuth, (req, res) => {
      const { name, provider, credential_type, value, metadata, tags, is_favorite, status } = req.body;
      const existing = dbGet("SELECT * FROM credentials WHERE id = ?", [Number(req.params.id)]);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const { encrypted, iv } = value ? encrypt(value) : { encrypted: existing.encrypted_value, iv: existing.iv };
      dbRun("UPDATE credentials SET name=?, provider=?, credential_type=?, encrypted_value=?, iv=?, metadata=?, tags=?, is_favorite=?, status=?, updated_at=datetime('now') WHERE id=?", [
        name || existing.name, provider || existing.provider, credential_type || existing.credential_type,
        encrypted, iv, JSON.stringify(metadata || JSON.parse(existing.metadata || "{}")),
        JSON.stringify(tags || JSON.parse(existing.tags || "[]")),
        is_favorite !== undefined ? is_favorite : existing.is_favorite,
        status || existing.status, Number(req.params.id)
      ]);
      logActivity("credential_updated", "Updated " + (name || existing.name));
      res.json({ success: true });
    });
    app.delete("/api/local/credentials/:id", requireAuth, (req, res) => {
      dbRun("DELETE FROM credentials WHERE id = ?", [Number(req.params.id)]);
      logActivity("credential_deleted", "Deleted credential #" + req.params.id);
      res.json({ success: true });
    });

    // ── Local projects (require auth) ──
    app.get("/api/local/projects", requireAuth, (_, res) => {
      const rows = dbAll("SELECT * FROM projects ORDER BY created_at DESC");
      res.json(rows.map(r => ({ ...r, credentials: JSON.parse(r.credentials || "[]") })));
    });
    app.post("/api/local/projects", requireAuth, (req, res) => {
      const { name, description, credentials, env_template } = req.body;
      const id = dbInsert("INSERT INTO projects (name, description, credentials, env_template) VALUES (?,?,?,?)", [name, description || "", JSON.stringify(credentials || []), env_template || ""]);
      logActivity("project_created", "Created " + name);
      res.json({ id, success: true });
    });
    app.delete("/api/local/projects/:id", requireAuth, (req, res) => {
      dbRun("DELETE FROM projects WHERE id = ?", [Number(req.params.id)]);
      res.json({ success: true });
    });

    // ── Local chat history ──
    app.get("/api/local/chat", requireAuth, (_, res) => res.json(dbAll("SELECT * FROM chat_history ORDER BY created_at ASC")));
    app.post("/api/local/chat", requireAuth, (req, res) => {
      const { role, content, tool_calls } = req.body;
      const id = dbInsert("INSERT INTO chat_history (role, content, tool_calls) VALUES (?,?,?)", [role, content, tool_calls ? JSON.stringify(tool_calls) : null]);
      res.json({ id, success: true });
    });
    app.delete("/api/local/chat", requireAuth, (_, res) => { dbRun("DELETE FROM chat_history"); res.json({ success: true }); });

    // ── Chat proxy to remote API (consumes credits on remote) ──
    app.post("/api/trpc/chat.send", requireAuth, async (req, res) => {
      const chatModePath = path.join(DATA_DIR, "mode.json");
      let chatMode = "online";
      try {
        if (fs.existsSync(chatModePath)) {
          const mdata = JSON.parse(fs.readFileSync(chatModePath, "utf8"));
          if (mdata.mode === "offline") chatMode = "offline";
        }
      } catch {}
      if (chatMode === "offline") {
        return res.json({
          result: { data: { json: {
            response: "You are currently in **offline mode**. Chat with the AI assistant requires an internet connection. Please switch to online mode to use this feature.\n\nIn offline mode, you can still:\n- View and manage locally stored credentials\n- Access your project configurations\n- Browse cached data and activity logs",
            creditsUsed: 0,
          } } },
        });
      }

      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });

      if (!license.credits?.isUnlimited && (license.credits?.balance ?? 0) <= 0) {
        return res.status(402).json({ error: "Insufficient credits. Please purchase more credits or upgrade your plan." });
      }

      try {
        const remoteRes = await fetch(REMOTE_URL + "/api/trpc/chat.send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `titan_session=${license.licenseKey}`,
          },
          body: JSON.stringify(req.body),
        });
        const data = await remoteRes.json();

        try {
          const refreshed = await remoteValidate(license.licenseKey);
          saveLicense(refreshed);
        } catch { /* non-critical */ }

        res.status(remoteRes.status).json(data);
      } catch (e) {
        res.status(500).json({ error: "Failed to connect to remote server: " + e.message });
      }
    });

    // ── Chat stream proxy (SSE for real-time build events) ──
    app.get("/api/chat/stream/:conversationId", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const remoteRes = await fetch(REMOTE_URL + `/api/chat/stream/${req.params.conversationId}`, {
          headers: { "Accept": "text/event-stream", "Cookie": `titan_session=${license.licenseKey}` },
        });
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const reader = remoteRes.body?.getReader();
        if (!reader) { res.end(); return; }
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
          } catch { /* connection closed */ }
          res.end();
        };
        pump();
        req.on("close", () => { try { reader.cancel(); } catch {} });
      } catch (e) {
        res.status(503).json({ error: "Failed to connect to remote server" });
      }
    });

    // ── Chat abort proxy ──
    app.post("/api/chat/abort/:conversationId", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const remoteRes = await fetch(REMOTE_URL + `/api/chat/abort/${req.params.conversationId}`, {
          method: "POST",
          headers: { "Cookie": `titan_session=${license.licenseKey}` },
        });
        const data = await remoteRes.json();
        res.json(data);
      } catch (e) {
        res.status(503).json({ error: "Failed to connect to remote server" });
      }
    });

    // ── Build status proxy (for reconnection after disconnect) ──
    app.get("/api/chat/build-status/:conversationId", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const remoteRes = await fetch(REMOTE_URL + `/api/chat/build-status/${req.params.conversationId}`, {
          headers: { "Cookie": `titan_session=${license.licenseKey}` },
        });
        const data = await remoteRes.json();
        res.json(data);
      } catch (e) {
        res.json({ active: false });
      }
    });

    // ── Active builds proxy ──
    app.get("/api/chat/active-builds", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.json({ builds: [] });
      try {
        const remoteRes = await fetch(REMOTE_URL + "/api/chat/active-builds", {
          headers: { "Cookie": `titan_session=${license.licenseKey}` },
        });
        const data = await remoteRes.json();
        res.json(data);
      } catch (e) {
        res.json({ builds: [] });
      }
    });

    // ── Chat file upload proxy ──
    app.post("/api/chat/upload", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        // Forward the raw request body to the remote server
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = Buffer.concat(chunks);
            const remoteRes = await fetch(REMOTE_URL + "/api/chat/upload", {
              method: "POST",
              headers: {
                "Content-Type": req.headers["content-type"],
                "Cookie": `titan_session=${license.licenseKey}`,
              },
              body,
            });
            const data = await remoteRes.json();
            res.status(remoteRes.status).json(data);
          } catch (e) {
            res.status(503).json({ error: "Upload proxy failed" });
          }
        });
      } catch (e) {
        res.status(503).json({ error: "Failed to connect to remote server" });
      }
    });

    // ── Voice upload proxy ──
    app.post("/api/voice/upload", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = Buffer.concat(chunks);
            const remoteRes = await fetch(REMOTE_URL + "/api/voice/upload", {
              method: "POST",
              headers: {
                "Content-Type": req.headers["content-type"],
                "Cookie": `titan_session=${license.licenseKey}`,
              },
              body,
            });
            const data = await remoteRes.json();
            res.status(remoteRes.status).json(data);
          } catch (e) {
            res.status(503).json({ error: "Voice upload proxy failed" });
          }
        });
      } catch (e) {
        res.status(503).json({ error: "Failed to connect to remote server" });
      }
    });

    // ── Generic tRPC proxy for all other endpoints ──
    // This ensures desktop has full parity with the web version
    // by forwarding any unhandled tRPC calls to the remote server.
    // Supports both single and BATCH tRPC requests (e.g. /api/trpc/auth.me,credits.getBalance?batch=1)
    app.all("/api/trpc/:procedure", async (req, res, next) => {
      const procedure = req.params.procedure;
      const isBatch = procedure.includes(",") || req.query.batch === "1";

      // For single non-batch requests, check if already handled above
      if (!isBatch && ["auth.me", "credits.getBalance", "chat.send"].includes(procedure)) {
        return next();
      }

      // For batch requests that contain locally-handled procedures,
      // we need to handle them individually and merge results
      if (isBatch) {
        const procedures = procedure.split(",");
        const localHandlers = {
          "auth.me": () => {
            const license = loadLicense();
            if (!license || !license.user) return { result: { data: { json: null } } };
            return { result: { data: { json: license.user } } };
          },
          "credits.getBalance": () => {
            const license = loadLicense();
            return { result: { data: { json: license?.credits || { balance: 0, isUnlimited: false } } } };
          },
        };

        // Check if ALL procedures can be handled locally
        const allLocal = procedures.every(p => localHandlers[p]);
        if (allLocal) {
          const results = procedures.map(p => localHandlers[p]());
          return res.json(results);
        }

        // Otherwise, proxy the entire batch to remote
      }

      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            "Cookie": `titan_session=${license.licenseKey}`,
          },
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const remoteRes = await fetch(url, fetchOpts);
        const contentType = remoteRes.headers.get("content-type") || "application/json";
        res.set("Content-Type", contentType);
        const data = await remoteRes.text();
        res.status(remoteRes.status).send(data);
      } catch (e) {
        res.status(503).json({ error: "Failed to proxy to remote server: " + e.message });
      }
    });

    // ── Activity & stats (require auth) ──
    app.get("/api/local/activity", requireAuth, (_, res) => res.json(dbAll("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100")));
    app.get("/api/local/stats", requireAuth, (_, res) => {
      const totalCreds = dbGet("SELECT COUNT(*) as c FROM credentials");
      const totalProjects = dbGet("SELECT COUNT(*) as c FROM projects");
      const activeCreds = dbGet("SELECT COUNT(*) as c FROM credentials WHERE status='active'");
      const recentActivity = dbGet("SELECT COUNT(*) as c FROM activity_log WHERE created_at > datetime('now','-7 days')");
      res.json({
        totalCreds: totalCreds?.c || 0,
        totalProjects: totalProjects?.c || 0,
        activeCreds: activeCreds?.c || 0,
        recentActivity: recentActivity?.c || 0,
      });
    });

    // ── Marketplace file proxy ──
    app.all("/api/marketplace/*", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: { "Cookie": `titan_session=${license.licenseKey}` },
        };
        if (req.headers["content-type"]) fetchOpts.headers["Content-Type"] = req.headers["content-type"];
        if (req.method !== "GET" && req.method !== "HEAD") {
          // For file uploads, forward raw body
          if (req.headers["content-type"]?.includes("multipart")) {
            const chunks = [];
            await new Promise((resolve) => {
              req.on("data", (chunk) => chunks.push(chunk));
              req.on("end", resolve);
            });
            fetchOpts.body = Buffer.concat(chunks);
          } else {
            fetchOpts.body = JSON.stringify(req.body);
          }
        }
        const remoteRes = await fetch(url, fetchOpts);
        const contentType = remoteRes.headers.get("content-type") || "application/octet-stream";
        res.set("Content-Type", contentType);
        const body = Buffer.from(await remoteRes.arrayBuffer());
        res.status(remoteRes.status).send(body);
      } catch (e) {
        res.status(503).json({ error: "Marketplace proxy failed: " + e.message });
      }
    });

    // ── Download gate proxy ──
    app.get("/api/download/:token", async (req, res) => {
      try {
        const remoteRes = await fetch(REMOTE_URL + req.originalUrl);
        const contentType = remoteRes.headers.get("content-type") || "application/octet-stream";
        const contentDisp = remoteRes.headers.get("content-disposition");
        res.set("Content-Type", contentType);
        if (contentDisp) res.set("Content-Disposition", contentDisp);
        const body = Buffer.from(await remoteRes.arrayBuffer());
        res.status(remoteRes.status).send(body);
      } catch (e) {
        res.status(503).json({ error: "Download proxy failed" });
      }
    });

    // ── Auth API proxy (register, forgot-password, etc.) ──
    app.all("/api/auth/*", async (req, res) => {
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: { "Content-Type": "application/json" },
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const remoteRes = await fetch(url, fetchOpts);
        // Forward set-cookie headers for session management
        const setCookies = remoteRes.headers.getSetCookie?.() || [];
        setCookies.forEach(c => res.append("Set-Cookie", c));
        const contentType = remoteRes.headers.get("content-type") || "application/json";
        res.set("Content-Type", contentType);
        const data = await remoteRes.text();
        res.status(remoteRes.status).send(data);
      } catch (e) {
        res.status(503).json({ error: "Auth proxy failed: " + e.message });
      }
    });

    // ── Generic REST API proxy for v1 endpoints ──
    app.all("/api/v1/*", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            "Cookie": `titan_session=${license.licenseKey}`,
          },
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const remoteRes = await fetch(url, fetchOpts);
        const contentType = remoteRes.headers.get("content-type") || "application/json";
        res.set("Content-Type", contentType);
        const data = await remoteRes.text();
        res.status(remoteRes.status).send(data);
      } catch (e) {
        res.status(503).json({ error: "API proxy failed: " + e.message });
      }
    });

    // ── Files API proxy ──
    app.all("/api/files", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            "Cookie": `titan_session=${license.licenseKey}`,
          },
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const remoteRes = await fetch(url, fetchOpts);
        const contentType = remoteRes.headers.get("content-type") || "application/json";
        res.set("Content-Type", contentType);
        const data = await remoteRes.text();
        res.status(remoteRes.status).send(data);
      } catch (e) {
        res.status(503).json({ error: "Files proxy failed: " + e.message });
      }
    });

    // ── Releases upload proxy ──
    app.post("/api/releases/upload", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = Buffer.concat(chunks);
            const remoteRes = await fetch(REMOTE_URL + "/api/releases/upload", {
              method: "POST",
              headers: {
                "Content-Type": req.headers["content-type"],
                "Cookie": `titan_session=${license.licenseKey}`,
              },
              body,
            });
            const data = await remoteRes.json();
            res.status(remoteRes.status).json(data);
          } catch (e) {
            res.status(503).json({ error: "Release upload proxy failed" });
          }
        });
      } catch (e) {
        res.status(503).json({ error: "Failed to connect to remote server" });
      }
    });

    // ── Stripe proxy (subscription management from desktop) ──
    app.all("/api/stripe/*", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: {
            "Content-Type": req.headers["content-type"] || "application/json",
            "Cookie": `titan_session=${license.licenseKey}`,
          },
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const remoteRes = await fetch(url, fetchOpts);
        const contentType = remoteRes.headers.get("content-type") || "application/json";
        res.set("Content-Type", contentType);
        const data = await remoteRes.text();
        res.status(remoteRes.status).send(data);
      } catch (e) {
        res.status(503).json({ error: "Stripe proxy failed: " + e.message });
      }
    });

    // ── Releases API proxy ──
    app.all("/api/releases/*", requireAuth, async (req, res) => {
      const license = loadLicense();
      if (!license?.licenseKey) return res.status(401).json({ error: "Not authenticated" });
      try {
        const url = REMOTE_URL + req.originalUrl;
        const fetchOpts = {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            "Cookie": `titan_session=${license.licenseKey}`,
          },
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOpts.body = JSON.stringify(req.body);
        }
        const remoteRes = await fetch(url, fetchOpts);
        const contentType = remoteRes.headers.get("content-type") || "application/json";
        res.set("Content-Type", contentType);
        const data = await remoteRes.text();
        res.status(remoteRes.status).send(data);
      } catch (e) {
        res.status(503).json({ error: "Releases proxy failed: " + e.message });
      }
    });

    // ── Serve synced bundle static assets ──
    // Priority: synced bundle > built-in public > remote proxy
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      // Try synced bundle first
      if (fs.existsSync(BUNDLE_DIR)) {
        const filePath = path.join(BUNDLE_DIR, req.path);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return res.sendFile(filePath);
        }
      }
      next();
    });

    // ── SPA fallback ──
    // Priority: synced bundle > built-in public > remote proxy
    app.get("*", async (req, res) => {
      if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
      // 1. Synced bundle (auto-updated from server)
      const syncedIdx = path.join(BUNDLE_DIR, "index.html");
      if (fs.existsSync(syncedIdx)) {
        return res.sendFile(syncedIdx);
      }
      // 2. Built-in bundle (shipped with installer)
      const builtInIdx = path.join(publicDir, "index.html");
      if (fs.existsSync(builtInIdx)) {
        return res.sendFile(builtInIdx);
      }
      // No local frontend — proxy from remote server
      try {
        const remoteUrl = REMOTE_URL + req.originalUrl;
        const proxyRes = await fetch(remoteUrl, {
          headers: { "Accept": req.headers.accept || "text/html" },
        });
        const contentType = proxyRes.headers.get("content-type") || "text/html";
        res.set("Content-Type", contentType);
        const body = Buffer.from(await proxyRes.arrayBuffer());
        res.status(proxyRes.status).send(body);
      } catch (e) {
        console.error("[Titan] Remote proxy failed:", e.message);
        res.status(503).send(`<!DOCTYPE html><html><head><title>Archibald Titan</title><style>body{background:#0a0e1a;color:#e2e8f0;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;}h1{font-size:24px;margin-bottom:16px;}p{color:#94a3b8;max-width:400px;line-height:1.6;}button{margin-top:24px;padding:12px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;}button:hover{background:#2563eb;}</style></head><body><h1>Connection Error</h1><p>Could not connect to the Archibald Titan server. Please check your internet connection and try again.</p><button onclick="location.reload()">Retry</button></body></html>`);
      }
    });

    server = app.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      console.log("[Titan] http://127.0.0.1:" + port);
      resolve(port);

      // Start bundle sync: check immediately, then every 30 minutes as fallback
      setTimeout(() => checkAndSyncBundle(), 3000);
      setInterval(() => checkAndSyncBundle(), 30 * 60 * 1000);

      // Connect to SSE stream for instant deploy notifications
      connectBundleStream();
    });
  });
}

function stopServer() {
  if (server) server.close();
  if (db) {
    try { saveDB(); db.close(); } catch {}
  }
}
function getPort() { return port; }
module.exports = { startServer, stopServer, getPort, DATA_DIR, REMOTE_URL, checkAndSyncBundle, setSendToMainWindow };

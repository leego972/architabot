const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const { startServer, stopServer, getPort, DATA_DIR, REMOTE_URL, checkAndSyncBundle, setSendToMainWindow } = require("./local-server");

const APP_NAME = "Archibald Titan";
const MODE_PATH = path.join(DATA_DIR, "mode.json");
let mainWindow = null, tray = null, isQuitting = false;
let currentMode = "online"; // "online" | "offline"

// ─── Auto-Updater Setup ───────────────────────────────────────────
autoUpdater.autoDownload = false; // Don't download automatically — let user decide
autoUpdater.autoInstallOnAppQuit = true; // Install on next quit if downloaded
autoUpdater.allowPrerelease = false;

// Log updater events
autoUpdater.on("checking-for-update", () => {
  console.log("[Updater] Checking for update...");
  sendToRenderer("update-status", { status: "checking" });
});

autoUpdater.on("update-available", (info) => {
  console.log("[Updater] Update available:", info.version);
  sendToRenderer("update-status", {
    status: "available",
    version: info.version,
    releaseNotes: info.releaseNotes,
    releaseName: info.releaseName,
    releaseDate: info.releaseDate,
  });
});

autoUpdater.on("update-not-available", (info) => {
  console.log("[Updater] No update available. Current:", info.version);
  sendToRenderer("update-status", { status: "up-to-date", version: info.version });
});

autoUpdater.on("download-progress", (progress) => {
  console.log(`[Updater] Download: ${progress.percent.toFixed(1)}%`);
  sendToRenderer("update-status", {
    status: "downloading",
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("[Updater] Update downloaded:", info.version);
  sendToRenderer("update-status", {
    status: "downloaded",
    version: info.version,
  });
  // Show a dialog to restart
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: `Archibald Titan v${info.version} has been downloaded.`,
      detail: "The update will be installed when you restart the application.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }
});

autoUpdater.on("error", (err) => {
  console.error("[Updater] Error:", err.message);
  sendToRenderer("update-status", { status: "error", message: err.message });
});

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function checkForUpdates() {
  try {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[Updater] Check failed:", err.message);
    });
  } catch (err) {
    console.error("[Updater] Check failed:", err.message);
  }
}

// ─── Mode persistence ──────────────────────────────────────────────
function loadMode() {
  try {
    if (fs.existsSync(MODE_PATH)) {
      const data = JSON.parse(fs.readFileSync(MODE_PATH, "utf8"));
      if (data.mode === "online" || data.mode === "offline") {
        currentMode = data.mode;
      }
    }
  } catch { /* default to online */ }
  return currentMode;
}

function saveMode(mode) {
  currentMode = mode;
  fs.writeFileSync(MODE_PATH, JSON.stringify({ mode }, null, 2));
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); } else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
}

async function createWindow() {
  loadMode();
  const port = await startServer();
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 800, minHeight: 600,
    title: APP_NAME, icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    show: false, backgroundColor: "#0a0e1a", autoHideMenuBar: true,
  });
  mainWindow.loadFile(path.join(__dirname, "splash.html"));

  // Check if user has a saved license — go to dashboard or login
  const licensePath = path.join(DATA_DIR, "license.json");
  const hasLicense = fs.existsSync(licensePath);
  const targetPath = hasLicense ? "/dashboard" : "/desktop-login";

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL("http://127.0.0.1:" + port + targetPath);
    }
  }, 1500);

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("http")) shell.openExternal(url); return { action: "deny" }; });
  mainWindow.on("close", (e) => { if (!isQuitting) { e.preventDefault(); mainWindow.hide(); } });
  mainWindow.on("closed", () => { mainWindow = null; });

  // IPC handlers
  ipcMain.handle("get-data-dir", () => DATA_DIR);
  ipcMain.handle("get-port", () => getPort());
  ipcMain.handle("get-remote-url", () => REMOTE_URL);
  ipcMain.handle("navigate-to", (_, navPath) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL("http://127.0.0.1:" + getPort() + navPath);
    }
  });

  // Online/Offline mode IPC
  ipcMain.handle("get-mode", () => currentMode);
  ipcMain.handle("set-mode", (_, mode) => {
    if (mode !== "online" && mode !== "offline") return currentMode;
    saveMode(mode);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mode-changed", mode);
    }
    updateTrayMenu();
    return currentMode;
  });

  // Bundle sync IPC handlers
  ipcMain.handle("check-bundle-sync", () => {
    checkAndSyncBundle();
    return { checking: true };
  });
  ipcMain.handle("get-sync-status", async () => {
    try {
      const res = await fetch("http://127.0.0.1:" + getPort() + "/api/desktop/sync-status");
      return await res.json();
    } catch { return { status: "unknown" }; }
  });

  // Wire up bundle sync notifications to renderer
  setSendToMainWindow((channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  });

  // Auto-updater IPC handlers
  ipcMain.handle("check-for-updates", () => {
    checkForUpdates();
    return { checking: true };
  });
  ipcMain.handle("download-update", () => {
    autoUpdater.downloadUpdate().catch((err) => {
      console.error("[Updater] Download failed:", err.message);
      sendToRenderer("update-status", { status: "error", message: err.message });
    });
    return { downloading: true };
  });
  ipcMain.handle("install-update", () => {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates 5 seconds after window loads, then every 4 hours
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Archibald Titan", click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: "separator" },
    { label: `Mode: ${currentMode === "online" ? "Online" : "Offline"}`, enabled: false },
    {
      label: "Switch to Online", type: "radio", checked: currentMode === "online",
      click: () => { saveMode("online"); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("mode-changed", "online"); updateTrayMenu(); },
    },
    {
      label: "Switch to Offline", type: "radio", checked: currentMode === "offline",
      click: () => { saveMode("offline"); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("mode-changed", "offline"); updateTrayMenu(); },
    },
    { type: "separator" },
    { label: "Check for Updates", click: () => checkForUpdates() },
    { label: "Open in Browser", click: () => shell.openExternal(REMOTE_URL) },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
  tray.on("double-click", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

app.whenReady().then(() => { createWindow(); createTray(); app.on("activate", () => { if (!mainWindow) createWindow(); else mainWindow.show(); }); });
app.on("before-quit", () => { isQuitting = true; stopServer(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

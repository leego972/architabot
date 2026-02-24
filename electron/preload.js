const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("titanDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: require("./package.json").version,
  getDataDir: () => ipcRenderer.invoke("get-data-dir"),
  getPort: () => ipcRenderer.invoke("get-port"),
  getRemoteUrl: () => ipcRenderer.invoke("get-remote-url"),
  navigateTo: (path) => ipcRenderer.invoke("navigate-to", path),
  // Online/Offline mode
  getMode: () => ipcRenderer.invoke("get-mode"),
  setMode: (mode) => ipcRenderer.invoke("set-mode", mode),
  onModeChange: (callback) => {
    ipcRenderer.on("mode-changed", (_event, mode) => callback(mode));
    return () => ipcRenderer.removeAllListeners("mode-changed");
  },
  // Bundle sync
  checkBundleSync: () => ipcRenderer.invoke("check-bundle-sync"),
  getSyncStatus: () => ipcRenderer.invoke("get-sync-status"),
  onBundleSynced: (callback) => {
    ipcRenderer.on("bundle-synced", (_event, manifest) => callback(manifest));
    return () => ipcRenderer.removeAllListeners("bundle-synced");
  },
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners("update-status");
  },
});

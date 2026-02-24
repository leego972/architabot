declare global {
  interface Window {
    titanDesktop?: {
      isDesktop: boolean;
      platform: string;
      version: string;
      getDataDir: () => Promise<string>;
      getPort: () => Promise<number>;
      getRemoteUrl: () => Promise<string>;
      navigateTo: (path: string) => Promise<void>;
      openExternal?: (url: string) => void;
      // Online/Offline mode
      getMode: () => Promise<"online" | "offline">;
      setMode: (mode: "online" | "offline") => Promise<string>;
      onModeChange: (callback: (mode: string) => void) => () => void;
      // Bundle sync
      checkBundleSync: () => Promise<{ checking: boolean }>;
      getSyncStatus: () => Promise<{ status: string; version?: string | null; lastCheck?: string | null; error?: string | null }>;
      onBundleSynced: (callback: (manifest: { version: string; hash: string }) => void) => () => void;
      // Auto-updater
      checkForUpdates: () => Promise<{ checking: boolean }>;
      downloadUpdate: () => Promise<{ downloading: boolean }>;
      installUpdate: () => Promise<void>;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
    };
  }
}

export interface UpdateStatus {
  status: "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
  releaseNotes?: string;
  releaseName?: string;
  releaseDate?: string;
}

export function isDesktop(): boolean {
  return !!(typeof window !== "undefined" && window.titanDesktop?.isDesktop);
}

export function getDesktopInfo() {
  return window.titanDesktop || null;
}

export function getDesktopVersion(): string | null {
  return window.titanDesktop?.version || null;
}

export function getDesktopPlatform(): string | null {
  return window.titanDesktop?.platform || null;
}

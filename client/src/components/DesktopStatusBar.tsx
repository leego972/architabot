import { useState, useEffect } from "react";
import { isDesktop, type UpdateStatus } from "@/lib/desktop";
import {
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Monitor,
  CloudDownload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type SyncStatus = {
  status: "idle" | "checking" | "downloading" | "installing" | "synced" | "up-to-date" | "error" | "unknown";
  version?: string | null;
  lastCheck?: string | null;
  error?: string | null;
};

export default function DesktopStatusBar() {
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ status: "idle" });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    setVisible(true);

    // Get initial mode
    window.titanDesktop?.getMode().then((m) => setMode(m));

    // Get initial sync status
    window.titanDesktop?.getSyncStatus?.().then((s) => {
      if (s) setSyncStatus(s as SyncStatus);
    });

    // Listen for mode changes
    const cleanupMode = window.titanDesktop?.onModeChange((m) => {
      setMode(m as "online" | "offline");
      toast.info(`Switched to ${m} mode`);
    });

    // Listen for update status
    const cleanupUpdate = window.titanDesktop?.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });

    // Listen for bundle sync completions
    const cleanupSync = window.titanDesktop?.onBundleSynced?.((manifest) => {
      setSyncStatus({ status: "synced", version: manifest.version, lastCheck: new Date().toISOString(), error: null });
      toast.success(`App synced to v${manifest.version}`, {
        description: "Refresh the page to load the latest version.",
        action: {
          label: "Refresh now",
          onClick: () => window.location.reload(),
        },
        duration: 15000,
      });
    });

    // Poll sync status every 30 seconds to stay current
    const syncPoll = setInterval(async () => {
      try {
        const s = await window.titanDesktop?.getSyncStatus?.();
        if (s) setSyncStatus(s as SyncStatus);
      } catch { /* ignore */ }
    }, 30000);

    return () => {
      cleanupMode?.();
      cleanupUpdate?.();
      cleanupSync?.();
      clearInterval(syncPoll);
    };
  }, []);

  if (!visible) return null;

  const handleToggleMode = async () => {
    const newMode = mode === "online" ? "offline" : "online";
    await window.titanDesktop?.setMode(newMode);
    setMode(newMode);
  };

  const handleCheckUpdates = () => {
    window.titanDesktop?.checkForUpdates();
    toast.info("Checking for updates...");
  };

  const handleDownloadUpdate = () => {
    window.titanDesktop?.downloadUpdate();
  };

  const handleInstallUpdate = () => {
    window.titanDesktop?.installUpdate();
  };

  const handleSyncNow = () => {
    window.titanDesktop?.checkBundleSync?.();
    setSyncStatus((prev) => ({ ...prev, status: "checking" }));
    toast.info("Checking for new version...");
  };

  const version = window.titanDesktop?.version;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-background/60 border-b border-border/30 text-xs text-muted-foreground">
      {/* Desktop indicator */}
      <div className="flex items-center gap-1.5">
        <Monitor className="w-3 h-3" />
        <span className="font-medium">Desktop</span>
        {version && <span className="opacity-60">v{version}</span>}
      </div>

      <div className="w-px h-3 bg-border/50" />

      {/* Online/Offline mode toggle */}
      <button
        onClick={handleToggleMode}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-accent/50 transition-colors"
        title={`Currently ${mode}. Click to switch.`}
      >
        {mode === "online" ? (
          <>
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400">Offline</span>
          </>
        )}
      </button>

      <div className="w-px h-3 bg-border/50" />

      {/* Bundle sync status */}
      {syncStatus.status === "checking" && (
        <div className="flex items-center gap-1.5 text-blue-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Checking...</span>
        </div>
      )}

      {syncStatus.status === "downloading" && (
        <div className="flex items-center gap-1.5 text-blue-400">
          <CloudDownload className="w-3 h-3 animate-pulse" />
          <span>Syncing v{syncStatus.version}...</span>
        </div>
      )}

      {syncStatus.status === "installing" && (
        <div className="flex items-center gap-1.5 text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Installing...</span>
        </div>
      )}

      {syncStatus.status === "synced" && (
        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>Synced v{syncStatus.version}</span>
        </div>
      )}

      {syncStatus.status === "up-to-date" && (
        <div className="flex items-center gap-1.5 text-muted-foreground/60">
          <CheckCircle2 className="w-3 h-3" />
          <span>Bundle up to date</span>
        </div>
      )}

      {syncStatus.status === "error" && (
        <button
          onClick={handleSyncNow}
          className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors"
          title={syncStatus.error || "Sync error"}
        >
          <AlertCircle className="w-3 h-3" />
          <span>Sync error</span>
        </button>
      )}

      {(syncStatus.status === "idle" || syncStatus.status === "unknown") && (
        <button
          onClick={handleSyncNow}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-accent/50 transition-colors"
          title="Check for new version"
        >
          <CloudDownload className="w-3 h-3" />
          <span>Sync</span>
        </button>
      )}

      <div className="flex-1" />

      {/* App update status (full Electron binary updates) */}
      {updateStatus?.status === "available" && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
            v{updateStatus.version} available
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-2 text-[10px] text-blue-400 hover:text-blue-300"
            onClick={handleDownloadUpdate}
          >
            <Download className="w-3 h-3 mr-1" /> Download
          </Button>
        </div>
      )}

      {updateStatus?.status === "downloading" && (
        <div className="flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
          <span className="text-blue-400">
            Downloading {updateStatus.percent?.toFixed(0)}%
          </span>
        </div>
      )}

      {updateStatus?.status === "downloaded" && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Ready to install
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-2 text-[10px] text-emerald-400 hover:text-emerald-300"
            onClick={handleInstallUpdate}
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Restart
          </Button>
        </div>
      )}

      {updateStatus?.status === "error" && (
        <div className="flex items-center gap-1.5 text-red-400">
          <AlertCircle className="w-3 h-3" />
          <span>Update error</span>
        </div>
      )}

      {updateStatus?.status === "up-to-date" && (
        <div className="flex items-center gap-1.5 text-muted-foreground/60">
          <CheckCircle2 className="w-3 h-3" />
          <span>Up to date</span>
        </div>
      )}

      {!updateStatus && (
        <button
          onClick={handleCheckUpdates}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-accent/50 transition-colors"
          title="Check for app updates"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Check updates</span>
        </button>
      )}
    </div>
  );
}

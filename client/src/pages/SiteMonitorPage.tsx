/**
 * Site Monitor Dashboard — Website health monitoring, incident tracking, and auto-repair.
 * Pro+ feature: monitor your published websites for crashes, errors, and performance issues.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeBanner } from "@/components/UpgradePrompt";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Wrench,
  Shield,
  Zap,
  BarChart3,
  Pause,
  Play,
  ExternalLink,
  Server,
  Wifi,
  WifiOff,
  Settings,
  Eye,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";

// ─── Status Helpers ──────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "healthy": return "text-emerald-400";
    case "degraded": return "text-yellow-400";
    case "down": return "text-red-500";
    case "error": return "text-red-400";
    default: return "text-zinc-500";
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case "healthy": return "bg-emerald-500/10 border-emerald-500/30";
    case "degraded": return "bg-yellow-500/10 border-yellow-500/30";
    case "down": return "bg-red-500/10 border-red-500/30";
    case "error": return "bg-red-500/10 border-red-500/30";
    default: return "bg-zinc-500/10 border-zinc-500/30";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "healthy": return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "degraded": return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
    case "down": return <XCircle className="h-5 w-5 text-red-500" />;
    case "error": return <XCircle className="h-5 w-5 text-red-400" />;
    default: return <Clock className="h-5 w-5 text-zinc-500" />;
  }
}

function getSeverityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-red-500/20 text-red-400 border border-red-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  };
  return <Badge className={colors[severity] || "bg-zinc-500/20 text-zinc-400"}>{severity}</Badge>;
}

function formatTime(date: string | Date | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── Main Page Component ─────────────────────────────────────────

export default function SiteMonitorPage() {
  const { user } = useAuth();
  const sub = useSubscription();
  const canAccess = sub.canUse("site_monitor");

  const [activeTab, setActiveTab] = useState("sites");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [showRepairDialog, setShowRepairDialog] = useState(false);

  // ─── Queries ─────────────────────────────────────────────────
  const statsQuery = trpc.siteMonitor.getDashboardStats.useQuery(undefined, {
    enabled: canAccess,
    refetchInterval: 30_000,
  });
  const sitesQuery = trpc.siteMonitor.listSites.useQuery(undefined, {
    enabled: canAccess,
    refetchInterval: 15_000,
  });
  const incidentsQuery = trpc.siteMonitor.getIncidents.useQuery(
    { limit: 50 },
    { enabled: canAccess, refetchInterval: 30_000 }
  );
  const repairLogsQuery = trpc.siteMonitor.getRepairLogs.useQuery(
    { limit: 50 },
    { enabled: canAccess, refetchInterval: 30_000 }
  );
  const limitsQuery = trpc.siteMonitor.getLimits.useQuery(undefined, {
    enabled: canAccess,
  });

  // ─── Mutations ───────────────────────────────────────────────
  const addSiteMut = trpc.siteMonitor.addSite.useMutation({
    onSuccess: () => {
      toast.success("Site added for monitoring");
      sitesQuery.refetch();
      statsQuery.refetch();
      setShowAddDialog(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteSiteMut = trpc.siteMonitor.deleteSite.useMutation({
    onSuccess: () => {
      toast.success("Site removed from monitoring");
      sitesQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const togglePauseMut = trpc.siteMonitor.togglePause.useMutation({
    onSuccess: (data) => {
      toast.success(data.isPaused ? "Monitoring paused" : "Monitoring resumed");
      sitesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const triggerCheckMut = trpc.siteMonitor.triggerCheck.useMutation({
    onSuccess: (data) => {
      toast.success(`Health check complete: ${data.status}`);
      sitesQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const triggerRepairMut = trpc.siteMonitor.triggerRepair.useMutation({
    onSuccess: (data) => {
      if (data.status === "success") {
        toast.success("Repair completed successfully");
      } else {
        toast.error(`Repair failed: ${data.message}`);
      }
      repairLogsQuery.refetch();
      incidentsQuery.refetch();
      sitesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const resolveIncidentMut = trpc.siteMonitor.resolveIncident.useMutation({
    onSuccess: () => {
      toast.success("Incident resolved");
      incidentsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const ignoreIncidentMut = trpc.siteMonitor.ignoreIncident.useMutation({
    onSuccess: () => {
      toast.success("Incident ignored");
      incidentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const testConnectionMut = trpc.siteMonitor.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Upgrade Banner ──────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="h-8 w-8 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Website Health Monitor</h1>
          </div>
          <UpgradeBanner
            feature="Website Health Monitor"
            requiredPlan="pro"
          />
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <Globe className="h-8 w-8 text-blue-400 mb-2" />
                <CardTitle className="text-white text-lg">Real-Time Monitoring</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Monitor uptime, response time, SSL certificates, and content integrity across all your websites.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <Wrench className="h-8 w-8 text-emerald-400 mb-2" />
                <CardTitle className="text-white text-lg">Auto-Repair</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Automatically restart services, trigger redeployments, or execute custom repair commands when issues are detected.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <Shield className="h-8 w-8 text-purple-400 mb-2" />
                <CardTitle className="text-white text-lg">Incident Tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm">
                  Track incidents with severity levels, auto-resolution, and detailed repair logs for complete audit trails.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const stats = statsQuery.data;
  const sites = sitesQuery.data || [];
  const incidents = incidentsQuery.data || [];
  const repairLogs = repairLogsQuery.data || [];
  const limits = limitsQuery.data?.limits;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Website Health Monitor</h1>
              <p className="text-zinc-400 text-sm">
                Monitor, detect, and auto-repair your published websites
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                sitesQuery.refetch();
                statsQuery.refetch();
                incidentsQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Site
            </Button>
          </div>
        </div>

        {/* ─── Stats Cards ────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatsCard
              label="Total Sites"
              value={stats.totalSites}
              icon={<Globe className="h-4 w-4 text-blue-400" />}
            />
            <StatsCard
              label="Healthy"
              value={stats.healthySites}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              valueColor="text-emerald-400"
            />
            <StatsCard
              label="Degraded"
              value={stats.degradedSites}
              icon={<AlertTriangle className="h-4 w-4 text-yellow-400" />}
              valueColor={stats.degradedSites > 0 ? "text-yellow-400" : undefined}
            />
            <StatsCard
              label="Down"
              value={stats.downSites}
              icon={<XCircle className="h-4 w-4 text-red-500" />}
              valueColor={stats.downSites > 0 ? "text-red-500" : undefined}
            />
            <StatsCard
              label="Open Incidents"
              value={stats.openIncidents}
              icon={<AlertTriangle className="h-4 w-4 text-orange-400" />}
              valueColor={stats.openIncidents > 0 ? "text-orange-400" : undefined}
            />
            <StatsCard
              label="Avg Response"
              value={stats.avgResponseTimeMs ? formatMs(stats.avgResponseTimeMs) : "—"}
              icon={<Zap className="h-4 w-4 text-purple-400" />}
            />
          </div>
        )}

        {/* ─── Tabs ───────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="sites" className="data-[state=active]:bg-zinc-800">
              <Globe className="h-4 w-4 mr-1" /> Sites ({sites.length})
            </TabsTrigger>
            <TabsTrigger value="incidents" className="data-[state=active]:bg-zinc-800">
              <AlertTriangle className="h-4 w-4 mr-1" /> Incidents
              {incidents.filter(i => ["open", "investigating", "repairing"].includes(i.status)).length > 0 && (
                <Badge className="ml-1 bg-red-500/20 text-red-400 text-xs">
                  {incidents.filter(i => ["open", "investigating", "repairing"].includes(i.status)).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="repairs" className="data-[state=active]:bg-zinc-800">
              <Wrench className="h-4 w-4 mr-1" /> Repair Logs
            </TabsTrigger>
          </TabsList>

          {/* ─── Sites Tab ──────────────────────────────────── */}
          <TabsContent value="sites" className="space-y-3 mt-4">
            {sites.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Globe className="h-12 w-12 text-zinc-600 mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No sites monitored yet</h3>
                  <p className="text-zinc-400 text-sm text-center mb-4 max-w-md">
                    Add your first website to start monitoring uptime, performance, SSL certificates, and more.
                  </p>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Your First Site
                  </Button>
                </CardContent>
              </Card>
            ) : (
              sites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onCheck={() => triggerCheckMut.mutate({ siteId: site.id })}
                  onTogglePause={() => togglePauseMut.mutate({ id: site.id })}
                  onDelete={() => {
                    if (confirm(`Delete "${site.name}" from monitoring? This will remove all health check history and incidents.`)) {
                      deleteSiteMut.mutate({ id: site.id });
                    }
                  }}
                  onRepair={() => {
                    setSelectedSiteId(site.id);
                    setShowRepairDialog(true);
                  }}
                  onTestConnection={() => testConnectionMut.mutate({ id: site.id })}
                  isChecking={triggerCheckMut.isPending}
                />
              ))
            )}
            {limits && limits.maxSites > 0 && (
              <p className="text-xs text-zinc-500 text-center pt-2">
                {sites.length} / {limits.maxSites} sites used on your plan
              </p>
            )}
          </TabsContent>

          {/* ─── Incidents Tab ──────────────────────────────── */}
          <TabsContent value="incidents" className="space-y-3 mt-4">
            {incidents.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500/50 mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No incidents</h3>
                  <p className="text-zinc-400 text-sm">All your sites are running smoothly.</p>
                </CardContent>
              </Card>
            ) : (
              incidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  siteName={sites.find(s => s.id === incident.siteId)?.name || "Unknown Site"}
                  onResolve={(note) => resolveIncidentMut.mutate({ id: incident.id, resolutionNote: note })}
                  onIgnore={() => ignoreIncidentMut.mutate({ id: incident.id })}
                />
              ))
            )}
          </TabsContent>

          {/* ─── Repair Logs Tab ────────────────────────────── */}
          <TabsContent value="repairs" className="space-y-3 mt-4">
            {repairLogs.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Wrench className="h-12 w-12 text-zinc-600 mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No repair logs</h3>
                  <p className="text-zinc-400 text-sm">No repair actions have been executed yet.</p>
                </CardContent>
              </Card>
            ) : (
              repairLogs.map((log) => (
                <RepairLogCard
                  key={log.id}
                  log={log}
                  siteName={sites.find(s => s.id === log.siteId)?.name || "Unknown Site"}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Add Site Dialog ──────────────────────────────────── */}
      <AddSiteDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={(data) => addSiteMut.mutate(data)}
        isLoading={addSiteMut.isPending}
        limits={limits}
      />

      {/* ─── Repair Dialog ────────────────────────────────────── */}
      <RepairDialog
        open={showRepairDialog}
        onClose={() => { setShowRepairDialog(false); setSelectedSiteId(null); }}
        siteId={selectedSiteId}
        siteName={sites.find(s => s.id === selectedSiteId)?.name || ""}
        onRepair={(action, cmd) => {
          if (selectedSiteId) {
            triggerRepairMut.mutate({ siteId: selectedSiteId, action, customCommand: cmd });
          }
        }}
        isLoading={triggerRepairMut.isPending}
      />
    </div>
  );
}

// ─── Stats Card ──────────────────────────────────────────────────

function StatsCard({ label, value, icon, valueColor }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-zinc-500">{label}</span>
        </div>
        <p className={`text-xl font-bold ${valueColor || "text-white"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Site Card ───────────────────────────────────────────────────

function SiteCard({ site, onCheck, onTogglePause, onDelete, onRepair, onTestConnection, isChecking }: {
  site: any;
  onCheck: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  onRepair: () => void;
  onTestConnection: () => void;
  isChecking: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border ${getStatusBg(site.isPaused ? "unknown" : site.lastStatus)} bg-zinc-900/50`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {site.isPaused ? (
              <Pause className="h-5 w-5 text-zinc-500 flex-shrink-0" />
            ) : (
              <div className="flex-shrink-0">{getStatusIcon(site.lastStatus)}</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-medium truncate">{site.name}</h3>
                {site.isPaused && <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-xs">Paused</Badge>}
                {site.accessMethod !== "none" && (
                  <Badge variant="outline" className="text-blue-400 border-blue-500/30 text-xs capitalize">
                    {site.accessMethod}
                  </Badge>
                )}
                {site.autoRepairEnabled && site.accessMethod !== "none" && (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">
                    <Wrench className="h-3 w-3 mr-1" /> Auto-repair
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-400 hover:text-blue-400 truncate flex items-center gap-1"
                >
                  {site.url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 ml-4 flex-shrink-0">
            {/* Response Time */}
            <div className="hidden md:block text-right">
              <p className="text-xs text-zinc-500">Response</p>
              <p className={`text-sm font-mono ${
                (site.lastResponseTimeMs ?? 0) > 3000 ? "text-yellow-400" :
                (site.lastResponseTimeMs ?? 0) > 5000 ? "text-red-400" : "text-white"
              }`}>
                {formatMs(site.lastResponseTimeMs)}
              </p>
            </div>
            {/* Uptime */}
            <div className="hidden lg:block text-right">
              <p className="text-xs text-zinc-500">Uptime 24h</p>
              <p className={`text-sm font-mono ${
                parseFloat(site.uptimePercent24h || "0") >= 99 ? "text-emerald-400" :
                parseFloat(site.uptimePercent24h || "0") >= 95 ? "text-yellow-400" : "text-red-400"
              }`}>
                {site.uptimePercent24h ? `${site.uptimePercent24h}%` : "—"}
              </p>
            </div>
            {/* Last Check */}
            <div className="hidden md:block text-right">
              <p className="text-xs text-zinc-500">Last Check</p>
              <p className="text-sm text-zinc-300">{formatTime(site.lastCheckAt)}</p>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={onCheck}
                disabled={isChecking}
                title="Run health check now"
              >
                <RefreshCw className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={() => setExpanded(!expanded)}
                title="Show details"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-zinc-500">HTTP Status</p>
                <p className="text-sm text-white font-mono">{site.lastHttpStatusCode || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Check Interval</p>
                <p className="text-sm text-white">{site.checkIntervalSeconds}s</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Consecutive Failures</p>
                <p className={`text-sm font-mono ${site.consecutiveFailures > 0 ? "text-red-400" : "text-white"}`}>
                  {site.consecutiveFailures}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Uptime 7d / 30d</p>
                <p className="text-sm text-white font-mono">
                  {site.uptimePercent7d || "—"}% / {site.uptimePercent30d || "—"}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={onTogglePause}
              >
                {site.isPaused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                {site.isPaused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={onTestConnection}
              >
                <Wifi className="h-3 w-3 mr-1" /> Test Connection
              </Button>
              {site.accessMethod !== "none" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/30"
                  onClick={onRepair}
                >
                  <Wrench className="h-3 w-3 mr-1" /> Repair
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-red-700 text-red-400 hover:bg-red-900/30 ml-auto"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Incident Card ───────────────────────────────────────────────

function IncidentCard({ incident, siteName, onResolve, onIgnore }: {
  incident: any;
  siteName: string;
  onResolve: (note?: string) => void;
  onIgnore: () => void;
}) {
  const isActive = ["open", "investigating", "repairing"].includes(incident.status);

  return (
    <Card className={`border ${isActive ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900/50"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {getSeverityBadge(incident.severity)}
              <Badge variant="outline" className={`text-xs capitalize ${
                incident.status === "resolved" ? "text-emerald-400 border-emerald-500/30" :
                incident.status === "ignored" ? "text-zinc-500 border-zinc-700" :
                "text-red-400 border-red-500/30"
              }`}>
                {incident.status}
              </Badge>
              <span className="text-xs text-zinc-500">{siteName}</span>
            </div>
            <h4 className="text-white font-medium mt-2">{incident.title}</h4>
            {incident.description && (
              <p className="text-sm text-zinc-400 mt-1">{incident.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
              <span>Detected: {formatTime(incident.detectedAt)}</span>
              {incident.resolvedAt && <span>Resolved: {formatTime(incident.resolvedAt)}</span>}
              {incident.autoRepairAttempted && (
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
                  Auto-repair attempted ({incident.autoRepairAttempts}x)
                </Badge>
              )}
            </div>
            {incident.resolutionNote && (
              <p className="text-xs text-zinc-400 mt-2 italic">Resolution: {incident.resolutionNote}</p>
            )}
          </div>
          {isActive && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/30"
                onClick={() => onResolve("Manually resolved")}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={onIgnore}
              >
                Ignore
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Repair Log Card ─────────────────────────────────────────────

function RepairLogCard({ log, siteName }: { log: any; siteName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded ${
              log.status === "success" ? "bg-emerald-500/10" :
              log.status === "failed" ? "bg-red-500/10" :
              log.status === "running" ? "bg-blue-500/10" : "bg-zinc-500/10"
            }`}>
              {log.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
               log.status === "failed" ? <XCircle className="h-4 w-4 text-red-400" /> :
               log.status === "running" ? <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" /> :
               <Clock className="h-4 w-4 text-zinc-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700 capitalize">{log.method}</Badge>
                <span className="text-xs text-zinc-500">{siteName}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {formatTime(log.createdAt)}
                {log.durationMs && ` · ${formatMs(log.durationMs)}`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            {log.output && (
              <div className="mb-2">
                <p className="text-xs text-zinc-500 mb-1">Output:</p>
                <pre className="text-xs text-zinc-300 bg-zinc-950 p-2 rounded overflow-x-auto max-h-32">{log.output}</pre>
              </div>
            )}
            {log.errorMessage && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Error:</p>
                <pre className="text-xs text-red-400 bg-zinc-950 p-2 rounded overflow-x-auto">{log.errorMessage}</pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Add Site Dialog ─────────────────────────────────────────────

function AddSiteDialog({ open, onClose, onSubmit, isLoading, limits }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  limits: any;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [accessMethod, setAccessMethod] = useState("none");
  const [checkInterval, setCheckInterval] = useState("300");
  const [autoRepair, setAutoRepair] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alertEmail, setAlertEmail] = useState("");
  const [sslCheck, setSslCheck] = useState(true);

  // Platform fields
  const [platformToken, setPlatformToken] = useState("");
  const [platformProjectId, setPlatformProjectId] = useState("");
  const [platformServiceId, setPlatformServiceId] = useState("");
  const [platformEnvironmentId, setPlatformEnvironmentId] = useState("");

  // API fields
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");

  // SSH fields
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUsername, setSshUsername] = useState("");
  const [sshPrivateKey, setSshPrivateKey] = useState("");

  // Webhook fields
  const [repairWebhookUrl, setRepairWebhookUrl] = useState("");
  const [repairWebhookSecret, setRepairWebhookSecret] = useState("");

  // Login fields
  const [loginUrl, setLoginUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const handleSubmit = () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    const data: any = {
      name: name.trim(),
      url: url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`,
      accessMethod,
      checkIntervalSeconds: parseInt(checkInterval),
      autoRepairEnabled: autoRepair,
      alertsEnabled,
      alertEmail: alertEmail || null,
      sslCheckEnabled: sslCheck,
    };

    // Add access-method-specific fields
    if (["railway", "vercel", "netlify", "render", "heroku"].includes(accessMethod)) {
      data.platformToken = platformToken || null;
      data.platformProjectId = platformProjectId || null;
      data.platformServiceId = platformServiceId || null;
      data.platformEnvironmentId = platformEnvironmentId || null;
    }
    if (accessMethod === "api") {
      data.apiEndpoint = apiEndpoint || null;
      data.apiKey = apiKey || null;
    }
    if (accessMethod === "ssh") {
      data.sshHost = sshHost || null;
      data.sshPort = parseInt(sshPort) || 22;
      data.sshUsername = sshUsername || null;
      data.sshPrivateKey = sshPrivateKey || null;
    }
    if (accessMethod === "webhook") {
      data.repairWebhookUrl = repairWebhookUrl || null;
      data.repairWebhookSecret = repairWebhookSecret || null;
    }
    if (accessMethod === "login") {
      data.loginUrl = loginUrl || null;
      data.loginUsername = loginUsername || null;
      data.loginPassword = loginPassword || null;
    }

    onSubmit(data);
  };

  const resetForm = () => {
    setName(""); setUrl(""); setAccessMethod("none"); setCheckInterval("300");
    setAutoRepair(true); setAlertsEnabled(true); setAlertEmail(""); setSslCheck(true);
    setPlatformToken(""); setPlatformProjectId(""); setPlatformServiceId(""); setPlatformEnvironmentId("");
    setApiEndpoint(""); setApiKey(""); setSshHost(""); setSshPort("22"); setSshUsername(""); setSshPrivateKey("");
    setRepairWebhookUrl(""); setRepairWebhookSecret(""); setLoginUrl(""); setLoginUsername(""); setLoginPassword("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetForm(); } }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-400" />
            Add Website to Monitor
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configure health checks, alerts, and auto-repair for your website.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-300">Site Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Production Site"
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-zinc-300">URL *</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
          </div>

          {/* Check Interval & Access Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-300">Check Interval</Label>
              <Select value={checkInterval} onValueChange={setCheckInterval}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {limits?.minIntervalSeconds <= 30 && <SelectItem value="30">Every 30 seconds</SelectItem>}
                  {limits?.minIntervalSeconds <= 60 && <SelectItem value="60">Every 1 minute</SelectItem>}
                  <SelectItem value="300">Every 5 minutes</SelectItem>
                  <SelectItem value="600">Every 10 minutes</SelectItem>
                  <SelectItem value="1800">Every 30 minutes</SelectItem>
                  <SelectItem value="3600">Every 1 hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-300">Access Method (for repairs)</Label>
              <Select value={accessMethod} onValueChange={setAccessMethod}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none">None (monitoring only)</SelectItem>
                  <SelectItem value="railway">Railway</SelectItem>
                  <SelectItem value="vercel">Vercel</SelectItem>
                  <SelectItem value="netlify">Netlify</SelectItem>
                  <SelectItem value="render">Render</SelectItem>
                  <SelectItem value="heroku">Heroku</SelectItem>
                  <SelectItem value="api">Custom API</SelectItem>
                  <SelectItem value="ssh">SSH</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="login">Login Credentials</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Platform-specific fields */}
          {["railway", "vercel", "netlify", "render", "heroku"].includes(accessMethod) && (
            <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <h4 className="text-sm font-medium text-blue-400 capitalize">{accessMethod} Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs">API Token</Label>
                  <Input
                    type="password"
                    value={platformToken}
                    onChange={(e) => setPlatformToken(e.target.value)}
                    placeholder={`${accessMethod} API token`}
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Project ID</Label>
                  <Input
                    value={platformProjectId}
                    onChange={(e) => setPlatformProjectId(e.target.value)}
                    placeholder="Project or app ID"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Service ID</Label>
                  <Input
                    value={platformServiceId}
                    onChange={(e) => setPlatformServiceId(e.target.value)}
                    placeholder="Service ID (if applicable)"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Environment</Label>
                  <Input
                    value={platformEnvironmentId}
                    onChange={(e) => setPlatformEnvironmentId(e.target.value)}
                    placeholder="production"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* API fields */}
          {accessMethod === "api" && (
            <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <h4 className="text-sm font-medium text-blue-400">Custom API Configuration</h4>
              <div>
                <Label className="text-zinc-400 text-xs">API Endpoint</Label>
                <Input
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="https://api.example.com/repair"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">API Key / Bearer Token</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your API key"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
            </div>
          )}

          {/* SSH fields */}
          {accessMethod === "ssh" && (
            <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <h4 className="text-sm font-medium text-blue-400">SSH Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs">Host</Label>
                  <Input
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="192.168.1.1"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Port</Label>
                  <Input
                    value={sshPort}
                    onChange={(e) => setSshPort(e.target.value)}
                    placeholder="22"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Username</Label>
                  <Input
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="root"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Private Key</Label>
                <Textarea
                  value={sshPrivateKey}
                  onChange={(e) => setSshPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1 font-mono text-xs"
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Webhook fields */}
          {accessMethod === "webhook" && (
            <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <h4 className="text-sm font-medium text-blue-400">Webhook Configuration</h4>
              <div>
                <Label className="text-zinc-400 text-xs">Repair Webhook URL</Label>
                <Input
                  value={repairWebhookUrl}
                  onChange={(e) => setRepairWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook/repair"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Webhook Secret (optional)</Label>
                <Input
                  type="password"
                  value={repairWebhookSecret}
                  onChange={(e) => setRepairWebhookSecret(e.target.value)}
                  placeholder="Optional secret for verification"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
            </div>
          )}

          {/* Login fields */}
          {accessMethod === "login" && (
            <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <h4 className="text-sm font-medium text-blue-400">Login Credentials</h4>
              <div>
                <Label className="text-zinc-400 text-xs">Login URL</Label>
                <Input
                  value={loginUrl}
                  onChange={(e) => setLoginUrl(e.target.value)}
                  placeholder="https://example.com/admin/login"
                  className="bg-zinc-900 border-zinc-700 text-white mt-1"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs">Username</Label>
                  <Input
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="admin"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Password</Label>
                  <Input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-zinc-900 border-zinc-700 text-white mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <Label className="text-zinc-300 text-sm">Auto-Repair</Label>
              <Switch checked={autoRepair} onCheckedChange={setAutoRepair} />
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <Label className="text-zinc-300 text-sm">Alerts</Label>
              <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <Label className="text-zinc-300 text-sm">SSL Check</Label>
              <Switch checked={sslCheck} onCheckedChange={setSslCheck} />
            </div>
          </div>

          {/* Alert Email */}
          {alertsEnabled && (
            <div>
              <Label className="text-zinc-300">Alert Email (optional)</Label>
              <Input
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                placeholder="alerts@example.com"
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleSubmit}
            disabled={isLoading || !name.trim() || !url.trim()}
          >
            {isLoading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Add Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Repair Dialog ───────────────────────────────────────────────

function RepairDialog({ open, onClose, siteId, siteName, onRepair, isLoading }: {
  open: boolean;
  onClose: () => void;
  siteId: number | null;
  siteName: string;
  onRepair: (action: any, customCommand?: string) => void;
  isLoading: boolean;
}) {
  const [action, setAction] = useState("restart_service");
  const [customCommand, setCustomCommand] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-emerald-400" />
            Repair: {siteName}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Choose a repair action to execute on this site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300">Repair Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="restart_service">Restart Service</SelectItem>
                <SelectItem value="redeploy">Redeploy</SelectItem>
                <SelectItem value="rollback">Rollback</SelectItem>
                <SelectItem value="clear_cache">Clear Cache</SelectItem>
                <SelectItem value="platform_restart">Platform Restart</SelectItem>
                <SelectItem value="ssl_renew">Renew SSL</SelectItem>
                <SelectItem value="dns_flush">Flush DNS</SelectItem>
                <SelectItem value="webhook_trigger">Trigger Webhook</SelectItem>
                <SelectItem value="custom_command">Custom Command</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {action === "custom_command" && (
            <div>
              <Label className="text-zinc-300">Custom Command</Label>
              <Textarea
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="sudo systemctl restart nginx"
                className="bg-zinc-800 border-zinc-700 text-white mt-1 font-mono text-sm"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => onRepair(action, action === "custom_command" ? customCommand : undefined)}
            disabled={isLoading}
          >
            {isLoading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Wrench className="h-4 w-4 mr-1" />}
            Execute Repair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

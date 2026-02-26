import { TitanLogo } from "@/components/TitanLogo";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Globe,
  MousePointerClick,
  Play,
  Plus,
  Power,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatCard({ title, value, icon: Icon, subtitle, color = "purple" }: {
  title: string; value: string | number; icon: any; subtitle?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    purple: "from-purple-500/20 to-purple-600/10 text-purple-400",
    green: "from-green-500/20 to-green-600/10 text-green-400",
    blue: "from-blue-500/20 to-blue-600/10 text-blue-400",
    amber: "from-amber-500/20 to-amber-600/10 text-amber-400",
    red: "from-red-500/20 to-red-600/10 text-red-400",
    cyan: "from-cyan-500/20 to-cyan-600/10 text-cyan-400",
  };
  return (
    <Card className="bg-gradient-to-br border-white/5 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl bg-gradient-to-br ${colorMap[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AffiliateDashboard() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [discoveryStatusFilter, setDiscoveryStatusFilter] = useState<string>("all");

  // ─── Existing affiliate queries ─────────────────────────────────
  const statsQuery = trpc.affiliate.getStats.useQuery();
  const partnersQuery = trpc.affiliate.listPartners.useQuery(
    statusFilter !== "all" || verticalFilter !== "all"
      ? { status: statusFilter !== "all" ? statusFilter : undefined, vertical: verticalFilter !== "all" ? verticalFilter : undefined }
      : undefined
  );
  const leaderboardQuery = trpc.affiliate.getLeaderboard.useQuery({ limit: 10 });
  const payoutsQuery = trpc.affiliate.getPayouts.useQuery({ limit: 20 });

  // ─── Discovery engine queries ───────────────────────────────────
  const discoveryStatsQuery = trpc.affiliate.getDiscoveryStats.useQuery();
  const discoveriesQuery = trpc.affiliate.listDiscoveries.useQuery(
    discoveryStatusFilter !== "all"
      ? { status: discoveryStatusFilter, limit: 100 }
      : { limit: 100 }
  );
  const discoveryRunsQuery = trpc.affiliate.listDiscoveryRuns.useQuery({ limit: 10 });
  const discoveryStatusQuery = trpc.affiliate.getDiscoveryStatus.useQuery();

  // ─── Signup engine queries ─────────────────────────────────────
  const signupStatsQuery = trpc.affiliate.getSignupStats.useQuery();

  // ─── Mutations ──────────────────────────────────────────────────
  const seedMutation = trpc.affiliate.seedPrograms.useMutation({
    onSuccess: (data) => {
      toast.success(`Seeded ${data.seeded} new affiliate programs`);
      partnersQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const optimizeMutation = trpc.affiliate.runOptimization.useMutation({
    onSuccess: (data) => {
      toast.success(`Optimization complete: ${data.partnersAnalyzed} analyzed, ${data.partnersPaused} paused, ${data.partnersPromoted} promoted`);
      partnersQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const outreachMutation = trpc.affiliate.generateOutreach.useMutation({
    onSuccess: () => toast.success("Outreach email generated!"),
    onError: (err) => toast.error(err.message),
  });

  const updatePartnerMutation = trpc.affiliate.updatePartner.useMutation({
    onSuccess: () => {
      toast.success("Partner updated");
      partnersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const runDiscoveryMutation = trpc.affiliate.runDiscovery.useMutation({
    onSuccess: (data) => {
      toast.success(`Discovery complete: ${data.programsDiscovered} found, ${data.programsApproved} approved, ${data.applicationsGenerated} applications`);
      discoveriesQuery.refetch();
      discoveryStatsQuery.refetch();
      discoveryRunsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const promoteDiscoveryMutation = trpc.affiliate.promoteDiscovery.useMutation({
    onSuccess: (data) => {
      toast.success(`Promoted to partner #${data.partnerId}`);
      discoveriesQuery.refetch();
      partnersQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const killSwitchMutation = trpc.affiliate.discoveryKillSwitch.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
      discoveryStatusQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const runSignupMutation = trpc.affiliate.runSignupBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Signup batch: ${data.succeeded} succeeded, ${data.pending} pending, ${data.failed} failed`);
      signupStatsQuery.refetch();
      discoveriesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const signupKillSwitchMutation = trpc.affiliate.signupKillSwitch.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      discoveryStatusQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const stats = statsQuery.data;
  const partners = partnersQuery.data || [];
  const leaderboard = leaderboardQuery.data || [];
  const payouts = payoutsQuery.data || [];
  const discoveryStats = discoveryStatsQuery.data;
  const discoveries = discoveriesQuery.data || [];
  const discoveryRuns = discoveryRunsQuery.data || [];
  const discoveryStatus = discoveryStatusQuery.data;
  const signupStats = signupStatsQuery.data;

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  if (statsQuery.isLoading || partnersQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading affiliate data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" />
            Affiliate Revenue Engine
          </h1>
          <p className="text-muted-foreground mt-1">Zero ad spend. Maximum profit. AI-powered optimization.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-1" />
            Seed Programs
          </Button>
          <Button
            size="sm"
            onClick={() => optimizeMutation.mutate()}
            disabled={optimizeMutation.isPending}
            className="bg-gradient-to-r from-purple-600 to-indigo-600"
          >
            <Zap className="w-4 h-4 mr-1" />
            {optimizeMutation.isPending ? "Optimizing..." : "Run AI Optimization"}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Partners" value={stats?.totalPartners || 0} icon={Users} subtitle={`${stats?.activePartners || 0} active`} color="blue" />
        <StatCard title="Total Clicks" value={stats?.totalClicks?.toLocaleString() || "0"} icon={MousePointerClick} color="purple" />
        <StatCard title="Total Earnings" value={formatCents(stats?.totalEarningsCents || 0)} icon={DollarSign} subtitle={`${stats?.conversionRate?.toFixed(1) || "0"}% conversion`} color="green" />
        <StatCard title="Referral Rewards" value={stats?.totalReferralRewards || 0} icon={TrendingUp} subtitle={`${stats?.totalReferrals || 0} total referrals`} color="amber" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="partners" className="space-y-4">
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="discovery" className="flex items-center gap-1">
            <TitanLogo size="sm" />
            Auto-Discovery
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex items-center gap-1">
            <Rocket className="w-3 h-3" />
            Auto-Signup
          </TabsTrigger>
          <TabsTrigger value="referrals">Referral Leaderboard</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        {/* Partners Tab */}
        <TabsContent value="partners" className="space-y-4">
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verticalFilter} onValueChange={setVerticalFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Vertical" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verticals</SelectItem>
                <SelectItem value="ai_tools">AI Tools</SelectItem>
                <SelectItem value="hosting">Hosting</SelectItem>
                <SelectItem value="dev_tools">Dev Tools</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="vpn">VPN</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="education">Education</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Vertical</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Conversions</TableHead>
                  <TableHead>Earnings</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No partners yet. Click "Seed Programs" to add 31 high-paying affiliate programs.
                    </TableCell>
                  </TableRow>
                ) : (
                  partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.domain}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{p.vertical}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {p.commissionType === "revshare" ? `${p.commissionRate}%` : formatCents(p.commissionRate)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">{p.commissionType}</span>
                      </TableCell>
                      <TableCell>{p.totalClicks.toLocaleString()}</TableCell>
                      <TableCell>{p.totalConversions.toLocaleString()}</TableCell>
                      <TableCell className="text-green-400 font-medium">{formatCents(p.totalEarnings)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${p.performanceScore >= 70 ? "bg-green-500" : p.performanceScore >= 40 ? "bg-amber-500" : "bg-red-500"}`} />
                          <span className="text-sm">{p.performanceScore}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.status === "active" ? "default" : "secondary"}
                          className={p.status === "active" ? "bg-green-600" : p.status === "paused" ? "bg-amber-600" : ""}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {p.status === "prospect" && (
                            <Button variant="ghost" size="sm" onClick={() => outreachMutation.mutate({ partnerId: p.id })} disabled={outreachMutation.isPending} title="Generate AI outreach email">
                              <Send className="w-3 h-3" />
                            </Button>
                          )}
                          {p.status !== "active" && (
                            <Button variant="ghost" size="sm" onClick={() => updatePartnerMutation.mutate({ id: p.id, status: "active" })} title="Activate partner">
                              <Play className="w-3 h-3" />
                            </Button>
                          )}
                          {p.affiliateUrl && (
                            <Button variant="ghost" size="sm" asChild title="Visit affiliate link">
                              <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ═══ AUTO-DISCOVERY TAB ═══ */}
        <TabsContent value="discovery" className="space-y-6">
          {/* Discovery Engine Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${discoveryStatus?.isKilled ? "bg-red-500/20" : "bg-green-500/20"}`}>
                <TitanLogo size="sm" />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Autonomous Discovery Engine
                  <Badge variant={discoveryStatus?.isKilled ? "destructive" : "default"} className={discoveryStatus?.isKilled ? "" : "bg-green-600"}>
                    {discoveryStatus?.isKilled ? "KILLED" : "ACTIVE"}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground">{discoveryStatus?.schedule}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runDiscoveryMutation.mutate()}
                disabled={runDiscoveryMutation.isPending || discoveryStatus?.isKilled}
              >
                <Search className="w-4 h-4 mr-1" />
                {runDiscoveryMutation.isPending ? "Discovering..." : "Run Discovery Now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={discoveryStatus?.isKilled ? "border-green-500 text-green-400" : "border-red-500 text-red-400"}
                onClick={() => {
                  const code = prompt(`Enter kill switch code to ${discoveryStatus?.isKilled ? "resume" : "stop"} discovery:`);
                  if (code) {
                    killSwitchMutation.mutate({ code, action: discoveryStatus?.isKilled ? "reset" : "kill" });
                  }
                }}
              >
                <Power className="w-4 h-4 mr-1" />
                {discoveryStatus?.isKilled ? "Resume" : "Kill Switch"}
              </Button>
            </div>
          </div>

          {/* Discovery Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Programs Discovered" value={discoveryStats?.totalDiscovered || 0} icon={Search} subtitle={`${discoveryStats?.totalApproved || 0} approved`} color="cyan" />
            <StatCard title="Applications Sent" value={discoveryStats?.totalApplied || 0} icon={Send} subtitle={`${discoveryStats?.totalAccepted || 0} accepted`} color="blue" />
            <StatCard title="Promoted to Partners" value={discoveryStats?.totalPromoted || 0} icon={ArrowUpRight} color="green" />
            <StatCard title="Avg. Score" value={discoveryStats?.avgScore || 0} icon={Target} subtitle={`${discoveryStats?.totalRuns || 0} total runs`} color="purple" />
          </div>

          {/* Discovery Run History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5 text-blue-400" />
                Recent Discovery Runs
              </CardTitle>
              <CardDescription>Automated runs every Wednesday and Saturday at 6 AM UTC</CardDescription>
            </CardHeader>
            <CardContent>
              {discoveryRuns.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No discovery runs yet. Click "Run Discovery Now" to start.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Discovered</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead>Applications</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discoveryRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="text-sm">{new Date(run.startedAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{run.runType}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{run.programsDiscovered}</TableCell>
                        <TableCell className="text-green-400">{run.programsApproved}</TableCell>
                        <TableCell>{run.applicationsGenerated}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {run.durationMs > 0 ? `${Math.round(run.durationMs / 1000)}s` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}
                            className={run.status === "completed" ? "bg-green-600" : run.status === "running" ? "bg-blue-600" : ""}
                          >
                            {run.status === "running" && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
                            {run.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Discovered Programs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Globe className="w-5 h-5 text-cyan-400" />
                    Discovered Programs
                  </CardTitle>
                  <CardDescription>AI-discovered affiliate programs scored by revenue potential</CardDescription>
                </div>
                <Select value={discoveryStatusFilter} onValueChange={setDiscoveryStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="discovered">Discovered</SelectItem>
                    <SelectItem value="evaluating">Evaluating</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {discoveries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No discoveries yet. The engine runs automatically on Wed/Sat, or click "Run Discovery Now".
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program</TableHead>
                      <TableHead>Vertical</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Network</TableHead>
                      <TableHead>Revenue Score</TableHead>
                      <TableHead>Relevance</TableHead>
                      <TableHead>Overall</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discoveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{d.name}</p>
                            <p className="text-xs text-muted-foreground">{d.domain}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{d.vertical}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {d.estimatedCommissionType === "revshare" ? `${d.estimatedCommissionRate}%` : formatCents(d.estimatedCommissionRate)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{d.estimatedCommissionType}</span>
                        </TableCell>
                        <TableCell className="text-sm">{d.networkName || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${d.revenueScore >= 70 ? "bg-green-500" : d.revenueScore >= 40 ? "bg-amber-500" : "bg-red-500"}`} />
                            <span className="text-sm">{d.revenueScore}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${d.relevanceScore >= 70 ? "bg-green-500" : d.relevanceScore >= 40 ? "bg-amber-500" : "bg-red-500"}`} />
                            <span className="text-sm">{d.relevanceScore}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-bold ${d.overallScore >= 70 ? "text-green-400" : d.overallScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                            {d.overallScore}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={d.status === "accepted" ? "default" : d.status === "approved" || d.status === "applied" ? "secondary" : "outline"}
                            className={
                              d.status === "accepted" ? "bg-green-600" :
                              d.status === "approved" ? "bg-blue-600" :
                              d.status === "applied" ? "bg-purple-600" :
                              d.status === "skipped" ? "bg-gray-600" : ""
                            }
                          >
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(d.status === "approved" || d.status === "applied" || d.status === "accepted") && !d.promotedToPartnerId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => promoteDiscoveryMutation.mutate({ discoveryId: d.id })}
                                disabled={promoteDiscoveryMutation.isPending}
                                title="Promote to active partner"
                              >
                                <Rocket className="w-3 h-3" />
                              </Button>
                            )}
                            {d.promotedToPartnerId && (
                              <Badge variant="outline" className="text-xs border-green-500 text-green-400">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Partner #{d.promotedToPartnerId}
                              </Badge>
                            )}
                            {d.affiliateProgramUrl && (
                              <Button variant="ghost" size="sm" asChild title="Visit program page">
                                <a href={d.affiliateProgramUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Top Verticals */}
          {discoveryStats?.topVerticals && discoveryStats.topVerticals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                  Top Discovery Verticals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {discoveryStats.topVerticals.map((v) => (
                    <div key={v.vertical} className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-2">
                      <Badge variant="outline" className="text-xs">{v.vertical}</Badge>
                      <span className="text-sm font-medium">{v.count} programs</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Auto-Signup Tab */}
        <TabsContent value="signup" className="space-y-4">
          {/* Signup Engine Status */}
          <div className="flex items-center justify-between bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-xl p-4 border border-orange-500/20">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${discoveryStatus?.isSignupKilled ? "bg-red-500/20" : "bg-green-500/20"}`}>
                <Rocket className={`w-5 h-5 ${discoveryStatus?.isSignupKilled ? "text-red-400" : "text-green-400"}`} />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Autonomous Signup Engine
                  <Badge variant={discoveryStatus?.isSignupKilled ? "destructive" : "default"} className={discoveryStatus?.isSignupKilled ? "" : "bg-green-600"}>
                    {discoveryStatus?.isSignupKilled ? "KILLED" : "ACTIVE"}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground">Signs up as archibaldtitan@gmail.com using Titan's browser automation + CAPTCHA solving</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSignupMutation.mutate({ limit: 10 })}
                disabled={runSignupMutation.isPending || discoveryStatus?.isSignupKilled}
              >
                <Play className="w-4 h-4 mr-1" />
                {runSignupMutation.isPending ? "Signing up..." : "Run Signup Batch"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={discoveryStatus?.isSignupKilled ? "border-green-500 text-green-400" : "border-red-500 text-red-400"}
                onClick={() => signupKillSwitchMutation.mutate({ action: discoveryStatus?.isSignupKilled ? "reset" : "kill" })}
              >
                <Power className="w-4 h-4 mr-1" />
                {discoveryStatus?.isSignupKilled ? "Resume" : "Kill Switch"}
              </Button>
            </div>
          </div>

          {/* Signup Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Attempted" value={signupStats?.totalAttempted || 0} icon={Rocket} color="blue" />
            <StatCard title="Succeeded" value={signupStats?.totalSucceeded || 0} icon={CheckCircle2} color="green" />
            <StatCard title="Pending Review" value={signupStats?.totalPending || 0} icon={Clock} color="amber" />
            <StatCard title="Failed" value={signupStats?.totalFailed || 0} icon={AlertTriangle} color="red" />
          </div>

          {/* Recent Signup Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="w-5 h-5 text-amber-400" />
                Recent Signup Attempts
              </CardTitle>
              <CardDescription>Automated affiliate program registrations using archibaldtitan@gmail.com</CardDescription>
            </CardHeader>
            <CardContent>
              {(!signupStats?.recentResults || signupStats.recentResults.length === 0) ? (
                <div className="text-center py-8">
                  <Rocket className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">No signup attempts yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">Run the discovery engine first to find programs, then click "Run Signup Batch".</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Attempted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signupStats.recentResults.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.programName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={r.status === "accepted" ? "default" : r.status === "pending" || r.status === "sent" ? "secondary" : "destructive"}
                            className={r.status === "accepted" ? "bg-green-600" : r.status === "pending" || r.status === "sent" ? "bg-amber-600" : ""}
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.attemptedAt ? new Date(r.attemptedAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How Autonomous Signup Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl mb-2">1️⃣</div>
                  <h4 className="font-medium text-sm">Discovery</h4>
                  <p className="text-xs text-muted-foreground mt-1">AI discovers new affiliate programs across 8 verticals every Wed/Sat</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl mb-2">2️⃣</div>
                  <h4 className="font-medium text-sm">Form Analysis</h4>
                  <p className="text-xs text-muted-foreground mt-1">LLM analyzes each signup form to determine fields and values</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl mb-2">3️⃣</div>
                  <h4 className="font-medium text-sm">Auto-Fill & Submit</h4>
                  <p className="text-xs text-muted-foreground mt-1">Stealth browser fills forms with business details, solves CAPTCHAs, submits</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl mb-2">4️⃣</div>
                  <h4 className="font-medium text-sm">Track & Promote</h4>
                  <p className="text-xs text-muted-foreground mt-1">Successful signups auto-promoted to active partners with affiliate links</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referral Leaderboard Tab */}
        <TabsContent value="referrals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                Referral Leaderboard
              </CardTitle>
              <CardDescription>Top referrers driving viral growth — zero cost user acquisition</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead>Rewards Earned</TableHead>
                    <TableHead>Tier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No referrals yet. Users will appear here as they share their referral codes.
                      </TableCell>
                    </TableRow>
                  ) : (
                    leaderboard.map((entry, i) => (
                      <TableRow key={entry.userId}>
                        <TableCell className="font-bold text-lg">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </TableCell>
                        <TableCell>{entry.userName || `User #${entry.userId}`}</TableCell>
                        <TableCell><code className="text-purple-400">{entry.code}</code></TableCell>
                        <TableCell className="font-medium">{entry.totalReferrals}</TableCell>
                        <TableCell>{entry.totalRewards} free months</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            entry.tier === "Ambassador" ? "border-purple-500 text-purple-400" :
                            entry.tier === "Champion" ? "border-amber-500 text-amber-400" :
                            entry.tier === "Advocate" ? "border-blue-500 text-blue-400" : ""
                          }>
                            {entry.tier}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payout History</CardTitle>
              <CardDescription>Commission payouts to affiliate partners</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Partner ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No payouts yet. Payouts will appear as partners earn commissions.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>#{p.partnerId}</TableCell>
                        <TableCell className="text-green-400 font-medium">{formatCents(p.amountCents)}</TableCell>
                        <TableCell>{p.paymentMethod || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "completed" ? "default" : "secondary"}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(p.periodStart).toLocaleDateString()} — {new Date(p.periodEnd).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

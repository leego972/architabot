import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Megaphone,
  DollarSign,
  TrendingUp,
  Zap,
  Play,
  BarChart3,
  Target,
  Eye,
  MousePointerClick,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Globe,
  Clock,
  FileText,
  Mail,
  Link2,
  MessageSquare,
  Rss,
  Search,
  PenTool,
  Video,
  Image,
  Send,
  Music,
} from "lucide-react";
import { toast } from "sonner";

// Channel display config
const CHANNEL_ICONS: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  seo_organic: { icon: Search, label: "SEO Organic", color: "text-green-500" },
  blog_content: { icon: FileText, label: "Blog Content", color: "text-blue-500" },
  social_organic: { icon: Rss, label: "Social Media", color: "text-purple-500" },
  community_engagement: { icon: MessageSquare, label: "Community", color: "text-orange-500" },
  affiliate_network: { icon: Link2, label: "Affiliates", color: "text-cyan-500" },
  email_nurture: { icon: Mail, label: "Email Nurture", color: "text-yellow-500" },
  google_ads: { icon: Target, label: "Google Ads", color: "text-red-500" },
  product_hunt: { icon: Zap, label: "Product Hunt", color: "text-amber-500" },
  github_presence: { icon: Globe, label: "GitHub", color: "text-gray-500" },
  backlink_outreach: { icon: Link2, label: "Backlinks", color: "text-indigo-500" },
  forum_participation: { icon: MessageSquare, label: "Forums", color: "text-teal-500" },
};

function ImpactBadge({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    high: "bg-green-500/10 text-green-500 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };
  return (
    <Badge variant="outline" className={colors[impact] || colors.low}>
      {impact}
    </Badge>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "partial") return <AlertCircle className="w-4 h-4 text-yellow-500" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
}

export default function AdvertisingDashboard() {
  const [isRunning, setIsRunning] = useState(false);

  const dashboard = trpc.advertising.getDashboard.useQuery();
  const strategies = trpc.advertising.getStrategies.useQuery();
  const budget = trpc.advertising.getBudgetBreakdown.useQuery();
  const contentQueue = trpc.advertising.getContentQueue.useQuery({ limit: 20 });
  const runCycle = trpc.advertising.runCycle.useMutation({
    onSuccess: (result) => {
      setIsRunning(false);
      const successCount = result.actions.filter((a: any) => a.status === "success").length;
      toast.success(`Advertising cycle complete: ${successCount}/${result.actions.length} actions succeeded`);
      dashboard.refetch();
      contentQueue.refetch();
    },
    onError: (err) => {
      setIsRunning(false);
      toast.error(`Cycle failed: ${err.message}`);
    },
  });

  const updateContent = trpc.advertising.updateContentStatus.useMutation({
    onSuccess: () => {
      toast.success("Content status updated");
      contentQueue.refetch();
    },
  });

  const handleRunCycle = () => {
    setIsRunning(true);
    runCycle.mutate();
  };

  const data = dashboard.data;
  const perf = data?.performance;
  const strat = data?.strategy;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            Autonomous Advertising
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered growth engine — 80% free organic, 20% paid amplification
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm py-1 px-3">
            <DollarSign className="w-3.5 h-3.5 mr-1" />
            ${strat?.monthlyBudget || 500} AUD/mo
          </Badge>
          <Button onClick={handleRunCycle} disabled={isRunning} size="sm">
            {isRunning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Run Cycle Now</>
            )}
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="w-4 h-4" /> Blog Posts (30d)
            </div>
            <div className="text-2xl font-bold mt-1">
              {perf?.organic?.blogPostsPublished ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <PenTool className="w-4 h-4" /> Content Created
            </div>
            <div className="text-2xl font-bold mt-1">
              {perf?.organic?.contentPiecesCreated ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <MousePointerClick className="w-4 h-4" /> Affiliate Clicks
            </div>
            <div className="text-2xl font-bold mt-1">
              {perf?.organic?.affiliateClicks ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="w-4 h-4" /> Budget Used
            </div>
            <div className="text-2xl font-bold mt-1">
              {perf?.budgetUtilization ? `${perf.budgetUtilization.utilizationPercent}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              ${perf?.budgetUtilization?.spent ?? 0} / ${perf?.budgetUtilization?.monthlyBudget ?? 500}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="strategies">Growth Strategies</TabsTrigger>
          <TabsTrigger value="content">Content Queue</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="tiktok">TikTok</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" /> Autonomous Schedule
              </CardTitle>
              <CardDescription>
                What the advertising engine does automatically each day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {strat?.schedule && Object.entries(strat.schedule).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium capitalize">
                        {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                      </div>
                      <div className="text-xs text-muted-foreground">{value as string}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Content Pillars */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5" /> Content Pillars
              </CardTitle>
              <CardDescription>
                SEO-optimized content topics driving organic traffic
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {strat?.contentPillars?.map((pillar: any) => (
                  <div key={pillar.name} className="p-3 rounded-lg border">
                    <div className="font-medium text-sm">{pillar.name}</div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {pillar.keywordCount} keywords
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {pillar.blogTopicCount} blog topics
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {pillar.socialAngleCount} social angles
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Paid Performance */}
          {perf?.paid && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> Paid Campaign Performance (30d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Impressions</div>
                    <div className="text-xl font-bold">{perf.paid.totalImpressions.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Clicks</div>
                    <div className="text-xl font-bold">{perf.paid.totalClicks.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">CTR</div>
                    <div className="text-xl font-bold">{perf.paid.ctr}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">CPC</div>
                    <div className="text-xl font-bold">${perf.paid.cpc}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Strategies Tab */}
        <TabsContent value="strategies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Growth Strategy Matrix</CardTitle>
              <CardDescription>
                All channels ranked by expected impact — {strategies.data?.filter((s: any) => s.costPerMonth === 0).length || 0} free, {strategies.data?.filter((s: any) => s.costPerMonth > 0).length || 0} paid
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {strategies.data?.map((strategy: any) => {
                  const channelInfo = CHANNEL_ICONS[strategy.channel] || { icon: Globe, label: strategy.channel, color: "text-gray-500" };
                  const IconComp = channelInfo.icon;
                  return (
                    <div key={strategy.channel} className="flex items-start gap-4 p-4 rounded-lg border">
                      <div className={`mt-0.5 ${channelInfo.color}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{channelInfo.label}</span>
                          <ImpactBadge impact={strategy.expectedImpact} />
                          {strategy.costPerMonth === 0 ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">FREE</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                              ${strategy.costPerMonth}/mo
                            </Badge>
                          )}
                          {strategy.automatable && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                              <Zap className="w-3 h-3 mr-1" /> Auto
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{strategy.description}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <Clock className="w-3 h-3 inline mr-1" /> {strategy.frequency}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Queue Tab */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PenTool className="w-5 h-5" /> Content Queue
              </CardTitle>
              <CardDescription>
                AI-generated content awaiting review — {data?.contentQueue?.draft || 0} drafts, {data?.contentQueue?.approved || 0} approved
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contentQueue.data?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <PenTool className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No content in queue. Run a cycle to generate content.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contentQueue.data?.map((item: any) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {item.platform}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.contentType?.replace(/_/g, " ")}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              item.status === "published"
                                ? "bg-green-500/10 text-green-500"
                                : item.status === "approved"
                                ? "bg-blue-500/10 text-blue-500"
                                : item.status === "rejected"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-yellow-500/10 text-yellow-500"
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <div className="font-medium text-sm mt-1">{item.headline}</div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.body?.substring(0, 200)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      {item.status === "draft" && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-500 hover:text-green-600"
                            onClick={() => updateContent.mutate({ id: item.id, status: "approved" })}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => updateContent.mutate({ id: item.id, status: "failed" })}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budget Tab */}
        <TabsContent value="budget" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5" /> Budget Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-red-500/10">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-red-500" />
                      <span className="font-medium">Google Ads</span>
                    </div>
                    <span className="font-bold text-red-500">
                      ${budget.data?.allocation?.googleAds || 500} AUD/mo
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-green-500/10">
                    <div className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-green-500" />
                      <span className="font-medium">Free Channels ({budget.data?.freeChannels || 10})</span>
                    </div>
                    <span className="font-bold text-green-500">$0 AUD/mo</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="font-medium">Total Monthly</span>
                    <span className="font-bold text-lg">${budget.data?.monthlyBudget || 500} AUD</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> Channel Cost Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {budget.data?.costBreakdown?.map((item: any) => {
                    const channelInfo = CHANNEL_ICONS[item.channel] || { icon: Globe, label: item.channel, color: "text-gray-500" };
                    return (
                      <div key={item.channel} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <span className={channelInfo.color}>●</span>
                          <span>{channelInfo.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ImpactBadge impact={item.impact} />
                          <span className={item.costPerMonth === 0 ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
                            {item.costPerMonth === 0 ? "FREE" : `$${item.costPerMonth}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="w-5 h-5" /> Activity Log
                  </CardTitle>
                  <CardDescription>Recent autonomous advertising actions</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data?.recentActivity?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No activity yet. The advertising engine runs automatically once daily.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.recentActivity?.map((activity: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                      <StatusIcon status={activity.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm capitalize">
                            {activity.action?.replace(/_/g, " ")}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {activity.channel}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {activity.details ? (
                            typeof activity.details === "string"
                              ? activity.details.substring(0, 200)
                              : JSON.stringify(activity.details).substring(0, 200)
                          ) : "No details"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(activity.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TikTok Content Tab */}
        <TabsContent value="tiktok" className="space-y-4">
          <TikTokContentTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// TIKTOK CONTENT TAB
// ============================================

function TikTokContentTab() {
  const [isGenerating, setIsGenerating] = useState(false);
  const tiktokStats = trpc.advertising.getTikTokStats.useQuery();
  const triggerPost = trpc.advertising.triggerTikTokPost.useMutation({
    onSuccess: (result) => {
      setIsGenerating(false);
      if (result.success) {
        toast.success(result.details);
      } else {
        toast.error(result.details);
      }
      tiktokStats.refetch();
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(`TikTok post failed: ${err.message}`);
    },
  });

  const stats = tiktokStats.data;

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-pink-500" />
              <div>
                <div className="text-2xl font-bold">{stats?.totalPosts ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total Posts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats?.publishedPosts ?? 0}</div>
                <div className="text-xs text-muted-foreground">Published</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Image className="w-5 h-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats?.approvedPosts ?? 0}</div>
                <div className="text-xs text-muted-foreground">Ready to Post</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold">{stats?.draftPosts ?? 0}</div>
                <div className="text-xs text-muted-foreground">Drafts</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection Status + Generate Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Music className="w-5 h-5 text-pink-500" /> TikTok Content Engine
              </CardTitle>
              <CardDescription>
                Auto-generates photo carousels from blog posts using AI-generated cyberpunk infographics
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={stats?.configured ? "default" : "secondary"} className={stats?.configured ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}>
                {stats?.configured ? "API Connected" : "Content-Only Mode"}
              </Badge>
              <Button
                onClick={() => {
                  setIsGenerating(true);
                  triggerPost.mutate();
                }}
                disabled={isGenerating}
                size="sm"
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Generate Post</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.creatorInfo ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              {stats.creatorInfo.creatorAvatarUrl && (
                <img loading="lazy" src={stats.creatorInfo.creatorAvatarUrl} alt="" className="w-10 h-10 rounded-full" />
              )}
              <div>
                <div className="font-medium">{stats.creatorInfo.creatorNickname || "Connected Account"}</div>
                <div className="text-xs text-muted-foreground">
                  Privacy options: {stats.creatorInfo.privacyLevelOptions?.join(", ") || "N/A"}
                  {stats.creatorInfo.maxVideoPostDurationSec && ` • Max video: ${stats.creatorInfo.maxVideoPostDurationSec}s`}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground p-3 rounded-lg border border-dashed">
              <p className="font-medium mb-1">TikTok Content Posting API not connected</p>
              <p>Content will be generated and saved as ready-to-post drafts. To enable direct posting, configure your TikTok Developer App credentials in Settings.</p>
              <p className="mt-2 text-xs">Required: <code>TIKTOK_CREATOR_TOKEN</code> or <code>TIKTOK_ACCESS_TOKEN</code></p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Posts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent TikTok Content</CardTitle>
              <CardDescription>Auto-generated content from blog posts</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => tiktokStats.refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!stats?.recentPosts?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No TikTok content generated yet.</p>
              <p className="text-xs mt-1">Content is auto-generated on Tue/Thu/Sat, or click "Generate Post" above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentPosts.map((post: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className="flex-shrink-0 mt-1">
                    {post.status === "published" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : post.status === "approved" ? (
                      <Image className="w-5 h-5 text-blue-500" />
                    ) : (
                      <FileText className="w-5 h-5 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{post.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs capitalize">{post.status}</Badge>
                      {post.imageCount > 0 && (
                        <span className="text-xs text-muted-foreground">{post.imageCount} slides</span>
                      )}
                      {post.publishedAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.publishedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How TikTok Content Engine Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg border">
              <FileText className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <div className="font-medium text-sm">1. Pick Blog Post</div>
              <div className="text-xs text-muted-foreground mt-1">Selects an unpromoted blog post from the content library</div>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <PenTool className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <div className="font-medium text-sm">2. AI Content Plan</div>
              <div className="text-xs text-muted-foreground mt-1">LLM generates hook, caption, hashtags, and image prompts</div>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <Image className="w-8 h-8 mx-auto mb-2 text-pink-500" />
              <div className="font-medium text-sm">3. Generate Images</div>
              <div className="text-xs text-muted-foreground mt-1">AI creates cyberpunk-style carousel slides (3 images)</div>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <Send className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <div className="font-medium text-sm">4. Post to TikTok</div>
              <div className="text-xs text-muted-foreground mt-1">Direct post via Content Posting API (or save as draft)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

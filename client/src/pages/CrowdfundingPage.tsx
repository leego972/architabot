import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Rocket, Plus, Loader2, Users, Target, Search, ExternalLink,
  TrendingUp, Clock, DollarSign, ArrowLeft, Heart, Share2,
  Globe, Zap, Filter, BarChart3, Star, ChevronRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Source badge colors ───────────────────────────────────────
function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; className: string }> = {
    kickstarter: { label: "Kickstarter", className: "bg-green-500/15 text-green-400 border-green-500/30" },
    indiegogo: { label: "Indiegogo", className: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
    gofundme: { label: "GoFundMe", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    internal: { label: "Archibald Titan", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    other: { label: "Community", className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  };
  const c = config[source] || config.other;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string }> = {
    active: { className: "bg-green-500/15 text-green-400 border-green-500/30" },
    funded: { className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    ended: { className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
    draft: { className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    cancelled: { className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const c = config[status] || config.active;
  return <Badge variant="outline" className={c.className}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN CARD
// ═══════════════════════════════════════════════════════════════

function CampaignCard({ campaign, onClick }: { campaign: any; onClick: () => void }) {
  const progressPct = Math.min(100, Math.round((campaign.currentAmount / campaign.goalAmount) * 100));
  const isExternal = campaign.source !== "internal";

  return (
    <Card
      className="group cursor-pointer hover:border-blue-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/5 overflow-hidden"
      onClick={onClick}
    >
      <div className="h-40 relative overflow-hidden bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20">
        {campaign.imageUrl ? (
          <img loading="lazy" src={campaign.imageUrl} alt={campaign.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Rocket className="h-12 w-12 text-blue-400/30" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <SourceBadge source={campaign.source || "internal"} />
          <StatusBadge status={campaign.status} />
        </div>
        {campaign.featured === 1 && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-yellow-500/90 text-black border-0 font-bold">
              <Star className="h-3 w-3 mr-1" /> Featured
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-blue-400 transition-colors">
            {campaign.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            by {campaign.creatorName || "Anonymous"} {campaign.location ? `· ${campaign.location}` : ""}
          </p>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">{campaign.description}</p>

        <div className="space-y-1.5">
          <Progress value={progressPct} className="h-2" />
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-green-400">{formatAmount(campaign.currentAmount)} raised</span>
            <span className="text-muted-foreground">of {formatAmount(campaign.goalAmount)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-white/5">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{(campaign.backerCount || 0).toLocaleString()} backers</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span className="font-semibold text-green-400">{campaign.percentFunded || progressPct}%</span>
          </div>
          {campaign.daysLeft != null && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{campaign.daysLeft}d left</span>
            </div>
          )}
        </div>

        {campaign.tags && Array.isArray(campaign.tags) && campaign.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {campaign.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        )}

        {isExternal && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span>View on {campaign.source?.charAt(0).toUpperCase() + campaign.source?.slice(1)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// BROWSE VIEW
// ═══════════════════════════════════════════════════════════════

function BrowseView() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState<string>("trending");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: campaigns, isLoading } = trpc.crowdfunding.list.useQuery({
    sort: sortBy as any,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const { data: stats } = trpc.crowdfunding.stats.useQuery();

  const seedMutation = trpc.crowdfunding.seed.useMutation({
    onSuccess: (data) => {
      toast.success(`Seeded ${data.seeded} campaigns (${data.skipped} already existed)`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-pink-600/10 p-6">
        <div className="relative">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Rocket className="h-7 w-7 text-blue-400" />
                Crowdfunding Hub
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Discover and back innovative projects from Kickstarter, Indiegogo, GoFundMe, and our community
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Seed Campaigns
              </Button>
              <Button size="sm" onClick={() => setLocation("/crowdfunding/create")}>
                <Plus className="h-4 w-4 mr-1" /> Create Campaign
              </Button>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <div className="bg-background/50 rounded-lg p-3 border border-white/5">
                <div className="text-lg font-bold">{stats.total}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Campaigns</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-white/5">
                <div className="text-lg font-bold text-green-400">{formatAmount(stats.totalRaised)}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Raised</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-white/5">
                <div className="text-lg font-bold text-blue-400">{stats.totalBackers.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Backers</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-white/5">
                <div className="text-lg font-bold text-green-400">{stats.kickstarter}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Kickstarter</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-white/5">
                <div className="text-lg font-bold text-pink-400">{stats.indiegogo + stats.gofundme + stats.other}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Other Platforms</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search campaigns..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]"><Globe className="h-4 w-4 mr-1" /><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="kickstarter">Kickstarter</SelectItem>
            <SelectItem value="indiegogo">Indiegogo</SelectItem>
            <SelectItem value="gofundme">GoFundMe</SelectItem>
            <SelectItem value="internal">Archibald Titan</SelectItem>
            <SelectItem value="other">Community</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="funded">Funded</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]"><BarChart3 className="h-4 w-4 mr-1" /><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="most_funded">Most Funded</SelectItem>
            <SelectItem value="most_backed">Most Backed</SelectItem>
            <SelectItem value="ending_soon">Ending Soon</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaign grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
      ) : !campaigns || campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No campaigns found</h3>
          <p className="text-sm text-muted-foreground mb-4">Click "Seed Campaigns" to populate with real projects from Kickstarter, Indiegogo, and GoFundMe.</p>
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Seed Campaigns
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign: any) => (
            <CampaignCard key={campaign.id} campaign={campaign} onClick={() => setLocation(`/crowdfunding/campaign/${campaign.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL VIEW
// ═══════════════════════════════════════════════════════════════

function CampaignDetailView({ campaignId }: { campaignId: number }) {
  const [, setLocation] = useLocation();
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeMessage, setContributeMessage] = useState("");
  const [showContribute, setShowContribute] = useState(false);

  const { data: campaign, isLoading, refetch } = trpc.crowdfunding.get.useQuery({ id: campaignId });

  const contributeMutation = trpc.crowdfunding.contribute.useMutation({
    onSuccess: () => {
      toast.success("Contribution recorded successfully!");
      setShowContribute(false);
      setContributeAmount("");
      setContributeMessage("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;

  if (!campaign) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-lg font-semibold">Campaign not found</h3>
        <Button className="mt-4" onClick={() => setLocation("/crowdfunding")}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Campaigns</Button>
      </Card>
    );
  }

  const isExternal = (campaign as any).source !== "internal";
  const progressPct = Math.min(100, Math.round((campaign.currentAmount / campaign.goalAmount) * 100));

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/crowdfunding")}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Campaigns</Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden">
            <div className="h-48 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 relative">
              {campaign.imageUrl ? (
                <img loading="lazy" src={campaign.imageUrl} alt={campaign.title} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center"><Rocket className="h-16 w-16 text-blue-400/30" /></div>
              )}
              <div className="absolute top-3 left-3 flex gap-2">
                <SourceBadge source={(campaign as any).source || "internal"} />
                <StatusBadge status={campaign.status} />
              </div>
            </div>
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold">{campaign.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                by {(campaign as any).creatorName || "Anonymous"}
                {(campaign as any).location ? ` · ${(campaign as any).location}` : ""}
              </p>
              <p className="mt-4 text-sm">{campaign.description}</p>
              {(campaign as any).tags && Array.isArray((campaign as any).tags) && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(campaign as any).tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Campaign Story</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{campaign.story || campaign.description || "No detailed story provided."}</p>
            </CardContent>
          </Card>

          {campaign.updates && (campaign.updates as any[]).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Updates ({(campaign.updates as any[]).length})</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(campaign.updates as any[]).map((update: any) => (
                  <div key={update.id} className="border-l-2 border-blue-500/30 pl-4">
                    <h4 className="font-semibold text-sm">{update.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{update.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">{new Date(update.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {campaign.contributions && (campaign.contributions as any[]).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Recent Backers ({(campaign.contributions as any[]).length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(campaign.contributions as any[]).slice(0, 10).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <span className="text-sm font-medium">{c.anonymous ? "Anonymous" : c.backerName}</span>
                      {c.message && <p className="text-xs text-muted-foreground mt-0.5">{c.message}</p>}
                    </div>
                    <span className="text-sm font-semibold text-green-400">${c.amount}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="border-blue-500/20">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{formatAmount(campaign.currentAmount)}</div>
                <div className="text-sm text-muted-foreground">raised of {formatAmount(campaign.goalAmount)} goal</div>
              </div>
              <Progress value={progressPct} className="h-3" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-green-400">{(campaign as any).percentFunded || progressPct}%</div>
                  <div className="text-[10px] text-muted-foreground">Funded</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{(campaign.backerCount || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">Backers</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{(campaign as any).daysLeft ?? "N/A"}</div>
                  <div className="text-[10px] text-muted-foreground">Days Left</div>
                </div>
              </div>

              {isExternal ? (
                <div className="space-y-2">
                  <Button className="w-full bg-green-600 hover:bg-green-500" onClick={() => window.open((campaign as any).externalUrl, "_blank")}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Back on {((campaign as any).source || "").charAt(0).toUpperCase() + ((campaign as any).source || "").slice(1)}
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground">You'll be redirected to the original campaign page</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {!showContribute ? (
                    <div className="space-y-2">
                      <Button className="w-full bg-blue-600 hover:bg-blue-500" onClick={() => setShowContribute(true)} disabled={campaign.status !== "active"}>
                        <Heart className="h-4 w-4 mr-2" />
                        {campaign.status === "active" ? "Back This Project" : "Campaign Not Active"}
                      </Button>
                      {campaign.status === "active" && (
                        <Button variant="outline" className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={() => setShowContribute(true)}>
                          <Zap className="h-4 w-4 mr-2" />
                          Pay with Crypto (BTC, ETH, USDT)
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                      <Label className="text-xs">Contribution Amount ($)</Label>
                      <Input type="number" min="1" placeholder="25" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} />
                      <Label className="text-xs">Message (optional)</Label>
                      <Textarea placeholder="Good luck with the project!" value={contributeMessage} onChange={(e) => setContributeMessage(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-green-600 hover:bg-green-500" onClick={() => {
                          const amount = parseInt(contributeAmount);
                          if (!amount || amount < 1) { toast.error("Enter a valid amount"); return; }
                          contributeMutation.mutate({ campaignId: campaign.id, amount, message: contributeMessage || undefined });
                        }} disabled={contributeMutation.isPending}>
                          {contributeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                        </Button>
                        <Button variant="outline" onClick={() => setShowContribute(false)}>Cancel</Button>
                      </div>
                      <p className="text-[10px] text-center text-muted-foreground">5% platform fee applies. Crypto payments (BTC, ETH, USDT) also accepted.</p>
                    </div>
                  )}
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); }}>
                <Share2 className="h-4 w-4 mr-2" /> Share Campaign
              </Button>
            </CardContent>
          </Card>

          {campaign.rewards && (campaign.rewards as any[]).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Reward Tiers</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(campaign.rewards as any[]).map((reward: any) => (
                  <div key={reward.id} className="p-3 rounded-lg border border-white/10 hover:border-blue-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{reward.title}</span>
                      <Badge variant="secondary">${reward.minAmount}+</Badge>
                    </div>
                    {reward.description && <p className="text-xs text-muted-foreground mt-1">{reward.description}</p>}
                    {reward.maxClaims && <p className="text-[10px] text-muted-foreground mt-1">{reward.claimedCount}/{reward.maxClaims} claimed</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Campaign Info</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{campaign.category || "Technology"}</span></div>
              {(campaign as any).subcategory && <div className="flex justify-between"><span className="text-muted-foreground">Subcategory</span><span>{(campaign as any).subcategory}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span>{campaign.currency}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Start Date</span><span>{new Date(campaign.startDate).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">End Date</span><span>{new Date(campaign.endDate).toLocaleDateString()}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MY CAMPAIGNS VIEW
// ═══════════════════════════════════════════════════════════════

function MyCampaignsView() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: campaigns, isLoading } = trpc.crowdfunding.myCampaigns.useQuery();

  const updateMutation = trpc.crowdfunding.update.useMutation({
    onSuccess: () => { toast.success("Campaign updated"); utils.crowdfunding.myCampaigns.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3"><Rocket className="h-7 w-7 text-blue-400" /> My Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your crowdfunding campaigns</p>
        </div>
        <Button onClick={() => setLocation("/crowdfunding/create")}><Plus className="h-4 w-4 mr-1" /> New Campaign</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
      ) : !campaigns || campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first crowdfunding campaign to start raising funds.</p>
          <Button onClick={() => setLocation("/crowdfunding/create")}><Plus className="h-4 w-4 mr-1" /> Create Campaign</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign: any) => {
            const progressPct = Math.min(100, Math.round((campaign.currentAmount / campaign.goalAmount) * 100));
            return (
              <Card key={campaign.id} className="hover:border-blue-500/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold cursor-pointer hover:text-blue-400 transition-colors" onClick={() => setLocation(`/crowdfunding/campaign/${campaign.id}`)}>{campaign.title}</h3>
                        <StatusBadge status={campaign.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{campaign.description}</p>
                      <div className="mt-3 space-y-1.5">
                        <Progress value={progressPct} className="h-2" />
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="text-green-400 font-semibold">{formatAmount(campaign.currentAmount)} / {formatAmount(campaign.goalAmount)}</span>
                          <span>{campaign.backerCount} backers</span>
                          <span>{progressPct}% funded</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {campaign.status === "draft" && (
                        <Button size="sm" variant="outline" className="text-green-400 border-green-500/30" onClick={() => updateMutation.mutate({ id: campaign.id, status: "active" })}>Launch</Button>
                      )}
                      {campaign.status === "active" && (
                        <Button size="sm" variant="outline" className="text-red-400 border-red-500/30" onClick={() => updateMutation.mutate({ id: campaign.id, status: "ended" })}>End</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setLocation(`/crowdfunding/campaign/${campaign.id}`)}>View</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE CAMPAIGN VIEW
// ═══════════════════════════════════════════════════════════════

function CreateCampaignView() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [story, setStory] = useState("");
  const [category, setCategory] = useState("technology");
  const [goalAmount, setGoalAmount] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  const createMutation = trpc.crowdfunding.create.useMutation({
    onSuccess: (data) => {
      toast.success("Campaign created!");
      setLocation(`/crowdfunding/campaign/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/crowdfunding")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-blue-400" /> Create New Campaign</CardTitle>
          <CardDescription>Launch a crowdfunding campaign to raise funds for your project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Campaign Title *</Label><Input placeholder="My Awesome Project" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>Short Description *</Label><Textarea placeholder="A brief description..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
          <div className="space-y-2"><Label>Full Story</Label><Textarea placeholder="Tell your story in detail..." value={story} onChange={(e) => setStory(e.target.value)} rows={6} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="science">Science</SelectItem>
                  <SelectItem value="health">Health</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="environment">Environment</SelectItem>
                  <SelectItem value="community">Community</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Goal Amount ($) *</Label><Input type="number" min="100" placeholder="10000" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Start Date *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>End Date *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-500" onClick={() => {
              if (!title || !description || !goalAmount || !startDate || !endDate) { toast.error("Please fill in all required fields"); return; }
              createMutation.mutate({ title, description, story, category, goalAmount: parseInt(goalAmount), startDate, endDate });
            }} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Rocket className="h-4 w-4 mr-1" />}
              Create Campaign
            </Button>
            <Button variant="outline" onClick={() => setLocation("/crowdfunding")}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE ROUTER
// ═══════════════════════════════════════════════════════════════

export default function CrowdfundingPage() {
  const [location] = useLocation();
  const path = location.replace(/^\/crowdfunding\/?/, "");

  const campaignMatch = path.match(/^campaign\/(\d+)/);
  if (campaignMatch) return <CampaignDetailView campaignId={parseInt(campaignMatch[1])} />;
  if (path === "my-campaigns") return <MyCampaignsView />;
  if (path === "create") return <CreateCampaignView />;
  return <BrowseView />;
}

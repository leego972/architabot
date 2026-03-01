import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpRight,
  Banknote,
  Check,
  Coins,
  Copy,
  Crown,
  DollarSign,
  Gift,
  Loader2,
  Share2,
  Star,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);

  // Use the enhanced dashboard endpoint
  const dashboard = trpc.affiliate.getMyReferralDashboard.useQuery(undefined, {
    enabled: !!user,
  });
  const leaderboard = trpc.affiliate.getLeaderboard.useQuery({ limit: 10 });
  const config = trpc.affiliate.getReferralConfig.useQuery();

  const payoutMutation = trpc.affiliate.requestPayout.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        dashboard.refetch();
      } else {
        toast.error(data.message);
      }
      setPayoutLoading(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setPayoutLoading(false);
    },
  });

  const copyLink = () => {
    if (dashboard.data?.referralLink) {
      navigator.clipboard.writeText(dashboard.data.referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareOnTwitter = () => {
    if (dashboard.data?.referralLink) {
      const text = encodeURIComponent(
        "I earn recurring commissions promoting Archibald Titan \u2014 the world's most advanced AI agent. Join the affiliate program:"
      );
      const url = encodeURIComponent(dashboard.data.referralLink);
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
    }
  };

  const shareOnLinkedIn = () => {
    if (dashboard.data?.referralLink) {
      const url = encodeURIComponent(dashboard.data.referralLink);
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
        "_blank"
      );
    }
  };

  const requestPayout = (method: "wire_transfer" | "credits") => {
    setPayoutLoading(true);
    payoutMutation.mutate({ method });
  };

  const d = dashboard.data;
  const tiers = d?.allTiers || config.data?.tiers || [];

  if (!user) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto text-center py-20">
        <Gift className="w-16 h-16 text-purple-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">Titan Affiliate Program</h1>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Earn 10-22% recurring commission for 12 months on every user you refer.
          Sign in to get your unique referral link.
        </p>
        <Button size="lg" className="bg-purple-600 hover:bg-purple-700">
          Sign In to Start Earning
        </Button>
      </div>
    );
  }

  if (dashboard.isLoading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" />
            Titan Affiliate Program
          </h1>
          <p className="text-muted-foreground mt-1">
            Earn {d?.currentTier?.commissionPercent || 10}% recurring commission on every payment your referrals make for {d?.commissionDurationMonths || 12} months.
          </p>
        </div>
        {d?.currentTier && (
          <Badge
            variant="outline"
            className="text-lg px-4 py-2 border-purple-500/50 bg-purple-500/10"
          >
            {d.currentTier.badge} {d.currentTier.name}
          </Badge>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatCents(d?.totalEarningsCents || 0)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500/40" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Referrals</p>
                <p className="text-2xl font-bold text-purple-400">
                  {d?.totalReferrals || 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d?.activeReferrals || 0} active subscribers
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-500/40" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Recurring</p>
                <p className="text-2xl font-bold text-blue-400">
                  {formatCents(d?.monthlyRecurringCents || 0)}
                </p>
                <p className="text-xs text-muted-foreground">/month estimated</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-500/40" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Payout</p>
                <p className="text-2xl font-bold text-amber-400">
                  {formatCents(d?.pendingPayoutCents || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Min: {formatCents(d?.minPayoutCents || 5000)}
                </p>
              </div>
              <Wallet className="w-8 h-8 text-amber-500/40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Link + Tier Progress */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Referral Link Card */}
        <Card className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border-purple-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-purple-400" />
              Your Referral Link
            </CardTitle>
            <CardDescription>Share this link to earn commissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-black/30 rounded-lg text-purple-300 text-sm truncate border border-purple-500/20">
                {d?.referralLink || "Loading..."}
              </code>
              <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Code: <code className="text-purple-400 font-mono">{d?.code}</code>
            </p>

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={shareOnTwitter} className="bg-[#1DA1F2] hover:bg-[#1a8cd8]">
                <Share2 className="w-4 h-4 mr-1" />
                Share on X
              </Button>
              <Button size="sm" onClick={shareOnLinkedIn} className="bg-[#0A66C2] hover:bg-[#094d92]">
                <ArrowUpRight className="w-4 h-4 mr-1" />
                LinkedIn
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="w-4 h-4 mr-1" />
                Copy Link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tier Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              Tier Progress
            </CardTitle>
            <CardDescription>
              {d?.nextTier
                ? `${d.referralsToNextTier} more referrals to ${d.nextTier.badge} ${d.nextTier.name} (${d.nextTier.commissionPercent}%)`
                : "You've reached the highest tier!"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{d?.currentTier?.badge}</span>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{d?.currentTier?.name}</span>
                  <span className="text-muted-foreground">
                    {d?.currentTier?.commissionPercent}% commission
                  </span>
                </div>
                <Progress value={d?.tierProgress || 0} className="h-2" />
              </div>
              {d?.nextTier && <span className="text-2xl opacity-40">{d.nextTier.badge}</span>}
            </div>

            <p className="text-xs text-muted-foreground">{d?.currentTier?.perks}</p>

            {/* Deal 1: 5 referrals = 30% off first month */}
            <div className="p-3 bg-black/20 rounded-lg">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">30% Off First Month</span>
                <span className="text-purple-400">
                  {Math.min(d?.totalReferrals || 0, 5)}/5 verified sign-ups
                </span>
              </div>
              <Progress
                value={Math.min(((d?.totalReferrals || 0) / 5) * 100, 100)}
                className="h-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(d?.totalReferrals || 0) >= 5
                  ? "Unlocked! 30% off will be applied to your next subscription checkout."
                  : `Refer ${5 - (d?.totalReferrals || 0)} more friends who sign up to unlock 30% off your first month.`
                }
              </p>
            </div>

            {/* Deal 2: High-value referral = 50% off Pro annual */}
            <div className="p-3 bg-gradient-to-r from-amber-500/10 to-purple-500/10 rounded-lg border border-amber-500/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-400 text-sm font-semibold">Premium Referral Bonus</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Refer a friend who subscribes to <span className="text-cyan-400 font-medium">Cyber</span> tier or above, and you'll get <span className="text-amber-400 font-medium">50% off your second year of Pro</span> (annual billing, one-time reward).
              </p>
            </div>

            {/* Deal 3: Titan referral = 3 months Titan features */}
            <div className="p-3 bg-gradient-to-r from-purple-600/15 to-cyan-500/15 rounded-lg border border-purple-500/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-purple-400 text-sm font-bold">Titan Referral Unlock</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full font-medium">EXCLUSIVE</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Refer a friend who subscribes to <span className="text-purple-400 font-medium">Titan</span> tier and pays — you'll get <span className="text-cyan-400 font-medium">3 months of full Titan features unlocked</span> for free. All tools, unlimited access, zero cost. One-time reward.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Tiers / Conversions / Payouts / Leaderboard */}
      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tiers">Commission Tiers</TabsTrigger>
          <TabsTrigger value="conversions">Conversion History</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        {/* Tiers Tab */}
        <TabsContent value="tiers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Commission Tiers
              </CardTitle>
              <CardDescription>
                The more you refer, the higher your commission rate. All commissions are recurring for {d?.commissionDurationMonths || 12} months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {tiers.map((tier: any) => {
                  const isCurrent = d?.currentTier?.name === tier.name;
                  const isLocked =
                    (d?.totalReferrals || 0) < tier.minReferrals;
                  return (
                    <div
                      key={tier.name}
                      className={`relative p-4 rounded-xl border text-center transition-all ${
                        isCurrent
                          ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30 scale-[1.02]"
                          : isLocked
                          ? "border-white/5 bg-white/2 opacity-60"
                          : "border-green-500/30 bg-green-500/5"
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                          <Badge className="bg-purple-600 text-xs">Current</Badge>
                        </div>
                      )}
                      <p className="text-2xl mb-1">{tier.badge}</p>
                      <p className="font-bold text-lg">{tier.name}</p>
                      <p className="text-2xl font-bold text-green-400 mt-2">
                        {tier.commissionPercent}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {tier.minReferrals}+ referrals
                      </p>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {tier.perks}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversions Tab */}
        <TabsContent value="conversions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Conversion History
              </CardTitle>
              <CardDescription>Track every referral signup and subscription</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reward Type</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!d?.conversions || d.conversions.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No conversions yet. Share your referral link to start earning!
                      </TableCell>
                    </TableRow>
                  ) : (
                    d.conversions.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              c.status === "rewarded"
                                ? "border-green-500/50 text-green-400"
                                : c.status === "subscribed"
                                ? "border-blue-500/50 text-blue-400"
                                : "border-gray-500/50 text-gray-400"
                            }
                          >
                            {c.status === "signed_up"
                              ? "Signed Up"
                              : c.status === "subscribed"
                              ? "Subscribed"
                              : "Rewarded"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {c.rewardType?.replace("_", " ") || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-400">
                          {c.rewardAmountCents > 0
                            ? formatCents(c.rewardAmountCents)
                            : "-"}
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
        <TabsContent value="payouts">
          <div className="space-y-4">
            {/* Payout Request Card */}
            <Card className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-green-400" />
                  Request Payout
                </CardTitle>
                <CardDescription>
                  Available balance: <span className="text-green-400 font-medium">{formatCents(d?.pendingPayoutCents || 0)}</span>
                  {" \u2022 "}Minimum: {formatCents(d?.minPayoutCents || 5000)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Wire Transfer Option */}
                  <div className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-5 h-5 text-green-400" />
                      <h3 className="font-medium">Wire Transfer</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Receive {formatCents(d?.pendingPayoutCents || 0)} directly to your bank account.
                      Processing: 3-5 business days.
                    </p>
                    <Button
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={
                        payoutLoading ||
                        (d?.pendingPayoutCents || 0) < (d?.minPayoutCents || 5000)
                      }
                      onClick={() => requestPayout("wire_transfer")}
                    >
                      {payoutLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <DollarSign className="w-4 h-4 mr-1" />
                      )}
                      Cash Out {formatCents(d?.pendingPayoutCents || 0)}
                    </Button>
                  </div>

                  {/* Credits Option */}
                  <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-purple-400" />
                      <h3 className="font-medium">Platform Credits</h3>
                      <Badge className="bg-purple-600 text-xs">{d?.creditBonusMultiplier || 1.5}x BONUS</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Get{" "}
                      <span className="text-purple-400 font-medium">
                        {formatCents(
                          Math.round((d?.pendingPayoutCents || 0) * (d?.creditBonusMultiplier || 1.5))
                        )}
                      </span>{" "}
                      in credits ({d?.creditBonusMultiplier || 1.5}x bonus!). Instant delivery.
                    </p>
                    <Button
                      size="sm"
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      disabled={
                        payoutLoading ||
                        (d?.pendingPayoutCents || 0) < (d?.minPayoutCents || 5000)
                      }
                      onClick={() => requestPayout("credits")}
                    >
                      {payoutLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Star className="w-4 h-4 mr-1" />
                      )}
                      Get {formatCents(
                        Math.round((d?.pendingPayoutCents || 0) * (d?.creditBonusMultiplier || 1.5))
                      )} Credits
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payout History */}
            <Card>
              <CardHeader>
                <CardTitle>Payout History</CardTitle>
                <CardDescription>
                  Total paid: {formatCents(d?.paidOutCents || 0)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!d?.payouts || d.payouts.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No payouts yet. Earn commissions and request your first payout!
                        </TableCell>
                      </TableRow>
                    ) : (
                      d.payouts.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium text-green-400">
                            {formatCents(p.amountCents)}
                          </TableCell>
                          <TableCell className="text-sm capitalize">
                            {p.paymentMethod?.replace("_", " ") || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                p.status === "completed"
                                  ? "border-green-500/50 text-green-400"
                                  : p.status === "processing"
                                  ? "border-blue-500/50 text-blue-400"
                                  : p.status === "failed"
                                  ? "border-red-500/50 text-red-400"
                                  : "border-amber-500/50 text-amber-400"
                              }
                            >
                              {p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Top Referrers
              </CardTitle>
              <CardDescription>
                Community leaderboard \u2014 climb the ranks for higher commissions!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead>Tier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leaderboard.data || []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        Be the first to refer a friend and claim the #1 spot!
                      </TableCell>
                    </TableRow>
                  ) : (
                    (leaderboard.data || []).map((entry: any, i: number) => (
                      <TableRow key={entry.userId}>
                        <TableCell className="font-bold text-lg">
                          {i === 0
                            ? "\uD83E\uDD47"
                            : i === 1
                            ? "\uD83E\uDD48"
                            : i === 2
                            ? "\uD83E\uDD49"
                            : `#${i + 1}`}
                        </TableCell>
                        <TableCell>
                          {entry.userId === user?.id ? (
                            <span className="text-purple-400 font-medium">
                              You
                            </span>
                          ) : (
                            entry.userName || `User #${entry.userId}`
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.totalReferrals}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.tier}</Badge>
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

      {/* How it Works */}
      <Card>
        <CardHeader>
          <CardTitle>How the Titan Affiliate Program Works</CardTitle>
          <CardDescription>
            Earn recurring commissions for every user you bring to Titan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
                <Share2 className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="font-medium">1. Share Your Link</h3>
              <p className="text-sm text-muted-foreground">
                Copy your unique referral link and share it anywhere \u2014 social media,
                communities, blog posts.
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-medium">2. Users Sign Up</h3>
              <p className="text-sm text-muted-foreground">
                When someone signs up using your link, they're tracked as your
                referral automatically.
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="font-medium">3. Earn Commissions</h3>
              <p className="text-sm text-muted-foreground">
                You earn {d?.currentTier?.commissionPercent || 10}% of every payment they make for {d?.commissionDurationMonths || 12} months.
                Recurring passive income.
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="font-medium">4. Get Paid</h3>
              <p className="text-sm text-muted-foreground">
                Cash out via wire transfer, or take {d?.creditBonusMultiplier || 1.5}x bonus as platform credits.
                Min payout: {formatCents(d?.minPayoutCents || 5000)}.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bonus: Free Month Tracker */}
      <Card className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Gift className="w-10 h-10 text-amber-400 shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium">Bonus: Free Months</h3>
              <p className="text-sm text-muted-foreground">
                In addition to commissions, every 3 referrals earns you 1 free month of Titan Pro.
                You've earned <span className="text-amber-400 font-medium">{Math.floor((d?.totalReferrals || 0) / 3)}</span> free months so far!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useSubscription } from "@/hooks/useSubscription";
import { PRICING_TIERS, type PlanId } from "@shared/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Crown,
  CreditCard,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { TIER_LOGOS } from "@/lib/logos";

type BillingInterval = "month" | "year";

export default function SubscriptionPage() {
  const { user } = useAuth();
  const sub = useSubscription();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: stripeSub, isLoading: subLoading } = trpc.stripe.getSubscription.useQuery();

  const cancelMutation = trpc.stripe.cancelSubscription.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.stripe.getSubscription.invalidate();
      sub.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const resumeMutation = trpc.stripe.resumeSubscription.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.stripe.getSubscription.invalidate();
      sub.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const changePlanMutation = trpc.stripe.changePlan.useMutation({
    onSuccess: (data) => {
      toast.success(`Plan changed to ${data.newPlan}. Your billing has been updated.`);
      utils.stripe.getSubscription.invalidate();
      sub.refresh();
      setChangePlanOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const portalMutation = trpc.stripe.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [selectedNewPlan, setSelectedNewPlan] = useState<PlanId | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("month");

  const currentTier = PRICING_TIERS.find((t) => t.id === sub.planId);
  const isActive = stripeSub?.status === "active";
  const isCanceled = stripeSub?.status === "canceled";
  const isPastDue = stripeSub?.status === "past_due";
  const hasSubscription = stripeSub?.plan !== "free" && stripeSub?.stripeSubscriptionId;
  const periodEnd = stripeSub?.currentPeriodEnd ? new Date(stripeSub.currentPeriodEnd) : null;

  if (subLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl px-4 sm:px-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
        <p className="text-muted-foreground mt-1">Manage your plan, billing, and payment methods</p>
      </div>

      {/* Current Plan Card */}
      <Card className="overflow-hidden">
        <div className="relative">
          <div className={`absolute top-0 left-0 right-0 h-1 ${
            sub.isCyber ? "bg-gradient-to-r from-red-500 to-orange-500" :
            sub.isEnterprise ? "bg-gradient-to-r from-purple-500 to-blue-500" :
            sub.isPro ? "bg-gradient-to-r from-blue-500 to-cyan-500" :
            "bg-muted-foreground/20"
          }`} />
          <CardHeader className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  sub.isCyber ? "bg-red-500/10" :
                  sub.isEnterprise ? "bg-purple-500/10" :
                  sub.isPro ? "bg-blue-500/10" : "bg-muted/50"
                }`}>
                  {TIER_LOGOS[sub.planId] ? (
                    <img src={TIER_LOGOS[sub.planId]} alt={currentTier?.name} className="h-8 w-8 object-contain" />
                  ) : (
                    <Crown className={`h-5 w-5 ${
                      sub.isCyber ? "text-red-400" :
                      sub.isEnterprise ? "text-purple-400" :
                      sub.isPro ? "text-blue-400" : "text-muted-foreground"
                    }`} />
                  )}
                </div>
                <div>
                  <CardTitle className="text-xl">{currentTier?.name || "Free"} Plan</CardTitle>
                  <CardDescription className="mt-0.5">{currentTier?.tagline}</CardDescription>
                </div>
              </div>
              <StatusBadge status={stripeSub?.status || "active"} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">${currentTier?.monthlyPrice || 0}</span>
              <span className="text-muted-foreground">/month</span>
              {currentTier && currentTier.yearlyPrice > 0 && (
                <span className="text-sm text-muted-foreground ml-2">
                  or ${currentTier.yearlyPrice}/year (save {Math.round((1 - currentTier.yearlyPrice / (currentTier.monthlyPrice * 12)) * 100)}%)
                </span>
              )}
            </div>

            {hasSubscription && periodEnd && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InfoBlock icon={<Calendar className="h-4 w-4" />} label="Next billing date"
                  value={periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
                <InfoBlock icon={<CreditCard className="h-4 w-4" />} label="Billing cycle" value="Monthly auto-renewal" />
                <InfoBlock icon={<Sparkles className="h-4 w-4" />} label="Monthly credits"
                  value={currentTier?.credits.monthlyAllocation === -1 ? "Unlimited" : `${currentTier?.credits.monthlyAllocation || 50} credits`} />
              </div>
            )}

            {isPastDue && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-400">Payment failed</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your last payment failed. Please update your payment method to avoid service interruption.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                    {portalMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <CreditCard className="h-3.5 w-3.5 mr-2" />}
                    Update Payment Method
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              {sub.isFree ? (
                <Button onClick={() => setLocation("/pricing")} className="bg-blue-600 hover:bg-blue-500">
                  <Zap className="h-4 w-4 mr-2" />Upgrade Plan
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setChangePlanOpen(true)}>
                    <RefreshCw className="h-4 w-4 mr-2" />Change Plan
                  </Button>
                  {isActive && (
                    <Button variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setCancelDialogOpen(true)}>
                      <XCircle className="h-4 w-4 mr-2" />Cancel Subscription
                    </Button>
                  )}
                  {isCanceled && hasSubscription && (
                    <Button variant="outline" className="text-emerald-400 hover:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                      {resumeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Resume Subscription
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                    {portalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    Billing Portal
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Plan features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Plan Features</CardTitle>
          <CardDescription>What's included in your {currentTier?.name || "Free"} plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentTier?.features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Usage</CardTitle>
          <CardDescription>Your resource consumption this billing period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <UsageStat label="Fetches" used={sub.fetchesUsed} limit={sub.fetchesLimit} />
            <UsageStat label="Credentials Stored" used={sub.credentialsStored} limit={currentTier?.limits.credentialStorage ?? 25} />
            <UsageStat label="Proxy Slots" used={sub.proxySlotsUsed} limit={sub.proxySlotLimit} />
          </div>
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Are you sure you want to cancel your {currentTier?.name} subscription?</p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span>Your remaining credits will be preserved</span></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span>Access continues until {periodEnd?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span></div>
                <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-amber-400" /><span>No more monthly credit refills after cancellation</span></div>
                <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-amber-400" /><span>You'll revert to the Free plan when the period ends</span></div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction onClick={() => { cancelMutation.mutate(); setCancelDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>Select a new plan. Changes take effect immediately with prorated billing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-lg w-fit">
              <button onClick={() => setSelectedInterval("month")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedInterval === "month" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Monthly</button>
              <button onClick={() => setSelectedInterval("year")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedInterval === "year" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Yearly</button>
            </div>
            {PRICING_TIERS.filter((t) => t.id !== "free").map((tier) => {
              const isCurrentPlan = tier.id === sub.planId;
              const isUpgrade = getPlanRank(tier.id) > getPlanRank(sub.planId);
              const price = selectedInterval === "month" ? tier.monthlyPrice : tier.yearlyPrice;
              return (
                <button key={tier.id} onClick={() => setSelectedNewPlan(tier.id)} disabled={isCurrentPlan}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedNewPlan === tier.id ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30" :
                    isCurrentPlan ? "border-muted-foreground/10 bg-muted/30 opacity-50 cursor-not-allowed" :
                    "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/20"
                  }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {TIER_LOGOS[tier.id] && <img src={TIER_LOGOS[tier.id]} alt={tier.name} className="h-6 w-6 object-contain" />}
                        <span className="font-semibold">{tier.name}</span>
                        {isCurrentPlan && <Badge variant="secondary" className="text-xs">Current</Badge>}
                        {!isCurrentPlan && (
                          <Badge variant="outline" className={`text-xs ${isUpgrade ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}`}>
                            {isUpgrade ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                            {isUpgrade ? "Upgrade" : "Downgrade"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{tier.tagline}</p>
                      <p className="text-xs text-muted-foreground mt-1">{tier.credits.monthlyAllocation === -1 ? "Unlimited" : tier.credits.monthlyAllocation} credits/month</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold">${price}</span>
                      <span className="text-muted-foreground text-sm">/{selectedInterval === "month" ? "mo" : "yr"}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {selectedNewPlan && getPlanRank(selectedNewPlan) < getPlanRank(sub.planId) && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">Downgrading will charge you immediately for the prorated difference. Your credit allocation will adjust on the next billing cycle.</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setChangePlanOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (selectedNewPlan && selectedNewPlan !== "free") { changePlanMutation.mutate({ planId: selectedNewPlan as "pro" | "enterprise", interval: selectedInterval }); } }}
              disabled={!selectedNewPlan || selectedNewPlan === sub.planId || changePlanMutation.isPending} className="bg-blue-600 hover:bg-blue-500">
              {changePlanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Affiliate Recommendations — users here are already spending money */}
      <AffiliateRecommendations context="subscription" variant="card" limit={3} className="mt-2" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: any }> = {
    active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
    canceled: { label: "Canceled", className: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
    past_due: { label: "Past Due", className: "bg-red-500/10 text-red-400 border-red-500/20", icon: AlertTriangle },
    incomplete: { label: "Incomplete", className: "bg-muted text-muted-foreground border-muted-foreground/20", icon: Clock },
    trialing: { label: "Trial", className: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Sparkles },
  };
  const c = config[status] || config.active;
  const Icon = c.icon;
  return <Badge variant="outline" className={c.className}><Icon className="h-3 w-3 mr-1" />{c.label}</Badge>;
}

function InfoBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium mt-0.5">{value}</p></div>
    </div>
  );
}

function UsageStat({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isHigh = percentage > 80;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used} / {isUnlimited ? "∞" : limit}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isUnlimited ? "bg-blue-500/30 w-0" : isHigh ? "bg-amber-500" : "bg-blue-500"}`}
          style={{ width: isUnlimited ? "0%" : `${percentage}%` }} />
      </div>
    </div>
  );
}

function getPlanRank(planId: PlanId): number {
  const ranks: Record<PlanId, number> = { free: 0, pro: 1, enterprise: 2, cyber: 3, cyber_plus: 4, titan: 5 };
  return ranks[planId] ?? 0;
}

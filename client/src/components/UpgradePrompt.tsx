/**
 * UpgradePrompt — Reusable upgrade modal/banner for gated features.
 *
 * Shows when a user tries to access a feature not available on their plan.
 * Provides a clear message and CTA to upgrade.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Crown, Lock, Sparkles, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import type { PlanId } from "@shared/pricing";

// ─── Upgrade Dialog (Modal) ─────────────────────────────────────────

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  description?: string;
  requiredPlan?: "pro" | "enterprise" | "cyber";
}

export function UpgradeDialog({
  open,
  onOpenChange,
  feature,
  description,
  requiredPlan = "pro",
}: UpgradeDialogProps) {
  const [, setLocation] = useLocation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Crown className="h-5 w-5 text-amber-500" />
            </div>
            <DialogTitle className="text-lg">You discovered a premium feature!</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            <span className="font-semibold text-foreground">{feature}</span> is
            available on the{" "}
            <span className="font-semibold text-amber-500 capitalize">
              {requiredPlan}
            </span>{" "}
            plan and above.
            {description && (
              <span className="block mt-2 text-muted-foreground">
                {description}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {requiredPlan === "pro" ? "Pro plan includes:" : requiredPlan === "cyber" ? "Cyber plan unlocks:" : "Enterprise plan includes:"}
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-6">
            {requiredPlan === "cyber" ? (
              <>
                <li>75,000 AI credits/month</li>
                <li>Credential Leak Scanner</li>
                <li>TOTP Vault (2FA management)</li>
                <li>Credential Health Monitor</li>
                <li>Advanced threat modeling</li>
                <li>Red team automation</li>
                <li>Priority security support</li>
              </>
            ) : requiredPlan === "pro" ? (
              <>
                <li>5,000 AI credits/month</li>
                <li>Unlimited fetches & all 15+ providers</li>
                <li>CAPTCHA auto-solving</li>
                <li>5 proxy slots & kill switch</li>
                <li>JSON & .ENV export</li>
              </>
            ) : (
              <>
                <li>25,000 AI credits/month</li>
                <li>Team management (25 seats)</li>
                <li>Team Vault & shared credentials</li>
                <li>Developer API (10,000 req/day)</li>
                <li>Dedicated account manager</li>
              </>
            )}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          7-day free trial included. 30-day money-back guarantee.
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              setLocation("/pricing");
            }}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          >
            <Crown className="h-4 w-4 mr-2" />
            Upgrade to {requiredPlan === "pro" ? "Pro" : requiredPlan === "cyber" ? "Cyber" : "Enterprise"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline Upgrade Banner ──────────────────────────────────────────

interface UpgradeBannerProps {
  feature: string;
  requiredPlan?: "pro" | "enterprise" | "cyber";
  compact?: boolean;
}

export function UpgradeBanner({
  feature,
  requiredPlan = "pro",
  compact = false,
}: UpgradeBannerProps) {
  const [, setLocation] = useLocation();

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-xs text-amber-500/90">
          {feature} requires{" "}
          <button
            onClick={() => setLocation("/pricing")}
            className="font-semibold underline underline-offset-2 hover:text-amber-400 transition-colors"
          >
            {requiredPlan === "pro" ? "Pro" : requiredPlan === "cyber" ? "Cyber" : "Enterprise"}
          </button>
        </span>
      </div>
    );
  }

  const isCyber = requiredPlan === "cyber";
  const borderColor = isCyber ? "border-red-500/20" : "border-amber-500/20";
  const bgGradient = isCyber ? "from-red-500/5 to-orange-500/5" : "from-amber-500/5 to-orange-500/5";
  const iconBg = isCyber ? "bg-red-500/10" : "bg-amber-500/10";
  const iconColor = isCyber ? "text-red-500" : "text-amber-500";
  const accentColor = isCyber ? "text-red-500" : "text-amber-500";
  const btnGradient = isCyber
    ? "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white"
    : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white";

  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-br ${bgGradient} p-6 text-center space-y-4`}>
      <div className={`h-12 w-12 rounded-full ${iconBg} flex items-center justify-center mx-auto`}>
        <Lock className={`h-6 w-6 ${iconColor}`} />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{feature}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Unlock this feature with the{" "}
          <span className={`font-semibold ${accentColor} capitalize`}>
            {requiredPlan}
          </span>{" "}
          plan.
          {isCyber && (
            <span className="block mt-1 text-xs text-muted-foreground/70">
              Includes Leak Scanner, TOTP Vault, Health Monitor, and 75K credits/mo.
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2">
          7-day free trial. 30-day money-back guarantee.
        </p>
      </div>
      <Button
        onClick={() => setLocation("/pricing")}
        className={btnGradient}
      >
        <Crown className="h-4 w-4 mr-2" />
        Upgrade to {requiredPlan === "pro" ? "Pro" : requiredPlan === "cyber" ? "Cyber" : "Enterprise"}
      </Button>
    </div>
  );
}

// ─── Plan Badge ─────────────────────────────────────────────────────

interface PlanBadgeProps {
  planId: PlanId;
  className?: string;
}

export function PlanBadge({ planId, className = "" }: PlanBadgeProps) {
  const colors: Record<PlanId, string> = {
    free: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    pro: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    enterprise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    cyber: "bg-red-500/10 text-red-400 border-red-500/20",
    cyber_plus: "bg-red-500/10 text-red-400 border-red-500/20",
    titan: "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-400 border-amber-500/30",
  };

  const labels: Record<PlanId, string> = {
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
    cyber: "Cyber",
    cyber_plus: "Cyber+",
    titan: "Admin",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[planId] || colors.free} ${className}`}
    >
      {planId !== "free" && <Crown className="h-3 w-3" />}
      {labels[planId] || planId}
    </span>
  );
}

// ─── Usage Bar ──────────────────────────────────────────────────────

interface UsageBarProps {
  label: string;
  used: number;
  limit: number; // -1 = unlimited
  className?: string;
}

export function UsageBar({ label, used, limit, className = "" }: UsageBarProps) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min(100, (used / limit) * 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && used >= limit;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={`font-medium ${
            isAtLimit
              ? "text-destructive"
              : isNearLimit
              ? "text-amber-500"
              : "text-foreground"
          }`}
        >
          {used}
          {isUnlimited ? " / ∞" : ` / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isAtLimit
                ? "bg-destructive"
                : isNearLimit
                ? "bg-amber-500"
                : "bg-primary"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="h-1.5 rounded-full bg-primary/20 overflow-hidden">
          <div className="h-full rounded-full bg-primary w-full opacity-30" />
        </div>
      )}
    </div>
  );
}

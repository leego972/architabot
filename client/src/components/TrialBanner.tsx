import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Clock, Zap, AlertTriangle, CreditCard, X, ArrowRight, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * TrialBanner — shows contextual trial status banners.
 * Uses retry:false and ignores errors so it NEVER triggers the global
 * redirectToLoginIfUnauthorized handler (which would cause a login loop).
 */
export default function TrialBanner() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const { user } = useAuth();

  // Admins never see trial banners — they have full access
  if (user?.role === "admin") return null;

  // CRITICAL: retry:false prevents repeated failed queries from triggering
  // the global error handler that redirects to /login
  const { data: trialStatus, isError: trialError } = trpc.stripe.getTrialStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 120_000,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // @ts-ignore — suppress any missing-endpoint errors during deploy
    onError: () => {},
  });

  const { data: subscription, isError: subError } = trpc.stripe.getSubscription.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // @ts-ignore
    onError: () => {},
  });

  // If any query errored or is still loading, silently return nothing — NEVER break the app
  if (dismissed || trialError || subError || !trialStatus) return null;

  // Don't show if user has an active paid subscription (not in trial)
  if (subscription && subscription.plan !== "free" && subscription.status === "active" && !trialStatus.inTrial) return null;

  const { inTrial, hasPaymentMethod, daysRemaining, trialExpired } = trialStatus;

  // ── No payment method, no trial started ──
  if (!hasPaymentMethod && !inTrial && !trialExpired) {
    return (
      <div className="relative bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white px-4 py-2.5 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            <strong>Unlock your 7-day free trial</strong> — Try all features including Leak Scanner, TOTP Vault, and AI tools. No charge until trial ends.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => navigate("/payment-setup")}
          >
            <CreditCard className="w-3 h-3 mr-1" />
            Start Trial
          </Button>
          <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Active trial: 4-7 days remaining (green, relaxed) ──
  if (inTrial && daysRemaining >= 4) {
    return (
      <div className="relative bg-gradient-to-r from-emerald-600/80 to-green-600/80 text-white px-4 py-2 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            <strong>Pro Trial</strong> — {daysRemaining} days remaining. Enjoy full access to all features.
          </span>
        </div>
        <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Active trial: 3 days remaining (day 3 reminder - amber) ──
  if (inTrial && daysRemaining === 3) {
    return (
      <div className="relative bg-gradient-to-r from-amber-600/80 to-yellow-600/80 text-white px-4 py-2.5 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Zap className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            <strong>3 days left</strong> in your Pro trial. Your plan will automatically continue at $29/month — no action needed.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => navigate("/pricing")}
          >
            View Plans
          </Button>
          <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Active trial: 1-2 days remaining (urgent - red/orange) ──
  if (inTrial && daysRemaining <= 2) {
    return (
      <div className="relative bg-gradient-to-r from-red-600/90 to-orange-600/90 text-white px-4 py-2.5 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse" />
          <span className="truncate">
            <strong>{daysRemaining === 0 ? "Last day" : `${daysRemaining} day${daysRemaining > 1 ? "s" : ""} left`}</strong> — Your trial ends soon. Continue with Pro at $29/mo, or go <strong>Cyber</strong> for the full security suite.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => navigate("/pricing")}
          >
            Upgrade Now
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
          <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Trial expired, no active subscription ──
  if (trialExpired) {
    return (
      <div className="relative bg-gradient-to-r from-red-700/90 to-red-600/90 text-white px-4 py-3 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            <strong>Your trial has ended.</strong> Subscribe to keep building. Go <strong>Cyber</strong> for the full security suite — Leak Scanner, TOTP Vault, and more.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs bg-white/20 hover:bg-white/30 text-white border-0 font-semibold"
            onClick={() => navigate("/pricing")}
          >
            View Plans
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-white text-red-700 hover:bg-white/90 font-semibold"
            onClick={() => navigate("/pricing")}
          >
            Go Cyber
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

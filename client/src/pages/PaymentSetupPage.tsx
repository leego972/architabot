import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  CreditCard, Shield, Zap, Lock, ArrowRight, Loader2,
  CheckCircle2, Clock, Star, Sparkles, ChevronRight
} from "lucide-react";
import { FULL_LOGO_DARK_512 } from "@/lib/logos";
import { TitanLogo } from "@/components/TitanLogo";
import { trpc } from "@/lib/trpc";

export default function PaymentSetupPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const skipped = new URLSearchParams(searchString).get("skipped") === "true";
  const [loading, setLoading] = useState(false);

  const createTrialSetup = trpc.stripe.createTrialSetup.useMutation();

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const result = await createTrialSetup.mutateAsync();
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start trial setup");
      setLoading(false);
    }
  };

  const handleSkip = () => {
    toast.info("You can start your free trial anytime from Settings.", { duration: 5000 });
    navigate("/dashboard");
  };

  const trialFeatures = [
    { icon: ({ className }: { className?: string }) => <TitanLogo size="sm" className={`!h-5 !w-5 ${className || ''}`} />, label: "Unlimited AI Chat", desc: "Full access to Archibald Titan AI assistant" },
    { icon: Zap, label: "5,000 Monthly Credits", desc: "Build, create, and automate without limits" },
    { icon: Shield, label: "Credential Vault", desc: "Secure encrypted storage for all your credentials" },
    { icon: Star, label: "Bazaar Marketplace", desc: "Browse and purchase specialized modules" },
    { icon: Sparkles, label: "Builder Mode", desc: "AI-powered code generation and project building" },
    { icon: Lock, label: "Leak Scanner", desc: "Monitor the dark web for your exposed data" },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/40 via-background to-indigo-950/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center gap-3 mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
            <img loading="eager" src={FULL_LOGO_DARK_512} alt="Archibald Titan" className="relative h-20 w-auto object-contain drop-shadow-2xl" />
          </div>
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center space-y-2 pb-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-2">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {skipped ? "Unlock Your Full Trial" : "Start Your 7-Day Pro Trial"}
            </CardTitle>
            <CardDescription className="text-base">
              Add a payment method to unlock <strong>full Pro access</strong> for 7 days — completely free.
              {" "}You won't be charged until your trial ends.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* What you get */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Everything included in your trial
              </p>
              <div className="grid gap-2.5">
                {trialFeatures.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <f.icon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Trial timeline */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold">How it works</span>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">1.</span>
                  <span><strong className="text-foreground">Today</strong> — Add your payment method. No charge.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">2.</span>
                  <span><strong className="text-foreground">7 days</strong> — Enjoy full Pro access with all features unlocked.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">3.</span>
                  <span><strong className="text-foreground">Day 8</strong> — Pro plan starts at $29/month. Cancel anytime before.</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Button
              onClick={handleStartTrial}
              disabled={loading}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5 mr-2" />
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            {/* Trust signals */}
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>256-bit SSL</span>
              </div>
              <span>•</span>
              <span>Cancel anytime</span>
              <span>•</span>
              <span>No charge today</span>
            </div>

            {/* Skip option */}
            <div className="text-center pt-2 border-t border-border/50">
              <button
                onClick={handleSkip}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Skip for now — continue with limited free access
              </button>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Free tier: 5 messages/day, no downloads, no marketplace selling
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

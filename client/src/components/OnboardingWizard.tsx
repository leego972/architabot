/**
 * OnboardingWizard — Multi-step wizard shown to new users.
 *
 * Auto-shows when onboardingCompleted is false. Dismissible.
 * Renders as a full-screen overlay with step-by-step guidance.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  KeyRound,
  Zap,
  Settings,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Rocket,
} from "lucide-react";
import { TitanLogo } from "@/components/TitanLogo";
import { toast } from "sonner";

const STEP_ICONS = [Shield, KeyRound, Zap, Settings, Sparkles] as const;

const STEP_ACTIONS: Record<string, { label: string; path: string }> = {
  add_credential: { label: "Go to Credentials", path: "/fetcher/credentials" },
  run_fetch: { label: "Start a Fetch", path: "/fetcher/new" },
  configure_settings: { label: "Open Settings", path: "/fetcher/settings" },
  explore_features: { label: "Try Titan Assistant", path: "/fetcher/chat" },
};

export default function OnboardingWizard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: status, isLoading } = trpc.onboardingWizard.getStatus.useQuery();
  const completeMutation = trpc.onboardingWizard.complete.useMutation({
    onSuccess: () => {
      utils.onboardingWizard.getStatus.invalidate();
      utils.auth.me.invalidate();
    },
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Don't show if loading, completed, or dismissed
  if (isLoading || !status || status.completed || dismissed) {
    return null;
  }

  const steps = status.steps;
  if (!steps || steps.length === 0) return null;

  const currentStep = steps[currentIndex];
  const Icon = STEP_ICONS[currentIndex] || Sparkles;
  const progressPercent = ((status.progress || 0) / (status.total || 1)) * 100;
  const isLastStep = currentIndex === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleFinish();
    } else {
      setCurrentIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  const handleSkip = () => {
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        setDismissed(true);
        toast.info("Onboarding skipped. You can always explore features from the sidebar.");
      },
    });
  };

  const handleFinish = () => {
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        setDismissed(true);
        toast.success("Welcome aboard! You're all set to use Titan.", {
          icon: <Rocket className="w-4 h-4" />,
        });
      },
    });
  };

  const handleAction = (stepId: string) => {
    const action = STEP_ACTIONS[stepId];
    if (action) {
      setDismissed(true);
      navigate(action.path);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 pb-[env(safe-area-inset-bottom,16px)]" style={{ height: '100dvh' }}>
      <div className="w-full max-w-xl max-h-[85dvh] max-h-[85vh] flex flex-col">
        {/* Close button */}
        <div className="flex justify-end mb-2 shrink-0">
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Skip onboarding"
          >
                  <span className="sr-only">Close</span>
                  <X className="w-5 h-5" />
          </button>
        </div>

        <Card className="border-border/50 bg-card/95 backdrop-blur shadow-2xl overflow-hidden flex flex-col min-h-0">
          {/* Progress bar — fixed at top */}
          <div className="px-6 pt-5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                Step {currentIndex + 1} of {steps.length}
              </span>
              <span className="text-xs text-muted-foreground">
                {status.progress}/{status.total} completed
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>

          {/* Scrollable content area */}
          <CardContent className="pt-6 pb-4 px-6 overflow-y-auto min-h-0 flex-1">
            <div className="text-center space-y-3">
              {currentStep.id === "welcome" ? (
                <div className="mx-auto"><TitanLogo size="md" /></div>
              ) : (
                <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                  <Icon className="w-7 h-7 text-blue-400" />
                </div>
              )}

              <div>
                <h2 className="text-lg font-bold">{currentStep.title}</h2>
                <p className="text-muted-foreground mt-1.5 text-sm max-w-md mx-auto">
                  {currentStep.description}
                </p>
              </div>

              {/* Step-specific content */}
              {currentStep.id === "welcome" && (
                <div className="bg-muted/30 rounded-xl p-3 text-left space-y-2.5 text-sm">
                  <div className="flex items-start gap-3">
                    <TitanLogo size="sm" />
                    <div>
                      <p className="font-medium text-sm">AI-Powered Credential Fetching</p>
                      <p className="text-muted-foreground text-xs">Automated retrieval from 15+ providers using stealth browser technology.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Military-Grade Encryption</p>
                      <p className="text-muted-foreground text-xs">AES-256-GCM encryption for all stored credentials.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Titan Assistant</p>
                      <p className="text-muted-foreground text-xs">AI assistant that executes real actions — manage credentials, scan for leaks, and more.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Completion status */}
              {currentStep.completed && currentStep.id !== "welcome" && (
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  <span>Already completed!</span>
                </div>
              )}

              {/* Action button for incomplete steps */}
              {!currentStep.completed && STEP_ACTIONS[currentStep.id] && (
                <Button
                  onClick={() => handleAction(currentStep.id)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  size="sm"
                >
                  {STEP_ACTIONS[currentStep.id].label}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>

            {/* Step indicators */}
            <div className="flex justify-center gap-2 mt-5">
              {steps.map((step, i) => (
                <button
                  key={step.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === currentIndex
                      ? "bg-blue-500 scale-110"
                      : step.completed
                        ? "bg-green-500/50"
                        : "bg-muted-foreground/20"
                  }`}
                  title={step.title}
                />
              ))}
            </div>
          </CardContent>

          {/* Navigation — fixed at bottom */}
          <div className="flex items-center justify-between px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border/30 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>

            <Button
              size="sm"
              onClick={handleNext}
              className={isLastStep ? "bg-gradient-to-r from-green-600 to-emerald-600" : ""}
            >
              {isLastStep ? (
                <>
                  <Rocket className="w-4 h-4 mr-1" />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, KeyRound, RotateCcw } from "lucide-react";
import { TitanLogo } from "@/components/TitanLogo";
import { AT_ICON_256, FULL_LOGO_DARK_512 } from "@/lib/logos";
import { trpc } from "@/lib/trpc";
import SocialLoginButtons from "@/components/SocialLoginButtons";

type LoginStep = "credentials" | "two_factor";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const utils = trpc.useUtils();

  // Parse returnTo from query string for post-login redirect
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const path = params.get("returnTo");
    // Only allow internal paths (starts with /), prevent open redirect
    if (path && path.startsWith("/") && !path.startsWith("//")) return path;
    return "/dashboard";
  }, [searchString]);

  // Step state
  const [step, setStep] = useState<LoginStep>("credentials");

  // Credentials step
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // 2FA step
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first OTP input when entering 2FA step
  useEffect(() => {
    if (step === "two_factor" && !useBackupCode) {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [step, useBackupCode]);

  // ─── Step 1: Credentials Login ─────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(data.error || "Too many login attempts. Please try again later.", {
            duration: 8000,
          });
        } else {
          toast.error(data.error || "Invalid email or password");
        }
        return;
      }

      // Check if 2FA is required
      if (data.requiresTwoFactor && data.twoFactorToken) {
        setTwoFactorToken(data.twoFactorToken);
        setStep("two_factor");
        toast.info("Two-factor authentication required", {
          description: "Enter the 6-digit code from your authenticator app.",
        });
        return;
      }

      // Normal login success
      await utils.auth.me.invalidate();
      toast.success(`Welcome back, ${data.user?.name || data.user?.email}!`);
      navigate(returnTo);
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: 2FA Verification ──────────────────────────────────────

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5) {
      const fullCode = newDigits.join("");
      if (fullCode.length === 6) {
        verify2FA(fullCode);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    // Focus the next empty or last input
    const nextEmpty = newDigits.findIndex((d) => !d);
    const focusIdx = nextEmpty === -1 ? 5 : nextEmpty;
    otpRefs.current[focusIdx]?.focus();

    // Auto-submit if all 6 digits
    if (pasted.length === 6) {
      verify2FA(pasted);
    }
  };

  const verify2FA = async (code: string) => {
    setVerifying2FA(true);
    try {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ twoFactorToken, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Invalid verification code");
        // Clear OTP inputs on failure
        setOtpDigits(["", "", "", "", "", ""]);
        setBackupCode("");
        setTimeout(() => {
          if (useBackupCode) return;
          otpRefs.current[0]?.focus();
        }, 100);
        return;
      }

      // 2FA verified — login complete
      await utils.auth.me.invalidate();
      toast.success(`Welcome back, ${data.user?.name || data.user?.email}!`);

      if (data.backupCodeUsed) {
        toast.warning("You used a backup code. Consider regenerating your backup codes in Account Settings.", {
          duration: 10000,
        });
      }

      navigate(returnTo);
    } catch (err) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setVerifying2FA(false);
    }
  };

  const handleBackupCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCode.trim()) return;
    verify2FA(backupCode.trim());
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setTwoFactorToken("");
    setOtpDigits(["", "", "", "", "", ""]);
    setBackupCode("");
    setUseBackupCode(false);
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/40 via-background to-indigo-950/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
            <img loading="eager" src={FULL_LOGO_DARK_512} alt="Archibald Titan" className="relative h-64 w-auto object-contain drop-shadow-2xl" />
          </div>
        </div>

        {step === "credentials" ? (
          /* ─── Credentials Card ────────────────────────────────── */
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
            <CardHeader className="text-center space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      autoComplete="current-password"
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-xs text-blue-400 hover:text-blue-300 underline-offset-4 hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or continue with</span>
                </div>
              </div>

              {/* Social Login Options */}
              <SocialLoginButtons mode="login" />

              {/* Register link */}
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button
                  onClick={() => navigate("/register")}
                  className="text-blue-400 hover:text-blue-300 font-medium underline-offset-4 hover:underline transition-colors"
                >
                  Create one
                </button>
              </p>
            </CardContent>
          </Card>
        ) : (
          /* ─── 2FA Challenge Card ─────────────────────────────── */
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
            <CardHeader className="text-center space-y-1 pb-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                <KeyRound className="w-6 h-6 text-blue-400" />
              </div>
              <CardTitle className="text-2xl font-bold">Two-Factor Authentication</CardTitle>
              <CardDescription>
                {useBackupCode
                  ? "Enter one of your backup codes"
                  : "Enter the 6-digit code from your authenticator app"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!useBackupCode ? (
                /* OTP Input */
                <div className="space-y-4">
                  <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        disabled={verifying2FA}
                        className="w-12 h-14 text-center text-xl font-mono font-bold rounded-lg border border-border/50 bg-background/50 text-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:opacity-50"
                        aria-label={`Digit ${i + 1}`}
                      />
                    ))}
                  </div>

                  {verifying2FA && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setUseBackupCode(true)}
                    className="w-full text-center text-xs text-muted-foreground hover:text-blue-400 transition-colors"
                  >
                    Use a backup code instead
                  </button>
                </div>
              ) : (
                /* Backup Code Input */
                <form onSubmit={handleBackupCodeSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="backup-code" className="text-sm font-medium">Backup Code</Label>
                    <Input
                      id="backup-code"
                      type="text"
                      placeholder="Enter your backup code"
                      value={backupCode}
                      onChange={(e) => setBackupCode(e.target.value)}
                      disabled={verifying2FA}
                      autoFocus
                      className="font-mono text-center tracking-wider"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium"
                    disabled={verifying2FA || !backupCode.trim()}
                  >
                    {verifying2FA ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <KeyRound className="w-4 h-4 mr-2" />
                    )}
                    {verifying2FA ? "Verifying..." : "Verify Backup Code"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(false);
                      setBackupCode("");
                    }}
                    className="w-full text-center text-xs text-muted-foreground hover:text-blue-400 transition-colors"
                  >
                    Use authenticator app instead
                  </button>
                </form>
              )}

              {/* Back button */}
              <button
                type="button"
                onClick={handleBackToCredentials}
                className="flex items-center justify-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          By signing in, you agree to our{" "}
          <a href="/terms" className="underline hover:text-foreground">Terms</a>{" "}
          and{" "}
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

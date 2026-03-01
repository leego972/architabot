import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, ArrowRight, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { FULL_LOGO_DARK_512 } from "@/lib/logos";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [success, setSuccess] = useState(false);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenError("No reset token provided. Please request a new password reset link.");
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch("/api/auth/verify-reset-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.valid) {
          setTokenError(data.error || "Invalid or expired reset link.");
          setTokenValid(false);
        } else {
          setTokenValid(true);
          setUserEmail(data.email || "");
        }
      } catch {
        setTokenError("Failed to verify reset link. Please try again.");
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to reset password");
        return;
      }

      setSuccess(true);
      toast.success("Password reset successfully!");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/40 via-background to-indigo-950/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
            <img loading="eager" src={FULL_LOGO_DARK_512} alt="Archibald Titan" className="relative h-32 w-auto object-contain drop-shadow-2xl" />
          </div>
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
          {verifying ? (
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-muted-foreground">Verifying reset link...</p>
              </div>
            </CardContent>
          ) : !tokenValid && !success ? (
            <>
              <CardHeader className="text-center space-y-1 pb-4">
                <CardTitle className="text-2xl font-bold">Invalid link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-destructive" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {tokenError}
                  </p>
                </div>
                <div className="space-y-3">
                  <Button
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    onClick={() => navigate("/forgot-password")}
                  >
                    Request a new reset link
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-border/50"
                    onClick={() => navigate("/login")}
                  >
                    Back to sign in
                  </Button>
                </div>
              </CardContent>
            </>
          ) : success ? (
            <>
              <CardHeader className="text-center space-y-1 pb-4">
                <CardTitle className="text-2xl font-bold">Password reset!</CardTitle>
                <CardDescription>Your password has been changed successfully.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    You can now sign in with your new password.
                  </p>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                  onClick={() => navigate("/login")}
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Sign in
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center space-y-1 pb-4">
                <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
                <CardDescription>
                  {userEmail
                    ? `Enter a new password for ${userEmail}`
                    : "Enter your new password below"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">New password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                        autoComplete="new-password"
                        minLength={8}
                        autoFocus
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

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-destructive">Passwords do not match</p>
                    )}
                  </div>

                  {/* Password strength indicator */}
                  {password && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              password.length >= level * 4
                                ? password.length >= 16
                                  ? "bg-emerald-500"
                                  : password.length >= 12
                                  ? "bg-blue-500"
                                  : password.length >= 8
                                  ? "bg-yellow-500"
                                  : "bg-destructive"
                                : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {password.length < 8
                          ? "Too short"
                          : password.length < 12
                          ? "Fair"
                          : password.length < 16
                          ? "Good"
                          : "Strong"}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium"
                    disabled={loading || !password || !confirmPassword || password !== confirmPassword}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Reset password
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

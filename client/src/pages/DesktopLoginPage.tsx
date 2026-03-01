import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, Monitor, Globe } from "lucide-react";
import { FULL_LOGO_DARK_512 } from "@/lib/logos";
import { isDesktop, getDesktopVersion } from "@/lib/desktop";

/**
 * Desktop Login Page — shown in the Electron app when no license is saved.
 * 
 * This page calls the local desktop server's /api/desktop/login endpoint,
 * which in turn calls the remote desktopLicense.activate tRPC endpoint.
 * 
 * On success, the license is saved locally and the user is redirected to /dashboard.
 */
export default function DesktopLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/desktop/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || "Login failed. Please check your credentials.";
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success(`Welcome, ${data.user?.name || data.user?.email || "User"}!`);

      // Navigate to dashboard — use IPC if available (Electron), otherwise window.location
      if (window.titanDesktop?.navigateTo) {
        window.titanDesktop.navigateTo("/dashboard");
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      const msg = "Could not connect to the server. Please check your internet connection.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const openWebVersion = () => {
    const url = "https://archibaldtitan.com";
    if (window.titanDesktop?.navigateTo) {
      // Use shell.openExternal via the main process
      window.open(url, "_blank");
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/60 via-[#0a0e1a] to-indigo-950/40 pointer-events-none" />

      {/* Subtle grid pattern */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo & Desktop Badge */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
            <img loading="eager" src={FULL_LOGO_DARK_512} alt="Archibald Titan" className="relative h-64 w-auto object-contain drop-shadow-2xl" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Desktop App</span>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-xl font-bold text-white">Sign in to continue</CardTitle>
            <CardDescription className="text-gray-400">
              Use your Archibald Titan account credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="desktop-email" className="text-sm font-medium text-gray-300">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="desktop-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-blue-500/20"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desktop-password" className="text-sm font-medium text-gray-300">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="desktop-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-blue-500/20"
                    required
                    autoComplete="current-password"
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium h-11 mt-2"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                {loading ? "Signing in..." : "Sign In & Activate"}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#0f1320] px-2 text-gray-500">or</span>
              </div>
            </div>

            {/* Web Version Link */}
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/10 text-gray-300 hover:bg-white/5 hover:text-white"
              onClick={openWebVersion}
            >
              <Globe className="w-4 h-4 mr-2" />
              Open Web Version
            </Button>

            {/* Info */}
            <div className="text-center space-y-2 pt-2">
              <p className="text-xs text-gray-500">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={openWebVersion}
                  className="text-blue-400 hover:text-blue-300 underline-offset-4 hover:underline transition-colors"
                >
                  Sign up on the web
                </button>
              </p>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                Your desktop license is tied to this device. Credits are consumed from your account balance.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Version info */}
        <p className="text-center text-[10px] text-gray-600 mt-4">
          Archibald Titan Desktop {getDesktopVersion() ? `v${getDesktopVersion()}` : "v7.0.0"}
        </p>
      </div>
    </div>
  );
}

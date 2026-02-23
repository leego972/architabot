import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  User,
  Mail,
  Lock,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
  Plus,
  Github,
  Key,
  Trash2,
  Zap,
} from "lucide-react";

const providerConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  email: {
    label: "Email",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: <Mail className="w-4 h-4" />,
  },
  google: {
    label: "Google",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    color: "bg-gray-500/20 text-gray-300 border-gray-500/30",
    icon: <Github className="w-4 h-4" />,
  },
};

// ─── OpenAI API Key Management Component ───────────────────────────────
function OpenAIKeySection() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const utils = trpc.useUtils();
  const { data: keyData, isLoading } = trpc.userSecrets.getOpenAIKey.useQuery();

  const saveMutation = trpc.userSecrets.saveOpenAIKey.useMutation({
    onSuccess: (data) => {
      toast.success(`API key saved successfully (${data.maskedKey})`);
      setApiKey("");
      setShowKey(false);
      utils.userSecrets.getOpenAIKey.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save API key");
    },
    onSettled: () => setSaving(false),
  });

  const deleteMutation = trpc.userSecrets.deleteOpenAIKey.useMutation({
    onSuccess: () => {
      toast.success("API key removed");
      utils.userSecrets.getOpenAIKey.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to remove API key");
    },
    onSettled: () => setDeleting(false),
  });

  const testMutation = trpc.userSecrets.testOpenAIKey.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        toast.success("API key is valid and working!");
      } else {
        toast.error(data.error || "API key test failed");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to test API key");
    },
    onSettled: () => setTesting(false),
  });

  const handleSave = () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    saveMutation.mutate({ apiKey: apiKey.trim() });
  };

  const handleDelete = () => {
    setDeleting(true);
    deleteMutation.mutate();
  };

  const handleTest = () => {
    setTesting(true);
    testMutation.mutate();
  };

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Key className="w-5 h-5 text-amber-400" />
          OpenAI API Key
        </CardTitle>
        <CardDescription>
          Add your own OpenAI API key for faster, dedicated AI responses. Your key is encrypted at rest and never shared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : keyData?.hasKey ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm font-mono">{keyData.maskedKey}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="text-xs"
                >
                  {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                  {testing ? "Testing..." : "Test"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                  Remove
                </Button>
              </div>
            </div>
            {keyData.lastUsedAt && (
              <p className="text-xs text-muted-foreground">
                Last used: {new Date(keyData.lastUsedAt).toLocaleString()}
              </p>
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              To update your key, enter a new one below:
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-300">No API key set</p>
                <p className="text-muted-foreground mt-1">
                  Without your own key, your chat uses shared system keys which may be slower during peak usage.
                  Get a key from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    platform.openai.com/api-keys
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="sk-proj-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Key"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Your key is encrypted with AES-256-GCM and stored securely. It will be validated against OpenAI before saving.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AccountSettingsPage() {
  const { user, loading: authLoading, refresh } = useAuth();
  const utils = trpc.useUtils();
  const { theme, toggleTheme } = useTheme();

  // Profile state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Identity providers
  const { data: linkedProviders, isLoading: providersLoading } = trpc.identityProviders.list.useQuery();
  const { data: providerSummary } = trpc.identityProviders.summary.useQuery();
  const unlinkMutation = trpc.identityProviders.unlink.useMutation({
    onSuccess: () => {
      toast.success("Provider unlinked successfully");
      utils.identityProviders.list.invalidate();
      utils.identityProviders.summary.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to unlink provider");
    },
  });

  // Is this an OAuth-only user (no password set)?
  const isOAuthUser = !user?.passwordHash;

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setProfileDirty(name !== (user.name || "") || email !== (user.email || ""));
    }
  }, [name, email, user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileDirty) return;

    setProfileLoading(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to update profile");
        return;
      }

      toast.success("Profile updated successfully");
      await utils.auth.me.invalidate();
      setProfileDirty(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to change password");
        return;
      }

      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUnlinkProvider = (providerId: number, providerName: string) => {
    if (!confirm(`Are you sure you want to unlink your ${providerName} account? You won't be able to sign in with it anymore.`)) {
      return;
    }
    unlinkMutation.mutate({ providerId });
  };

  const handleLinkProvider = (provider: string) => {
    window.location.href = `/api/auth/${provider}?returnPath=${encodeURIComponent("/fetcher/settings")}&mode=login`;
  };

  // Password strength indicator
  const getPasswordStrength = (pw: string) => {
    if (!pw) return { label: "", color: "", width: "0%" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "20%" };
    if (score === 2) return { label: "Fair", color: "bg-orange-500", width: "40%" };
    if (score === 3) return { label: "Good", color: "bg-yellow-500", width: "60%" };
    if (score === 4) return { label: "Strong", color: "bg-green-500", width: "80%" };
    return { label: "Very Strong", color: "bg-emerald-500", width: "100%" };
  };

  const pwStrength = getPasswordStrength(newPassword);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine which providers can still be linked
  const availableProviders = ["google", "github"].filter(
    (p) => !providerSummary?.providers.includes(p)
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 px-1 sm:px-0">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-400" />
          Account Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your profile, security, and linked sign-in methods.
        </p>
      </div>

      {/* Theme Toggle */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="w-5 h-5 text-blue-400">🌓</span>
            Theme
          </CardTitle>
          <CardDescription>
            Toggle between light and dark mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm">Dark Mode</span>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
              className="ml-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Profile Section */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Update your display name and email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">Display Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-email" className="text-sm font-medium">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="settings-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!profileDirty || profileLoading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                {profileLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {profileLoading ? "Saving..." : "Save Changes"}
              </Button>
              {profileDirty && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Unsaved changes
                </span>
              )}
              {!profileDirty && name && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Up to date
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      {/* Two-Factor Authentication */}
      <TwoFactorSetup />

      {/* Linked Identity Providers */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-400" />
            Linked Sign-In Methods
          </CardTitle>
          <CardDescription>
            Manage the accounts you use to sign in. Link multiple providers so you always have a way to access your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Currently linked providers */}
          {providersLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : linkedProviders && linkedProviders.length > 0 ? (
            <div className="space-y-3">
              {linkedProviders.map((provider) => {
                const config = providerConfig[provider.provider] || {
                  label: provider.provider,
                  color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
                  icon: <Link2 className="w-4 h-4" />,
                };

                return (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-background/50 hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${config.color}`}>
                        {config.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{config.label}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400">
                            Connected
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {provider.email || provider.displayName || provider.providerAccountId}
                          {provider.lastUsedAt && (
                            <> &middot; Last used {new Date(provider.lastUsedAt).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => handleUnlinkProvider(provider.id, config.label)}
                      disabled={unlinkMutation.isPending}
                    >
                      <Unlink className="w-4 h-4 mr-1" />
                      Unlink
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No linked providers yet.</p>
              <p className="text-xs mt-1">Link a provider below to enable additional sign-in methods.</p>
            </div>
          )}

          {/* Available providers to link */}
          {availableProviders.length > 0 && (
            <>
              <Separator className="bg-border/30" />
              <div>
                <p className="text-sm font-medium mb-3 text-muted-foreground">
                  <Plus className="w-4 h-4 inline mr-1" />
                  Link another sign-in method
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {availableProviders.map((provider) => {
                    const config = providerConfig[provider];
                    if (!config) return null;

                    return (
                      <Button
                        key={provider}
                        variant="outline"
                        className="border-border/50 hover:bg-accent/50 h-10 text-sm"
                        onClick={() => handleLinkProvider(provider)}
                      >
                        <span className="mr-2">{config.icon}</span>
                        Link {config.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Security tip */}
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300">
            <p className="flex items-start gap-2">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                We recommend linking at least two sign-in methods. If you lose access to one, you can still sign in with the other.
                {providerSummary && providerSummary.total >= 2 && (
                  <span className="text-emerald-400 ml-1 font-medium">You're all set with {providerSummary.total} linked methods.</span>
                )}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-400" />
            Change Password
          </CardTitle>
          <CardDescription>
            {isOAuthUser
              ? "You signed in with OAuth. Set a password to enable email/password login as a backup."
              : "Update your password to keep your account secure."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOAuthUser ? (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (newPassword.length < 8) {
                toast.error("Password must be at least 8 characters");
                return;
              }
              if (newPassword !== confirmPassword) {
                toast.error("Passwords do not match");
                return;
              }
              setPasswordLoading(true);
              try {
                const res = await fetch("/api/auth/set-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ newPassword }),
                });
                const data = await res.json();
                if (!res.ok) {
                  toast.error(data.error || "Failed to set password");
                  return;
                }
                toast.success("Password set! You can now log in to the desktop app.");
                setNewPassword("");
                setConfirmPassword("");
                // Refresh user data so the form switches to change-password mode
                refresh();
              } catch {
                toast.error("Something went wrong. Please try again.");
              } finally {
                setPasswordLoading(false);
              }
            }} className="space-y-4">
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 text-sm text-blue-300 mb-4">
                <p className="flex items-center gap-2">
                  <Shield className="w-4 h-4 shrink-0" />
                  Set a password to enable desktop app login and email/password sign-in as a backup.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setNewPassword" className="text-sm font-medium">New Password</Label>
                <Input
                  id="setNewPassword"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setConfirmPassword" className="text-sm font-medium">Confirm Password</Label>
                <Input
                  id="setConfirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" disabled={passwordLoading} className="w-full">
                {passwordLoading ? "Setting password..." : "Set Password"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-sm font-medium">Current Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Separator className="bg-border/30" />

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                        style={{ width: pwStrength.width }}
                      />
                    </div>
                    <p className={`text-xs ${pwStrength.color.replace("bg-", "text-")}`}>
                      {pwStrength.label}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmNewPassword" className="text-sm font-medium">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmNewPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && newPassword === confirmPassword && newPassword.length >= 8 && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Passwords match
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={passwordLoading || !currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                {passwordLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                {passwordLoading ? "Changing..." : "Change Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* OpenAI API Key Section */}
      <OpenAIKeySection />

      {/* Account Info */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Account ID</p>
              <p className="font-mono text-xs mt-1">{user?.id || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Role</p>
              <p className="mt-1 capitalize">{user?.role || "user"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Sign-In Methods</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {providerSummary?.providers.map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px] capitalize">
                    {p}
                  </Badge>
                )) || <span className="text-xs">-</span>}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Member Since</p>
              <p className="mt-1">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

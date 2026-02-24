import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldOff, Copy, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function TwoFactorSetup() {
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenCode, setRegenCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [showRegen, setShowRegen] = useState(false);

  const statusQuery = trpc.twoFactor.status.useQuery();
  const setupMutation = trpc.twoFactor.setup.useMutation();
  const verifyMutation = trpc.twoFactor.verify.useMutation();
  const disableMutation = trpc.twoFactor.disable.useMutation();
  const regenMutation = trpc.twoFactor.regenerateBackupCodes.useMutation();

  const isEnabled = statusQuery.data?.enabled ?? false;

  const handleSetup = async () => {
    try {
      const data = await setupMutation.mutateAsync();
      setSetupData({ secret: data.secret, qrCode: data.qrCode });
    } catch (err: any) {
      toast.error(err.message || "Failed to start 2FA setup");
    }
  };

  const handleVerify = async () => {
    try {
      const result = await verifyMutation.mutateAsync({ code: verifyCode });
      if (result.success) {
        setBackupCodes(result.backupCodes);
        setSetupData(null);
        setVerifyCode("");
        statusQuery.refetch();
        toast.success("2FA enabled successfully!");
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid code");
    }
  };

  const handleDisable = async () => {
    try {
      await disableMutation.mutateAsync({ code: disableCode });
      setShowDisable(false);
      setDisableCode("");
      statusQuery.refetch();
      toast.success("2FA disabled");
    } catch (err: any) {
      toast.error(err.message || "Invalid code");
    }
  };

  const handleRegenerate = async () => {
    try {
      const result = await regenMutation.mutateAsync({ code: regenCode });
      setBackupCodes(result.backupCodes);
      setShowRegen(false);
      setRegenCode("");
      toast.success("Backup codes regenerated");
    } catch (err: any) {
      toast.error(err.message || "Invalid code");
    }
  };

  const copyBackupCodes = () => {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success("Backup codes copied to clipboard");
    }
  };

  if (statusQuery.isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isEnabled ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
              {isEnabled ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              ) : (
                <Shield className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account using an authenticator app
              </CardDescription>
            </div>
          </div>
          <Badge variant={isEnabled ? "default" : "secondary"} className={isEnabled ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : ""}>
            {isEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Backup codes display */}
        {backupCodes && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold text-sm">Save your backup codes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Store these codes in a safe place. Each code can only be used once to sign in if you lose access to your authenticator app.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono bg-background/50 px-3 py-1.5 rounded border border-border/50 text-center">
                  {code}
                </code>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={copyBackupCodes} className="w-full">
              <Copy className="h-3.5 w-3.5 mr-2" />
              Copy all codes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setBackupCodes(null)} className="w-full text-muted-foreground">
              I've saved my codes
            </Button>
          </div>
        )}

        {/* Setup flow */}
        {!isEnabled && !setupData && !backupCodes && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use an authenticator app like Google Authenticator, Authy, or 1Password to generate one-time codes.
            </p>
            <Button onClick={handleSetup} disabled={setupMutation.isPending}>
              {setupMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Enable 2FA
            </Button>
          </div>
        )}

        {/* QR code scanning step */}
        {setupData && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Step 1: Scan this QR code</p>
              <p>Open your authenticator app and scan the QR code below, or manually enter the secret key.</p>
            </div>
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-lg">
                <img loading="lazy" src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-muted px-3 py-2 rounded flex-1 text-center select-all">
                {setupData.secret}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(setupData.secret);
                  toast.success("Secret copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Step 2: Enter the 6-digit code from your app</p>
              <div className="flex gap-2">
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="font-mono text-center text-lg tracking-widest"
                  maxLength={6}
                />
                <Button
                  onClick={handleVerify}
                  disabled={verifyCode.length !== 6 || verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSetupData(null)} className="text-muted-foreground">
              Cancel setup
            </Button>
          </div>
        )}

        {/* Enabled state actions */}
        {isEnabled && !backupCodes && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Your account is protected with two-factor authentication.
            </p>
            <div className="flex flex-wrap gap-2">
              {!showDisable && !showRegen && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowRegen(true)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Regenerate backup codes
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDisable(true)} className="text-destructive hover:text-destructive">
                    <ShieldOff className="h-3.5 w-3.5 mr-2" />
                    Disable 2FA
                  </Button>
                </>
              )}
            </div>

            {/* Disable flow */}
            {showDisable && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">Disable Two-Factor Authentication</p>
                <p className="text-xs text-muted-foreground">Enter your current TOTP code or a backup code to disable 2FA.</p>
                <div className="flex gap-2">
                  <Input
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="TOTP code or backup code"
                    className="font-mono"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisable}
                    disabled={!disableCode || disableMutation.isPending}
                  >
                    {disableMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowDisable(false); setDisableCode(""); }}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Regenerate flow */}
            {showRegen && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium">Regenerate Backup Codes</p>
                <p className="text-xs text-muted-foreground">Enter your current TOTP code to generate new backup codes. This will invalidate all previous codes.</p>
                <div className="flex gap-2">
                  <Input
                    value={regenCode}
                    onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="font-mono text-center tracking-widest"
                    maxLength={6}
                  />
                  <Button
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={regenCode.length !== 6 || regenMutation.isPending}
                  >
                    {regenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowRegen(false); setRegenCode(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

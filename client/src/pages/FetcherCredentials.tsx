import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Loader2, RefreshCw, Trash2, Eye, EyeOff, KeyRound, Copy, Check,
  Search, Plus, X, Shield, ChevronDown,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

// ─── Known Providers ────────────────────────────────────────────────
const KNOWN_PROVIDERS = [
  { id: "openai", name: "OpenAI", keyTypes: ["api_key"], prefixes: ["sk-"] },
  { id: "anthropic", name: "Anthropic", keyTypes: ["api_key"], prefixes: ["sk-ant-"] },
  { id: "github", name: "GitHub", keyTypes: ["personal_access_token"], prefixes: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"] },
  { id: "aws", name: "AWS", keyTypes: ["access_key_id", "secret_access_key"], prefixes: ["AKIA", "ASIA"] },
  { id: "google_cloud", name: "Google Cloud", keyTypes: ["api_key", "oauth_client_id", "oauth_client_secret"], prefixes: ["AIza"] },
  { id: "firebase", name: "Firebase", keyTypes: ["api_key", "project_id", "app_id"], prefixes: ["AIza"] },
  { id: "stripe", name: "Stripe", keyTypes: ["publishable_key", "secret_key"], prefixes: ["pk_", "sk_", "rk_"] },
  { id: "twilio", name: "Twilio", keyTypes: ["account_sid", "auth_token"], prefixes: ["AC"] },
  { id: "sendgrid", name: "SendGrid", keyTypes: ["api_key"], prefixes: ["SG."] },
  { id: "mailgun", name: "Mailgun", keyTypes: ["api_key"], prefixes: [] },
  { id: "heroku", name: "Heroku", keyTypes: ["api_key"], prefixes: [] },
  { id: "digitalocean", name: "DigitalOcean", keyTypes: ["personal_access_token"], prefixes: ["dop_v1_"] },
  { id: "cloudflare", name: "Cloudflare", keyTypes: ["api_token", "global_api_key"], prefixes: [] },
  { id: "godaddy", name: "GoDaddy", keyTypes: ["api_key", "api_secret"], prefixes: [] },
  { id: "meta", name: "Meta (Facebook/Instagram)", keyTypes: ["app_id", "app_secret", "access_token", "page_access_token"], prefixes: ["EAA"] },
  { id: "tiktok", name: "TikTok", keyTypes: ["app_id", "app_secret", "access_token", "advertiser_id"], prefixes: [] },
  { id: "google_ads", name: "Google Ads", keyTypes: ["developer_token", "client_id", "client_secret", "refresh_token", "customer_id"], prefixes: [] },
  { id: "snapchat", name: "Snapchat", keyTypes: ["client_id", "client_secret", "refresh_token", "ad_account_id"], prefixes: [] },
  { id: "discord", name: "Discord", keyTypes: ["bot_token", "client_id", "client_secret", "application_id"], prefixes: [] },
  { id: "roblox", name: "Roblox", keyTypes: ["api_key", "cloud_api_key", "universe_id"], prefixes: [] },
  { id: "huggingface", name: "Hugging Face", keyTypes: ["access_token"], prefixes: ["hf_"] },
] as const;

function autoDetectProvider(value: string): { providerId: string; providerName: string; keyType: string } | null {
  const trimmed = value.trim();
  for (const p of KNOWN_PROVIDERS) {
    for (const prefix of p.prefixes) {
      if (trimmed.startsWith(prefix)) {
        return { providerId: p.id, providerName: p.name, keyType: p.keyTypes[0] };
      }
    }
  }
  return null;
}

export default function FetcherCredentials() {
  const { data: credentials, isLoading, refetch } = trpc.fetcher.listCredentials.useQuery();
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [revealedValues, setRevealedValues] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ─── Add Credential Form State ──────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [addProviderId, setAddProviderId] = useState("");
  const [addProviderName, setAddProviderName] = useState("");
  const [addKeyType, setAddKeyType] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  const addCred = trpc.fetcher.addCredential.useMutation({
    onSuccess: () => {
      toast.success("Credential saved and encrypted!");
      setShowAddForm(false);
      resetForm();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCred = trpc.fetcher.deleteCredential.useMutation({
    onSuccess: () => {
      toast.success("Credential deleted");
      setConfirmDeleteId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = useCallback(() => {
    setAddProviderId("");
    setAddProviderName("");
    setAddKeyType("");
    setAddValue("");
    setAddLabel("");
    setAutoDetected(false);
  }, []);

  const handleValueChange = useCallback((val: string) => {
    setAddValue(val);
    // Auto-detect provider from the pasted value
    const detected = autoDetectProvider(val);
    if (detected && !addProviderId) {
      setAddProviderId(detected.providerId);
      setAddProviderName(detected.providerName);
      setAddKeyType(detected.keyType);
      setAutoDetected(true);
    }
  }, [addProviderId]);

  const handleSelectProvider = useCallback((provider: typeof KNOWN_PROVIDERS[number]) => {
    setAddProviderId(provider.id);
    setAddProviderName(provider.name);
    if (provider.keyTypes.length === 1) {
      setAddKeyType(provider.keyTypes[0]);
    } else {
      setAddKeyType("");
    }
    setShowProviderDropdown(false);
    setAutoDetected(false);
  }, []);

  const handleSubmitCredential = useCallback(() => {
    const pid = addProviderId.trim() || "custom";
    const pname = addProviderName.trim() || pid;
    const ktype = addKeyType.trim() || "api_key";
    const val = addValue.trim();
    if (!val) {
      toast.error("Please enter the credential value");
      return;
    }
    addCred.mutate({
      providerId: pid,
      providerName: pname,
      keyType: ktype,
      value: val,
      keyLabel: addLabel.trim() || undefined,
    });
  }, [addProviderId, addProviderName, addKeyType, addValue, addLabel, addCred]);

  const toggleReveal = async (id: number) => {
    if (revealedIds.has(id)) {
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/trpc/fetcher.revealCredential?input=${encodeURIComponent(JSON.stringify({ credentialId: id }))}`, {
        credentials: "include",
      });
      const json = await res.json();
      const creds = json?.result?.data;
      if (creds && Array.isArray(creds) && creds.length > 0) {
        const found = creds.find((c: any) => c.id === id);
        if (found) {
          setRevealedValues((prev) => ({ ...prev, [id]: found.value }));
          setRevealedIds((prev) => new Set([...prev, id]));
        }
      }
    } catch {
      toast.error("Failed to reveal credential");
    }
  };

  const copyToClipboard = async (id: number, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const filteredCredentials = useMemo(() => {
    if (!credentials) return [];
    if (!searchQuery.trim()) return credentials;
    const q = searchQuery.toLowerCase();
    return credentials.filter(
      (c) =>
        c.providerName.toLowerCase().includes(q) ||
        c.keyType.toLowerCase().includes(q) ||
        (c.keyLabel || "").toLowerCase().includes(q)
    );
  }, [credentials, searchQuery]);

  // Find the selected provider for key type dropdown
  const selectedProvider = KNOWN_PROVIDERS.find((p) => p.id === addProviderId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credentials Vault</h1>
          <p className="text-muted-foreground mt-1">
            All API keys and tokens, encrypted with AES-256-GCM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showAddForm ? "secondary" : "default"}
            size="sm"
            onClick={() => { setShowAddForm(!showAddForm); if (showAddForm) resetForm(); }}
          >
            {showAddForm ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Credential
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Add Credential Form ─────────────────────────────────── */}
      {showAddForm && (
        <Card className="border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Add New Credential
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Paste your API key or token below. We'll try to auto-detect the provider.
              You can also tell Titan in the chat: <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">"Save my OpenAI key sk-..."</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Value Input — First, because auto-detect works from here */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                API Key / Token / Secret <span className="text-destructive">*</span>
              </label>
              <Input
                type="password"
                placeholder="Paste your credential here (e.g. sk-abc123...)"
                value={addValue}
                onChange={(e) => handleValueChange(e.target.value)}
                className="font-mono"
                autoFocus
              />
              {autoDetected && addProviderName && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Auto-detected: {addProviderName} ({addKeyType})
                </p>
              )}
            </div>

            {/* Provider Selection */}
            <div className="relative">
              <label className="text-sm font-medium mb-1.5 block">Provider</label>
              <button
                type="button"
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
              >
                <span className={addProviderName ? "" : "text-muted-foreground"}>
                  {addProviderName || "Select a provider or type custom..."}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {showProviderDropdown && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-lg">
                  {KNOWN_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {p.name}
                      <span className="text-xs text-muted-foreground ml-2">
                        {p.keyTypes.join(", ")}
                      </span>
                    </button>
                  ))}
                  {/* Custom option */}
                  <button
                    type="button"
                    onClick={() => {
                      setAddProviderId("custom");
                      setAddProviderName("");
                      setAddKeyType("");
                      setShowProviderDropdown(false);
                      setAutoDetected(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-t transition-colors"
                  >
                    Custom Provider
                    <span className="text-xs text-muted-foreground ml-2">Enter your own</span>
                  </button>
                </div>
              )}
            </div>

            {/* Custom provider name if "custom" selected */}
            {addProviderId === "custom" && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Custom Provider Name</label>
                <Input
                  placeholder="e.g. My Internal API"
                  value={addProviderName}
                  onChange={(e) => setAddProviderName(e.target.value)}
                />
              </div>
            )}

            {/* Key Type — dropdown if provider has multiple, or text input */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Key Type</label>
              {selectedProvider && selectedProvider.keyTypes.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedProvider.keyTypes.map((kt) => (
                    <button
                      key={kt}
                      type="button"
                      onClick={() => setAddKeyType(kt)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                        addKeyType === kt
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-accent border-input"
                      }`}
                    >
                      {kt}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  placeholder="e.g. api_key, secret_key, access_token"
                  value={addKeyType}
                  onChange={(e) => setAddKeyType(e.target.value)}
                />
              )}
            </div>

            {/* Label (optional) */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Label <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                placeholder="e.g. Production, Staging, Personal"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
              />
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Encrypted at rest with AES-256-GCM
              </p>
              <Button
                onClick={handleSubmitCredential}
                disabled={!addValue.trim() || addCred.isPending}
              >
                {addCred.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                Save Credential
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Empty State ─────────────────────────────────────────── */}
      {!credentials || credentials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <KeyRound className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No credentials stored yet.</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add credentials manually, paste them in the chat, or run a fetch job.
            </p>
            {!showAddForm && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Credential
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search */}
          {credentials.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search credentials by provider, key type, or label..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {/* Count */}
          <p className="text-xs text-muted-foreground">
            {filteredCredentials.length} credential{filteredCredentials.length !== 1 ? "s" : ""}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>

          <div className="space-y-3">
            {filteredCredentials.map((cred) => {
              const isRevealed = revealedIds.has(cred.id);
              const decryptedValue = revealedValues[cred.id];
              const isCopied = copiedId === cred.id;
              const isConfirmingDelete = confirmDeleteId === cred.id;

              return (
                <Card key={cred.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <KeyRound className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{cred.providerName}</p>
                          <Badge variant="secondary" className="text-xs">
                            {cred.keyType}
                          </Badge>
                          {cred.jobId === 0 && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              manual
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate select-all">
                          {isRevealed && decryptedValue
                            ? decryptedValue
                            : "••••••••••••••••••••••••"}
                        </p>
                        {cred.keyLabel && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {cred.keyLabel}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Copy button — only when revealed */}
                      {isRevealed && decryptedValue && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(cred.id, decryptedValue)}
                          title="Copy to clipboard"
                        >
                          {isCopied ? (
                            <Check className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {/* Reveal/hide button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleReveal(cred.id)}
                        title={isRevealed ? "Hide" : "Reveal"}
                      >
                        {isRevealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      {/* Delete with confirmation */}
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteCred.mutate({ credentialId: cred.id })}
                            disabled={deleteCred.isPending}
                            className="text-xs h-7 px-2"
                          >
                            {deleteCred.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Delete"
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs h-7 px-2"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(cred.id)}
                          className="text-destructive hover:text-destructive"
                          title="Delete credential"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { PROVIDERS, CATEGORIES } from "@shared/fetcher";
import { useState, useMemo } from "react";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Lock, Crown, AlertTriangle, Plus, Trash2, Plug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeDialog, UsageBar } from "@/components/UpgradePrompt";

export default function FetcherNew() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const sub = useSubscription();

  // Custom providers
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customIcon, setCustomIcon] = useState("🔌");
  const [customCategory, setCustomCategory] = useState("custom");
  const [customLoginUrl, setCustomLoginUrl] = useState("");
  const [customKeysUrl, setCustomKeysUrl] = useState("");
  const [customKeyTypes, setCustomKeyTypes] = useState("api_key");
  const [customDescription, setCustomDescription] = useState("");

  const customProvidersList = trpc.customProviders.list.useQuery();
  const createCustomProvider = trpc.customProviders.create.useMutation({
    onSuccess: () => {
      toast.success("Custom provider added!");
      setShowAddCustom(false);
      setCustomName("");
      setCustomIcon("🔌");
      setCustomLoginUrl("");
      setCustomKeysUrl("");
      setCustomKeyTypes("api_key");
      setCustomDescription("");
      customProvidersList.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteCustomProvider = trpc.customProviders.delete.useMutation({
    onSuccess: () => {
      toast.success("Custom provider removed");
      customProvidersList.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Get provider data with lock status from the backend
  const { data: providerData } = trpc.fetcher.providers.useQuery();

  const createJob = trpc.fetcher.createJob.useMutation({
    onSuccess: () => {
      toast.success("Fetch job created successfully!");
      sub.refresh();
      setLocation(`/fetcher/jobs`);
    },
    onError: (err) => {
      if (err.message.includes("Upgrade to")) {
        setUpgradeFeature(err.message);
        setShowUpgrade(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  // Build provider list with lock status + custom providers merged in
  const allProviders = useMemo(() => {
    const builtIn = providerData?.providers
      ? providerData.providers
      : Object.values(PROVIDERS).map((p) => ({ ...p, locked: false }));

    // Merge custom providers
    const custom = (customProvidersList.data || []).map((cp) => ({
      id: cp.slug,
      name: cp.name,
      icon: cp.icon || "🔌",
      category: cp.category || "custom",
      description: cp.description || "Custom integration",
      loginUrl: cp.loginUrl,
      keysUrl: cp.keysUrl,
      keyTypes: cp.keyTypes,
      locked: false,
      isCustom: true,
      customId: cp.id,
    }));

    return [...builtIn.map((p) => ({ ...p, isCustom: false, customId: 0 })), ...custom];
  }, [providerData, customProvidersList.data]);

  const providersByCategory = useMemo(() => {
    const grouped: Record<string, typeof allProviders> = {};
    for (const provider of allProviders) {
      if (!grouped[provider.category]) grouped[provider.category] = [];
      grouped[provider.category].push(provider);
    }
    return grouped;
  }, [allProviders]);

  const toggleProvider = (id: string) => {
    const provider = allProviders.find((p) => p.id === id);
    if (provider?.locked) {
      setUpgradeFeature(`Access to ${provider.name}`);
      setShowUpgrade(true);
      return;
    }
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedProviders(allProviders.filter((p) => !p.locked).map((p) => p.id));
  };

  const clearAll = () => {
    setSelectedProviders([]);
  };

  const atFetchLimit = sub.fetchesRemaining === 0 && sub.fetchesLimit !== -1;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || selectedProviders.length === 0) {
      toast.error("Please fill in all fields and select at least one provider.");
      return;
    }
    if (atFetchLimit) {
      setUpgradeFeature("Monthly fetch limit reached");
      setShowUpgrade(true);
      return;
    }
    createJob.mutate({ email, password, providers: selectedProviders });
  };

  const unlockedCount = allProviders.filter((p) => !p.locked).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Fetch Job</h1>
        <p className="text-muted-foreground mt-1">
          Enter your credentials and select providers to retrieve API keys from.
        </p>
      </div>

      {/* Usage Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <UsageBar
            label="Fetches This Month"
            used={sub.fetchesUsed}
            limit={sub.fetchesLimit}
          />
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Available Providers</span>
            <span className="font-medium">
              {unlockedCount} / {allProviders.length}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(unlockedCount / allProviders.length) * 100}%` }}
            />
          </div>
        </Card>
      </div>

      {/* At limit warning */}
      {atFetchLimit && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-500">Monthly fetch limit reached</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You've used all {sub.fetchesLimit} fetches this month. Upgrade to Pro for unlimited fetches.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setLocation("/pricing")}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shrink-0"
            >
              <Crown className="h-3.5 w-3.5 mr-1" />
              Upgrade
            </Button>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Credentials</CardTitle>
            <CardDescription>
              These are used to log into provider websites. Encrypted with AES-256 before storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Provider Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Select Providers</CardTitle>
                <CardDescription>
                  {selectedProviders.length} of {unlockedCount} available selected
                  {sub.isFree && (
                    <span className="text-amber-500 ml-1">
                      ({allProviders.length - unlockedCount} locked — upgrade for all)
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(providersByCategory).map(([category, providers]) => (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {CATEGORIES[category] || category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {providers.map((provider) => {
                    const isLocked = provider.locked;
                    return (
                      <label
                        key={provider.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isLocked
                            ? "border-dashed border-muted-foreground/20 bg-muted/20 opacity-60"
                            : selectedProviders.includes(provider.id)
                            ? "border-primary bg-primary/5"
                            : "hover:bg-accent/50"
                        }`}
                        onClick={(e) => {
                          if (isLocked) {
                            e.preventDefault();
                            toggleProvider(provider.id);
                          }
                        }}
                      >
                        {isLocked ? (
                          <Lock className="h-4 w-4 text-amber-500/60 shrink-0" />
                        ) : (
                          <Checkbox
                            checked={selectedProviders.includes(provider.id)}
                            onCheckedChange={() => toggleProvider(provider.id)}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{provider.name}</p>
                            {isLocked && (
                              <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                PRO
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {provider.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Custom Provider Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plug className="h-5 w-5" />
                  Custom Integrations
                </CardTitle>
                <CardDescription>
                  Add your own API providers — any platform with a login page and API keys page.
                </CardDescription>
              </div>
              <Dialog open={showAddCustom} onOpenChange={setShowAddCustom}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Provider
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Custom Provider</DialogTitle>
                    <DialogDescription>
                      Define a new API provider. Titan will use the login URL to authenticate and the keys URL to extract credentials.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-[1fr_80px] gap-3">
                      <div className="space-y-1.5">
                        <Label>Provider Name</Label>
                        <Input
                          placeholder="e.g. Notion, Airtable, Vercel"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Icon</Label>
                        <Input
                          placeholder="🔌"
                          value={customIcon}
                          onChange={(e) => setCustomIcon(e.target.value)}
                          maxLength={4}
                          className="text-center text-lg"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={customCategory} onValueChange={setCustomCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloud">Cloud & Infrastructure</SelectItem>
                          <SelectItem value="ai">AI & Machine Learning</SelectItem>
                          <SelectItem value="dev">Developer Tools</SelectItem>
                          <SelectItem value="social_media">Social Media</SelectItem>
                          <SelectItem value="advertising">Advertising</SelectItem>
                          <SelectItem value="communication">Communication</SelectItem>
                          <SelectItem value="hosting">Hosting & Domains</SelectItem>
                          <SelectItem value="gaming">Gaming</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Login URL</Label>
                      <Input
                        placeholder="https://platform.com/login"
                        value={customLoginUrl}
                        onChange={(e) => setCustomLoginUrl(e.target.value)}
                        type="url"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>API Keys Page URL</Label>
                      <Input
                        placeholder="https://platform.com/settings/api-keys"
                        value={customKeysUrl}
                        onChange={(e) => setCustomKeysUrl(e.target.value)}
                        type="url"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Key Types (comma-separated)</Label>
                      <Input
                        placeholder="api_key, secret_key, access_token"
                        value={customKeyTypes}
                        onChange={(e) => setCustomKeyTypes(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description (optional)</Label>
                      <Textarea
                        placeholder="Brief description of this provider..."
                        value={customDescription}
                        onChange={(e) => setCustomDescription(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddCustom(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={!customName || !customLoginUrl || !customKeysUrl || createCustomProvider.isPending}
                      onClick={() => {
                        createCustomProvider.mutate({
                          name: customName,
                          icon: customIcon || "🔌",
                          category: customCategory,
                          loginUrl: customLoginUrl,
                          keysUrl: customKeysUrl,
                          keyTypes: customKeyTypes.split(",").map((k) => k.trim()).filter(Boolean),
                          description: customDescription || undefined,
                        });
                      }}
                    >
                      {createCustomProvider.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...</>
                      ) : (
                        <><Plus className="h-4 w-4 mr-1" /> Add Provider</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          {(customProvidersList.data?.length ?? 0) > 0 && (
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(customProvidersList.data || []).map((cp) => {
                  const customId = `custom_${cp.id}`;
                  const isSelected = selectedProviders.includes(customId);
                  return (
                    <div
                      key={cp.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors group ${
                        isSelected ? "border-primary bg-primary/10" : "hover:bg-accent/50"
                      }`}
                      onClick={() => {
                        setSelectedProviders((prev) =>
                          prev.includes(customId)
                            ? prev.filter((p) => p !== customId)
                            : [...prev, customId]
                        );
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedProviders((prev) =>
                            checked
                              ? [...prev, customId]
                              : prev.filter((p) => p !== customId)
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-lg">{cp.icon || "🔌"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{cp.name}</p>
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {cp.description || cp.keysUrl}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteCustomProvider.mutate({ id: cp.id }); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={createJob.isPending || selectedProviders.length === 0 || atFetchLimit}
        >
          {createJob.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Job…
            </>
          ) : atFetchLimit ? (
            "Fetch Limit Reached — Upgrade to Continue"
          ) : (
            `Start Fetching from ${selectedProviders.length} Provider${selectedProviders.length !== 1 ? "s" : ""}`
          )}
        </Button>
      </form>

      {/* Affiliate Recommendations — power users creating fetch jobs */}
      <AffiliateRecommendations context="security" variant="banner" className="mt-6" />

      {/* Upgrade Dialog */}
      <UpgradeDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature={upgradeFeature}
        requiredPlan="pro"
      />
    </div>
  );
}

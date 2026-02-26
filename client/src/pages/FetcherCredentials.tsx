import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCw, Trash2, Eye, EyeOff, KeyRound, Copy, Check, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function FetcherCredentials() {
  const { data: credentials, isLoading, refetch } = trpc.fetcher.listCredentials.useQuery();
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [revealedValues, setRevealedValues] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteCred = trpc.fetcher.deleteCredential.useMutation({
    onSuccess: () => {
      toast.success("Credential deleted");
      setConfirmDeleteId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleReveal = async (id: number) => {
    if (revealedIds.has(id)) {
      // Hide it
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    // Fetch the specific credential's decrypted value
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credentials Vault</h1>
          <p className="text-muted-foreground mt-1">
            All retrieved API keys and tokens, encrypted with AES-256-GCM.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {!credentials || credentials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <KeyRound className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No credentials stored yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run a fetch job to retrieve API keys.
            </p>
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

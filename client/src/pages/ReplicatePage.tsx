import { useState, useMemo } from "react";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Palette,
  CreditCard,
  Hammer,
  FileCode,
  Database,
  Server,
  Layout,
  Zap,
  Clock,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  AlertCircle,
  Github,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

type Project = {
  id: number;
  targetUrl: string;
  targetName: string;
  targetDescription: string | null;
  status: string;
  priority: string;
  currentStep: number;
  totalSteps: number;
  statusMessage: string | null;
  errorMessage: string | null;
  brandName: string | null;
  brandTagline: string | null;
  brandColors: { primary: string; secondary: string; accent: string; background: string; text: string } | null;
  brandLogo: string | null;
  stripePublishableKey: string | null;
  researchData: {
    appName: string;
    description: string;
    targetAudience: string;
    coreFeatures: string[];
    uiPatterns: string[];
    techStackGuess: string[];
    dataModels: string[];
    apiEndpoints: string[];
    authMethod: string;
    monetization: string;
    keyDifferentiators: string[];
    suggestedTechStack: string;
    estimatedComplexity: string;
    mvpFeatures: string[];
    fullFeatures: string[];
  } | null;
  buildPlan: {
    projectName: string;
    description: string;
    techStack: { frontend: string; backend: string; database: string; other: string };
    fileStructure: Array<{ path: string; description: string; priority: number }>;
    buildSteps: Array<{ step: number; description: string; files: string[]; commands: string[] }>;
    dataModels: Array<{ name: string; fields: string[] }>;
    apiRoutes: Array<{ method: string; path: string; description: string }>;
    estimatedFiles: number;
    estimatedTimeMinutes: number;
  } | null;
  buildLog: Array<{ step: number; status: string; message: string; timestamp: string }> | null;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  researching: { label: "Researching", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Search },
  research_complete: { label: "Research Complete", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  planning: { label: "Planning", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: FileCode },
  plan_complete: { label: "Plan Ready", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  building: { label: "Building", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Hammer },
  build_complete: { label: "Build Complete", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  testing: { label: "Testing", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: Zap },
  complete: { label: "Complete", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  error: { label: "Error", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
};

export default function ReplicatePage() {
  const [activeTab, setActiveTab] = useState("new");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [patInput, setPatInput] = useState("");
  const [showPatInput, setShowPatInput] = useState(false);
  const projectsQuery = trpc.replicate.list.useQuery();
  const githubPatQuery = trpc.userSecrets.getGithubPat.useQuery();
  const savePatMutation = trpc.userSecrets.saveGithubPat.useMutation({
    onSuccess: (data) => {
      toast.success(`GitHub connected as ${data.githubUsername}`);
      setPatInput("");
      setShowPatInput(false);
      githubPatQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deletePatMutation = trpc.userSecrets.deleteGithubPat.useMutation({
    onSuccess: () => {
      toast.success("GitHub PAT removed");
      githubPatQuery.refetch();
    },
  });
  const projects = (projectsQuery.data ?? []) as unknown as Project[];
  const selectedProjectData = useMemo(
    () => projects.find((p) => p.id === selectedProject),
    [projects, selectedProject]
  );
  const hasGithubPat = githubPatQuery.data?.hasPat ?? false;
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Copy className="h-6 w-6 text-purple-400" />
            Website Replicate
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clone any website with your branding, your payment system, and deploy to your own domain
          </p>
        </div>
      </div>

      {/* GitHub PAT Setup */}
      <Card className={`border ${hasGithubPat ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Github className={`h-5 w-5 ${hasGithubPat ? 'text-green-400' : 'text-yellow-400'}`} />
              <div>
                <p className="font-medium text-sm">
                  {hasGithubPat ? 'GitHub Connected' : 'Connect GitHub to Deploy'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasGithubPat
                    ? `Connected: ${githubPatQuery.data?.maskedPat}`
                    : 'A GitHub Personal Access Token with repo scope is required to push your cloned websites'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasGithubPat ? (
                <>
                  <Badge variant="outline" className="border-green-500/50 text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPatInput(!showPatInput)}
                    className="text-xs"
                  >
                    Update
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePatMutation.mutate()}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPatInput(!showPatInput)}
                >
                  <Github className="h-4 w-4 mr-1" /> Connect GitHub
                </Button>
              )}
            </div>
          </div>
          {showPatInput && (
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button
                size="sm"
                onClick={() => savePatMutation.mutate({ pat: patInput })}
                disabled={!patInput || patInput.length < 10 || savePatMutation.isPending}
              >
                {savePatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save & Verify'
                )}
              </Button>
            </div>
          )}
          {!hasGithubPat && !showPatInput && (
            <p className="text-xs text-muted-foreground mt-2">
              Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" className="text-blue-400 underline">GitHub Settings → Tokens</a> → Generate new token (classic) → Select <strong>repo</strong> scope → Copy and paste here
            </p>
          )}
        </CardContent>
      </Card>

      <AffiliateRecommendations context="app_builder" variant="banner" /> />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="new">New Project</TabsTrigger>
          <TabsTrigger value="projects">
            My Projects
            {projects.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {projects.length}
              </Badge>
            )}
          </TabsTrigger>
          {selectedProject && (
            <TabsTrigger value="detail">Project Detail</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <NewProjectForm
            onCreated={(id) => {
              setSelectedProject(id);
              setActiveTab("detail");
              projectsQuery.refetch();
            }}
          />
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <ProjectList
            projects={projects}
            loading={projectsQuery.isLoading}
            onSelect={(id) => {
              setSelectedProject(id);
              setActiveTab("detail");
            }}
            onDelete={() => projectsQuery.refetch()}
          />
        </TabsContent>

        <TabsContent value="detail" className="mt-4">
          {selectedProjectData ? (
            <ProjectDetail
              project={selectedProjectData}
              onRefresh={() => projectsQuery.refetch()}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Select a project to view details
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── New Project Form ───────────────────────────────────────────────

function NewProjectForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [targetUrl, setTargetUrl] = useState("");
  const [targetName, setTargetName] = useState("");
  const [priority, setPriority] = useState<"mvp" | "full">("mvp");
  const [brandName, setBrandName] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [accentColor, setAccentColor] = useState("#a855f7");
  const [bgColor, setBgColor] = useState("#0f172a");
  const [textColor, setTextColor] = useState("#f8fafc");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [step, setStep] = useState(1);

  const createMutation = trpc.replicate.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("Project created! Starting research...");
      onCreated(data.id);
    },
    onError: (err) => {
      toast.error(`Failed to create project: ${err.message}`);
    },
  });

  const handleCreate = () => {
    if (!targetUrl.trim()) {
      toast.error("Please enter a target URL or app name");
      return;
    }

    createMutation.mutate({
      targetUrl: targetUrl.trim(),
      targetName: targetName.trim() || targetUrl.trim(),
      priority,
      brandName: brandName || undefined,
      brandTagline: brandTagline || undefined,
      brandColors: brandName
        ? { primary: primaryColor, secondary: secondaryColor, accent: accentColor, background: bgColor, text: textColor }
        : undefined,
      stripePublishableKey: stripePublishableKey || undefined,
      stripeSecretKey: stripeSecretKey || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Target */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 1 ? "bg-purple-500/20 text-purple-400" : "bg-muted text-muted-foreground"}`}>
              1
            </div>
            Target Website
          </CardTitle>
          <CardDescription>Enter the URL or name of the website/app you want to replicate</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetUrl">Website URL or Name</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="targetUrl"
                  placeholder="https://example.com or 'Notion'"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetName">Project Name</Label>
              <Input
                id="targetName"
                placeholder="My Clone App"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Build Priority</Label>
            <div className="flex gap-3">
              <Button
                variant={priority === "mvp" ? "default" : "outline"}
                size="sm"
                onClick={() => setPriority("mvp")}
                className={priority === "mvp" ? "bg-purple-600 hover:bg-purple-700" : ""}
              >
                <Zap className="h-4 w-4 mr-1" />
                MVP — Core Features
              </Button>
              <Button
                variant={priority === "full" ? "default" : "outline"}
                size="sm"
                onClick={() => setPriority("full")}
                className={priority === "full" ? "bg-purple-600 hover:bg-purple-700" : ""}
              >
                <Layout className="h-4 w-4 mr-1" />
                Full — Complete Parity
              </Button>
            </div>
          </div>

          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!targetUrl.trim()}>
              Next: Branding <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Branding */}
      {step >= 2 && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 2 ? "bg-purple-500/20 text-purple-400" : "bg-muted text-muted-foreground"}`}>
                2
              </div>
              <Palette className="h-5 w-5" />
              Custom Branding
              <Badge variant="outline" className="text-xs">Optional</Badge>
            </CardTitle>
            <CardDescription>Apply your own branding instead of the original</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  placeholder="Your Company Name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandTagline">Tagline</Label>
                <Input
                  id="brandTagline"
                  placeholder="Your catchy tagline"
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Brand Colors</Label>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Primary</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-24 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Secondary</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-24 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Accent</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-24 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Background</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-24 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Text</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-24 text-xs" />
                  </div>
                </div>
              </div>
            </div>

            {/* Color Preview */}
            {brandName && (
              <div
                className="rounded-lg p-4 border"
                style={{ backgroundColor: bgColor, borderColor: primaryColor + "40" }}
              >
                <h3 style={{ color: primaryColor }} className="text-lg font-bold">{brandName}</h3>
                <p style={{ color: textColor }} className="text-sm opacity-80">{brandTagline || "Your tagline here"}</p>
                <div className="flex gap-2 mt-2">
                  <span className="px-3 py-1 rounded-full text-xs text-white" style={{ backgroundColor: primaryColor }}>Primary</span>
                  <span className="px-3 py-1 rounded-full text-xs text-white" style={{ backgroundColor: secondaryColor }}>Secondary</span>
                  <span className="px-3 py-1 rounded-full text-xs text-white" style={{ backgroundColor: accentColor }}>Accent</span>
                </div>
              </div>
            )}

            {step === 2 && (
              <Button onClick={() => setStep(3)}>
                Next: Payments <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Stripe */}
      {step >= 3 && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 3 ? "bg-purple-500/20 text-purple-400" : "bg-muted text-muted-foreground"}`}>
                3
              </div>
              <CreditCard className="h-5 w-5" />
              Stripe Payment Integration
              <Badge variant="outline" className="text-xs">Optional</Badge>
            </CardTitle>
            <CardDescription>Add your Stripe keys to enable payments in the clone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stripePk">Publishable Key</Label>
                <Input
                  id="stripePk"
                  placeholder="pk_live_..."
                  value={stripePublishableKey}
                  onChange={(e) => setStripePublishableKey(e.target.value)}
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripeSk">Secret Key</Label>
                <Input
                  id="stripeSk"
                  placeholder="sk_live_..."
                  value={stripeSecretKey}
                  onChange={(e) => setStripeSecretKey(e.target.value)}
                  type="password"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your Stripe keys from{" "}
              <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                dashboard.stripe.com/apikeys <ExternalLink className="inline h-3 w-3" />
              </a>
            </p>

            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !targetUrl.trim()}
              className="bg-purple-600 hover:bg-purple-700"
              size="lg"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Project...
                </>
              ) : (
                <>
                  <Hammer className="h-4 w-4 mr-2" />
                  Create & Start Research
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Project List ───────────────────────────────────────────────────

function ProjectList({
  projects,
  loading,
  onSelect,
  onDelete,
}: {
  projects: Project[];
  loading: boolean;
  onSelect: (id: number) => void;
  onDelete: () => void;
}) {
  const deleteMutation = trpc.replicate.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      onDelete();
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <Copy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <h3 className="text-lg font-medium">No projects yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first Website Replicate project to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {projects.map((project) => {
        const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.error;
        const StatusIcon = statusCfg.icon;

        return (
          <Card
            key={project.id}
            className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
            onClick={() => onSelect(project.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Globe className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{project.targetName}</h3>
                    <p className="text-xs text-muted-foreground truncate">{project.targetUrl}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge className={`${statusCfg.color} border text-xs`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusCfg.label}
                  </Badge>

                  {project.status === "building" && project.totalSteps > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {project.currentStep}/{project.totalSteps}
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this project?")) {
                        deleteMutation.mutate({ projectId: project.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* GitHub Push Form */}
          {showGithubPush && (
            <div className="mt-3 p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Github className="h-4 w-4 text-purple-400" />
                Push to GitHub Repository
              </p>
              <p className="text-xs text-muted-foreground">
                Creates a new GitHub repository and pushes all project files. Make sure your GitHub PAT is saved in Account Settings.
              </p>
              <div className="flex gap-2">
                <Input
                  value={githubRepoName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGithubRepoName(e.target.value)}
                  placeholder="Repository name (e.g., my-clone)"
                  className="h-8 text-sm flex-1"
                />
                <Button
                  onClick={() => pushToGithubMutation.mutate({ projectId: project.id, repoName: githubRepoName })}
                  disabled={isPushing || !githubRepoName.trim()}
                  size="sm"
                  className="gap-1.5 shrink-0"
                >
                  {isPushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {isPushing ? "Pushing..." : "Push"}
                </Button>
              </div>
              {(project as any).githubRepoUrl && (
                <a
                  href={(project as any).githubRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          {project.statusMessage && (
                <p className="text-xs text-muted-foreground mt-2 pl-13">
                  {project.statusMessage}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Project Detail ─────────────────────────────────────────────────

function ProjectDetail({
  project,
  onRefresh,
}: {
  project: Project;
  onRefresh: () => void;
}) {
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.error;
  const StatusIcon = statusCfg.icon;

  const researchMutation = trpc.replicate.research.useMutation({
    onSuccess: () => {
      toast.success("Research complete!");
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const planMutation = trpc.replicate.plan.useMutation({
    onSuccess: () => {
      toast.success("Build plan generated!");
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const [githubRepoName, setGithubRepoName] = useState("");
  const [showGithubPush, setShowGithubPush] = useState(false);
  const [showDomainDeploy, setShowDomainDeploy] = useState(false);
  const [domainSuggestions, setDomainSuggestions] = useState<Array<{ domain: string; price: number; currency: string }>>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [deployPlatform, setDeployPlatform] = useState<"vercel" | "railway" | "auto">("auto");
  const [deployResult, setDeployResult] = useState<{ url: string; platform: string } | null>(null);
  const [pushedRepoName, setPushedRepoName] = useState("");

  const pushToGithubMutation = trpc.replicate.pushToGithub.useMutation({
    onSuccess: (data) => {
      toast.success(`Pushed to GitHub: ${data.repoUrl}`);
      setPushedRepoName(data.repoUrl?.replace("https://github.com/", "") || githubRepoName);
      setShowGithubPush(false);
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const searchDomainsMutation = trpc.replicate.searchDomains.useMutation({
    onSuccess: (data) => {
      if (data.success && data.domains.length > 0) {
        setDomainSuggestions(data.domains);
      } else {
        toast.error(data.message || "No domains found. Try a different keyword.");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const deployMutation = trpc.replicate.deploy.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setDeployResult({ url: result.deploymentUrl, platform: result.platform });
        toast.success(result.message);
        onRefresh();
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const buildMutation = trpc.replicate.build.useMutation({
    onSuccess: () => {
      toast.success("Build complete!");
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const isResearching = researchMutation.isPending;
  const isPlanning = planMutation.isPending;
  const isBuilding = buildMutation.isPending;
  const isPushing = pushToGithubMutation.isPending;
  const isSearchingDomains = searchDomainsMutation.isPending;
  const isDeploying = deployMutation.isPending;
  const isBusy = isResearching || isPlanning || isBuilding || isPushing || isDeploying;

  // Auto-detect recommended platform based on complexity
  const complexity = project.researchData?.estimatedComplexity?.toLowerCase() || "standard";
  const recommendedPlatform = (complexity === "simple" || complexity === "standard") ? "vercel" : "railway";

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Globe className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{project.targetName}</h2>
                <a
                  href={project.targetUrl.startsWith("http") ? project.targetUrl : `https://${project.targetUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:underline flex items-center gap-1"
                >
                  {project.targetUrl} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge className={`${statusCfg.color} border`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusCfg.label}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {project.priority === "mvp" ? "MVP" : "Full"}
              </Badge>
              {(project.status === "build_complete" || project.status === "branded" || project.status === "pushed") && (
                <Button
                  onClick={() => setShowGithubPush(!showGithubPush)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                >
                  <Github className="h-3.5 w-3.5" />
                  Push to GitHub
                </Button>
              )}
            </div>
          </div>

          {/* GitHub Push Form */}
          {showGithubPush && (
            <div className="mt-3 p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Github className="h-4 w-4 text-purple-400" />
                Push to GitHub Repository
              </p>
              <p className="text-xs text-muted-foreground">
                Creates a new GitHub repository and pushes all project files. Make sure your GitHub PAT is saved in Account Settings.
              </p>
              <div className="flex gap-2">
                <Input
                  value={githubRepoName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGithubRepoName(e.target.value)}
                  placeholder="Repository name (e.g., my-clone)"
                  className="h-8 text-sm flex-1"
                />
                <Button
                  onClick={() => pushToGithubMutation.mutate({ projectId: project.id, repoName: githubRepoName })}
                  disabled={isPushing || !githubRepoName.trim()}
                  size="sm"
                  className="gap-1.5 shrink-0"
                >
                  {isPushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {isPushing ? "Pushing..." : "Push"}
                </Button>
              </div>
              {(project as any).githubRepoUrl && (
                <a
                  href={(project as any).githubRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          {project.statusMessage && (
            <p className="text-sm text-muted-foreground mt-3 pl-15">
              {project.statusMessage}
            </p>
          )}

          {project.errorMessage && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {project.errorMessage}
            </div>
          )}

          {/* Progress bar for building */}
          {project.status === "building" && project.totalSteps > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Building...</span>
                <span>{project.currentStep}/{project.totalSteps} steps</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${(project.currentStep / project.totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            {(project.status === "researching" || project.status === "error") && (
              <Button
                onClick={() => researchMutation.mutate({ projectId: project.id })}
                disabled={isBusy}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isResearching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                {isResearching ? "Researching..." : "Start Research"}
              </Button>
            )}

            {project.status === "research_complete" && (
              <Button
                onClick={() => planMutation.mutate({ projectId: project.id })}
                disabled={isBusy}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isPlanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCode className="h-4 w-4 mr-2" />}
                {isPlanning ? "Generating Plan..." : "Generate Build Plan"}
              </Button>
            )}

            {project.status === "plan_complete" && (
              <Button
                onClick={() => buildMutation.mutate({ projectId: project.id })}
                disabled={isBusy}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isBuilding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Hammer className="h-4 w-4 mr-2" />}
                {isBuilding ? "Building..." : "Start Build"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Research Results */}
      {project.researchData && (
        <ResearchResults research={project.researchData} />
      )}

      {/* Build Plan */}
      {project.buildPlan && (
        <BuildPlanView plan={project.buildPlan} />
      )}

      {/* Build Log */}
      {project.buildLog && project.buildLog.length > 0 && (
        <BuildLogView log={project.buildLog} />
      )}

      {/* Branding Info */}
      {project.brandName && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="h-5 w-5 text-purple-400" />
              Custom Branding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Brand Name</span>
                <p className="font-medium">{project.brandName}</p>
              </div>
              {project.brandTagline && (
                <div>
                  <span className="text-muted-foreground">Tagline</span>
                  <p className="font-medium">{project.brandTagline}</p>
                </div>
              )}
              {project.brandColors && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Colors</span>
                  <div className="flex gap-2 mt-1">
                    {Object.entries(project.brandColors).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-1">
                        <div className="w-5 h-5 rounded border" style={{ backgroundColor: val }} />
                        <span className="text-xs">{key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ DOMAIN & DEPLOY SECTION ═══ */}
      {(project.status === "build_complete" || project.status === "branded" || project.status === "pushed") && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-green-400" />
                Domain & Deployment
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDomainDeploy(!showDomainDeploy)}
              >
                {showDomainDeploy ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardTitle>
            <CardDescription>
              Get a custom domain and deploy your cloned website to production
            </CardDescription>
          </CardHeader>

          {showDomainDeploy && (
            <CardContent className="space-y-6">
              {/* Step 1: Domain Search */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">1</span>
                  Find a Domain
                </h4>
                <p className="text-xs text-muted-foreground">
                  Search for available domains. GoDaddy registration fees are charged separately on top of the clone service fee.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={customDomainInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomDomainInput(e.target.value)}
                    placeholder="Enter brand name or keyword to search..."
                    className="h-9 text-sm flex-1"
                  />
                  <Button
                    onClick={() => searchDomainsMutation.mutate({ keyword: customDomainInput })}
                    disabled={isSearchingDomains || !customDomainInput.trim()}
                    size="sm"
                    className="gap-1.5 shrink-0"
                  >
                    {isSearchingDomains ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Search
                  </Button>
                </div>

                {/* Domain Suggestions */}
                {domainSuggestions.length > 0 && (
                  <div className="space-y-2">
                    {domainSuggestions.map((d) => (
                      <div
                        key={d.domain}
                        onClick={() => setSelectedDomain(d.domain)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedDomain === d.domain
                            ? "border-green-500 bg-green-500/10"
                            : "border-border/50 hover:border-green-500/50 bg-card/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-green-400" />
                            <span className="font-medium text-sm">{d.domain}</span>
                            {selectedDomain === d.domain && (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            )}
                          </div>
                          <Badge variant="outline" className="text-green-400 border-green-500/30">
                            ${(d.price / 100).toFixed(2)}/{d.currency || "USD"}/yr
                          </Badge>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Or enter your own domain if you already have one:
                    </p>
                    <Input
                      value={selectedDomain}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedDomain(e.target.value)}
                      placeholder="yourdomain.com"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Step 2: Choose Deployment Platform */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">2</span>
                  Deployment Platform
                </h4>
                <p className="text-xs text-muted-foreground">
                  {recommendedPlatform === "vercel"
                    ? "Vercel is recommended for this project (simple/standard complexity — fast, optimized for static sites)."
                    : "Railway is recommended for this project (advanced/enterprise complexity — supports databases and backend services)."}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["auto", "vercel", "railway"] as const).map((platform) => (
                    <div
                      key={platform}
                      onClick={() => setDeployPlatform(platform)}
                      className={`p-3 rounded-lg border cursor-pointer text-center transition-all ${
                        deployPlatform === platform
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-border/50 hover:border-blue-500/50"
                      }`}
                    >
                      <Server className="h-5 w-5 mx-auto mb-1 text-blue-400" />
                      <span className="text-xs font-medium">
                        {platform === "auto" ? `Auto (${recommendedPlatform})` : platform === "vercel" ? "Vercel" : "Railway"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 3: Deploy */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">3</span>
                  Deploy to Production
                </h4>

                {!pushedRepoName && !((project as any).githubRepoUrl) && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    Push to GitHub first before deploying. Use the "Push to GitHub" button above.
                  </div>
                )}

                {(pushedRepoName || (project as any).githubRepoUrl) && (
                  <Button
                    onClick={() => {
                      const repoName = pushedRepoName || ((project as any).githubRepoUrl?.replace("https://github.com/", "") || "");
                      deployMutation.mutate({
                        projectId: project.id,
                        repoFullName: repoName,
                        customDomain: selectedDomain || undefined,
                        platformOverride: deployPlatform === "auto" ? undefined : deployPlatform,
                      });
                    }}
                    disabled={isDeploying}
                    className="w-full bg-green-600 hover:bg-green-700 gap-2"
                  >
                    {isDeploying ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Deploying...</>
                    ) : (
                      <><Zap className="h-4 w-4" /> Deploy Now{selectedDomain ? ` to ${selectedDomain}` : ""}</>
                    )}
                  </Button>
                )}

                {/* Deploy Result */}
                {deployResult && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-2">
                    <p className="text-sm font-medium text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Deployed Successfully!
                    </p>
                    <div className="text-xs space-y-1">
                      <p><span className="text-muted-foreground">Platform:</span> <span className="font-medium capitalize">{deployResult.platform}</span></p>
                      <p>
                        <span className="text-muted-foreground">Live URL:</span>{" "}
                        <a href={deployResult.url} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                          {deployResult.url} <ExternalLink className="h-3 w-3 inline" />
                        </a>
                      </p>
                      {selectedDomain && (
                        <p className="text-muted-foreground">
                          Custom domain <span className="text-green-400">{selectedDomain}</span> DNS is being configured. It may take up to 48 hours to propagate.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Research Results Component ─────────────────────────────────────

function ResearchResults({ research }: { research: NonNullable<Project["researchData"]> }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-400" />
            Research Results: {research.appName}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{research.description}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Core Features */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Zap className="h-4 w-4 text-amber-400" /> Core Features
              </h4>
              <ul className="space-y-1">
                {research.coreFeatures.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                    <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* UI Patterns */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Layout className="h-4 w-4 text-purple-400" /> UI Patterns
              </h4>
              <div className="flex flex-wrap gap-1">
                {research.uiPatterns.map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                ))}
              </div>
            </div>

            {/* Tech Stack */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Server className="h-4 w-4 text-cyan-400" /> Detected Tech Stack
              </h4>
              <div className="flex flex-wrap gap-1">
                {research.techStackGuess.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>

            {/* Data Models */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Database className="h-4 w-4 text-green-400" /> Data Models
              </h4>
              <ul className="space-y-1">
                {research.dataModels.map((m, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{m}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border/50">
            <div className="text-center">
              <p className="text-lg font-bold text-purple-400">{research.estimatedComplexity}</p>
              <p className="text-xs text-muted-foreground">Complexity</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-blue-400">{research.coreFeatures.length}</p>
              <p className="text-xs text-muted-foreground">Core Features</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-amber-400">{research.mvpFeatures.length}</p>
              <p className="text-xs text-muted-foreground">MVP Features</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-400">{research.fullFeatures.length}</p>
              <p className="text-xs text-muted-foreground">Full Features</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Target Audience</span>
              <p>{research.targetAudience}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Auth Method</span>
              <p>{research.authMethod}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Monetization</span>
              <p>{research.monetization}</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Build Plan Component ───────────────────────────────────────────

function BuildPlanView({ plan }: { plan: NonNullable<Project["buildPlan"]> }) {
  const [expanded, setExpanded] = useState(true);
  const [showFiles, setShowFiles] = useState(false);

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-amber-400" />
            Build Plan: {plan.projectName}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{plan.description}</p>

          {/* Tech Stack */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Frontend</p>
              <p className="text-sm font-medium">{plan.techStack.frontend}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Backend</p>
              <p className="text-sm font-medium">{plan.techStack.backend}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Database</p>
              <p className="text-sm font-medium">{plan.techStack.database}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Other</p>
              <p className="text-sm font-medium">{plan.techStack.other}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-purple-400">{plan.buildSteps.length}</p>
              <p className="text-xs text-muted-foreground">Build Steps</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-400">{plan.estimatedFiles}</p>
              <p className="text-xs text-muted-foreground">Files</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-400">~{plan.estimatedTimeMinutes}m</p>
              <p className="text-xs text-muted-foreground">Est. Time</p>
            </div>
          </div>

          {/* Build Steps */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Build Steps</h4>
            {plan.buildSteps.map((step) => (
              <div key={step.step} className="flex items-start gap-3 p-2 rounded-lg bg-muted/20">
                <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400 shrink-0 mt-0.5">
                  {step.step}
                </div>
                <div className="min-w-0">
                  <p className="text-sm">{step.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {step.files.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs font-mono">{f}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* File Structure Toggle */}
          <Button variant="ghost" size="sm" onClick={() => setShowFiles(!showFiles)}>
            {showFiles ? "Hide" : "Show"} File Structure ({plan.fileStructure.length} files)
            {showFiles ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>

          {showFiles && (
            <div className="space-y-1 font-mono text-xs">
              {plan.fileStructure
                .sort((a, b) => a.priority - b.priority)
                .map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-1 rounded hover:bg-muted/30">
                    <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-purple-400">{f.path}</span>
                    <span className="text-muted-foreground truncate">— {f.description}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Data Models */}
          {plan.dataModels.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Database className="h-4 w-4 text-green-400" /> Data Models
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {plan.dataModels.map((m, i) => (
                  <div key={i} className="p-2 rounded-lg bg-muted/20 text-xs">
                    <span className="font-medium text-green-400">{m.name}</span>
                    <div className="text-muted-foreground mt-1">
                      {m.fields.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* API Routes */}
          {plan.apiRoutes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Server className="h-4 w-4 text-cyan-400" /> API Routes
              </h4>
              <div className="space-y-1 font-mono text-xs">
                {plan.apiRoutes.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs w-14 justify-center ${
                        r.method === "GET" ? "text-green-400 border-green-400/30" :
                        r.method === "POST" ? "text-blue-400 border-blue-400/30" :
                        r.method === "PUT" ? "text-amber-400 border-amber-400/30" :
                        "text-red-400 border-red-400/30"
                      }`}
                    >
                      {r.method}
                    </Badge>
                    <span className="text-purple-400">{r.path}</span>
                    <span className="text-muted-foreground">— {r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Build Log Component ────────────────────────────────────────────

function BuildLogView({ log }: { log: NonNullable<Project["buildLog"]> }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-400" />
            Build Log ({log.length} entries)
          </span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {log.map((entry, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-2 rounded text-xs ${
                  entry.status === "error" ? "bg-red-500/10" :
                  entry.status === "success" ? "bg-emerald-500/5" :
                  "bg-muted/20"
                }`}
              >
                {entry.status === "success" ? (
                  <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-400 shrink-0" />
                ) : entry.status === "error" ? (
                  <XCircle className="h-3 w-3 mt-0.5 text-red-400 shrink-0" />
                ) : entry.status === "running" ? (
                  <Loader2 className="h-3 w-3 mt-0.5 text-blue-400 animate-spin shrink-0" />
                ) : (
                  <Clock className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-muted-foreground shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={entry.status === "error" ? "text-red-400" : ""}>{entry.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Loader2, Sparkles, Building2, ArrowLeft, Target, TrendingUp,
  BarChart3, DollarSign, Users, Briefcase, ChevronDown, ChevronUp, Calendar,
  CheckCircle2, Lightbulb, Globe, Shield,
} from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

function PlanCard({ plan, isExpanded, onToggle }: { plan: any; isExpanded: boolean; onToggle: () => void }) {
  const statusColors: Record<string, string> = {
    draft: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
    generated: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    finalized: "bg-green-600/20 text-green-400 border-green-600/30",
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-800/30">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">{plan.title}</CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-0.5">
                <Calendar className="w-3 h-3 inline mr-1" />
                v{plan.version} — Created {new Date(plan.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColors[plan.status] || statusColors.draft}>
              {plan.status?.charAt(0).toUpperCase() + plan.status?.slice(1)}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          <Separator className="bg-zinc-800" />

          <Tabs defaultValue="executive" className="w-full">
            <TabsList className="bg-zinc-800/50 w-full grid grid-cols-3">
              <TabsTrigger value="executive" className="text-xs">Executive Summary</TabsTrigger>
              <TabsTrigger value="market" className="text-xs">Market Analysis</TabsTrigger>
              <TabsTrigger value="strategy" className="text-xs">Strategy</TabsTrigger>
            </TabsList>

            <TabsContent value="executive" className="mt-4">
              {plan.executiveSummary ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Executive Summary</h4>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{plan.executiveSummary}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No executive summary generated</p>
              )}
            </TabsContent>

            <TabsContent value="market" className="mt-4">
              {plan.marketAnalysis ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Market Analysis</h4>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{plan.marketAnalysis}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No market analysis generated</p>
              )}
            </TabsContent>

            <TabsContent value="strategy" className="mt-4">
              {plan.commercializationStrategy ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Commercialization Strategy</h4>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{plan.commercializationStrategy}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No strategy generated</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

export default function BusinessPlanPage() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const preselectedCompanyId = params.get("companyId");
  const utils = trpc.useUtils();
  const { data: companies } = trpc.companies.list.useQuery();
  const [selectedCompanyId, setSelectedCompanyId] = useState(preselectedCompanyId || "");
  const { data: plans, isLoading } = trpc.businessPlans.list.useQuery(
    { companyId: parseInt(selectedCompanyId) },
    { enabled: !!selectedCompanyId }
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({
    projectTitle: "",
    projectDescription: "",
    targetMarket: "",
    competitiveAdvantage: "",
  });

  const generateMutation = trpc.businessPlans.generate.useMutation({
    onSuccess: () => {
      toast.success("Business plan generated successfully!");
      setGenOpen(false);
      setGenForm({ projectTitle: "", projectDescription: "", targetMarket: "", competitiveAdvantage: "" });
      utils.businessPlans.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/companies")} className="gap-2 text-zinc-400 hover:text-white -ml-2">
        <ArrowLeft className="w-4 h-4" /> Back to Companies
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-400" /> Business Plans
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">AI-generated business plans for grant applications and investor pitches</p>
        </div>
        <Dialog open={genOpen} onOpenChange={setGenOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedCompanyId} className="gap-2 bg-blue-600 hover:bg-blue-700 shrink-0">
              <Sparkles className="w-4 h-4" /> Generate Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" /> Generate Business Plan
              </DialogTitle>
              <DialogDescription>
                Titan will generate a comprehensive business plan including executive summary,
                market analysis, and commercialization strategy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Project Title *</Label>
                <Input
                  value={genForm.projectTitle}
                  onChange={(e) => setGenForm((f) => ({ ...f, projectTitle: e.target.value }))}
                  placeholder="e.g., AI-Powered Credential Manager"
                  className="bg-zinc-900/50 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Project Description *</Label>
                <Textarea
                  value={genForm.projectDescription}
                  onChange={(e) => setGenForm((f) => ({ ...f, projectDescription: e.target.value }))}
                  placeholder="Describe your project, its goals, and the problem it solves..."
                  rows={4}
                  className="bg-zinc-900/50 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Target Market</Label>
                <Input
                  value={genForm.targetMarket}
                  onChange={(e) => setGenForm((f) => ({ ...f, targetMarket: e.target.value }))}
                  placeholder="e.g., Small businesses, enterprises, government..."
                  className="bg-zinc-900/50 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Competitive Advantage</Label>
                <Input
                  value={genForm.competitiveAdvantage}
                  onChange={(e) => setGenForm((f) => ({ ...f, competitiveAdvantage: e.target.value }))}
                  placeholder="What makes your solution unique?"
                  className="bg-zinc-900/50 border-zinc-700"
                />
              </div>
              <Separator className="bg-zinc-800" />
              <Button
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  if (!genForm.projectTitle || !genForm.projectDescription) {
                    return toast.error("Title and description are required");
                  }
                  generateMutation.mutate({
                    companyId: parseInt(selectedCompanyId),
                    projectTitle: genForm.projectTitle,
                    projectDescription: genForm.projectDescription,
                    targetMarket: genForm.targetMarket || undefined,
                    competitiveAdvantage: genForm.competitiveAdvantage || undefined,
                  });
                }}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generateMutation.isPending ? "Generating..." : "Generate Business Plan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 items-end">
        <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
          <SelectTrigger className="max-w-sm bg-zinc-900/50 border-zinc-700">
            <Building2 className="w-4 h-4 mr-2 text-zinc-500" />
            <SelectValue placeholder="Select company..." />
          </SelectTrigger>
          <SelectContent>
            {companies?.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      {plans && plans.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-white">{plans.length}</p>
              <p className="text-xs text-zinc-500 mt-1">Total Plans</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">
                {plans.filter((p: any) => p.status === "generated").length}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Generated</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-400">
                {plans.filter((p: any) => p.status === "finalized").length}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Finalized</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-zinc-500 text-sm">Loading business plans...</p>
          </div>
        </div>
      ) : !selectedCompanyId ? (
        <div className="text-center py-20">
          <Building2 className="w-14 h-14 mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium text-zinc-400">Select a company</h3>
          <p className="text-zinc-500 mt-1 text-sm">Choose a company profile to view or generate business plans</p>
        </div>
      ) : !plans || plans.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-14 h-14 mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium text-zinc-400">No business plans yet</h3>
          <p className="text-zinc-500 mt-1 text-sm max-w-md mx-auto">
            Click "Generate Plan" to create an AI-powered business plan with executive summary,
            market analysis, and commercialization strategy.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan: any) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isExpanded={expandedId === plan.id}
              onToggle={() => setExpandedId(expandedId === plan.id ? null : plan.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

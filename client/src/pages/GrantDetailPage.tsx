import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, DollarSign, Building2, Globe, Target, ExternalLink, Loader2,
  FileText, Calendar, CheckCircle2, Clock, AlertTriangle, Shield, Users,
  Sparkles, TrendingUp, BarChart3, Award, Briefcase, MapPin, Info,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function GrantDetailPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const grantId = parseInt(params.id || "0");
  const { data: grant, isLoading } = trpc.grants.get.useQuery({ id: grantId });
  const { data: companies } = trpc.companies.list.useQuery(undefined, { enabled: isAuthenticated });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const applyMutation = trpc.grantApplications.generate.useMutation({
    onSuccess: () => {
      toast.success("Grant application generated successfully!");
      navigate("/grant-applications");
    },
    onError: (err) => toast.error(err.message),
  });

  const formatAmount = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return null;
    try {
      return new Date(date).toLocaleDateString("en-AU", {
        day: "numeric", month: "long", year: "numeric",
      });
    } catch { return null; }
  };

  const getCompetitivenessColor = (level: string | null | undefined) => {
    if (!level) return "text-zinc-400";
    const l = level.toLowerCase();
    if (l.includes("low")) return "text-green-400";
    if (l.includes("medium") || l.includes("moderate")) return "text-amber-400";
    if (l.includes("high")) return "text-red-400";
    return "text-zinc-400";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
          <p className="text-zinc-500 text-sm">Loading grant details...</p>
        </div>
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-lg font-medium text-zinc-300">Grant not found</h3>
          <p className="text-zinc-500 text-sm">This grant may have been removed or the link is invalid.</p>
          <Button variant="outline" onClick={() => navigate("/grants")} className="gap-2 mt-2">
            <ArrowLeft className="w-4 h-4" /> Back to Grants
          </Button>
        </div>
      </div>
    );
  }

  const deadline = formatDate(grant.applicationDeadline);
  const isExpired = grant.applicationDeadline && new Date(grant.applicationDeadline) < new Date();

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Navigation */}
      <Button variant="ghost" onClick={() => navigate("/grants")} className="gap-2 text-zinc-400 hover:text-white -ml-2">
        <ArrowLeft className="w-4 h-4" /> Back to Grants
      </Button>

      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            <MapPin className="w-3 h-3 mr-1" />
            {grant.country || grant.region}
          </Badge>
          <Badge
            className={
              grant.status === "open"
                ? "bg-green-600/20 text-green-400 border-green-600/30"
                : grant.status === "closed"
                ? "bg-red-600/20 text-red-400 border-red-600/30"
                : "bg-zinc-600/20 text-zinc-400 border-zinc-600/30"
            }
          >
            {grant.status === "open" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
            {grant.status?.charAt(0).toUpperCase() + grant.status?.slice(1)}
          </Badge>
          {grant.competitiveness && (
            <Badge variant="secondary" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" />
              {grant.competitiveness} Competition
            </Badge>
          )}
          {grant.sourceUrl && (
            <Badge variant="outline" className="text-xs bg-blue-900/20 text-blue-400 border-blue-600/30">
              <Shield className="w-3 h-3 mr-1" /> Verified Source
            </Badge>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{grant.title}</h1>

        <div className="flex items-center gap-3 text-zinc-400">
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="text-sm">{grant.agency}</span>
          {grant.programName && (
            <>
              <span className="text-zinc-600">|</span>
              <span className="text-sm text-zinc-500">{grant.programName}</span>
            </>
          )}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium uppercase tracking-wider">Min Funding</span>
            </div>
            <p className="text-xl font-bold text-green-400">{formatAmount(grant.minAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium uppercase tracking-wider">Max Funding</span>
            </div>
            <p className="text-xl font-bold text-emerald-400">{formatAmount(grant.maxAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium uppercase tracking-wider">Deadline</span>
            </div>
            <p className={`text-lg font-bold ${isExpired ? "text-red-400" : "text-amber-400"}`}>
              {deadline || "Rolling"}
            </p>
            {isExpired && <p className="text-xs text-red-500 mt-1">Deadline passed</p>}
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
              <Target className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium uppercase tracking-wider">Phase</span>
            </div>
            <p className="text-lg font-bold text-blue-400">{grant.phase || "Open"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column — Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-400" /> Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{grant.description}</p>
            </CardContent>
          </Card>

          {grant.eligibilityCriteria && (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" /> Eligibility Criteria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{grant.eligibilityCriteria}</p>
              </CardContent>
            </Card>
          )}

          {grant.focusAreas && (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-cyan-400" /> Focus Areas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {grant.focusAreas.split(",").map((area: string, i: number) => (
                    <Badge key={i} variant="secondary" className="bg-zinc-800 text-zinc-300 px-3 py-1">
                      {area.trim()}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column — Actions & Meta */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {grant.url && (
                <a href={grant.url} target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="outline" className="w-full gap-2 justify-start">
                    <ExternalLink className="w-4 h-4" /> Visit Official Page
                  </Button>
                </a>
              )}
              {grant.sourceUrl && grant.sourceUrl !== grant.url && (
                <a href={grant.sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="outline" className="w-full gap-2 justify-start">
                    <Globe className="w-4 h-4" /> View Source API
                  </Button>
                </a>
              )}
              <Button
                variant="outline"
                className="w-full gap-2 justify-start"
                onClick={() => navigate("/grants")}
              >
                <ArrowLeft className="w-4 h-4" /> Browse More Grants
              </Button>
            </CardContent>
          </Card>

          {/* Competition Level */}
          {grant.competitiveness && (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" /> Competition Level
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-lg font-semibold ${getCompetitivenessColor(grant.competitiveness)}`}>
                  {grant.competitiveness}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {grant.competitiveness?.toLowerCase().includes("low")
                    ? "Fewer applicants — higher chance of success"
                    : grant.competitiveness?.toLowerCase().includes("high")
                    ? "Many applicants — strong application needed"
                    : "Moderate number of applicants expected"}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Grant Meta */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Grant Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Agency</span>
                <span className="text-zinc-300 text-right max-w-[60%]">{grant.agency}</span>
              </div>
              <Separator className="bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-zinc-500">Region</span>
                <span className="text-zinc-300">{grant.region}</span>
              </div>
              <Separator className="bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-zinc-500">Country</span>
                <span className="text-zinc-300">{grant.country}</span>
              </div>
              {grant.phase && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Phase</span>
                    <span className="text-zinc-300">{grant.phase}</span>
                  </div>
                </>
              )}
              <Separator className="bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-zinc-500">Status</span>
                <Badge
                  variant="outline"
                  className={
                    grant.status === "open"
                      ? "bg-green-600/10 text-green-400 border-green-600/30"
                      : "bg-zinc-600/10 text-zinc-400 border-zinc-600/30"
                  }
                >
                  {grant.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Application Generator — Full Width */}
      {isAuthenticated && (
        <Card className="bg-gradient-to-br from-blue-950/40 to-purple-950/30 border-blue-800/40">
          <CardHeader>
            <CardTitle className="text-blue-300 flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5" /> AI-Powered Application Generator
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Select a company profile and Titan will generate a tailored grant application with
              executive summary, technical abstract, project description, specific aims, budget
              breakdown, and success probability analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {companies && companies.length > 0 ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className="flex-1 bg-zinc-900/50 border-zinc-700">
                    <SelectValue placeholder="Select your company profile..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3 h-3" />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (!selectedCompanyId) return toast.error("Select a company first");
                    applyMutation.mutate({
                      companyId: parseInt(selectedCompanyId),
                      grantOpportunityId: grantId,
                    });
                  }}
                  disabled={applyMutation.isPending || !selectedCompanyId}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[180px]"
                >
                  {applyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Award className="w-4 h-4" />
                  )}
                  {applyMutation.isPending ? "Generating..." : "Generate Application"}
                </Button>
              </div>
            ) : (
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                <p className="text-zinc-400 text-sm mb-3">
                  You need a company profile to generate grant applications. Create one to get started.
                </p>
                <Button variant="outline" onClick={() => navigate("/companies")} className="gap-2">
                  <Building2 className="w-4 h-4" /> Create Company Profile
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="text-center p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50">
                <FileText className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">Technical Abstract</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50">
                <Target className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">Specific Aims</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50">
                <DollarSign className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">Budget Breakdown</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50">
                <TrendingUp className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">Success Analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

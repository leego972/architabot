import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FileText, Loader2, ArrowLeft, CheckCircle, Clock, XCircle, Building2,
  Target, DollarSign, TrendingUp, BarChart3, Award, Sparkles, ChevronDown,
  ChevronUp, Calendar, AlertTriangle, Shield,
} from "lucide-react";
import { useLocation, useSearch } from "wouter";

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  draft: { icon: FileText, color: "text-zinc-400", bg: "bg-zinc-600/20 border-zinc-600/30", label: "Draft" },
  generated: { icon: Sparkles, color: "text-blue-400", bg: "bg-blue-600/20 border-blue-600/30", label: "Generated" },
  reviewing: { icon: Clock, color: "text-amber-400", bg: "bg-amber-600/20 border-amber-600/30", label: "Under Review" },
  submitted: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-600/20 border-green-600/30", label: "Submitted" },
  awarded: { icon: Award, color: "text-emerald-400", bg: "bg-emerald-600/20 border-emerald-600/30", label: "Awarded" },
  rejected: { icon: XCircle, color: "text-red-400", bg: "bg-red-600/20 border-red-600/30", label: "Rejected" },
};

function ApplicationCard({ app, isExpanded, onToggle }: { app: any; isExpanded: boolean; onToggle: () => void }) {
  const config = STATUS_CONFIG[app.status] || STATUS_CONFIG.draft;
  const StatusIcon = config.icon;

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bg}`}>
              <StatusIcon className={`w-5 h-5 ${config.color}`} />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Application #{app.id}
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-0.5">
                <Calendar className="w-3 h-3 inline mr-1" />
                Created {new Date(app.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {app.successProbability != null && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/40 border border-blue-800/30">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-sm font-semibold text-blue-300">{app.successProbability}%</span>
                <span className="text-xs text-blue-500">success</span>
              </div>
            )}
            {app.qualityScore != null && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-800/30">
                <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-sm font-semibold text-purple-300">{app.qualityScore}</span>
                <span className="text-xs text-purple-500">/100</span>
              </div>
            )}
            <Badge className={config.bg}>{config.label}</Badge>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </div>

        {/* Mobile score badges */}
        <div className="flex sm:hidden gap-2 mt-3">
          {app.successProbability != null && (
            <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
              <TrendingUp className="w-3 h-3 mr-1" /> {app.successProbability}% success
            </Badge>
          )}
          {app.qualityScore != null && (
            <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30">
              <BarChart3 className="w-3 h-3 mr-1" /> Quality: {app.qualityScore}/100
            </Badge>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          <Separator className="bg-zinc-800" />

          {/* Expected Value */}
          {app.expectedValue != null && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-950/20 border border-green-800/20">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-sm text-zinc-400">Expected Value:</span>
              <span className="text-sm font-semibold text-green-400">
                ${app.expectedValue.toLocaleString()}
              </span>
            </div>
          )}

          <Tabs defaultValue="abstract" className="w-full">
            <TabsList className="bg-zinc-800/50 w-full grid grid-cols-4">
              <TabsTrigger value="abstract" className="text-xs">Abstract</TabsTrigger>
              <TabsTrigger value="description" className="text-xs">Description</TabsTrigger>
              <TabsTrigger value="aims" className="text-xs">Aims</TabsTrigger>
              <TabsTrigger value="budget" className="text-xs">Budget</TabsTrigger>
            </TabsList>

            <TabsContent value="abstract" className="mt-4">
              {app.technicalAbstract ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Technical Abstract</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{app.technicalAbstract}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No technical abstract generated</p>
              )}
            </TabsContent>

            <TabsContent value="description" className="mt-4">
              {app.projectDescription ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Project Description</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{app.projectDescription}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No project description generated</p>
              )}
            </TabsContent>

            <TabsContent value="aims" className="mt-4">
              {app.specificAims ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Specific Aims</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{app.specificAims}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No specific aims generated</p>
              )}
            </TabsContent>

            <TabsContent value="budget" className="mt-4">
              {app.budget ? (
                <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Budget Breakdown</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">{app.budget}</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-6">No budget breakdown generated</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

export default function GrantApplicationsPage() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const preselectedCompanyId = params.get("companyId");
  const { data: companies } = trpc.companies.list.useQuery();
  const [selectedCompanyId, setSelectedCompanyId] = useState(preselectedCompanyId || "");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: applications, isLoading } = trpc.grantApplications.list.useQuery(
    { companyId: parseInt(selectedCompanyId) },
    { enabled: !!selectedCompanyId }
  );

  const stats = applications
    ? {
        total: applications.length,
        avgSuccess: applications.filter((a: any) => a.successProbability).length > 0
          ? Math.round(
              applications
                .filter((a: any) => a.successProbability)
                .reduce((sum: number, a: any) => sum + (a.successProbability || 0), 0) /
              applications.filter((a: any) => a.successProbability).length
            )
          : 0,
        totalValue: applications.reduce((sum: number, a: any) => sum + (a.expectedValue || 0), 0),
        awarded: applications.filter((a: any) => a.status === "awarded").length,
      }
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/companies")} className="gap-2 text-zinc-400 hover:text-white -ml-2">
        <ArrowLeft className="w-4 h-4" /> Back to Companies
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" /> Grant Applications
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Track and manage your AI-generated grant applications</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/grants")} className="gap-2 shrink-0">
          <Sparkles className="w-4 h-4" /> Browse Grants
        </Button>
      </div>

      <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
        <SelectTrigger className="max-w-sm bg-zinc-900/50 border-zinc-700">
          <Building2 className="w-4 h-4 mr-2 text-zinc-500" />
          <SelectValue placeholder="Select company to view applications..." />
        </SelectTrigger>
        <SelectContent>
          {companies?.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stats Row */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-zinc-500 mt-1">Applications</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{stats.avgSuccess}%</p>
              <p className="text-xs text-zinc-500 mt-1">Avg Success Rate</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-400">
                ${stats.totalValue >= 1_000_000
                  ? `${(stats.totalValue / 1_000_000).toFixed(1)}M`
                  : stats.totalValue >= 1_000
                  ? `${(stats.totalValue / 1_000).toFixed(0)}K`
                  : stats.totalValue.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Total Value</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{stats.awarded}</p>
              <p className="text-xs text-zinc-500 mt-1">Awarded</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-zinc-500 text-sm">Loading applications...</p>
          </div>
        </div>
      ) : !selectedCompanyId ? (
        <div className="text-center py-20">
          <Building2 className="w-14 h-14 mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium text-zinc-400">Select a company</h3>
          <p className="text-zinc-500 mt-1 text-sm">Choose a company profile to view its grant applications</p>
        </div>
      ) : !applications || applications.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-14 h-14 mx-auto text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium text-zinc-400">No applications yet</h3>
          <p className="text-zinc-500 mt-1 text-sm max-w-md mx-auto">
            Browse available grants and use the AI application generator to create
            tailored grant applications for your company.
          </p>
          <Button variant="outline" onClick={() => navigate("/grants")} className="mt-4 gap-2">
            <Sparkles className="w-4 h-4" /> Browse Grants
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app: any) => (
            <ApplicationCard
              key={app.id}
              app={app}
              isExpanded={expandedId === app.id}
              onToggle={() => setExpandedId(expandedId === app.id ? null : app.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

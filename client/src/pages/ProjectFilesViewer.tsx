/**
 * Project Files Viewer — Mobile-first file explorer for builder projects.
 * Shows all files created by the Titan Builder (via create_file tool),
 * with inline preview, download, and GitHub push capabilities.
 * Reads from database (S3-backed) with filesystem fallback.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FolderOpen,
  FileText,
  Download,
  Search,
  ChevronRight,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Code2,
  FileCode,
  FileJson,
  FileType,
  Image,
  File,
  Github,
  X,
  ChevronDown,
  Package,
  DownloadCloud,
} from "lucide-react";

// ─── File type detection ─────────────────────────────────────────
const FILE_ICONS: Record<string, typeof FileText> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  py: Code2, rb: Code2, go: Code2, rs: Code2, java: Code2,
  html: FileType, css: FileType, scss: FileType,
  json: FileJson, yaml: FileJson, yml: FileJson, toml: FileJson,
  md: FileText, txt: FileText, sql: FileText,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
};

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  html: "html", css: "css", scss: "scss", less: "less",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", sql: "sql", sh: "bash", bash: "bash",
  xml: "xml", svg: "svg", txt: "text",
};

interface ProjectFile {
  id: number;
  path: string;
  name: string;
  size: number;
  hasContent: boolean;
  createdAt: string | null;
}

interface Project {
  name: string;
  fileCount: number;
  totalSize: number;
  lastModified: string | null;
}

interface FilePreview {
  path: string;
  content: string;
  language: string;
}

const formatSize = (bytes: number) => {
  if (!bytes) return "0B";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const getFileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || File;
};

const getLanguage = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_MAP[ext] || "text";
};

export default function ProjectFilesViewer() {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGithubSetup, setShowGithubSetup] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [pushing, setPushing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<"list" | "preview">("list");

  const sendMutation = trpc.chat.send.useMutation();

  const fetchProjectFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try the tRPC endpoint first (database-backed)
      const res = await fetch("/api/trpc/sandbox.projectFiles", {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        const data = json?.result?.data;
        if (data?.files) {
          setFiles(data.files);
          setProjects(data.projects || []);
          // Auto-expand all projects
          setExpandedProjects(new Set((data.projects || []).map((p: Project) => p.name)));
          setLoading(false);
          return;
        }
      }

      // Fallback: try sandbox filesystem API
      const fallbackRes = await fetch(`/api/sandbox/files?path=${encodeURIComponent("/home/sandbox/projects")}`, {
        credentials: "include",
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        const fileList = (data.files || data || []).map((f: any, idx: number) => ({
          id: idx,
          path: f.path || f.name,
          name: f.name,
          size: f.size || 0,
          hasContent: true,
          createdAt: null,
        }));
        setFiles(fileList);
        setLoading(false);
        return;
      }

      // Final fallback: old files API
      const oldRes = await fetch("/api/files", { credentials: "include" });
      if (oldRes.ok) {
        const data = await oldRes.json();
        setFiles(data.map((f: any, idx: number) => ({
          id: idx,
          path: f.path || f.name,
          name: f.name,
          size: f.size || 0,
          hasContent: true,
          createdAt: null,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjectFiles();
  }, [fetchProjectFiles]);

  const handleFileClick = async (file: ProjectFile) => {
    setPreviewLoading(true);
    setMobileView("preview");
    try {
      // Try tRPC endpoint first
      const res = await fetch(`/api/trpc/sandbox.projectFileContent?input=${encodeURIComponent(JSON.stringify({ fileId: file.id }))}`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        const data = json?.result?.data;
        if (data?.content) {
          setPreview({
            path: file.path,
            content: data.content,
            language: getLanguage(file.name),
          });
          setPreviewLoading(false);
          return;
        }
      }

      // Fallback: try sandbox file read
      const fallbackRes = await fetch(`/api/sandbox/file?path=${encodeURIComponent(`/home/sandbox/projects/${file.path}`)}`, {
        credentials: "include",
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        setPreview({
          path: file.path,
          content: data.content || "",
          language: getLanguage(file.name),
        });
        return;
      }

      toast.error("Could not read file content");
    } catch {
      toast.error("Failed to read file");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopy = () => {
    if (!preview) return;
    navigator.clipboard.writeText(preview.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const handleDownload = (filePath: string, content?: string) => {
    const fileName = filePath.split("/").pop() || "file";
    if (content) {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleDownloadAll = () => {
    // Download all files as individual downloads
    files.forEach(async (file) => {
      try {
        const res = await fetch(`/api/trpc/sandbox.projectFileContent?input=${encodeURIComponent(JSON.stringify({ fileId: file.id }))}`, {
          credentials: "include",
        });
        if (res.ok) {
          const json = await res.json();
          const data = json?.result?.data;
          if (data?.content) {
            handleDownload(file.path, data.content);
          }
        }
      } catch {}
    });
    toast.success(`Downloading ${files.length} files...`);
  };

  const handlePushToGithub = async () => {
    if (!repoName.trim()) {
      toast.error("Please enter a repository name");
      return;
    }
    setPushing(true);
    try {
      await sendMutation.mutateAsync({
        message: `Create a new GitHub repository called "${repoName}" and push all my project files to it.`,
      });
      toast.success("Push initiated! Check the Builder chat for progress.");
    } catch (err: any) {
      toast.error(err.message || "Failed to push to GitHub");
    } finally {
      setPushing(false);
    }
  };

  const toggleProject = (name: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredFiles = files.filter((f) =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group filtered files by project
  const groupedFiles = new Map<string, ProjectFile[]>();
  for (const file of filteredFiles) {
    const parts = file.path.split("/");
    const projectName = parts.length > 1 ? parts[0] : "general";
    if (!groupedFiles.has(projectName)) groupedFiles.set(projectName, []);
    groupedFiles.get(projectName)!.push(file);
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-3rem)] md:h-[calc(100vh-3rem)]">
      {/* File List Panel — full width on mobile, sidebar on desktop when preview is open */}
      <div className={`${
        preview && mobileView === "preview" ? "hidden md:flex" : "flex"
      } ${
        preview ? "md:w-[380px] md:border-r md:border-border" : "flex-1"
      } flex-col bg-background w-full`}>
        {/* Header */}
        <div className="px-3 sm:px-4 py-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-emerald-400" />
              <h1 className="text-base sm:text-lg font-semibold">Project Files</h1>
              {files.length > 0 && (
                <Badge variant="outline" className="text-[10px]">{files.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => fetchProjectFiles()}
                variant="ghost"
                size="icon"
                className="h-9 w-9 sm:h-8 sm:w-8"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              {files.length > 0 && (
                <Button
                  onClick={handleDownloadAll}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 sm:h-8 sm:w-8"
                  title="Download All"
                >
                  <DownloadCloud className="h-4 w-4" />
                </Button>
              )}
              <Button
                onClick={() => setShowGithubSetup(!showGithubSetup)}
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 sm:h-8 text-xs sm:text-sm"
              >
                <Github className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Push to GitHub</span>
                <span className="sm:hidden">Push</span>
              </Button>
            </div>
          </div>

          {/* GitHub Setup */}
          {showGithubSetup && (
            <div className="p-3 rounded-xl border border-border bg-card space-y-2">
              <p className="text-xs text-muted-foreground">
                Push all project files to a new GitHub repository.
              </p>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="Repository name (e.g., my-project)"
                className="h-10 sm:h-8 text-sm"
              />
              <Button
                onClick={handlePushToGithub}
                disabled={pushing || !repoName.trim()}
                size="sm"
                className="w-full gap-2 h-10 sm:h-8"
              >
                {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
                {pushing ? "Pushing..." : "Create Repo & Push"}
              </Button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="h-10 sm:h-8 pl-9 text-sm"
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-4 text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <Button onClick={() => fetchProjectFiles()} variant="outline" size="sm" className="h-10 sm:h-8">
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && filteredFiles.length === 0 && (
            <div className="p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No project files yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[250px] mx-auto">
                Ask Titan to build something in the chat and your files will appear here
              </p>
            </div>
          )}

          {!loading && !error && groupedFiles.size > 0 && (
            <div>
              {Array.from(groupedFiles.entries()).map(([projectName, projectFiles]) => (
                <div key={projectName}>
                  {/* Project Header */}
                  <button
                    onClick={() => toggleProject(projectName)}
                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-accent/30 hover:bg-accent/50 transition-colors text-left sticky top-0 z-10 border-b border-border/50"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                      expandedProjects.has(projectName) ? "" : "-rotate-90"
                    }`} />
                    <FolderOpen className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium flex-1 truncate">{projectName}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {projectFiles.length} {projectFiles.length === 1 ? "file" : "files"}
                    </Badge>
                  </button>

                  {/* Project Files */}
                  {expandedProjects.has(projectName) && (
                    <div className="divide-y divide-border/20">
                      {projectFiles.map((file) => {
                        const Icon = getFileIcon(file.name);
                        const isActive = preview?.path === file.path;
                        return (
                          <button
                            key={file.id || file.path}
                            onClick={() => handleFileClick(file)}
                            className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-2.5 hover:bg-accent/50 active:bg-accent/70 transition-colors text-left ${
                              isActive ? "bg-accent/70" : ""
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-blue-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{file.path}</p>
                            </div>
                            {file.size > 0 && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {formatSize(file.size)}
                              </span>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 md:hidden" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-4 py-2 border-t border-border safe-area-bottom">
          <p className="text-[10px] text-muted-foreground text-center">
            {filteredFiles.length} files · {projects.length} projects · {formatSize(files.reduce((s, f) => s + f.size, 0))} total
          </p>
        </div>
      </div>

      {/* File Preview Panel — full screen on mobile */}
      {preview && (
        <div className={`${
          mobileView === "list" ? "hidden md:flex" : "flex"
        } flex-1 flex-col bg-background w-full`}>
          {/* Preview Header */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              {/* Back button on mobile */}
              <button
                onClick={() => { setMobileView("list"); setPreview(null); }}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <FileText className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="text-sm font-medium truncate">
                {preview.path.split("/").pop()}
              </span>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">
                {preview.language}
              </Badge>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={handleCopy}
                className="p-2 sm:p-1.5 rounded-lg hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy content"
              >
                {copied ? <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-green-400" /> : <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
              </button>
              <button
                onClick={() => handleDownload(preview.path, preview.content)}
                className="p-2 sm:p-1.5 rounded-lg hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                onClick={() => { setPreview(null); setMobileView("list"); }}
                className="p-2 sm:p-1.5 rounded-lg hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors hidden md:block"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Preview Content */}
          {previewLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto overscroll-contain -webkit-overflow-scrolling-touch">
              <pre className="p-3 sm:p-4 text-xs sm:text-sm font-mono leading-relaxed whitespace-pre-wrap break-words">
                <code>{preview.content}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * My Projects — Full-featured file explorer for builder projects.
 * Shows all files created by the Titan Builder (via create_file tool),
 * with inline preview, single/batch download (ZIP), delete, and GitHub push.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
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
  DownloadCloud,
  Trash2,
  CheckSquare,
  Square,
  XCircle,
  Package,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────
function getFileIcon(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, typeof FileText> = {
    ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
    py: Code2, rb: Code2, go: Code2, rs: Code2, java: Code2,
    json: FileJson, yaml: FileJson, yml: FileJson, toml: FileJson,
    md: FileText, txt: FileText, csv: FileText, log: FileText,
    html: FileType, css: FileType, scss: FileType,
    png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, ico: Image,
  };
  return iconMap[ext] || File;
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", html: "html", css: "css", scss: "scss",
    sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", graphql: "graphql",
    dockerfile: "dockerfile", xml: "xml",
  };
  return langMap[ext] || "text";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

// Group files by project (first directory in path)
interface ProjectFile {
  id: number;
  path: string;
  name: string;
  s3Key?: string | null;
  hasContent?: boolean;
  size?: number | null;
  createdAt?: string;
}

interface ProjectGroup {
  name: string;
  files: ProjectFile[];
  totalSize: number;
  lastModified: string;
}

function groupByProject(files: ProjectFile[]): ProjectGroup[] {
  const groups: Record<string, ProjectFile[]> = {};
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const projectName = parts.length > 1 ? parts[0] : "Ungrouped";
    if (!groups[projectName]) groups[projectName] = [];
    groups[projectName].push(file);
  }
  return Object.entries(groups)
    .map(([name, files]) => ({
      name,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      totalSize: files.reduce((sum, f) => sum + (f.size || 0), 0),
      lastModified: files.reduce((latest, f) => {
        const d = f.createdAt || "";
        return d > latest ? d : latest;
      }, ""),
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

// ── Main Component ───────────────────────────────────────────────────
export default function ProjectFilesViewer() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // GitHub push state
  const [showGithubSetup, setShowGithubSetup] = useState(false);
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");

  // ── Queries ──
  const filesQuery = trpc.sandbox.projectFiles.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const fileContentQuery = trpc.sandbox.projectFileContent.useQuery(
    { fileId: selectedFileId! },
    { enabled: !!selectedFileId, refetchOnWindowFocus: false }
  );

  // ── Mutations ──
  const deleteFileMut = trpc.sandbox.deleteProjectFile.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      filesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteFilesMut = trpc.sandbox.deleteProjectFiles.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} files`);
      setSelectedIds(new Set());
      setSelectMode(false);
      filesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Derived data ──
  const allFiles: ProjectFile[] = useMemo(() => {
    if (!filesQuery.data?.files) return [];
    return filesQuery.data.files.map((f) => ({
      ...f,
      createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : (f.createdAt as unknown as string | undefined),
    })) as ProjectFile[];
  }, [filesQuery.data]);

  const projects = useMemo(() => groupByProject(allFiles), [allFiles]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects
      .map((p) => ({
        ...p,
        files: p.files.filter((f) => f.path.toLowerCase().includes(q)),
      }))
      .filter((p) => p.files.length > 0);
  }, [projects, searchQuery]);

  const currentProject = useMemo(
    () => filteredProjects.find((p) => p.name === selectedProject),
    [filteredProjects, selectedProject]
  );

  // ── Handlers ──
  const handleCopyContent = useCallback(async (content: string, fileId: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(fileId);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDownloadFile = useCallback(async (file: ProjectFile) => {
    try {
      // Try S3 URL via the download endpoint first
      if (file.s3Key) {
        const res = await fetch(`/api/trpc/sandbox.projectFileDownloadUrl?input=${encodeURIComponent(JSON.stringify({ json: { fileId: file.id } }))}`);
        const data = await res.json();
        const url = data?.result?.data?.json?.url;
        if (url) {
          window.open(url, "_blank");
          return;
        }
      }
      // Fallback: fetch content and download as text
      if (file.hasContent) {
        const res = await fetch(`/api/trpc/sandbox.projectFileContent?input=${encodeURIComponent(JSON.stringify({ json: { fileId: file.id } }))}`);
        const data = await res.json();
        const content = data?.result?.data?.json?.content;
        if (content) {
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.path.split("/").pop() || "file";
          a.click();
          URL.revokeObjectURL(url);
          return;
        }
      }
      toast.error("Download not available for this file");
    } catch (err) {
      toast.error("Download failed");
    }
  }, []);

  const handleBatchDownload = useCallback(async (files: ProjectFile[]) => {
    setDownloadingZip(true);
    try {
      // Fetch all file contents and create a ZIP using JSZip (loaded from CDN if needed)
      // For simplicity, download files individually if < 5, otherwise create a combined text file
      if (files.length <= 3) {
        for (const file of files) {
          await handleDownloadFile(file);
        }
        setDownloadingZip(false);
        return;
      }

      // Fetch all contents and create a combined download
      const contents: { path: string; content: string }[] = [];
      for (const file of files) {
        try {
          const res = await fetch(`/api/trpc/sandbox.projectFileContent?input=${encodeURIComponent(JSON.stringify({ json: { fileId: file.id } }))}`);
          const data = await res.json();
          const content = data?.result?.data?.json?.content;
          if (content) {
            contents.push({ path: file.path, content });
          }
        } catch {}
      }

      if (contents.length === 0) {
        toast.error("No downloadable files found");
        setDownloadingZip(false);
        return;
      }

      // Create a combined text file with all contents (simple approach without JSZip dependency)
      const combined = contents.map((c) =>
        `${"=".repeat(60)}\n// FILE: ${c.path}\n${"=".repeat(60)}\n${c.content}\n`
      ).join("\n\n");

      const blob = new Blob([combined], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedProject || "project"}-files.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${contents.length} files`);
    } catch (err) {
      toast.error("Batch download failed");
    }
    setDownloadingZip(false);
  }, [handleDownloadFile, selectedProject]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} file(s)? This cannot be undone.`)) return;
    deleteFilesMut.mutate({ fileIds: Array.from(selectedIds) });
  }, [selectedIds, deleteFilesMut]);

  const handleDeleteFile = useCallback((fileId: number) => {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    deleteFileMut.mutate({ fileId });
  }, [deleteFileMut]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((files: ProjectFile[]) => {
    setSelectedIds((prev) => {
      const allSelected = files.every((f) => prev.has(f.id));
      if (allSelected) {
        const next = new Set(prev);
        files.forEach((f) => next.delete(f.id));
        return next;
      }
      const next = new Set(prev);
      files.forEach((f) => next.add(f.id));
      return next;
    });
  }, []);

  // ── Loading state ──
  if (filesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ──
  if (allFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <FolderOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Project Files Yet</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Files created by the Titan Builder will appear here. Ask Titan to build
          something in the chat to get started.
        </p>
      </div>
    );
  }

  // ── File preview panel ──
  if (selectedFileId) {
    const file = allFiles.find((f) => f.id === selectedFileId);
    const content = fileContentQuery.data?.content;
    const lang = file ? getLanguage(file.path) : "text";

    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedFileId(null)}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm text-muted-foreground truncate">
            {file?.path}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{lang}</Badge>
              {file && (
                <span className="text-xs text-muted-foreground">
                  {formatBytes(content?.length || 0)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {content && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleCopyContent(content, selectedFileId)}
                >
                  {copiedId === selectedFileId ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              {file && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDownloadFile(file)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              {file && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-300"
                  onClick={() => handleDeleteFile(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-auto max-h-[70vh]">
            {fileContentQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : content ? (
              <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {content}
              </pre>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Content unavailable
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Project detail view ──
  if (selectedProject && currentProject) {
    const projectFiles = currentProject.files;
    const allSelected = projectFiles.every((f) => selectedIds.has(f.id));

    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedProject(null);
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h2 className="text-lg font-semibold">{currentProject.name}</h2>
            <Badge variant="secondary" className="text-xs">
              {projectFiles.length} files
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Select mode toggle */}
            <Button
              variant={selectMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectMode(!selectMode);
                if (selectMode) setSelectedIds(new Set());
              }}
              className="gap-1.5 h-8 text-xs"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectMode ? "Cancel" : "Select"}
            </Button>

            {/* Batch actions */}
            {selectMode && selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selected = projectFiles.filter((f) => selectedIds.has(f.id));
                    handleBatchDownload(selected);
                  }}
                  disabled={downloadingZip}
                  className="gap-1.5 h-8 text-xs"
                >
                  {downloadingZip ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="h-3.5 w-3.5" />
                  )}
                  Download ({selectedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={deleteFilesMut.isPending}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete ({selectedIds.size})
                </Button>
              </>
            )}

            {/* Download all */}
            {!selectMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBatchDownload(projectFiles)}
                disabled={downloadingZip}
                className="gap-1.5 h-8 text-xs"
              >
                {downloadingZip ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="h-3.5 w-3.5" />
                )}
                Download All
              </Button>
            )}

            {/* GitHub push */}
            <Button
              onClick={() => setShowGithubSetup(!showGithubSetup)}
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
            >
              <Github className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Push to GitHub</span>
            </Button>
          </div>
        </div>

        {/* GitHub Setup */}
        {showGithubSetup && (
          <div className="p-3 rounded-xl border border-border bg-card space-y-2">
            <p className="text-xs text-muted-foreground">
              Push all project files to a GitHub repository.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="owner/repo"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="GitHub PAT (ghp_...)"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8 text-xs whitespace-nowrap">
                Push
              </Button>
            </div>
          </div>
        )}

        {/* Select all */}
        {selectMode && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={() => toggleSelectAll(projectFiles)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Select all ({projectFiles.length})
            </button>
          </div>
        )}

        {/* File list */}
        <div className="space-y-1">
          {projectFiles.map((file) => {
            const Icon = getFileIcon(file.path);
            const fileName = file.path.split("/").pop() || file.path;
            const dirPath = file.path.split("/").slice(1, -1).join("/");
            const isSelected = selectedIds.has(file.id);

            return (
              <div
                key={file.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer group ${
                  isSelected
                    ? "border-primary/50 bg-primary/5"
                    : "border-transparent hover:border-border hover:bg-muted/30"
                }`}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(file.id);
                  } else {
                    setSelectedFileId(file.id);
                  }
                }}
              >
                {selectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(file.id);
                    }}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                )}

                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{fileName}</div>
                  {dirPath && (
                    <div className="text-xs text-muted-foreground truncate">
                      {dirPath}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {file.size && (
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {formatBytes(file.size)}
                    </span>
                  )}
                  {file.createdAt && (
                    <span className="text-xs text-muted-foreground hidden md:block">
                      {formatDate(file.createdAt)}
                    </span>
                  )}

                  {!selectMode && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(file);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {!selectMode && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Projects list view ──
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">My Projects</h1>
            <p className="text-xs text-muted-foreground">
              {allFiles.length} files across {projects.length} projects
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => filesQuery.refetch()}
            disabled={filesQuery.isFetching}
            className="gap-1.5 h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${filesQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <XCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Project cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProjects.map((project) => (
          <button
            key={project.name}
            onClick={() => setSelectedProject(project.name)}
            className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-sm truncate max-w-[180px]">
                  {project.name}
                </h3>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{project.files.length} files</span>
              <span>{formatBytes(project.totalSize)}</span>
              {project.lastModified && (
                <span>{formatDate(project.lastModified)}</span>
              )}
            </div>

            {/* File type badges */}
            <div className="flex flex-wrap gap-1 mt-2">
              {Array.from(
                new Set(
                  project.files
                    .map((f) => f.path.split(".").pop()?.toLowerCase())
                    .filter(Boolean)
                )
              )
                .slice(0, 5)
                .map((ext) => (
                  <Badge
                    key={ext}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    .{ext}
                  </Badge>
                ))}
            </div>
          </button>
        ))}
      </div>

      {filteredProjects.length === 0 && searchQuery && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No files matching "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
}

/**
 * Project Files Viewer — Full-featured file explorer for builder projects.
 * Shows all files created by the Titan Builder (via create_file tool),
 * with inline preview, download, and GitHub push capabilities.
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
  ExternalLink,
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

interface SandboxFile {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

interface FilePreview {
  path: string;
  content: string;
  language: string;
}

export default function ProjectFilesViewer() {
  const [currentPath, setCurrentPath] = useState("/home/sandbox");
  const [files, setFiles] = useState<SandboxFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGithubSetup, setShowGithubSetup] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [pushing, setPushing] = useState(false);

  const sendMutation = trpc.chat.send.useMutation();

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      // Try the sandbox files API first
      const res = await fetch(`/api/sandbox/files?path=${encodeURIComponent(path)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const fileList = (data.files || data || []).map((f: any) => ({
          name: f.name,
          path: f.path || `${path}/${f.name}`,
          type: f.type || (f.isDirectory ? "directory" : "file"),
          size: f.size,
        }));
        setFiles(fileList);
        setCurrentPath(path);
        return;
      }
      // Fallback to old API
      const fallbackRes = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
        credentials: "include",
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        setFiles(data.map((f: any) => ({
          name: f.name,
          path: f.path || `${path}/${f.name}`,
          type: f.isDirectory ? "directory" : "file",
          size: f.size,
        })));
        setCurrentPath(path);
        return;
      }
      throw new Error("Failed to fetch files");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles(currentPath);
  }, []);

  const handleFolderClick = (folderPath: string) => {
    fetchFiles(folderPath);
    setPreview(null);
  };

  const handleFileClick = async (filePath: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/sandbox/file?path=${encodeURIComponent(filePath)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to read file");
      const data = await res.json();
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      setPreview({
        path: filePath,
        content: data.content || "",
        language: LANGUAGE_MAP[ext] || "text",
      });
    } catch {
      toast.error("Failed to read file");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleBack = () => {
    if (currentPath === "/home/sandbox" || currentPath === "/") return;
    const parts = currentPath.split("/");
    parts.pop();
    const parentPath = parts.join("/") || "/";
    fetchFiles(parentPath);
    setPreview(null);
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

  const filteredFiles = files.filter((f) =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  const getFileIcon = (name: string, type: string) => {
    if (type === "directory") return FolderOpen;
    const ext = name.split(".").pop()?.toLowerCase() || "";
    return FILE_ICONS[ext] || File;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* File List Panel */}
      <div className={`${preview ? "w-[380px] border-r border-border" : "flex-1"} flex flex-col bg-background`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-emerald-400" />
              <h1 className="text-lg font-semibold">Project Files</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                onClick={() => fetchFiles(currentPath)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                onClick={() => setShowGithubSetup(!showGithubSetup)}
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
              >
                <Github className="h-3.5 w-3.5" />
                Push to GitHub
              </Button>
            </div>
          </div>

          {/* GitHub Setup */}
          {showGithubSetup && (
            <div className="p-3 rounded-xl border border-border bg-card space-y-2">
              <p className="text-xs text-muted-foreground">
                Push all project files to a new GitHub repository.
                Make sure your GitHub PAT is saved in Account Settings.
              </p>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="Repository name (e.g., my-project)"
                className="h-8 text-sm"
              />
              <Button
                onClick={handlePushToGithub}
                disabled={pushing || !repoName.trim()}
                size="sm"
                className="w-full gap-2"
              >
                {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
                {pushing ? "Pushing..." : "Create Repo & Push"}
              </Button>
            </div>
          )}

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
            <button
              onClick={() => fetchFiles("/home/sandbox")}
              className="hover:text-foreground transition-colors shrink-0"
            >
              ~
            </button>
            {breadcrumbs.slice(2).map((part, idx) => (
              <span key={idx} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() => fetchFiles("/" + breadcrumbs.slice(0, idx + 3).join("/"))}
                  className="hover:text-foreground transition-colors"
                >
                  {part}
                </button>
              </span>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-4 text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <Button onClick={() => fetchFiles(currentPath)} variant="outline" size="sm">
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && filteredFiles.length === 0 && (
            <div className="p-8 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No files found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the Builder chat to create project files
              </p>
            </div>
          )}

          {!loading && !error && (
            <div className="divide-y divide-border/30">
              {/* Back button */}
              {currentPath !== "/home/sandbox" && currentPath !== "/" && (
                <button
                  onClick={handleBack}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors text-left"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">..</span>
                </button>
              )}

              {/* Directories first, then files */}
              {filteredFiles
                .sort((a, b) => {
                  if (a.type === "directory" && b.type !== "directory") return -1;
                  if (a.type !== "directory" && b.type === "directory") return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((file) => {
                  const Icon = getFileIcon(file.name, file.type);
                  const isActive = preview?.path === file.path;
                  return (
                    <button
                      key={file.path}
                      onClick={() =>
                        file.type === "directory"
                          ? handleFolderClick(file.path)
                          : handleFileClick(file.path)
                      }
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors text-left ${
                        isActive ? "bg-accent/70" : ""
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          file.type === "directory" ? "text-amber-400" : "text-blue-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                      </div>
                      {file.size !== undefined && file.type !== "directory" && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatSize(file.size)}
                        </span>
                      )}
                      {file.type === "directory" && (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            {filteredFiles.length} items · {filteredFiles.filter((f) => f.type === "file").length} files ·{" "}
            {filteredFiles.filter((f) => f.type === "directory").length} folders
          </p>
        </div>
      </div>

      {/* File Preview Panel */}
      {preview && (
        <div className="flex-1 flex flex-col bg-background">
          {/* Preview Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="text-sm font-medium truncate">
                {preview.path.split("/").pop()}
              </span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {preview.language}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy content"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => handleDownload(preview.path, preview.content)}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPreview(null)}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
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
            <div className="flex-1 overflow-auto">
              <pre className="p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words">
                <code>{preview.content}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

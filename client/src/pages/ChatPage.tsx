import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TitanLogo } from "@/components/TitanLogo";
import AffiliateRecommendations from "@/components/AffiliateRecommendations";
import {
  Send,
  User,
  Trash2,
  Activity,
  Wrench,
  Shield,
  Lock,
  Download,
  Timer,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  Plus,
  MessageSquare,
  Search,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Trash,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  Navigation,
  Code2,
  KeyRound,
  Globe,
  Users,
  Calendar,
  Cpu,
  Mic,
  MicOff,
  Square,
  Terminal,
  Settings,
  ScanLine,
  Hammer,
  LayoutDashboard,
  RefreshCw,
  Eraser,
  FilePlus,
  Paperclip,
  X,
  StopCircle,
  Crown,
  Eye,
  FileCode,
  SearchCode,
  BookOpen,
  Copy,
  Check,
  RotateCcw,
  ArrowDown,
  Menu,
  DollarSign,
  Rocket,
  TrendingUp,
  Banknote,
  HandCoins,
  Target,
  FolderOpen,
  FileText,
  ExternalLink,
  Key,
  Save,
} from "lucide-react";
import { Streamdown } from "streamdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Slash Commands ────────────────────────────────────────────────
interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: 'send' | 'navigate' | 'local';
  prompt?: string;
  path?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', label: 'Help', description: 'Show all capabilities', icon: <HelpCircle className="h-4 w-4" />, action: 'local' },
  { command: '/build', label: 'Build', description: 'Build a new feature or page', icon: <Hammer className="h-4 w-4" />, action: 'send', prompt: 'I want to build a new feature. What would you like me to create? Please describe what you need.' },
  { command: '/scan', label: 'Scan', description: 'Scan for leaked credentials', icon: <ScanLine className="h-4 w-4" />, action: 'send', prompt: 'Run a full credential leak scan across all my stored credentials and report any findings.' },
  { command: '/status', label: 'Status', description: 'Check system health', icon: <Activity className="h-4 w-4" />, action: 'send', prompt: 'Run a full system health check — check server status, database connectivity, and all services.' },
  { command: '/credentials', label: 'Credentials', description: 'Go to credentials vault', icon: <KeyRound className="h-4 w-4" />, action: 'navigate', path: '/fetcher/credentials' },
  { command: '/settings', label: 'Settings', description: 'Go to account settings', icon: <Settings className="h-4 w-4" />, action: 'navigate', path: '/fetcher/account' },
  { command: '/dashboard', label: 'Dashboard', description: 'Go to main dashboard', icon: <LayoutDashboard className="h-4 w-4" />, action: 'navigate', path: '/dashboard' },
  { command: '/leaks', label: 'Leak Scanner', description: 'Go to leak scanner', icon: <Shield className="h-4 w-4" />, action: 'navigate', path: '/fetcher/leak-scanner' },
  { command: '/team', label: 'Team', description: 'Go to team management', icon: <Users className="h-4 w-4" />, action: 'navigate', path: '/fetcher/team' },
  { command: '/sync', label: 'Auto-Sync', description: 'Go to auto-sync settings', icon: <RefreshCw className="h-4 w-4" />, action: 'navigate', path: '/fetcher/auto-sync' },
  { command: '/new', label: 'New Chat', description: 'Start a new conversation', icon: <FilePlus className="h-4 w-4" />, action: 'local' },
  { command: '/clear', label: 'Clear', description: 'Clear current chat', icon: <Eraser className="h-4 w-4" />, action: 'local' },
];

// ─── Help Categories ──────────────────────────────────────────────
const HELP_CATEGORIES = [
  {
    icon: "code2",
    title: "Build & Deploy Software",
    items: [
      "Build entire apps, features, and pages from scratch",
      "Modify existing code across multiple files",
      "Run TypeScript type checks and fix errors",
      "Execute test suites and debug failures",
      "Health check the system and restart services",
      "Roll back changes if something breaks",
    ],
  },
  {
    icon: "keyrnd",
    title: "Credential Management",
    items: [
      "List, reveal, and export saved credentials",
      "Create and manage API keys",
      "Trigger credential fetch jobs from 15+ providers",
      "Bulk sync all credentials at once",
      "Check provider health and availability",
    ],
  },
  {
    icon: "shield",
    title: "Security & Protection",
    items: [
      "Scan for leaked credentials on the dark web",
      "Set up two-factor authentication (2FA)",
      "Activate emergency kill switch",
      "View audit logs of all actions",
      "Manage vault entries securely",
    ],
  },
  {
    icon: "globe",
    title: "Web Research",
    items: [
      "Search the web for any information",
      "Read and extract content from web pages",
      "Research APIs, documentation, and guides",
    ],
  },
  {
    icon: "navigation",
    title: "App Navigation",
    items: [
      'Navigate to any page — just say "take me to..."',
      "2FA Setup → /fetcher/account",
      "Credentials → /fetcher/credentials",
      "Auto-Sync → /fetcher/auto-sync",
      "Leak Scanner → /fetcher/leak-scanner",
      "Team Management → /fetcher/team",
      "Pricing → /pricing",
    ],
  },
  {
    icon: "users",
    title: "Team & Admin",
    items: [
      "Add, remove, and manage team members",
      "Update member roles and permissions",
      "View system status and plan usage",
      "Get AI-powered recommendations",
    ],
  },
  {
    icon: "calendar",
    title: "Automation & Scheduling",
    items: [
      "Create and manage scheduled fetch jobs",
      "Set up auto-sync with custom intervals",
      "Configure watchdog monitoring",
    ],
  },
];

const HELP_ICONS: Record<string, React.ReactNode> = {
  code2: <Code2 className="h-4 w-4" />,
  keyrnd: <KeyRound className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
  globe: <Globe className="h-4 w-4" />,
  navigation: <Navigation className="h-4 w-4" />,
  users: <Users className="h-4 w-4" />,
  calendar: <Calendar className="h-4 w-4" />,
};

const QUICK_ACTION_ICONS: Record<string, React.ReactNode> = {
  activity: <Activity className="h-4 w-4" />,
  wrench: <Wrench className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
  lock: <Lock className="h-4 w-4" />,
  download: <Download className="h-4 w-4" />,
  timer: <Timer className="h-4 w-4" />,
};

const TOOL_LABELS: Record<string, string> = {
  list_credentials: "Listed credentials",
  reveal_credential: "Revealed credential",
  export_credentials: "Exported credentials",
  create_fetch_job: "Created fetch job",
  list_jobs: "Listed fetch jobs",
  get_job_details: "Fetched job details",
  list_providers: "Listed providers",
  list_api_keys: "Listed API keys",
  create_api_key: "Created API key",
  revoke_api_key: "Revoked API key",
  start_leak_scan: "Started leak scan",
  get_leak_scan_results: "Fetched scan results",
  list_vault_entries: "Listed vault entries",
  add_vault_entry: "Added vault entry",
  trigger_bulk_sync: "Triggered bulk sync",
  get_bulk_sync_status: "Fetched sync status",
  list_team_members: "Listed team members",
  add_team_member: "Added team member",
  remove_team_member: "Removed team member",
  update_team_member_role: "Updated member role",
  list_schedules: "Listed schedules",
  create_schedule: "Created schedule",
  delete_schedule: "Deleted schedule",
  get_watchdog_summary: "Fetched watchdog summary",
  check_provider_health: "Checked provider health",
  get_recommendations: "Fetched recommendations",
  get_audit_logs: "Fetched audit logs",
  activate_kill_switch: "Activated kill switch",
  get_system_status: "Fetched system status",
  get_plan_usage: "Fetched plan usage",
  self_read_file: "Read file",
  self_list_files: "Listed files",
  self_modify_file: "Modified file",
  self_health_check: "Health check",
  self_rollback: "Rolled back",
  self_restart: "Restarted service",
  self_modification_history: "Modification history",
  self_get_protected_files: "Protected files list",
  self_type_check: "Type checked",
  self_run_tests: "Ran tests",
  self_multi_file_modify: "Modified multiple files",
  navigate_to_page: "Navigated to page",
  web_search: "Searched the web",
  web_page_read: "Read web page",
};

interface ExecutedAction {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
}

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  actionsTaken?: Array<{ tool: string; success: boolean; summary: string }> | null;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }> | null;
}

// ─── Copy Button ────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-accent/80 text-muted-foreground hover:text-foreground"
      title="Copy message"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── Action Badges ──────────────────────────────────────────────────
function ActionBadges({
  actions,
}: {
  actions: Array<{ tool: string; success: boolean; summary: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (actions.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Zap className="h-3 w-3 text-amber-400" />
        <span className="font-medium">
          {actions.length} action{actions.length > 1 ? "s" : ""} executed
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1">
          {actions.map((action, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[11px] pl-4 py-0.5"
            >
              {action.success ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-red-400 shrink-0" />
              )}
              <span className="text-muted-foreground">
                {TOOL_LABELS[action.tool] || action.tool}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Help Panel ─────────────────────────────────────────────────────
function HelpPanel({ onTryCommand }: { onTryCommand: (cmd: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Titan Assistant — What I Can Do</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        I'm your AI-powered builder and operations assistant. Here's everything I can help with:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {HELP_CATEGORIES.map((cat) => (
          <div
            key={cat.title}
            className="rounded-xl border border-border/50 bg-card/50 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="text-primary">{HELP_ICONS[cat.icon] || <Cpu className="h-4 w-4" />}</div>
              <h4 className="text-sm font-semibold">{cat.title}</h4>
            </div>
            <ul className="space-y-1">
              {cat.items.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary/60 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-border/30">
        <p className="text-xs text-muted-foreground mb-2">Try these commands:</p>
        <div className="flex flex-wrap gap-2">
          {[
            "List my credentials",
            "Set up 2FA",
            "Scan for leaks",
            "Build me a new page",
            "Check system health",
          ].map((cmd) => (
            <button
              key={cmd}
              onClick={() => onTryCommand(cmd)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-accent/50 transition-colors text-foreground"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Sidebar (Desktop) ────────────────────────────────
function ConversationSidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed,
  onToggle,
}: {
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete?: (id: number) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: convData, refetch } = trpc.chat.listConversations.useQuery(
    search ? { search } : undefined,
    { refetchOnWindowFocus: false }
  );

  const renameMutation = trpc.chat.renameConversation.useMutation({
    onSuccess: () => { refetch(); setEditingId(null); },
  });
  const deleteMutation = trpc.chat.deleteConversation.useMutation({
    onSuccess: (_data, variables) => {
      refetch();
      toast.success("Conversation deleted");
      setConfirmDeleteId(null);
      // Reset active conversation if the deleted one was active
      if (variables.conversationId === activeId && onDelete) {
        onDelete(variables.conversationId);
      }
    },
  });
  const pinMutation = trpc.chat.pinConversation.useMutation({
    onSuccess: () => refetch(),
  });
  const archiveMutation = trpc.chat.archiveConversation.useMutation({
    onSuccess: () => { refetch(); toast.success("Conversation archived"); },
  });

  const conversations = convData?.conversations ?? [];

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border/50 flex flex-col items-center py-3 gap-2 shrink-0 bg-background/50">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          onClick={onNew}
          className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border/50 flex flex-col shrink-0 bg-background/50">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Conversations</h3>
        <div className="flex items-center gap-1">
          <button onClick={onNew} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors" title="New conversation">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors" title="Collapse sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 pl-8 text-xs" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {search ? "No conversations found" : "No conversations yet"}
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50 text-foreground"
                }`}
                onClick={() => onSelect(conv.id)}
              >
                {conv.pinned === 1 && <Pin className="h-3 w-3 text-amber-400 shrink-0" />}
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                {/* Confirm delete inline banner */}
                {confirmDeleteId === conv.id ? (
                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] text-destructive font-medium truncate">Delete?</span>
                    <button
                      className="p-1 rounded bg-destructive/20 hover:bg-destructive/40 text-destructive transition-colors shrink-0"
                      title="Confirm delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate({ conversationId: conv.id });
                        setConfirmDeleteId(null);
                      }}
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                    <button
                      className="p-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground transition-colors shrink-0"
                      title="Cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    {editingId === conv.id ? (
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => {
                          if (editTitle.trim()) {
                            renameMutation.mutate({ conversationId: conv.id, title: editTitle.trim() });
                          }
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editTitle.trim()) {
                            renameMutation.mutate({ conversationId: conv.id, title: editTitle.trim() });
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 text-xs bg-transparent border-b border-primary/50 outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 text-xs truncate">{conv.title || "New conversation"}</span>
                    )}

                    {/* Delete button — always visible on mobile, hover on desktop */}
                    <button
                      className={`${
                        isMobile
                          ? "opacity-70"
                          : "opacity-0 group-hover:opacity-100"
                      } p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all shrink-0`}
                      title="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(conv.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    {/* More options dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`${
                            isMobile
                              ? "opacity-70"
                              : "opacity-0 group-hover:opacity-100"
                          } p-0.5 rounded hover:bg-accent transition-all shrink-0`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => { setEditingId(conv.id); setEditTitle(conv.title || ""); }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => pinMutation.mutate({ conversationId: conv.id, pinned: conv.pinned === 1 ? false : true })}>
                          {conv.pinned === 1 ? <><PinOff className="h-3.5 w-3.5 mr-2" /> Unpin</> : <><Pin className="h-3.5 w-3.5 mr-2" /> Pin</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archiveMutation.mutate({ conversationId: conv.id, archived: true })}>
                          <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirmDeleteId(conv.id)} className="text-red-500 focus:text-red-500">
                          <Trash className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground text-center">
          {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Mobile Conversation Drawer ─────────────────────────────────────
function MobileConversationDrawer({
  open,
  onClose,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete?: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: convData } = trpc.chat.listConversations.useQuery(undefined, { refetchOnWindowFocus: false });
  const conversations = convData?.conversations ?? [];
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteMutation = trpc.chat.deleteConversation.useMutation({
    onSuccess: (_data, variables) => {
      utils.chat.listConversations.invalidate();
      toast.success("Conversation deleted");
      setConfirmDeleteId(null);
      // Reset active conversation if the deleted one was active
      if (variables.conversationId === activeId && onDelete) {
        onDelete(variables.conversationId);
      }
    },
  });
  const pinMutation = trpc.chat.pinConversation.useMutation({
    onSuccess: () => utils.chat.listConversations.invalidate(),
  });

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-[280px] bg-background border-r border-border z-50 flex flex-col animate-in slide-in-from-left duration-200">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Conversations</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => { onNew(); onClose(); }} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No conversations yet</div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors ${
                    activeId === conv.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-foreground"
                  }`}
                >
                  <div
                    className="flex-1 flex items-center gap-2 min-w-0 cursor-pointer"
                    onClick={() => { onSelect(conv.id); onClose(); }}
                  >
                    {conv.pinned === 1 && <Pin className="h-3 w-3 text-amber-400 shrink-0" />}
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm truncate">{conv.title || "New conversation"}</span>
                  </div>
                  {/* Delete button — always visible on mobile */}
                  <button
                    className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all shrink-0"
                    title="Delete conversation"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(conv.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-accent transition-all shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => pinMutation.mutate({ conversationId: conv.id, pinned: conv.pinned === 1 ? false : true })}>
                        {conv.pinned === 1 ? <><PinOff className="h-3.5 w-3.5 mr-2" /> Unpin</> : <><Pin className="h-3.5 w-3.5 mr-2" /> Pin</>}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setConfirmDeleteId(conv.id)}
                        className="text-red-500 focus:text-red-500"
                      >
                        <Trash className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
            <h4 className="text-sm font-semibold mb-2">Delete conversation?</h4>
            <p className="text-xs text-muted-foreground mb-4">This will permanently delete this conversation and all its messages. Your project files, sandbox files, and GitHub repos are <strong>not affected</strong>.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({ conversationId: confirmDeleteId })}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Scroll to Bottom Button ────────────────────────────────────────
function ScrollToBottomButton({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement> }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShow(distFromBottom > 100);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [scrollRef]);

  if (!show) return null;

  return (
    <button
      onClick={() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }}
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
      title="Scroll to bottom"
    >
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}


// ─── Main Chat Page ──────────────────────────────────────────────────
export default function ChatPage() {
  const [input, setInput] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [localMessages, setLocalMessages] = useState<ChatMsg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>("Thinking...");
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const isProcessingRef = useRef(false);

  // Real-time Streaming State
  interface StreamEvent {
    type: string;
    tool?: string;
    description?: string;
    summary?: string;
    success?: boolean;
    preview?: string;
    message?: string;
    round?: number;
    timestamp: number;
  }
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [showStreamPanel, setShowStreamPanel] = useState(true);
  const [buildLog, setBuildLog] = useState<StreamEvent[]>([]); // persistent log of all events for the current message
  const eventSourceRef = useRef<EventSource | null>(null);
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();


  // UI state
  const [showHelp, setShowHelp] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // File Upload State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showProjectFiles, setShowProjectFiles] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenValue, setTokenValue] = useState('');
  const [savedTokens, setSavedTokens] = useState<Array<{name: string; preview: string}>>([]);
  const [createdFiles, setCreatedFiles] = useState<Array<{name: string; url: string; size: number; language: string}>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUploadClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = '';
    }
  };

  const transcribeMutation = trpc.voice.transcribe.useMutation();

  // Intercept internal navigation links in chat messages
  const handleChatClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      setLocation(href);
    }
  };

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingDuration(0);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 100) {
          toast.error('Recording too short. Please try again.');
          setIsRecording(false);
          return;
        }

        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.${mimeType.includes('webm') ? 'webm' : 'm4a'}`);
          const uploadRes = await fetch('/api/voice/upload', { method: 'POST', body: formData, credentials: 'include' });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(err.error || 'Failed to upload audio');
          }
          const { url: audioUrl } = await uploadRes.json();
          const result = await transcribeMutation.mutateAsync({ audioUrl });
          if (result.text && result.text.trim()) {
            handleSend(result.text.trim());
          } else {
            toast.error('Could not understand the audio. Please try again.');
          }
        } catch (err: any) {
          console.error('[Voice] Transcription error:', err);
          toast.error(err.message || 'Voice transcription failed. Please try again.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      toast.success('Recording started. Tap stop when done.');
    } catch (err: any) {
      console.error('[Voice] Microphone access error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        toast.error('Could not access microphone. Please check your device settings.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Load conversation messages
  const { data: convDetail, refetch: refetchConv } =
    trpc.chat.getConversation.useQuery(
      { conversationId: activeConversationId! },
      { enabled: !!activeConversationId, refetchOnWindowFocus: false }
    );

  const { data: quickActions } = trpc.chat.quickActions.useQuery(undefined, { refetchOnWindowFocus: false });
  const sendMutation = trpc.chat.send.useMutation();
  const utils = trpc.useUtils();

  // Sync DB messages into local state
  useEffect(() => {
    if (convDetail?.messages) {
      setLocalMessages(
        convDetail.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          actionsTaken: m.actionsTaken,
          toolCalls: m.toolCalls,
        }))
      );
    }
  }, [convDetail]);

  // Clear local messages when switching to new conversation
  useEffect(() => {
    if (!activeConversationId) setLocalMessages([]);
  }, [activeConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [localMessages, isLoading]);

  // Cycle loading phase text
  useEffect(() => {
    if (!isLoading) return;
    const phases = ["Thinking...", "Analyzing request...", "Executing actions...", "Processing results..."];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % phases.length;
      setLoadingPhase(phases[idx]);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Process queued messages after current build finishes
  useEffect(() => {
    if (!isLoading && messageQueue.length > 0 && !isProcessingRef.current) {
      isProcessingRef.current = true;
      const nextMessage = messageQueue[0];
      setMessageQueue((prev) => prev.slice(1));
      // Small delay to let the UI update before sending next message
      const timer = setTimeout(() => {
        isProcessingRef.current = false;
        handleSend(nextMessage);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, messageQueue]);

  // iOS keyboard handling — adjust viewport when keyboard opens
  useEffect(() => {
    if (!isMobile) return;
    const handleResize = () => {
      // Use visualViewport to handle iOS keyboard
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        const offset = window.innerHeight - viewport.height;
        document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
      }
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, [isMobile]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText) return;

    // Non-blocking chat: if a build is running, queue the message
    // instead of blocking. The user can keep chatting.
    if (isLoading) {
      // Add the user message to the chat immediately (optimistic)
      const queuedMsg: ChatMsg = { id: -Date.now(), role: 'user', content: messageText, createdAt: Date.now() };
      setLocalMessages((prev) => [...prev, queuedMsg]);
      setMessageQueue((prev) => [...prev, messageText]);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      toast.info('Message queued — will be sent when the current build finishes.');
      return;
    }

    // Handle slash commands
    const lowerText = messageText.toLowerCase().trim();
    const slashCmd = SLASH_COMMANDS.find(c => c.command === lowerText);
    setShowSlashMenu(false);

    if (lowerText === '/help' || lowerText === 'help') {
      setInput('');
      setShowHelp(true);
      const helpUserMsg: ChatMsg = { id: -Date.now(), role: 'user', content: messageText, createdAt: Date.now() };
      setLocalMessages((prev) => [...prev, helpUserMsg]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (lowerText === '/new') {
      setInput('');
      handleNewConversation();
      toast.success('New conversation started');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (lowerText === '/clear') {
      setInput('');
      setLocalMessages([]);
      setShowHelp(false);
      toast.success('Chat cleared');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (slashCmd?.action === 'navigate' && slashCmd.path) {
      setInput('');
      setLocation(slashCmd.path);
      toast.success(`Navigating to ${slashCmd.label}`);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (slashCmd?.action === 'send' && slashCmd.prompt) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      handleSend(slashCmd.prompt);
      return;
    }

    setShowHelp(false);

    // Optimistic user message
    const tempId = -Date.now();
    const userMsg: ChatMsg = { id: tempId, role: "user", content: messageText, createdAt: Date.now() };
    setLocalMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSelectedFiles([]);
    setIsLoading(true);
    setLoadingPhase("Thinking...");
    setStreamEvents([{ type: 'thinking', message: 'Processing your request...', timestamp: Date.now() }]);
    setBuildLog([]);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Pre-create conversation if this is a new chat, so we can connect SSE before sending
    let convIdForStream = activeConversationId;
    if (!convIdForStream) {
      try {
        const newConv = await utils.client.chat.createConversation.mutate({});
        convIdForStream = newConv.id;
        setActiveConversationId(newConv.id);
        utils.chat.listConversations.invalidate();
      } catch {
        // Failed to pre-create — sendMessage will create it server-side
      }
    }

    // Connect to SSE stream for real-time events
    if (convIdForStream) {
      try {
        const es = new EventSource(`/api/chat/stream/${convIdForStream}`);
        eventSourceRef.current = es;
        es.addEventListener('tool_start', (e) => {
          const data = JSON.parse(e.data);
          const evt: StreamEvent = { type: 'tool_start', tool: data.tool, description: data.description, round: data.round, timestamp: Date.now() };
          setStreamEvents(prev => [...prev, evt]);
          setBuildLog(prev => [...prev, evt]);
          setLoadingPhase(data.description || `Using ${data.tool.replace(/_/g, ' ')}...`);
        });
        es.addEventListener('tool_result', (e) => {
          const data = JSON.parse(e.data);
          const evt: StreamEvent = { type: 'tool_result', tool: data.tool, success: data.success, summary: data.summary, preview: data.preview, round: data.round, timestamp: Date.now() };
          setStreamEvents(prev => [...prev, evt]);
          setBuildLog(prev => [...prev, evt]);
        });
        es.addEventListener('thinking', (e) => {
          const data = JSON.parse(e.data);
          const evt: StreamEvent = { type: 'thinking', message: data.message, round: data.round, timestamp: Date.now() };
          setStreamEvents(prev => [...prev, evt]);
          setBuildLog(prev => [...prev, evt]);
          setLoadingPhase(data.message || 'Thinking...');
        });
        es.addEventListener('done', () => { es.close(); eventSourceRef.current = null; });
        es.addEventListener('error', () => { es.close(); eventSourceRef.current = null; });
        es.addEventListener('aborted', () => { es.close(); eventSourceRef.current = null; });
      } catch {
        // SSE connection failed — continue without streaming
      }
    }

    try {
      // Upload files and append their URLs to the message
      let finalMessage = messageText;
      if (selectedFiles.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of selectedFiles) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch('/api/chat/upload', {
              method: 'POST',
              body: formData,
              credentials: 'include',
            });
            if (uploadRes.ok) {
              const { url } = await uploadRes.json();
              uploadedUrls.push(`[Attached file: ${file.name}](${url})`);
            }
          } catch (e) {
            console.error('File upload failed:', e);
          }
        }
        if (uploadedUrls.length > 0) {
          finalMessage += '\n\n' + uploadedUrls.join('\n');
          finalMessage += '\n\nPlease read the attached file(s) using the read_uploaded_file tool to see their contents.';
        }
      }
      const result = await sendMutation.mutateAsync({
        message: finalMessage,
        conversationId: convIdForStream || undefined,
      });

      // If conversation was created server-side (fallback), update the ID
      if (!convIdForStream && result.conversationId) {
        setActiveConversationId(result.conversationId);
        utils.chat.listConversations.invalidate();
      }

      const assistantMsg: ChatMsg = {
        id: -Date.now() - 1,
        role: "assistant",
        content: result.response,
        createdAt: Date.now(),
        actionsTaken: result.actions
          ? result.actions.map((a: ExecutedAction) => {
              let summary = a.success ? `Executed ${a.tool}` : `Failed ${a.tool}`;
              const d = a.result as any;
              if (d) {
                switch (a.tool) {
                  case "self_type_check":
                    summary = d.passed ? "TypeScript: 0 errors" : `TypeScript: ${d.errorCount} error(s)`;
                    break;
                  case "self_run_tests":
                    summary = d.passed ? `Tests: ${d.totalTests} passed` : `Tests: ${d.failedTests}/${d.totalTests} failed`;
                    break;
                  case "self_modify_file":
                    summary = a.success ? `Modified ${a.args?.filePath || "file"}` : `Failed to modify ${a.args?.filePath || "file"}`;
                    break;
                  case "self_multi_file_modify":
                    summary = d.summary || (a.success ? `${(d.modifications || []).length} file(s) modified` : "Multi-file modify failed");
                    break;
                  case "self_health_check":
                    summary = d.healthy ? "All systems healthy" : `${(d.checks || []).filter((c: any) => !c.passed).length} issue(s) detected`;
                    break;
                  case "self_rollback":
                    summary = a.success ? `Rolled back (${d.filesRestored || 0} files restored)` : "Rollback failed";
                    break;
                  case "self_restart":
                    summary = a.success ? "Server restart triggered" : "Restart failed";
                    break;
                  case "self_read_file":
                    summary = `Read ${a.args?.filePath || "file"} (${d.length || 0} chars)`;
                    break;
                  case "self_list_files":
                    summary = `Listed ${d.count || 0} files in ${a.args?.dirPath || "directory"}`;
                    break;
                  case "create_file":
                    summary = a.success ? `Created ${d.fileName || a.args?.fileName || "file"} (${d.size ? (d.size < 1024 ? d.size + 'B' : (d.size / 1024).toFixed(1) + 'KB') : ''})` : `Failed to create ${a.args?.fileName || "file"}`;
                    break;
                  case "create_github_repo":
                    summary = a.success ? `Created repo: ${d.repoFullName || a.args?.name}` : `Failed to create repo`;
                    break;
                  case "push_to_github":
                    summary = a.success ? `Pushed ${d.filesPushed || 0} files to ${d.repoFullName || a.args?.repoFullName}` : `Failed to push to GitHub`;
                    break;
                  case "read_uploaded_file":
                    summary = a.success ? `Read uploaded file (${d.size || 0} chars)` : `Failed to read file`;
                    break;
                }
              }
              return { tool: a.tool, success: a.success, summary };
            })
          : null,
      };

      setLocalMessages((prev) => [...prev, assistantMsg]);

      // Track created files for the project files panel
      if (result.actions && result.actions.length > 0) {
        const newFiles = result.actions
          .filter((a: ExecutedAction) => a.tool === 'create_file' && a.success && a.result)
          .map((a: ExecutedAction) => {
            const d = a.result as any;
            return {
              name: d.fileName || (a.args as any)?.fileName || 'unknown',
              url: d.url || '',
              size: d.size || 0,
              language: d.language || 'text',
            };
          });
        if (newFiles.length > 0) {
          setCreatedFiles(prev => [...prev, ...newFiles]);
          setShowProjectFiles(true);
        }
      }
      if (result.actions && result.actions.length > 0) {
        const successCount = result.actions.filter((a: ExecutedAction) => a.success).length;
        const failCount = result.actions.length - successCount;
        if (failCount === 0) {
          toast.success(`${successCount} action${successCount > 1 ? "s" : ""} completed`);
        } else {
          toast.warning(`${successCount} succeeded, ${failCount} failed`);
        }
      }

      utils.chat.listConversations.invalidate();
    } catch (err: any) {
      const serverMessage = err?.message || err?.data?.message || "";
      if (serverMessage.toLowerCase().includes("credit")) {
        toast.error(serverMessage);
      } else if (serverMessage.toLowerCase().includes("unauthorized") || serverMessage.toLowerCase().includes("session")) {
        toast.error("Session expired. Please refresh the page and try again.");
      } else {
        toast.error(serverMessage || "Failed to get response. Please try again.");
      }
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
      setStreamEvents([]);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setLocalMessages([]);
    setShowHelp(false);
  };

  const handleSelectConversation = (id: number) => {
    setActiveConversationId(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIdx(prev => Math.min(prev + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIdx(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashSelectedIdx];
        if (cmd) {
          setInput(cmd.command);
          setShowSlashMenu(false);
          if (e.key === 'Enter') handleSend(cmd.command);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";

    if (val.startsWith('/')) {
      setSlashFilter(val.toLowerCase());
      setShowSlashMenu(true);
      setSlashSelectedIdx(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  const filteredSlashCommands = SLASH_COMMANDS.filter(c =>
    slashFilter ? c.command.startsWith(slashFilter) || c.label.toLowerCase().includes(slashFilter.slice(1)) : true
  );

  const showEmptyState = localMessages.length === 0 && !isLoading;

  // Handle regenerate last message
  const handleRegenerate = () => {
    const lastUserMsg = [...localMessages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Remove the last assistant message
      setLocalMessages(prev => {
        const idx = prev.length - 1;
        if (prev[idx]?.role === 'assistant') return prev.slice(0, idx);
        return prev;
      });
      handleSend(lastUserMsg.content);
    }
  };

  const lastMessage = localMessages[localMessages.length - 1];
  const canRegenerate = lastMessage?.role === 'assistant' && !isLoading;


  return (
    <div className={`chat-page-root flex ${isMobile ? 'h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)]' : 'h-[calc(100vh-3rem)]'}`}>
      {/* Mobile Conversation Drawer */}
      {isMobile && (
        <MobileConversationDrawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          activeId={activeConversationId}
          onDelete={() => handleNewConversation()}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />
      )}

      {/* Desktop Conversation Sidebar */}
      {!isMobile && (
        <ConversationSidebar
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={() => handleNewConversation()}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* Main chat area */}
      <div className={`flex-1 flex flex-col min-w-0 ${showProjectFiles && !isMobile ? 'mr-[360px]' : ''}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-sm shrink-0 ${isMobile ? 'px-2 py-2 min-h-[48px]' : 'px-4 pb-3 pt-1'}`}>
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            {/* Mobile: Conversation list button */}
            {isMobile && (
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0 touch-target"
                aria-label="Open conversations"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
              <TitanLogo size="sm" className="!h-7 !w-7 sm:!h-9 sm:!w-9" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-lg font-semibold tracking-tight truncate">
                Titan Assistant
              </h1>
              {!isMobile && (
                <p className="text-[11px] text-muted-foreground">
                  Executes real actions on your behalf
                </p>
              )}
            </div>
            {!isMobile && (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 ml-1 shrink-0">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                Actions Enabled
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {createdFiles.length > 0 && (
              <button
                onClick={() => setShowProjectFiles(!showProjectFiles)}
                className={`flex items-center gap-1 rounded-lg font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all touch-target ${isMobile ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                {!isMobile && `Files (${createdFiles.length})`}
                {isMobile && createdFiles.length}
              </button>
            )}
            <button
              onClick={() => setShowTokenInput(!showTokenInput)}
              className={`flex items-center gap-1 rounded-lg font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all touch-target ${isMobile ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
              title="Add API tokens for the builder to use"
            >
              <Key className="h-3.5 w-3.5 shrink-0" />
              {!isMobile && `Tokens${savedTokens.length > 0 ? ` (${savedTokens.length})` : ''}`}
              {isMobile && savedTokens.length > 0 && savedTokens.length}
            </button>
            {isMobile && (
              <button
                onClick={handleNewConversation}
                className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors touch-target"
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages area with scroll-to-bottom */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={scrollRef}
            onClick={handleChatClick}
            className={`absolute inset-0 overflow-y-auto scroll-smooth ${isMobile ? 'px-3 py-3' : 'px-4 py-4'}`}
          >
            <div className="max-w-3xl mx-auto space-y-4">
              {showEmptyState ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-2">
                  <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <TitanLogo size="xl" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold mb-2">Welcome, I am Titan.</h2>
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      How can I help you today? Ask me anything — I can build, research, analyse, and assist with your projects.
                    </p>
                  </div>

                  {/* Quick actions */}
                  {quickActions && quickActions.length > 0 && (
                    <div className={`grid gap-2 max-w-lg w-full ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {quickActions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => handleSend(action.prompt)}
                          className="flex items-center gap-2 p-3 rounded-xl border border-border/50 bg-card hover:bg-accent/50 transition-all text-left group active:scale-[0.98]"
                        >
                          <div className="text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                            {QUICK_ACTION_ICONS[action.icon] || <TitanLogo size="sm" className="!h-4 !w-4" />}
                          </div>
                          <span className="text-xs font-medium leading-tight">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ─── Funding Features Showcase ─── */}
                  <div className="max-w-lg w-full mt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Funding & Growth Tools</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => setLocation("/grants")}
                        className="flex items-start gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all text-left group"
                      >
                        <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                          <HandCoins className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Grant Finder</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Discover R&D and startup grants tailored to your business</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setLocation("/crowdfunding")}
                        className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-all text-left group"
                      >
                        <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                          <Rocket className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Crowdfunding</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Launch campaigns and rally community support for your projects</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setLocation("/affiliate")}
                        className="flex items-start gap-3 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-all text-left group"
                      >
                        <div className="h-9 w-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                          <TrendingUp className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Affiliate Program</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Earn commissions by referring users and promoting Titan tools</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setLocation("/marketplace")}
                        className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all text-left group"
                      >
                        <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                          <Banknote className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Tech Bazaar</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Sell your code, modules, and AI systems — earn 92% of every sale</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Affiliate recommendations */}
                  <AffiliateRecommendations context="ai_chat" variant="banner" className="max-w-lg w-full mt-2" />
                </div>
              ) : (
                <>
                  {localMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2 sm:gap-3 group ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                          <TitanLogo size="sm" />
                        </div>
                      )}
                      <div className="flex flex-col max-w-[85%] sm:max-w-[80%] min-w-0 overflow-hidden">
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted/50 border border-border/50 rounded-bl-md"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <>
                              {msg.actionsTaken && msg.actionsTaken.length > 0 && (
                                <>
                                <ActionBadges actions={msg.actionsTaken} />
                                {/* Inline file cards for created files */}
                                {msg.actionsTaken.filter(a => a.tool === 'create_file' && a.success).length > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    {msg.actionsTaken.filter(a => a.tool === 'create_file' && a.success).map((a, fi) => (
                                      <div key={fi} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                                        <FileText className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                        <span className="font-medium text-emerald-300 truncate">{a.summary.replace('Created ', '')}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                </>
                              )}
                              <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-words [&_table]:max-w-full [&_table]:overflow-x-auto [&_img]:max-w-full">
                                <Streamdown>{msg.content}</Streamdown>
                              </div>
                            </>
                          ) : (
                            <p className="whitespace-pre-wrap break-words overflow-hidden">{msg.content}</p>
                          )}
                        </div>
                        {/* Action buttons below assistant messages */}
                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-1 mt-1 ml-1">
                            <CopyButton text={msg.content} />
                          </div>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Persistent Build Log — shows after build completes */}
                  {!isLoading && buildLog.length > 2 && (
                    <div className="flex gap-2 sm:gap-3 justify-start">
                      <div className="w-7 sm:w-8 shrink-0" />
                      <details className="max-w-[90%] sm:max-w-[80%] group">
                        <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors py-1">
                          <Activity className="h-3 w-3" />
                          <span>Build log ({buildLog.filter(e => e.type === 'tool_start').length} actions)</span>
                        </summary>
                        <div className="mt-1 ml-5 space-y-0.5 border-l-2 border-border/30 pl-3 py-1">
                          {buildLog.map((evt, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                              {evt.type === 'thinking' && (
                                <><Cpu className="h-3 w-3 text-blue-400/60 shrink-0 mt-0.5" /><span className="text-muted-foreground">{evt.message}</span></>
                              )}
                              {evt.type === 'tool_start' && (
                                <><Activity className="h-3 w-3 text-amber-400/60 shrink-0 mt-0.5" /><span className="text-muted-foreground">{evt.description || (evt.tool || '').replace(/_/g, ' ')}</span></>
                              )}
                              {evt.type === 'tool_result' && evt.success && (
                                <><CheckCircle2 className="h-3 w-3 text-emerald-400/60 shrink-0 mt-0.5" /><span className="text-muted-foreground">{evt.summary || 'Done'}</span></>
                              )}
                              {evt.type === 'tool_result' && !evt.success && (
                                <><XCircle className="h-3 w-3 text-red-400/60 shrink-0 mt-0.5" /><span className="text-red-400/80">{evt.summary || 'Failed'}</span></>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}

                  {/* Help panel */}
                  {showHelp && (
                    <div className="flex gap-2 sm:gap-3 justify-start">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                        <TitanLogo size="sm" />
                      </div>
                      <div className="max-w-[90%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 bg-muted/50 border border-border/50 rounded-bl-md">
                        <HelpPanel onTryCommand={(cmd) => { setShowHelp(false); handleSend(cmd); }} />
                      </div>
                    </div>
                  )}

                  {/* Loading indicator with real-time activity stream */}
                  {isLoading && (
                    <div className="flex gap-2 sm:gap-3 justify-start">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                        <TitanLogo size="sm" />
                      </div>
                      <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-md px-3.5 py-2.5 sm:px-4 sm:py-3 min-w-[240px] sm:min-w-[280px] max-w-[90%]">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="font-medium text-xs sm:text-sm">{loadingPhase}</span>
                          </div>
                          <button
                            onClick={() => setShowStreamPanel(!showStreamPanel)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showStreamPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {/* Real-time activity feed — thought process & build log */}
                        {showStreamPanel && streamEvents.length > 0 && (
                          <div className="space-y-1 border-t border-border/30 pt-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                            {streamEvents.slice(-12).map((evt, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                                {evt.type === 'thinking' && (
                                  <><Cpu className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" /><span className="text-blue-400">{evt.message || 'Thinking...'}</span></>
                                )}
                                {evt.type === 'tool_start' && (
                                  <><Activity className="h-3 w-3 text-amber-400 shrink-0 mt-0.5 animate-pulse" /><span className="text-amber-400">{evt.description || (evt.tool || '').replace(/_/g, ' ')}</span></>
                                )}
                                {evt.type === 'tool_result' && evt.success && (
                                  <><CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" /><span className="text-emerald-400">{evt.summary || `${(evt.tool || '').replace(/_/g, ' ')} — done`}</span></>
                                )}
                                {evt.type === 'tool_result' && !evt.success && (
                                  <><XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" /><span className="text-red-400">{evt.summary || `${(evt.tool || '').replace(/_/g, ' ')} — failed`}</span></>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Stop button */}
                        <div className="mt-2 pt-2 border-t border-border/30">
                          <Button
                            onClick={async () => {
                              try {
                                if (activeConversationId) {
                                  await fetch(`/api/chat/abort/${activeConversationId}`, { method: 'POST' });
                                }
                                if (eventSourceRef.current) {
                                  eventSourceRef.current.close();
                                  eventSourceRef.current = null;
                                }
                                setIsLoading(false);
                                setStreamEvents([]);
                                toast.info('Request cancelled');
                              } catch {
                                toast.error('Failed to cancel request');
                              }
                            }}
                            variant="ghost"
                            size="sm"
                            className="w-full h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
                          >
                            <StopCircle className="h-3.5 w-3.5" />
                            Stop Generating
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Regenerate button */}
                  {canRegenerate && (
                    <div className="flex justify-center">
                      <button
                        onClick={handleRegenerate}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Regenerate response
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Scroll to bottom button */}
          <ScrollToBottomButton scrollRef={scrollRef as React.RefObject<HTMLDivElement>} />
        </div>

        {/* Input area */}
        <div className={`border-t border-border/50 bg-background/80 backdrop-blur-sm shrink-0 ${isMobile ? 'px-3 pt-2' : 'px-4 pt-3 pb-2'}`} style={isMobile ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' } : undefined}>
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-3 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-400 font-medium">Recording... {formatDuration(recordingDuration)}</span>
              <div className="flex-1" />
              <Button onClick={stopRecording} size="sm" variant="ghost" className="h-8 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/20">
                <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
                Stop
              </Button>
            </div>
          )}

          {/* Transcribing indicator */}
          {isTranscribing && (
            <div className="flex items-center gap-3 mb-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-xl">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-primary font-medium">Transcribing your voice...</span>
            </div>
          )}

          {/* Selected files preview */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/30 rounded-lg">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-1 bg-background px-2 py-1 rounded-md border border-border/50">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs truncate max-w-[100px] sm:max-w-[120px]">{file.name}</span>
                  <button
                    onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main input row */}
          <div className="relative">
            {/* Slash command autocomplete dropdown */}
            {showSlashMenu && filteredSlashCommands.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover text-popover-foreground border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-[280px] overflow-y-auto">
                <div className="px-3 py-1.5 border-b border-border/50">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Slash Commands</span>
                </div>
                {filteredSlashCommands.map((cmd, idx) => (
                  <button
                    key={cmd.command}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      idx === slashSelectedIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    }`}
                    onMouseEnter={() => setSlashSelectedIdx(idx)}
                    onClick={() => {
                      setInput(cmd.command);
                      setShowSlashMenu(false);
                      handleSend(cmd.command);
                    }}
                  >
                    <div className={`shrink-0 text-primary/70 ${idx === slashSelectedIdx ? 'text-primary' : ''}`}>{cmd.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{cmd.command}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {cmd.action === 'navigate' ? 'Navigate' : cmd.action === 'send' ? 'Action' : 'Local'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                    </div>
                  </button>
                ))}
                <div className="px-3 py-1.5 border-t border-border/50 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">↑↓ Navigate</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">Tab to select</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">Enter to run</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">Esc to close</span>
                </div>
              </div>
            )}

            {/* Input container with integrated buttons */}
            <div className="flex items-end gap-1.5">
              {/* Action buttons - always side-by-side for accessibility */}
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading || isTranscribing}
                  className={`flex items-center justify-center rounded-xl transition-all touch-target ${
                    isMobile ? 'h-[44px] w-[44px]' : 'h-10 w-10'
                  } ${
                    isRecording
                      ? 'bg-red-500/20 text-red-400 animate-pulse ring-1 ring-red-500/50'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/10 border border-border/50 hover:border-primary/50'
                  } disabled:opacity-50 disabled:pointer-events-none`}
                  title={isRecording ? 'Stop recording' : 'Voice input'}
                >
                  {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
                </button>

                <button
                  onClick={handleFileUploadClick}
                  className={`flex items-center justify-center rounded-xl border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 hover:border-primary/50 transition-all touch-target ${
                    isMobile ? 'h-[44px] w-[44px]' : 'h-10 w-10'
                  }`}
                  title="Upload files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.xml,.zip"
                  className="hidden"
                />
              </div>

              {/* Textarea */}
              <div className="flex-1 min-w-0">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isLoading ? 'Titan is building... type here to queue a message'
                    : isRecording ? 'Recording... tap Stop when done'
                    : isTranscribing ? 'Transcribing...'
                    : isMobile ? 'Ask Titan anything...'
                    : 'Ask Titan anything — type / for commands...'
                  }
                  className={`resize-none rounded-xl border-border/50 focus-visible:ring-primary/30 leading-relaxed ${
                    isMobile ? 'min-h-[44px] max-h-[120px] text-[16px] py-2.5' : 'min-h-[56px] max-h-[200px] text-base py-3'
                  }`}
                  rows={1}
                  disabled={isRecording || isTranscribing}
                />
              </div>

              {/* Send button */}
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isRecording || isTranscribing}
                size="icon"
                className={`rounded-xl shrink-0 touch-target ${isMobile ? 'h-[44px] w-[44px]' : 'h-10 w-10'}`}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Queued messages indicator */}
          {messageQueue.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              <span className="text-[11px] text-amber-500 font-medium">
                {messageQueue.length} message{messageQueue.length !== 1 ? 's' : ''} queued — will send after current build
              </span>
            </div>
          )}

          {/* Footer hint */}
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            <button onClick={isRecording ? stopRecording : startRecording} className="text-primary hover:underline cursor-pointer">
              <Mic className="h-3 w-3 inline-block mr-0.5 -mt-0.5" />Voice
            </button>
            {' · '}
            <button onClick={() => handleSend('/help')} className="text-primary hover:underline cursor-pointer">/help</button>
            {' · Conversations saved automatically · Powered by AI'}
          </p>
        </div>
      </div>
      {/* Token Input Panel */}
      {showTokenInput && (
        <div className={`${isMobile ? 'fixed inset-0 z-50 bg-background' : 'fixed right-0 top-0 bottom-0 w-[360px] border-l border-border'} flex flex-col bg-background`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-400" />
              <h3 className="font-semibold text-sm">API Tokens & Keys</h3>
            </div>
            <button onClick={() => setShowTokenInput(false)} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-xs text-muted-foreground">Add API tokens here for the builder to use in your projects. These are saved securely and accessible by the AI when building.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Token Name</label>
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g. OpenAI API Key, Stripe Secret..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Token Value</label>
                <input
                  type="password"
                  value={tokenValue}
                  onChange={(e) => setTokenValue(e.target.value)}
                  placeholder="sk-... or pk_live_..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <Button
                onClick={async () => {
                  if (!tokenName.trim() || !tokenValue.trim()) {
                    toast.error('Both name and value are required');
                    return;
                  }
                  try {
                    // Save directly to encrypted vault via tRPC
                    // Use fetch to call tRPC mutation directly (can't use hooks in event handlers)
                    const resp = await fetch('/api/trpc/vault.add', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        json: {
                          name: tokenName.trim(),
                          credentialType: 'api_token',
                          value: tokenValue.trim(),
                          notes: 'Manually added via Builder token input',
                        },
                      }),
                    });
                    if (!resp.ok) {
                      const errData = await resp.json().catch(() => ({}));
                      throw new Error(errData?.error?.message || 'Failed to save token');
                    }
                    const preview = tokenValue.length > 10
                      ? tokenValue.substring(0, 6) + '...' + tokenValue.substring(tokenValue.length - 4)
                      : '••••••';
                    setSavedTokens(prev => [...prev, { name: tokenName, preview }]);
                    setTokenName('');
                    setTokenValue('');
                    toast.success(`Token "${tokenName}" saved to vault`);
                  } catch (err: any) {
                    if (err?.message?.includes('feature')) {
                      toast.error('Vault requires a paid plan. Upgrade to save tokens.');
                    } else {
                      toast.error('Failed to save token: ' + (err?.message || 'Unknown error'));
                    }
                  }
                }}
                disabled={!tokenName.trim() || !tokenValue.trim()}
                size="sm"
                className="w-full gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                Save Token
              </Button>
            </div>
            {savedTokens.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="text-xs font-medium text-muted-foreground">Saved Tokens</h4>
                {savedTokens.map((t, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/50 bg-card">
                    <div className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5 text-amber-400" />
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{t.preview}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSavedTokens(prev => prev.filter((_, idx) => idx !== i))}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground">Tokens are encrypted and stored in your secure vault. The builder can access them when building projects that need API integrations. You can also say "use my OpenAI key" in chat and the builder will pull it from your vault.</p>
            </div>
          </div>
        </div>
      )}
      {/* Project Files Panel */}
      {showProjectFiles && createdFiles.length > 0 && (
        <div className={`${isMobile ? 'fixed inset-0 z-50 bg-background' : 'fixed right-0 top-0 bottom-0 w-[360px] border-l border-border'} flex flex-col bg-background`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-emerald-400" />
              <h3 className="font-semibold text-sm">Project Files</h3>
              <Badge variant="outline" className="text-[10px]">{createdFiles.length}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const allContent = createdFiles.map(f => `// === ${f.name} ===\n// Download: ${f.url}`).join('\n\n');
                  navigator.clipboard.writeText(allContent);
                  toast.success('File list copied');
                }}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy all file links"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowProjectFiles(false)}
                className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {createdFiles.map((file, idx) => (
              <div key={idx} className="rounded-xl border border-border/50 bg-card hover:bg-accent/30 transition-all">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {file.language} · {file.size < 1024 ? `${file.size}B` : `${(file.size / 1024).toFixed(1)}KB`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {file.url && (
                      <a
                        href={file.url}
                        download={file.name}
                        className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {file.url && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3 space-y-2">
            <Button
              onClick={() => {
                createdFiles.forEach(f => {
                  if (f.url) {
                    const a = document.createElement('a');
                    a.href = f.url;
                    a.download = f.name;
                    a.click();
                  }
                });
                toast.success('Downloading all files...');
              }}
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Download All ({createdFiles.length} files)
            </Button>
            <Button
              onClick={() => handleSend('Push all project files to GitHub. Create a new repository if needed.')}
              variant="default"
              size="sm"
              className="w-full gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Push to GitHub
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

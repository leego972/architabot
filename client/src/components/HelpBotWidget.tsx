/**
 * HelpBotWidget — Floating help chat bot that replaces ArchibaldWizard.
 * Provides navigation help, payment/billing support, and customer assistance.
 * Also includes a link to the Grand Bazaar marketplace.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useArchibald } from "@/contexts/ArchibaldContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TitanLogo } from "@/components/TitanLogo";
import {
  MessageCircleQuestion,
  X,
  Send,
  Store,
  CreditCard,
  HelpCircle,
  Navigation,
  ChevronDown,
  Loader2,
  ExternalLink,
} from "lucide-react";

// ─── Quick Topics ──────────────────────────────────────────────────
const QUICK_TOPICS = [
  { icon: Navigation, label: "Navigate the app", prompt: "How do I navigate the app? Show me what's available." },
  { icon: CreditCard, label: "Credits & billing", prompt: "How do credits and billing work? What are the plans?" },
  { icon: HelpCircle, label: "Builder help", prompt: "How do I use the Builder to create projects?" },
  { icon: Store, label: "Grand Bazaar", prompt: "Tell me about the Grand Bazaar marketplace." },
];

// ─── Knowledge Base for Help Bot ───────────────────────────────────
const HELP_KNOWLEDGE: Record<string, string> = {
  navigate: `**Archibald Titan** is organized into clear sections:

**Developer Tools** — Your main workspace:
• **Titan Builder** — Chat with AI to build full projects. Just describe what you want!
• **Clone Website** — Enter any URL and we'll clone it into a new GitHub repo
• **Sandbox** — Run code in a secure environment
• **Grand Bazaar** — Buy and sell developer tools, templates, and services

**Security** — Protect your credentials:
• TOTP Vault, Leak Scanner, Credential Health, Expiry Watchdog

**Business & Funding** — Grow your business:
• Browse Grants, Business Plans, Crowdfunding, Advertising, Affiliates

**Account & Settings** — Manage your account:
• Subscription, Credentials, API Access, Team Management, Settings`,

  credits: `**How Credits Work:**

Every action costs credits. Your plan gives you monthly credits that refill automatically.

| Action | Cost |
|--------|------|
| Chat message | 1 credit |
| Builder action | 3 credits |
| Voice action | 2 credits |
| Fetch action | 1 credit |

**Plans:**
• **Free** — 100 credits/month (get started)
• **Pro** ($29/mo) — 5,000 credits/month (~165 builder tasks)
• **Enterprise** ($99/mo) — 25,000 credits/month
• **Cyber** ($199/mo) — 100,000 credits/month + security tools
• **Cyber+** ($499/mo) — 500,000 credits/month + offensive security
• **Titan** ($4,999/mo) — 1,000,000 credits/month + everything

**Top-Up Packs** (if you run out mid-month):
• Quick Top-Up: 500 credits for $4.99
• Boost Pack: 2,500 credits for $14.99
• Power Top-Up: 5,000 credits for $29.99
• Mega Top-Up: 10,000 credits for $49.99

Go to **Subscription** in the sidebar to manage your plan.`,

  builder: `**Using the Builder:**

1. Go to **Titan Builder** (first item in Developer Tools)
2. Type what you want to build — be specific! Example: "Build me a landing page for a coffee shop with a menu section and contact form"
3. The AI will create real files — HTML, CSS, JavaScript, etc.
4. Files appear in the **Project Files** panel on the right side of the chat
5. You can preview, download, or copy any file
6. Click **Push to GitHub** to push your project to a new repository

**Tips:**
• Upload reference files (images, designs) using the paperclip button
• Use slash commands: /build, /fix, /explain, /refactor
• The builder creates actual downloadable files, not just code snippets
• You can continue iterating — ask for changes and the AI will update the files`,

  bazaar: `**Grand Bazaar Marketplace:**

The Grand Bazaar is a developer marketplace where you can buy and sell:
• Templates & starter kits
• Developer tools & utilities
• Security tools & scripts
• API integrations
• Custom AI models

**To browse:** Go to **Grand Bazaar** in Developer Tools
**To sell:** Go to **Sell / Listings** and create a listing
**Seller subscription:** Required to sell — activated through Stripe

Find it in the sidebar under **Developer Tools → Grand Bazaar**.`,

  clone: `**Clone Website Feature:**

1. Go to **Clone Website** in Developer Tools
2. Enter the URL of any website you want to clone
3. Give it a name
4. Click **Start Research** — the AI analyzes the site structure
5. Click **Generate Plan** — creates a build plan
6. Click **Build** — generates all the code files
7. Click **Push to GitHub** — creates a new repo and pushes everything

The clone creates a functional replica with clean, modern code. You can customize branding, colors, and even add Stripe payments.`,

  payment: `**Payment & Subscription:**

We use **Stripe** for all payments. Your options:
• Monthly or yearly billing (save ~17% with yearly)
• Credit card or supported payment methods
• Cancel anytime — you keep credits until the end of the billing period

**To manage your subscription:**
1. Go to **Account & Settings → Subscription**
2. You can upgrade, downgrade, or cancel
3. Buy credit top-up packs if you run out mid-month

**If payment fails:** Your subscription goes to "past due" status. Update your payment method in Subscription settings to restore access.`,
};

// ─── Simple intent matching ────────────────────────────────────────
function getHelpResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("navigate") || lower.includes("where") || lower.includes("find") || lower.includes("section") || lower.includes("sidebar") || lower.includes("menu") || lower.includes("available") || lower.includes("show me")) {
    return HELP_KNOWLEDGE.navigate;
  }
  if (lower.includes("credit") || lower.includes("billing") || lower.includes("plan") || lower.includes("pricing") || lower.includes("cost") || lower.includes("subscription") || lower.includes("tier") || lower.includes("how much")) {
    return HELP_KNOWLEDGE.credits;
  }
  if (lower.includes("builder") || lower.includes("build") || lower.includes("create") || lower.includes("project") || lower.includes("chat") || lower.includes("file")) {
    return HELP_KNOWLEDGE.builder;
  }
  if (lower.includes("bazaar") || lower.includes("marketplace") || lower.includes("sell") || lower.includes("buy") || lower.includes("template")) {
    return HELP_KNOWLEDGE.bazaar;
  }
  if (lower.includes("clone") || lower.includes("replicate") || lower.includes("copy") || lower.includes("website")) {
    return HELP_KNOWLEDGE.clone;
  }
  if (lower.includes("payment") || lower.includes("stripe") || lower.includes("pay") || lower.includes("charge") || lower.includes("refund") || lower.includes("cancel")) {
    return HELP_KNOWLEDGE.payment;
  }

  return `I can help you with:

• **Navigation** — Finding features and pages in the app
• **Credits & Billing** — Understanding plans, credits, and payments
• **Builder** — How to use the AI builder to create projects
• **Clone Website** — How to clone and replicate websites
• **Grand Bazaar** — The developer marketplace
• **Payments** — Managing subscriptions and billing

Just ask me about any of these topics, or click one of the quick topic buttons above!`;
}

// ─── Types ─────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ─── Component ─────────────────────────────────────────────────────
export default function HelpBotWidget() {
  const { isEnabled } = useArchibald();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  // Hide on chat page so it doesn't block the input area
  const isChatPage = location === "/dashboard" || location === "/";
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi${user?.name ? ` ${user.name.split(" ")[0]}` : ""}! 👋 I'm your Titan Help Bot. I can help you with:\n\n• **Navigating** the app\n• **Credits & billing** questions\n• **Builder** and **Clone Website** help\n• **Grand Bazaar** marketplace info\n\nAsk me anything or pick a topic below!`,
      timestamp: new Date(),
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = useCallback((text?: string) => {
    const messageText = text || input.trim();
    if (!messageText) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate brief typing delay for natural feel
    setTimeout(() => {
      const response = getHelpResponse(messageText);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 400 + Math.random() * 400);
  }, [input]);

  if (!isEnabled) return null;
  if (isChatPage) return null;

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group md:bottom-6 md:right-6 max-md:bottom-20 max-md:right-4 max-md:h-12 max-md:w-12"
        title="Need help? Chat with Titan Help Bot"
      >
        <MessageCircleQuestion className="h-6 w-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background animate-pulse" />
      </button>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-accent/50 transition-colors max-w-[260px] max-md:bottom-20 max-md:right-4"
      >
        <TitanLogo size="sm" />
        <span className="text-sm font-medium truncate">Help Bot</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 rotate-180" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            setIsMinimized(false);
          }}
          className="ml-auto p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Full chat panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[560px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden max-md:bottom-16 max-md:right-2 max-md:left-2 max-md:w-auto max-md:max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-blue-600/10 to-purple-600/10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <TitanLogo size="sm" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Titan Help Bot</h3>
            <p className="text-[10px] text-muted-foreground">Navigation • Billing • Support</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLocation("/marketplace")}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Go to Grand Bazaar"
          >
            <Store className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Minimize"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              setIsMinimized(false);
            }}
            className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick Topics */}
      <div className="px-3 py-2 border-b border-border/50 flex gap-1.5 overflow-x-auto scrollbar-none">
        {QUICK_TOPICS.map((topic) => (
          <button
            key={topic.label}
            onClick={() => handleSend(topic.prompt)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/50 hover:bg-accent text-xs font-medium whitespace-nowrap transition-colors"
          >
            <topic.icon className="h-3 w-3 text-blue-400" />
            {topic.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px] max-h-[340px] scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-accent/70 text-foreground rounded-bl-md"
              }`}
            >
              <div
                className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-inherit [&_table]:text-xs"
                dangerouslySetInnerHTML={{
                  __html: msg.content
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\n\n/g, "<br/><br/>")
                    .replace(/\n•/g, "<br/>•")
                    .replace(/\n\|/g, "<br/>|")
                    .replace(/\n/g, "<br/>"),
                }}
              />
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-accent/70 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Marketplace Link */}
      <div className="px-3 py-1.5 border-t border-border/30">
        <button
          onClick={() => setLocation("/marketplace")}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/20 text-xs font-medium text-amber-400 transition-colors"
        >
          <Store className="h-3.5 w-3.5" />
          Browse Grand Bazaar Marketplace
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 bg-accent/50 rounded-xl px-3.5 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30 border border-transparent focus:border-blue-500/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="h-9 w-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white flex items-center justify-center transition-colors shrink-0"
          >
            {isTyping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

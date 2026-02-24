/**
 * Marketplace Seed — Merchant Bot Profiles & Module Catalog
 * Creates realistic merchant accounts with diverse specializations
 * and populates the marketplace with useful, categorized modules.
 */
import { getDb } from "./db";
import { users, sellerProfiles, marketplaceListings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("MarketplaceSeed");

function generateUid() {
  return crypto.randomBytes(16).toString("hex");
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ─── Merchant Bot Profiles ──────────────────────────────────────────
const MERCHANT_BOTS = [
  {
    openId: "bot_cyberforge_001",
    name: "CyberForge Labs",
    email: "cyberforge@proton.me",
    bio: "Offensive security researchers building production-grade pentesting tools since 2019. Former red team operators turned tool builders. All code battle-tested in real engagements.",
    verified: true,
    totalSales: 347,
    avgRating: 47, // stored as x10, so 4.7
    ratingCount: 189,
  },
  {
    openId: "bot_synthwave_002",
    name: "SynthWave AI",
    email: "synthwave.ai@pm.me",
    bio: "AI/ML engineers specializing in autonomous agents and prompt engineering. We build the tools that build the future. GPT-4, Claude, and open-source model integrations.",
    verified: true,
    totalSales: 512,
    avgRating: 49,
    ratingCount: 276,
  },
  {
    openId: "bot_ghostnet_003",
    name: "GhostNet Security",
    email: "ghostnet@tutanota.com",
    bio: "Network security specialists. OSINT, traffic analysis, and threat intelligence tools. Everything we ship comes with documentation and support.",
    verified: true,
    totalSales: 223,
    avgRating: 46,
    ratingCount: 134,
  },
  {
    openId: "bot_stacksmith_004",
    name: "StackSmith",
    email: "hello@stacksmith.dev",
    bio: "Full-stack developer tools and templates. React, Node, TypeScript — clean code, tested, documented. Saving you hundreds of hours per project.",
    verified: true,
    totalSales: 891,
    avgRating: 48,
    ratingCount: 445,
  },
  {
    openId: "bot_vaultkeeper_005",
    name: "VaultKeeper",
    email: "vault@keeper.security",
    bio: "Cryptography and data protection specialists. Encryption modules, key management, secure storage — built to compliance standards (SOC2, GDPR, HIPAA).",
    verified: true,
    totalSales: 156,
    avgRating: 50,
    ratingCount: 98,
  },
  {
    openId: "bot_devops_ninja_006",
    name: "DevOps Ninja",
    email: "ninja@devops.tools",
    bio: "CI/CD pipelines, infrastructure-as-code, monitoring, and deployment automation. We automate everything so you can ship faster and sleep better.",
    verified: true,
    totalSales: 634,
    avgRating: 45,
    ratingCount: 312,
  },
  {
    openId: "bot_chainlink_007",
    name: "ChainLink Research",
    email: "research@chainlink.dev",
    bio: "Blockchain security researchers and smart contract auditors. Solidity, Rust, Move — we find the bugs before the hackers do.",
    verified: true,
    totalSales: 178,
    avgRating: 48,
    ratingCount: 87,
  },
  {
    openId: "bot_titan_official_008",
    name: "Archibald Titan Official",
    email: "modules@archibaldtitan.com",
    bio: "Official modules and extensions built by the Archibald Titan core team. Premium quality, deeply integrated with the Titan platform.",
    verified: true,
    totalSales: 1203,
    avgRating: 49,
    ratingCount: 567,
  },
];

// ─── Module Catalog ─────────────────────────────────────────────────
interface ModuleDef {
  merchantIndex: number; // index into MERCHANT_BOTS
  title: string;
  description: string;
  longDescription: string;
  category: "agents" | "modules" | "blueprints" | "artifacts" | "exploits" | "templates" | "datasets" | "other";
  riskCategory: "safe" | "low_risk" | "medium_risk" | "high_risk";
  priceCredits: number;
  tags: string[];
  language: string;
  license: string;
  featured: boolean;
  version: string;
  totalSales: number;
  viewCount: number;
}

const MODULE_CATALOG: ModuleDef[] = [
  // ── CyberForge Labs (0) — Offensive Security ──
  {
    merchantIndex: 0,
    title: "Titan Credential Harvester Module",
    description: "Advanced credential extraction module that integrates with Archibald Titan's fetcher engine. Supports 50+ providers with automatic CAPTCHA bypass and session management.",
    longDescription: "# Titan Credential Harvester Module\n\nA production-grade credential extraction module built for the Archibald Titan platform.\n\n## Features\n- 50+ provider support (Google, Microsoft, AWS, GitHub, etc.)\n- Automatic CAPTCHA detection and bypass via 2Captcha/Anti-Captcha\n- Session persistence and cookie management\n- Rate-limit aware with exponential backoff\n- Encrypted credential storage with AES-256-GCM\n- Webhook notifications on successful extraction\n\n## Installation\n```bash\ntitan module install credential-harvester\n```\n\n## Configuration\nConfigure via the Titan dashboard under Modules > Credential Harvester.\n\n## Legal Notice\nFor authorized penetration testing only. Users are responsible for compliance with applicable laws.",
    category: "modules",
    riskCategory: "high_risk",
    priceCredits: 500,
    tags: ["credentials", "automation", "security", "fetcher", "pentesting"],
    language: "TypeScript",
    license: "Proprietary",
    featured: false,
    version: "2.3.1",
    totalSales: 89,
    viewCount: 1247,
  },
  {
    merchantIndex: 0,
    title: "AI Vulnerability Scanner Agent",
    description: "Autonomous AI agent that scans web applications for OWASP Top 10 vulnerabilities. Uses LLM analysis to understand responses and generate detailed reports with remediation steps.",
    longDescription: "# AI Vulnerability Scanner Agent\n\n## Overview\nAn autonomous security scanning agent powered by GPT-4.1 that goes beyond pattern matching. It understands application logic, identifies business logic flaws, and generates human-readable reports.\n\n## Scan Types\n- SQL Injection (blind, time-based, UNION)\n- XSS (reflected, stored, DOM-based)\n- CSRF token validation\n- Authentication bypass\n- IDOR/Broken access control\n- SSRF detection\n- File upload vulnerabilities\n- API endpoint enumeration\n\n## Output\nGenerates PDF reports with severity ratings, proof-of-concept payloads, and step-by-step remediation guides.\n\n## Usage\n```python\nfrom titan_vuln_scanner import TitanScanner\nscanner = TitanScanner(target='https://example.com', api_key='your-titan-key')\nresults = scanner.full_scan()\nresults.export_pdf('report.pdf')\n```",
    category: "agents",
    riskCategory: "low_risk",
    priceCredits: 1200,
    tags: ["security", "vulnerability", "scanner", "AI", "OWASP", "pentesting"],
    language: "Python",
    license: "MIT",
    featured: true,
    version: "3.1.0",
    totalSales: 234,
    viewCount: 3891,
  },
  {
    merchantIndex: 0,
    title: "Autonomous Bug Bounty Hunter Agent",
    description: "AI-powered agent that autonomously discovers and reports security vulnerabilities. Integrates with HackerOne and Bugcrowd APIs for automated submission.",
    longDescription: "# Autonomous Bug Bounty Hunter\n\n## How It Works\n1. Provide a target scope (domain, IP range, or bug bounty program URL)\n2. Agent performs reconnaissance (subdomain enum, port scanning, tech fingerprinting)\n3. Runs targeted vulnerability checks based on discovered tech stack\n4. Validates findings with proof-of-concept exploits\n5. Generates formatted reports matching HackerOne/Bugcrowd templates\n6. Optionally auto-submits to bug bounty platforms\n\n## Supported Platforms\n- HackerOne API integration\n- Bugcrowd API integration\n- Intigriti API integration\n- Custom webhook output\n\n## Requirements\n- Titan API key with agent permissions\n- Target must be in-scope for authorized testing\n- Python 3.10+",
    category: "agents",
    riskCategory: "medium_risk",
    priceCredits: 3000,
    tags: ["bug-bounty", "AI", "autonomous", "security", "HackerOne", "Bugcrowd"],
    language: "Python",
    license: "Proprietary",
    featured: true,
    version: "1.8.0",
    totalSales: 67,
    viewCount: 2456,
  },
  {
    merchantIndex: 0,
    title: "Zero-Day Exploit Framework — Educational",
    description: "Educational framework demonstrating common zero-day exploitation techniques. Includes sandboxed environments and detailed write-ups for each technique.",
    longDescription: "# Zero-Day Exploit Framework (Educational)\n\n## Purpose\nThis framework is designed for security researchers and students learning exploit development. All exploits run in isolated Docker containers.\n\n## Modules\n- Buffer overflow (stack, heap, format string)\n- Use-after-free exploitation\n- Race condition exploitation\n- Kernel module exploitation (Linux)\n- Browser exploitation basics (V8, SpiderMonkey)\n- Return-oriented programming (ROP chains)\n\n## Safety\n- All exploits run in sandboxed Docker environments\n- No network access from exploit containers\n- Automatic cleanup after each session\n- Detailed educational write-ups for each technique\n\n## Disclaimer\nFor educational purposes only. Do not use against systems you do not own or have explicit permission to test.",
    category: "exploits",
    riskCategory: "high_risk",
    priceCredits: 5000,
    tags: ["zero-day", "exploit", "educational", "security", "research", "CTF"],
    language: "C/Python",
    license: "Proprietary",
    featured: true,
    version: "2.0.0",
    totalSales: 34,
    viewCount: 5672,
  },
  {
    merchantIndex: 0,
    title: "WiFi Penetration Testing Toolkit",
    description: "Comprehensive wireless security testing toolkit. WPA2/WPA3 handshake capture, deauth attacks, evil twin AP, and automated cracking with hashcat integration.",
    longDescription: "# WiFi Penetration Testing Toolkit\n\n## Features\n- WPA2/WPA3 handshake capture and analysis\n- Automated deauthentication attacks\n- Evil twin access point creation\n- PMKID extraction for offline cracking\n- Hashcat/John integration for password recovery\n- Client probe request monitoring\n- Rogue AP detection\n\n## Hardware Support\n- Alfa AWUS036ACH\n- TP-Link TL-WN722N v1\n- Any monitor-mode capable adapter\n\n## Requirements\n- Linux (Kali/Parrot recommended)\n- Monitor-mode capable WiFi adapter\n- Python 3.10+\n\n## Legal\nFor authorized penetration testing only.",
    category: "artifacts",
    riskCategory: "high_risk",
    priceCredits: 800,
    tags: ["wifi", "wireless", "pentesting", "WPA2", "WPA3", "security"],
    language: "Python/Bash",
    license: "Proprietary",
    featured: false,
    version: "1.5.2",
    totalSales: 156,
    viewCount: 2890,
  },

  // ── SynthWave AI (1) — AI/ML Tools ──
  {
    merchantIndex: 1,
    title: "AI Code Review Agent",
    description: "Autonomous code review agent that analyzes pull requests for bugs, security vulnerabilities, performance issues, and code style. Integrates with GitHub and GitLab.",
    longDescription: "# AI Code Review Agent\n\n## Overview\nDrop-in AI code reviewer that integrates with your Git workflow. Reviews every PR automatically and posts inline comments.\n\n## What It Catches\n- Security vulnerabilities (injection, XSS, auth bypass)\n- Performance anti-patterns (N+1 queries, memory leaks)\n- Code style violations (configurable rules)\n- Logic errors and edge cases\n- Missing error handling\n- Unused imports and dead code\n\n## Integrations\n- GitHub Actions (one-click setup)\n- GitLab CI/CD pipeline\n- Bitbucket Pipelines\n- Custom webhook\n\n## Supported Languages\nTypeScript, JavaScript, Python, Go, Rust, Java, C#",
    category: "agents",
    riskCategory: "safe",
    priceCredits: 900,
    tags: ["code-review", "AI", "GitHub", "GitLab", "automation", "quality"],
    language: "TypeScript",
    license: "MIT",
    featured: true,
    version: "2.4.0",
    totalSales: 412,
    viewCount: 5123,
  },
  {
    merchantIndex: 1,
    title: "Prompt Engineering Masterclass — 200+ Templates",
    description: "Curated collection of 200+ battle-tested prompt templates for coding, writing, analysis, and automation. Works with GPT-4, Claude, Gemini, and open-source models.",
    longDescription: "# Prompt Engineering Masterclass\n\n## What's Included\n- 50 coding prompts (debug, refactor, generate, review)\n- 40 writing prompts (blog, copy, technical docs, emails)\n- 30 analysis prompts (data, market, competitor, financial)\n- 25 automation prompts (workflow, scraping, testing)\n- 20 security prompts (audit, pentest planning, threat modeling)\n- 15 business prompts (pitch decks, proposals, strategies)\n- 20 creative prompts (brainstorming, ideation, naming)\n\n## Format\nEach template includes:\n- The prompt with variable placeholders\n- Example input/output\n- Tips for customization\n- Model-specific variations (GPT-4 vs Claude vs Gemini)\n\n## Bonus\n- Prompt chaining patterns for complex tasks\n- System prompt templates for custom agents",
    category: "templates",
    riskCategory: "safe",
    priceCredits: 250,
    tags: ["prompts", "AI", "GPT-4", "Claude", "templates", "productivity"],
    language: "Markdown/JSON",
    license: "MIT",
    featured: false,
    version: "3.0.0",
    totalSales: 789,
    viewCount: 8934,
  },
  {
    merchantIndex: 1,
    title: "Smart Contract Auditor Agent",
    description: "AI agent that audits Solidity smart contracts for vulnerabilities including reentrancy, overflow, and access control issues. Generates detailed audit reports.",
    longDescription: "# Smart Contract Auditor Agent\n\n## Vulnerability Detection\n- Reentrancy attacks\n- Integer overflow/underflow\n- Access control flaws\n- Front-running vulnerabilities\n- Flash loan attack vectors\n- Unchecked external calls\n- Gas optimization issues\n- Proxy upgrade vulnerabilities\n\n## Output\n- Severity-rated findings (Critical/High/Medium/Low/Info)\n- Proof-of-concept exploit code\n- Remediation recommendations\n- Gas optimization suggestions\n- PDF audit report generation\n\n## Supported\n- Solidity 0.8.x\n- Vyper\n- Foundry/Hardhat project integration",
    category: "agents",
    riskCategory: "safe",
    priceCredits: 2000,
    tags: ["smart-contract", "audit", "Solidity", "blockchain", "security", "DeFi"],
    language: "Python",
    license: "MIT",
    featured: true,
    version: "1.6.0",
    totalSales: 123,
    viewCount: 2345,
  },
  {
    merchantIndex: 1,
    title: "LLM Fine-Tuning Pipeline",
    description: "End-to-end pipeline for fine-tuning open-source LLMs (Llama, Mistral, Phi) on custom datasets. Includes data preparation, training, evaluation, and deployment scripts.",
    longDescription: "# LLM Fine-Tuning Pipeline\n\n## Supported Models\n- Meta Llama 3.x (7B, 13B, 70B)\n- Mistral 7B / Mixtral 8x7B\n- Microsoft Phi-3\n- Google Gemma\n\n## Features\n- Automated data preparation and cleaning\n- LoRA/QLoRA fine-tuning (runs on single GPU)\n- Evaluation benchmarks (MMLU, HumanEval, custom)\n- GGUF export for local deployment\n- vLLM/TGI deployment scripts\n- Weights & Biases integration\n\n## Requirements\n- NVIDIA GPU with 16GB+ VRAM (24GB recommended)\n- Python 3.10+\n- CUDA 12.x",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 1500,
    tags: ["LLM", "fine-tuning", "AI", "Llama", "Mistral", "ML", "training"],
    language: "Python",
    license: "Apache-2.0",
    featured: true,
    version: "2.1.0",
    totalSales: 198,
    viewCount: 4567,
  },
  {
    merchantIndex: 1,
    title: "Phishing Detection ML Dataset",
    description: "Curated dataset of 100K+ labeled phishing URLs and emails for training machine learning models. Includes benign samples for balanced training.",
    longDescription: "# Phishing Detection Dataset\n\n## Contents\n- 65,000 confirmed phishing URLs with metadata\n- 45,000 benign URLs for balanced training\n- 20,000 phishing emails (headers + body)\n- 15,000 legitimate emails for comparison\n- Feature extraction scripts\n- Baseline model (Random Forest, 97.3% accuracy)\n\n## Format\n- CSV with labeled features\n- Raw HTML for email samples\n- Pre-extracted feature vectors (NumPy)\n- Train/test splits included\n\n## Use Cases\n- Email security gateway training\n- Browser extension development\n- Security awareness training tools\n- Academic research",
    category: "datasets",
    riskCategory: "safe",
    priceCredits: 800,
    tags: ["dataset", "ML", "phishing", "security", "training", "NLP"],
    language: "CSV/JSON",
    license: "CC-BY-4.0",
    featured: false,
    version: "2024.2",
    totalSales: 267,
    viewCount: 3456,
  },

  // ── GhostNet Security (2) — Network & OSINT ──
  {
    merchantIndex: 2,
    title: "Dark Web OSINT Toolkit",
    description: "Comprehensive OSINT toolkit for dark web intelligence gathering. Monitors .onion sites, paste bins, and underground forums for credential leaks and threat intelligence.",
    longDescription: "# Dark Web OSINT Toolkit\n\n## Capabilities\n- Tor hidden service crawler and monitor\n- Paste site monitoring (Pastebin, Ghostbin, etc.)\n- Underground forum scraping (configurable targets)\n- Credential leak detection and alerting\n- Cryptocurrency transaction tracing\n- Threat actor profiling\n- Automated reporting and alerting\n\n## Data Sources\n- 500+ monitored .onion services\n- 30+ paste sites\n- 15+ underground forums\n- Blockchain explorers (BTC, ETH, XMR)\n\n## Output\n- JSON/CSV exports\n- Webhook alerts (Slack, Discord, Teams)\n- PDF intelligence reports\n- STIX/TAXII format for SIEM integration",
    category: "exploits",
    riskCategory: "high_risk",
    priceCredits: 2500,
    tags: ["OSINT", "dark-web", "intelligence", "monitoring", "security", "threat-intel"],
    language: "Python",
    license: "Proprietary",
    featured: true,
    version: "3.2.0",
    totalSales: 89,
    viewCount: 4567,
  },
  {
    merchantIndex: 2,
    title: "Network Packet Analyzer",
    description: "Deep packet inspection tool for network traffic analysis. Supports pcap files, live capture, and protocol dissection with a web-based UI.",
    longDescription: "# Network Packet Analyzer\n\n## Features\n- Live packet capture (libpcap)\n- PCAP/PCAPNG file analysis\n- 100+ protocol dissectors\n- TLS/SSL decryption (with keys)\n- HTTP/2 and gRPC support\n- DNS query analysis\n- Web-based UI with filtering\n- Export to JSON/CSV\n\n## Performance\n- Handles 10Gbps+ capture rates\n- Written in Rust for zero-copy parsing\n- Web UI built with React + WebSocket\n\n## Use Cases\n- Network forensics\n- Malware traffic analysis\n- Performance troubleshooting\n- Security monitoring",
    category: "artifacts",
    riskCategory: "safe",
    priceCredits: 700,
    tags: ["network", "packet", "analyzer", "pcap", "security", "forensics"],
    language: "Rust",
    license: "Apache-2.0",
    featured: false,
    version: "1.4.0",
    totalSales: 145,
    viewCount: 2345,
  },
  {
    merchantIndex: 2,
    title: "Subdomain Enumeration & Takeover Scanner",
    description: "Fast subdomain discovery using DNS bruteforce, certificate transparency logs, and web scraping. Automatically detects subdomain takeover vulnerabilities.",
    longDescription: "# Subdomain Enumeration & Takeover Scanner\n\n## Discovery Methods\n- DNS bruteforce (custom wordlists, 50K+ entries)\n- Certificate Transparency log parsing\n- Search engine dorking (Google, Bing, Shodan)\n- Web archive mining\n- DNS zone transfer attempts\n- Virtual host discovery\n\n## Takeover Detection\n- Checks 80+ fingerprints for takeover-vulnerable services\n- AWS S3, Azure, GitHub Pages, Heroku, Shopify, etc.\n- Automatic CNAME chain resolution\n- Proof-of-concept generation\n\n## Output\n- JSON with full DNS records\n- Screenshot capture of live subdomains\n- Takeover vulnerability report",
    category: "modules",
    riskCategory: "low_risk",
    priceCredits: 400,
    tags: ["subdomain", "enumeration", "takeover", "recon", "pentesting", "DNS"],
    language: "Go",
    license: "MIT",
    featured: false,
    version: "2.0.1",
    totalSales: 312,
    viewCount: 4123,
  },
  {
    merchantIndex: 2,
    title: "Credential Breach Database — 2024 Compilation",
    description: "Compiled dataset of publicly disclosed credential breaches from 2024. Hashed and anonymized for security research and breach detection systems.",
    longDescription: "# Credential Breach Database — 2024\n\n## Contents\n- 2.3M hashed credential pairs from public disclosures\n- Source attribution for each breach\n- Timeline data for breach detection\n- Password pattern analysis\n- Industry categorization\n\n## Format\n- SHA-256 hashed emails (for matching, not reversal)\n- bcrypt hashed passwords\n- JSON metadata per entry\n- Elasticsearch-ready bulk import format\n\n## Use Cases\n- Breach detection services (Have I Been Pwned style)\n- Password policy research\n- Security awareness training\n- Threat intelligence feeds\n\n## Legal\nAll data sourced from public disclosures. Fully anonymized and hashed.",
    category: "datasets",
    riskCategory: "medium_risk",
    priceCredits: 1500,
    tags: ["breach", "credentials", "dataset", "security", "research", "OSINT"],
    language: "JSON",
    license: "Research-Only",
    featured: false,
    version: "2024.12",
    totalSales: 56,
    viewCount: 3210,
  },

  // ── StackSmith (3) — Dev Tools & Templates ──
  {
    merchantIndex: 3,
    title: "React Dashboard Template — Cyber Theme",
    description: "Premium React dashboard template with dark cyber theme. Includes 40+ components, charts, tables, auth pages, and responsive layout. Built with TypeScript and Tailwind.",
    longDescription: "# React Cyber Dashboard Template\n\n## Components (40+)\n- Data tables with sorting, filtering, pagination\n- Chart components (line, bar, pie, area, radar)\n- Auth pages (login, register, forgot password, 2FA)\n- User management (profiles, roles, permissions)\n- Notification system (toast, bell, email)\n- File upload with drag-and-drop\n- Markdown editor\n- Code editor (Monaco)\n- Terminal emulator component\n\n## Tech Stack\n- React 18 + TypeScript\n- Tailwind CSS + shadcn/ui\n- Recharts for data visualization\n- React Router v6\n- React Query for data fetching\n\n## Theming\n- Dark cyber theme (default)\n- Light mode included\n- Fully customizable color palette\n- CSS variables for easy theming",
    category: "templates",
    riskCategory: "safe",
    priceCredits: 200,
    tags: ["react", "dashboard", "template", "UI", "cyber", "dark-mode", "TypeScript"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "3.2.0",
    totalSales: 567,
    viewCount: 7890,
  },
  {
    merchantIndex: 3,
    title: "API Rate Limiter Middleware",
    description: "Production-grade rate limiting middleware for Express/Fastify. Supports Redis, in-memory, and distributed modes with sliding window algorithm.",
    longDescription: "# API Rate Limiter Middleware\n\n## Algorithms\n- Fixed window\n- Sliding window (recommended)\n- Token bucket\n- Leaky bucket\n\n## Storage Backends\n- In-memory (single instance)\n- Redis (distributed)\n- PostgreSQL (persistent)\n- Custom adapter interface\n\n## Features\n- Per-route configuration\n- API key-based limits\n- IP-based limits\n- User-based limits\n- Custom key functions\n- Rate limit headers (X-RateLimit-*)\n- Retry-After header\n- Webhook on limit exceeded\n\n## Usage\n```typescript\nimport { rateLimiter } from 'titan-rate-limiter';\napp.use(rateLimiter({ window: '1m', max: 100, store: 'redis' }));\n```",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 150,
    tags: ["API", "rate-limit", "middleware", "express", "fastify", "security"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "2.1.0",
    totalSales: 423,
    viewCount: 5678,
  },
  {
    merchantIndex: 3,
    title: "Full-Stack SaaS Boilerplate",
    description: "Complete SaaS starter with auth, billing, teams, admin panel, and API. React + Node + PostgreSQL. Stripe integration included. Launch your SaaS in days, not months.",
    longDescription: "# Full-Stack SaaS Boilerplate\n\n## Included\n- User authentication (email/password, OAuth, 2FA)\n- Stripe billing (subscriptions, one-time, usage-based)\n- Team management (invites, roles, permissions)\n- Admin dashboard (user management, analytics, settings)\n- REST + tRPC API layer\n- Email system (transactional, marketing)\n- File upload (S3-compatible)\n- Webhook system\n- Rate limiting\n- Audit logging\n\n## Tech Stack\n- React 18 + TypeScript + Tailwind\n- Node.js + Express + tRPC\n- PostgreSQL + Drizzle ORM\n- Redis for caching/sessions\n- Docker + docker-compose\n\n## Deployment\n- Railway one-click deploy\n- Vercel + Supabase guide\n- AWS ECS guide\n- Docker self-hosted",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 600,
    tags: ["SaaS", "boilerplate", "React", "Node", "Stripe", "auth", "full-stack"],
    language: "TypeScript",
    license: "MIT",
    featured: true,
    version: "4.0.0",
    totalSales: 345,
    viewCount: 6789,
  },
  {
    merchantIndex: 3,
    title: "Email Campaign Manager Template",
    description: "Full-stack email campaign management template with drag-and-drop editor, A/B testing, analytics dashboard, and SMTP integration.",
    longDescription: "# Email Campaign Manager\n\n## Features\n- Drag-and-drop email builder\n- A/B testing (subject lines, content, send times)\n- Contact list management with segmentation\n- Analytics dashboard (open rate, CTR, conversions)\n- SMTP integration (SendGrid, Mailgun, Amazon SES)\n- Template library with 50+ designs\n- Unsubscribe management (CAN-SPAM compliant)\n- Scheduled sending with timezone support\n\n## Tech Stack\n- React frontend with MJML email rendering\n- Node.js backend with Bull queue\n- PostgreSQL for data storage\n- Redis for job queuing",
    category: "templates",
    riskCategory: "safe",
    priceCredits: 400,
    tags: ["email", "campaign", "template", "marketing", "SMTP", "automation"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "2.3.0",
    totalSales: 234,
    viewCount: 3456,
  },
  {
    merchantIndex: 3,
    title: "SEO Keyword Research Automation",
    description: "Automated keyword research tool that scrapes Google, Bing, and competitor sites. Generates keyword clusters with search volume and difficulty scores.",
    longDescription: "# SEO Keyword Research Automation\n\n## Features\n- Google autocomplete scraping\n- People Also Ask extraction\n- Competitor keyword analysis\n- Search volume estimation\n- Keyword difficulty scoring\n- Keyword clustering by topic\n- SERP feature detection\n- Content gap analysis\n\n## Output\n- CSV/JSON export\n- Keyword cluster visualization\n- Content brief generation\n- Priority scoring matrix\n\n## Data Sources\n- Google Search (via SerpAPI or scraping)\n- Bing Webmaster Tools\n- Google Search Console integration\n- Competitor site crawling",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 350,
    tags: ["SEO", "keywords", "automation", "marketing", "scraping", "content"],
    language: "Python",
    license: "MIT",
    featured: false,
    version: "1.8.0",
    totalSales: 189,
    viewCount: 2890,
  },

  // ── VaultKeeper (4) — Cryptography & Data Protection ──
  {
    merchantIndex: 4,
    title: "End-to-End Encryption Module",
    description: "Drop-in E2EE module for any application. AES-256-GCM encryption, RSA key exchange, perfect forward secrecy. Zero-knowledge architecture.",
    longDescription: "# End-to-End Encryption Module\n\n## Algorithms\n- AES-256-GCM for symmetric encryption\n- RSA-4096 for key exchange\n- X25519 for Diffie-Hellman\n- HKDF for key derivation\n- HMAC-SHA256 for message authentication\n\n## Features\n- Perfect forward secrecy (new keys per session)\n- Zero-knowledge architecture (server never sees plaintext)\n- Key rotation with configurable intervals\n- Multi-device key sync\n- Offline message queuing\n- Group encryption support\n\n## Integration\n```typescript\nimport { E2EE } from 'titan-e2ee';\nconst channel = new E2EE.Channel(myKeyPair, recipientPublicKey);\nconst encrypted = channel.encrypt('Hello, World!');\n```\n\n## Compliance\n- SOC2 Type II compatible\n- GDPR compliant\n- HIPAA compatible",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 450,
    tags: ["encryption", "E2EE", "security", "cryptography", "privacy", "AES"],
    language: "TypeScript",
    license: "MIT",
    featured: true,
    version: "2.0.0",
    totalSales: 156,
    viewCount: 3456,
  },
  {
    merchantIndex: 4,
    title: "Password Manager Core Engine",
    description: "Complete password manager engine with vault encryption, master key derivation, browser extension API, and auto-fill support. Build your own 1Password.",
    longDescription: "# Password Manager Core Engine\n\n## Architecture\n- Master password → Argon2id → vault key\n- AES-256-GCM vault encryption\n- TOTP/HOTP 2FA support\n- Secure random password generator\n- Breach detection (HIBP API integration)\n\n## Components\n- Vault engine (create, read, update, delete entries)\n- Browser extension API (Chrome, Firefox, Safari)\n- Auto-fill engine (form detection, field matching)\n- Sync protocol (encrypted cloud sync)\n- Import/export (1Password, LastPass, Bitwarden, CSV)\n\n## Customization\n- Pluggable storage backends\n- Custom field types\n- Organization/team vaults\n- Audit logging",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 800,
    tags: ["password-manager", "encryption", "security", "vault", "browser-extension"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "1.5.0",
    totalSales: 98,
    viewCount: 2345,
  },
  {
    merchantIndex: 4,
    title: "Secure File Sharing Module",
    description: "End-to-end encrypted file sharing with link expiration, download limits, and password protection. Self-hosted or cloud. Zero-knowledge design.",
    longDescription: "# Secure File Sharing Module\n\n## Features\n- Client-side AES-256-GCM encryption (zero-knowledge)\n- Shareable links with expiration (1h to 30d)\n- Download count limits\n- Optional password protection\n- File size up to 5GB\n- Chunked upload with resume\n- QR code sharing\n- Webhook notifications\n\n## Storage Backends\n- Local filesystem\n- AWS S3 / S3-compatible\n- Azure Blob Storage\n- Google Cloud Storage\n\n## API\n```typescript\nconst share = await secureShare.upload(file, {\n  expiresIn: '24h',\n  maxDownloads: 5,\n  password: 'optional'\n});\nconsole.log(share.url); // https://share.example.com/abc123\n```",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 300,
    tags: ["file-sharing", "encryption", "security", "privacy", "zero-knowledge"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "1.3.0",
    totalSales: 234,
    viewCount: 3456,
  },

  // ── DevOps Ninja (5) — CI/CD & Infrastructure ──
  {
    merchantIndex: 5,
    title: "Docker Security Scanner",
    description: "Scan Docker images and containers for vulnerabilities, misconfigurations, and compliance violations. Integrates with CI/CD pipelines for automated scanning.",
    longDescription: "# Docker Security Scanner\n\n## Scan Types\n- CVE vulnerability detection (NVD database)\n- Dockerfile best practice analysis\n- Secret detection in image layers\n- Compliance checks (CIS Docker Benchmark)\n- Runtime security monitoring\n- Image signing verification\n\n## CI/CD Integration\n- GitHub Actions\n- GitLab CI\n- Jenkins\n- CircleCI\n- Azure DevOps\n\n## Output\n- JSON/SARIF reports\n- HTML dashboard\n- Slack/Teams notifications\n- JIRA ticket creation\n- Policy-as-code (OPA/Rego)\n\n## Usage\n```bash\ntitan-docker-scan scan myimage:latest --severity HIGH,CRITICAL\n```",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 500,
    tags: ["docker", "security", "scanner", "CI/CD", "DevOps", "containers"],
    language: "Go",
    license: "Apache-2.0",
    featured: false,
    version: "2.2.0",
    totalSales: 289,
    viewCount: 4567,
  },
  {
    merchantIndex: 5,
    title: "Infrastructure-as-Code Security Analyzer",
    description: "Static analysis for Terraform, CloudFormation, and Kubernetes manifests. Detects security misconfigurations before deployment.",
    longDescription: "# IaC Security Analyzer\n\n## Supported Formats\n- Terraform (HCL)\n- AWS CloudFormation (JSON/YAML)\n- Kubernetes manifests\n- Helm charts\n- Docker Compose\n- Ansible playbooks\n\n## Detection Rules (500+)\n- Public S3 buckets\n- Unencrypted databases\n- Overly permissive IAM policies\n- Missing network segmentation\n- Exposed management ports\n- Missing logging/monitoring\n- Non-compliant resource tags\n\n## Compliance Frameworks\n- CIS Benchmarks\n- SOC2\n- PCI-DSS\n- HIPAA\n- NIST 800-53\n\n## Integration\nPre-commit hook, CI/CD pipeline, or IDE plugin (VS Code).",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 600,
    tags: ["IaC", "Terraform", "security", "DevOps", "compliance", "cloud"],
    language: "Go",
    license: "Apache-2.0",
    featured: true,
    version: "3.0.0",
    totalSales: 345,
    viewCount: 5678,
  },
  {
    merchantIndex: 5,
    title: "Kubernetes Monitoring Dashboard Blueprint",
    description: "Complete K8s monitoring stack with Prometheus, Grafana, and custom alerting. Pre-built dashboards for pods, nodes, services, and security events.",
    longDescription: "# Kubernetes Monitoring Dashboard\n\n## Included\n- Prometheus configuration with service discovery\n- 15 pre-built Grafana dashboards\n- AlertManager with Slack/PagerDuty/Teams integration\n- Custom metrics collection via ServiceMonitor\n- Log aggregation with Loki\n- Distributed tracing with Tempo\n\n## Dashboards\n- Cluster overview (CPU, memory, disk, network)\n- Pod health and restart tracking\n- Service latency and error rates\n- Node resource utilization\n- Security events (failed auth, privilege escalation)\n- Cost tracking per namespace\n\n## Deployment\n```bash\nhelm install titan-monitoring ./charts/monitoring -n monitoring\n```",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 450,
    tags: ["Kubernetes", "monitoring", "Prometheus", "Grafana", "DevOps", "observability"],
    language: "YAML/HCL",
    license: "MIT",
    featured: false,
    version: "2.1.0",
    totalSales: 267,
    viewCount: 3890,
  },
  {
    merchantIndex: 5,
    title: "GitHub Actions CI/CD Template Pack",
    description: "30+ production-ready GitHub Actions workflows for Node.js, Python, Go, Rust, and Docker projects. Includes security scanning, testing, and deployment.",
    longDescription: "# GitHub Actions Template Pack\n\n## Workflows (30+)\n- Node.js: lint, test, build, deploy (Vercel/Railway/AWS)\n- Python: pytest, mypy, black, deploy (Lambda/ECS)\n- Go: test, lint, build, deploy (ECS/K8s)\n- Rust: cargo test, clippy, build, release\n- Docker: build, scan, push, deploy\n- Security: Dependabot, CodeQL, Trivy, SAST\n- Release: semantic versioning, changelog, GitHub Release\n- Terraform: plan, apply, drift detection\n\n## Features\n- Matrix builds for multi-version testing\n- Caching for fast builds\n- Slack/Discord notifications\n- Manual approval gates\n- Environment-specific deployments",
    category: "templates",
    riskCategory: "safe",
    priceCredits: 200,
    tags: ["GitHub-Actions", "CI/CD", "DevOps", "automation", "deployment", "testing"],
    language: "YAML",
    license: "MIT",
    featured: false,
    version: "2.5.0",
    totalSales: 456,
    viewCount: 6789,
  },

  // ── ChainLink Research (6) — Blockchain ──
  {
    merchantIndex: 6,
    title: "Crypto Wallet Tracker Blueprint",
    description: "Blueprint for building a cryptocurrency wallet tracking system. Monitors BTC, ETH, and ERC-20 token movements with real-time alerts.",
    longDescription: "# Crypto Wallet Tracker\n\n## Supported Chains\n- Bitcoin (BTC)\n- Ethereum (ETH + ERC-20)\n- Polygon (MATIC)\n- Arbitrum\n- Optimism\n- BSC (BNB + BEP-20)\n\n## Features\n- Real-time transaction monitoring\n- Whale alert detection (configurable thresholds)\n- Portfolio valuation with historical charts\n- Tax reporting (cost basis calculation)\n- DeFi position tracking\n- NFT portfolio tracking\n- Multi-wallet aggregation\n\n## Alerts\n- Webhook (custom URL)\n- Telegram bot\n- Discord bot\n- Email\n- SMS (Twilio)\n\n## Data Sources\n- Etherscan/Polygonscan APIs\n- Blockchain node RPC\n- CoinGecko for pricing",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 450,
    tags: ["crypto", "blockchain", "wallet", "tracker", "alerts", "DeFi"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "2.0.0",
    totalSales: 178,
    viewCount: 3456,
  },
  {
    merchantIndex: 6,
    title: "DeFi Arbitrage Bot Framework",
    description: "Framework for building cross-DEX arbitrage bots. Supports Uniswap, SushiSwap, PancakeSwap, and custom DEX integrations. Flash loan support included.",
    longDescription: "# DeFi Arbitrage Bot Framework\n\n## Supported DEXes\n- Uniswap V2/V3\n- SushiSwap\n- PancakeSwap\n- Curve Finance\n- Balancer\n- Custom DEX adapter interface\n\n## Features\n- Cross-DEX price monitoring\n- Flash loan integration (Aave, dYdX)\n- MEV protection (Flashbots Protect)\n- Gas optimization\n- Profit calculation with slippage\n- Backtesting engine\n- Paper trading mode\n\n## Architecture\n- Rust core for speed\n- TypeScript configuration layer\n- WebSocket price feeds\n- Redis for state management\n\n## Disclaimer\nFor educational and research purposes. DeFi trading carries significant financial risk.",
    category: "artifacts",
    riskCategory: "medium_risk",
    priceCredits: 3500,
    tags: ["DeFi", "arbitrage", "bot", "flash-loan", "Uniswap", "blockchain"],
    language: "Rust/TypeScript",
    license: "Proprietary",
    featured: true,
    version: "1.4.0",
    totalSales: 45,
    viewCount: 5678,
  },
  {
    merchantIndex: 6,
    title: "NFT Smart Contract Templates",
    description: "Gas-optimized ERC-721 and ERC-1155 smart contract templates with royalties, allowlists, reveal mechanics, and marketplace integration.",
    longDescription: "# NFT Smart Contract Templates\n\n## Templates\n- ERC-721A (gas-optimized batch minting)\n- ERC-1155 (multi-token)\n- Soulbound tokens (non-transferable)\n- Dynamic NFTs (on-chain metadata updates)\n- Generative art (on-chain SVG)\n\n## Features\n- EIP-2981 royalty standard\n- Merkle tree allowlists\n- Delayed reveal mechanism\n- Dutch auction minting\n- Multi-phase minting\n- OpenSea/Blur marketplace integration\n- Foundry test suite (100% coverage)\n\n## Deployment\n- Hardhat deployment scripts\n- Etherscan verification\n- Multi-chain support (ETH, Polygon, Base, Arbitrum)",
    category: "templates",
    riskCategory: "safe",
    priceCredits: 350,
    tags: ["NFT", "smart-contract", "Solidity", "ERC-721", "blockchain", "Web3"],
    language: "Solidity",
    license: "MIT",
    featured: false,
    version: "2.1.0",
    totalSales: 234,
    viewCount: 4567,
  },

  // ── Archibald Titan Official (7) — Platform Extensions ──
  {
    merchantIndex: 7,
    title: "Titan Builder Pro Extension",
    description: "Supercharge Titan's self-building capabilities with advanced code analysis, multi-file refactoring, and automated testing. The official builder upgrade.",
    longDescription: "# Titan Builder Pro Extension\n\n## Enhanced Capabilities\n- Multi-file refactoring with dependency tracking\n- Automated test generation for modified code\n- Performance profiling integration\n- Memory leak detection\n- Bundle size analysis\n- Accessibility audit (WCAG 2.1)\n- SEO analysis for frontend changes\n\n## Builder Intelligence\n- Learns from your codebase patterns\n- Suggests architectural improvements\n- Detects code duplication across files\n- Recommends library upgrades\n- Identifies unused dependencies\n\n## Integration\nInstall via the Titan dashboard. Automatically enhances all builder operations.",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 300,
    tags: ["Titan", "builder", "extension", "refactoring", "testing", "official"],
    language: "TypeScript",
    license: "Proprietary",
    featured: true,
    version: "1.0.0",
    totalSales: 456,
    viewCount: 8901,
  },
  {
    merchantIndex: 7,
    title: "Titan Security Hardening Pack",
    description: "Official security hardening module for Titan deployments. Automated security headers, CSP configuration, rate limiting, and intrusion detection.",
    longDescription: "# Titan Security Hardening Pack\n\n## Automated Protections\n- Security headers (HSTS, CSP, X-Frame-Options, etc.)\n- Content Security Policy generator\n- Rate limiting with Redis backend\n- Brute force protection\n- SQL injection prevention layer\n- XSS sanitization middleware\n- CSRF token management\n- IP reputation checking\n\n## Monitoring\n- Real-time attack detection dashboard\n- Suspicious activity alerts\n- Failed login tracking\n- API abuse detection\n- Automated IP blocking\n\n## Compliance\n- OWASP Top 10 coverage\n- SOC2 readiness checklist\n- GDPR data handling audit",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 250,
    tags: ["security", "hardening", "Titan", "official", "OWASP", "compliance"],
    language: "TypeScript",
    license: "Proprietary",
    featured: true,
    version: "1.2.0",
    totalSales: 678,
    viewCount: 7890,
  },
  {
    merchantIndex: 7,
    title: "Titan Chat Plugin SDK",
    description: "Build custom chat plugins for Archibald Titan. Add new commands, integrations, and AI capabilities. Full TypeScript SDK with examples.",
    longDescription: "# Titan Chat Plugin SDK\n\n## What You Can Build\n- Custom slash commands (/weather, /translate, /jira)\n- External API integrations (Slack, Discord, Jira, GitHub)\n- Custom AI tool definitions\n- Scheduled chat actions\n- Interactive message components (buttons, forms)\n\n## SDK Features\n- Full TypeScript types\n- Hot-reload during development\n- Built-in testing framework\n- Plugin marketplace publishing\n- Version management\n- User permission scoping\n\n## Quick Start\n```typescript\nimport { TitanPlugin } from '@titan/plugin-sdk';\n\nexport default new TitanPlugin({\n  name: 'my-plugin',\n  commands: [{\n    name: 'hello',\n    handler: async (ctx) => ctx.reply('Hello from my plugin!')\n  }]\n});\n```",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 150,
    tags: ["Titan", "plugin", "SDK", "chat", "official", "developer"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "1.0.0",
    totalSales: 345,
    viewCount: 5678,
  },
  {
    merchantIndex: 7,
    title: "Titan Analytics Dashboard Module",
    description: "Real-time analytics for your Titan instance. Track user engagement, API usage, credit consumption, builder activity, and system health.",
    longDescription: "# Titan Analytics Dashboard\n\n## Metrics Tracked\n- User engagement (DAU, MAU, session duration)\n- API usage (requests/sec, latency, error rates)\n- Credit consumption (by user, by feature, trends)\n- Builder activity (builds/day, success rate, popular tools)\n- System health (CPU, memory, disk, DB connections)\n- Revenue metrics (MRR, churn, LTV)\n\n## Visualizations\n- Real-time line charts\n- Heatmaps (usage by hour/day)\n- Funnel analysis\n- Cohort retention\n- Geographic distribution\n\n## Alerts\n- Anomaly detection (spike/drop alerts)\n- Threshold-based alerts\n- Slack/Discord/Email notifications\n\n## Export\n- CSV/JSON data export\n- Scheduled email reports\n- API access for custom dashboards",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 400,
    tags: ["analytics", "dashboard", "Titan", "official", "metrics", "monitoring"],
    language: "TypeScript",
    license: "Proprietary",
    featured: true,
    version: "1.1.0",
    totalSales: 234,
    viewCount: 4567,
  },
  {
    merchantIndex: 7,
    title: "Titan White-Label Kit",
    description: "Rebrand and resell Titan as your own product. Custom logos, colors, domain, and branding. Perfect for agencies and consultants.",
    longDescription: "# Titan White-Label Kit\n\n## Customization\n- Custom logo and favicon\n- Brand colors and typography\n- Custom domain mapping\n- Custom email templates\n- Custom landing page\n- Remove all Titan branding\n\n## Business Features\n- Multi-tenant support\n- Per-client billing\n- Usage quotas per tenant\n- Custom pricing tiers\n- Reseller dashboard\n- Client onboarding wizard\n\n## Technical\n- Environment variable configuration\n- CSS theme override system\n- Logo replacement via dashboard\n- DNS CNAME setup guide\n- SSL certificate automation",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 2000,
    tags: ["white-label", "Titan", "official", "reseller", "agency", "branding"],
    language: "TypeScript",
    license: "Proprietary",
    featured: true,
    version: "1.0.0",
    totalSales: 23,
    viewCount: 3456,
  },

  // ── Additional diverse modules ──
  {
    merchantIndex: 1,
    title: "AI Customer Support Chatbot Blueprint",
    description: "Build an AI-powered customer support chatbot with RAG, knowledge base integration, ticket escalation, and multi-language support.",
    longDescription: "# AI Customer Support Chatbot\n\n## Features\n- RAG (Retrieval Augmented Generation) for accurate answers\n- Knowledge base ingestion (docs, FAQs, tickets)\n- Automatic ticket creation and escalation\n- Multi-language support (50+ languages)\n- Sentiment analysis\n- Conversation handoff to human agents\n- Analytics dashboard\n\n## Integrations\n- Zendesk, Freshdesk, Intercom\n- Slack, Discord, WhatsApp\n- Custom website widget\n- REST API\n\n## Models\n- GPT-4.1 (via OpenAI API)\n- Claude 3.5 (via Anthropic API)\n- Open-source (Llama, Mistral via Ollama)",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 700,
    tags: ["chatbot", "AI", "customer-support", "RAG", "NLP", "automation"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "2.0.0",
    totalSales: 312,
    viewCount: 5678,
  },
  {
    merchantIndex: 3,
    title: "Next.js E-Commerce Starter",
    description: "Complete e-commerce starter with product catalog, cart, checkout, Stripe payments, admin panel, and inventory management. SEO-optimized.",
    longDescription: "# Next.js E-Commerce Starter\n\n## Features\n- Product catalog with categories and filters\n- Shopping cart with persistence\n- Stripe checkout (cards, Apple Pay, Google Pay)\n- Order management dashboard\n- Inventory tracking\n- Customer accounts\n- Wishlist\n- Review system\n- SEO optimization (structured data, sitemap)\n- Email notifications (order confirmation, shipping)\n\n## Tech Stack\n- Next.js 14 (App Router)\n- TypeScript + Tailwind CSS\n- Prisma + PostgreSQL\n- Stripe for payments\n- Cloudinary for images\n- Resend for emails",
    category: "templates",
    riskCategory: "safe",
    priceCredits: 500,
    tags: ["e-commerce", "Next.js", "Stripe", "React", "shop", "payments"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "3.0.0",
    totalSales: 456,
    viewCount: 7890,
  },
  {
    merchantIndex: 5,
    title: "Log Analysis & SIEM Lite",
    description: "Lightweight SIEM for small teams. Collects logs from servers, applications, and cloud services. Real-time alerting and search.",
    longDescription: "# Log Analysis & SIEM Lite\n\n## Log Sources\n- Syslog (UDP/TCP)\n- Filebeat/Fluentd agents\n- AWS CloudTrail/CloudWatch\n- Docker container logs\n- Application logs (JSON/text)\n- Nginx/Apache access logs\n\n## Features\n- Full-text search with Lucene syntax\n- Real-time log streaming\n- Alert rules (regex, threshold, anomaly)\n- Dashboard builder\n- Correlation rules\n- Incident timeline\n- User activity tracking\n\n## Architecture\n- Elasticsearch for storage/search\n- Kibana-compatible dashboards\n- Redis for real-time streaming\n- Docker Compose deployment\n\n## Sizing\nHandles up to 10GB/day on a single node.",
    category: "blueprints",
    riskCategory: "safe",
    priceCredits: 550,
    tags: ["SIEM", "logging", "security", "monitoring", "DevOps", "alerting"],
    language: "TypeScript/Go",
    license: "Apache-2.0",
    featured: false,
    version: "1.3.0",
    totalSales: 178,
    viewCount: 3456,
  },
  {
    merchantIndex: 2,
    title: "Social Media OSINT Framework",
    description: "Automated social media intelligence gathering. Profile analysis, connection mapping, sentiment tracking across Twitter, LinkedIn, Instagram, and Reddit.",
    longDescription: "# Social Media OSINT Framework\n\n## Platforms\n- Twitter/X (profile, tweets, followers, connections)\n- LinkedIn (profile, company, employees)\n- Instagram (profile, posts, stories, followers)\n- Reddit (profile, posts, comments, subreddits)\n- GitHub (repos, contributions, connections)\n- Telegram (public channels, groups)\n\n## Analysis\n- Profile enrichment and correlation\n- Connection/network mapping\n- Sentiment analysis over time\n- Activity pattern detection\n- Fake account detection\n- Influence scoring\n- Geographic inference\n\n## Output\n- Interactive network graph\n- PDF intelligence report\n- JSON/CSV data export\n- Neo4j graph database export",
    category: "artifacts",
    riskCategory: "medium_risk",
    priceCredits: 600,
    tags: ["OSINT", "social-media", "intelligence", "analysis", "security", "recon"],
    language: "Python",
    license: "Proprietary",
    featured: false,
    version: "2.1.0",
    totalSales: 145,
    viewCount: 3890,
  },
  {
    merchantIndex: 4,
    title: "JWT Authentication Library — Hardened",
    description: "Battle-tested JWT library with refresh token rotation, device fingerprinting, token revocation, and brute-force protection. Drop-in replacement for jsonwebtoken.",
    longDescription: "# JWT Authentication Library — Hardened\n\n## Security Features\n- Refresh token rotation (single-use tokens)\n- Device fingerprinting\n- Token revocation list (Redis-backed)\n- Brute-force protection\n- Rate limiting per user/IP\n- Automatic token cleanup\n- Secure cookie configuration\n\n## API\n```typescript\nimport { TitanJWT } from 'titan-jwt';\n\nconst auth = new TitanJWT({\n  secret: process.env.JWT_SECRET,\n  accessTokenTTL: '15m',\n  refreshTokenTTL: '7d',\n  rotateRefreshTokens: true,\n  deviceFingerprint: true,\n});\n\nconst { accessToken, refreshToken } = auth.generateTokenPair(userId);\n```\n\n## Compliance\n- OWASP JWT best practices\n- No algorithm confusion attacks\n- Enforced algorithm whitelist",
    category: "modules",
    riskCategory: "safe",
    priceCredits: 200,
    tags: ["JWT", "authentication", "security", "tokens", "auth", "Node.js"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "3.0.0",
    totalSales: 567,
    viewCount: 6789,
  },
  {
    merchantIndex: 6,
    title: "Blockchain Transaction Monitor",
    description: "Real-time monitoring of blockchain transactions with pattern detection, whale alerts, and suspicious activity flagging. Supports BTC, ETH, and 20+ chains.",
    longDescription: "# Blockchain Transaction Monitor\n\n## Supported Chains\n- Bitcoin, Ethereum, Polygon, Arbitrum, Optimism\n- BSC, Avalanche, Fantom, Solana\n- 15+ additional EVM chains\n\n## Detection Patterns\n- Whale transactions (configurable thresholds)\n- Mixer/tumbler usage\n- Bridge transactions\n- Flash loan activity\n- Unusual gas patterns\n- Known scam addresses\n- Sanctions list matching (OFAC)\n\n## Alerts\n- Real-time WebSocket feed\n- Telegram/Discord/Slack bots\n- Email digests\n- Webhook integration\n- Custom alert rules (amount, address, pattern)\n\n## Dashboard\n- Transaction flow visualization\n- Address clustering\n- Risk scoring\n- Historical analysis",
    category: "artifacts",
    riskCategory: "safe",
    priceCredits: 900,
    tags: ["blockchain", "monitoring", "crypto", "compliance", "AML", "security"],
    language: "TypeScript",
    license: "MIT",
    featured: false,
    version: "1.7.0",
    totalSales: 123,
    viewCount: 2890,
  },
];

// ─── Seed Function ──────────────────────────────────────────────────
export async function seedMarketplaceWithMerchants(): Promise<{ merchants: number; listings: number; skipped: number; attempted: number; errors: string[]; merchantMap: Record<string, number> }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let merchantsCreated = 0;
  let listingsCreated = 0;

  // Map from merchantIndex to userId
  const merchantUserIds: Map<number, number> = new Map();

  // Step 1: Create merchant bot user accounts
  for (let i = 0; i < MERCHANT_BOTS.length; i++) {
    const bot = MERCHANT_BOTS[i];
    try {
      // Check if bot user already exists
      const existing = await db.select().from(users).where(eq(users.openId, bot.openId)).limit(1);
      let userId: number;

      if (existing[0]) {
        userId = existing[0].id;
      } else {
        const result = await db.insert(users).values({
          openId: bot.openId,
          name: bot.name,
          email: bot.email,
          loginMethod: "system",
          role: "user",
          emailVerified: true,
          onboardingCompleted: true,
        });
        userId = result[0].insertId;
        merchantsCreated++;
      }

      merchantUserIds.set(i, userId);

      // Create or update seller profile
      const existingProfile = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
      if (existingProfile[0]) {
        await db.update(sellerProfiles).set({
          displayName: bot.name,
          bio: bot.bio,
          totalSales: bot.totalSales,
          avgRating: bot.avgRating,
          ratingCount: bot.ratingCount,
          verified: bot.verified,
        }).where(eq(sellerProfiles.userId, userId));
      } else {
        await db.insert(sellerProfiles).values({
          userId,
          displayName: bot.name,
          bio: bot.bio,
          totalSales: bot.totalSales,
          avgRating: bot.avgRating,
          ratingCount: bot.ratingCount,
          verified: bot.verified,
        });
      }
    } catch (e: unknown) {
      log.warn(`[Marketplace Seed] Failed to create merchant "${bot.name}":`, { error: String(getErrorMessage(e)) });
    }
  }

  // Step 2: Create module listings
  const errors: string[] = [];
  let skipped = 0;
  let attempted = 0;
  for (const mod of MODULE_CATALOG) {
    const sellerId = merchantUserIds.get(mod.merchantIndex);
    if (!sellerId) {
      errors.push(`No seller for merchantIndex ${mod.merchantIndex} (${mod.title})`);
      continue;
    }

    const uid = generateUid();
    const slug = slugify(mod.title) + "-" + uid.slice(-6).toLowerCase();
    attempted++;

    try {
      // Check if a listing with this exact title already exists
      const existing = await db.select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.title, mod.title))
        .limit(1);

      if (existing[0]) {
        skipped++;
        continue;
      }

      await db.insert(marketplaceListings).values({
        uid,
        sellerId,
        title: mod.title,
        slug,
        description: mod.description,
        longDescription: mod.longDescription,
        category: mod.category as any,
        riskCategory: mod.riskCategory as any,
        priceCredits: mod.priceCredits,
        priceUsd: Math.round(mod.priceCredits / 100),
        tags: JSON.stringify(mod.tags),
        language: mod.language,
        license: mod.license,
        version: mod.version,
        totalSales: mod.totalSales,
        viewCount: mod.viewCount,
        featured: mod.featured,
        reviewStatus: "approved" as const,
        status: "active" as const,
      });
      listingsCreated++;
    } catch (e: unknown) {
      errors.push(`${mod.title}: ${getErrorMessage(e)?.substring(0, 150)}`);
    }
  }

  log.info(`[Marketplace Seed] Created ${merchantsCreated} merchants, ${listingsCreated} listings, ${skipped} skipped, ${errors.length} errors`);
  return { merchants: merchantsCreated, listings: listingsCreated, skipped, attempted, errors: errors.slice(0, 10), merchantMap: Object.fromEntries(merchantUserIds) };
}

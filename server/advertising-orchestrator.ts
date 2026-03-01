/**
 * Autonomous Advertising Orchestrator
 * 
 * The master brain that coordinates ALL of Titan's growth systems:
 * - SEO Engine → organic search traffic (FREE)
 * - Blog System → content marketing & long-tail keywords (FREE)
 * - Marketing Engine → social media & paid campaigns ($500 AUD/month)
 * - Affiliate Engine → partner-driven revenue (FREE)
 * - Email Service → lead nurturing & retention (FREE)
 * - Ad Tracking → conversion measurement (FREE)
 * 
 * Strategy: 80% free organic growth, 20% paid amplification
 * Budget: $500 AUD/month → Google Ads only (highest intent traffic)
 */

import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { generateContent, allocateBudget, runAutonomousCycle as runMarketingCycle } from "./marketing-engine";
import { runScheduledSeoOptimization, analyzeSeoHealth, analyzeKeywords, generateSeoReport } from "./seo-engine";
import { getAffiliateRecommendationContext } from "./affiliate-recommendation-engine";
import {
  xAdapter,
  redditAdapter,
  tiktokAdapter,
  linkedinAdapter,
  pinterestAdapter,
  getConnectedChannels,
  type ChannelId,
} from "./marketing-channels";
import { ENV } from "./_core/env";
import {
  devtoAdapter,
  mediumAdapter,
  hashnodeAdapter,
  discordAdapter,
  mastodonAdapter,
  telegramAdapter,
  whatsappAdapter,
  getExpandedChannelStatuses,
  getConnectedExpandedChannels,
  getContentQueueChannels,
} from "./expanded-channels";
import {
  marketingContent,
  marketingActivityLog,
  marketingCampaigns,
  marketingPerformance,
  marketingSettings,
  blogPosts,
  blogCategories,
  affiliatePartners,
  affiliateClicks,
} from "../drizzle/schema";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";
import { runTikTokContentPipeline, getTikTokContentStats, isTikTokContentConfigured } from "./tiktok-content-service";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
import { generateShortFormVideo, generateMarketingVideo, generateSocialClip, isVideoGenerationAvailable } from "./_core/videoGeneration";
const log = createLogger("AdvertisingOrchestrator");

// ============================================
// CONSTANTS
// ============================================

const MONTHLY_BUDGET_AUD = 500;
const GOOGLE_ADS_ALLOCATION = 500; // All paid budget goes to Google Ads
const FREE_CHANNELS = [
  "seo_organic",
  "blog_content",
  "social_organic",
  "community_engagement",
  "affiliate_network",
  "email_nurture",
  "product_hunt",
  "github_presence",
  "backlink_outreach",
  "forum_participation",
  "tiktok_organic",
  "pinterest_organic",
  "linkedin_organic",
  "devto_crosspost",
  "quora_answers",
  "medium_republish",
  "youtube_shorts",
  "discord_community",
  "skool_community",
  "indiehackers",
  "lobsters",
  "hashnode_crosspost",
  "github_discussions",
  "mastodon_infosec",
  "telegram_channel",
  "hackernews_submit",
  "twitch_dev",
  "slack_communities",
  "xda_forums",
  "spiceworks",
  "bugcrowd_community",
  "steam_community",
  "lemmy_fediverse",
  "whatsapp_broadcast",
  "hackforums",
  "0x00sec",
  "nullbyte",
  "hackthebox_community",
  "tryhackme_community",
  "owasp_community",
  "offensive_security",
  "ctftime",
  "breachforums_alt",
] as const;

type FreeChannel = (typeof FREE_CHANNELS)[number];

// Content topics that drive organic traffic for cybersecurity SaaS
const CONTENT_PILLARS = [
  {
    pillar: "API Key Security",
    keywords: ["api key management", "secure api keys", "api key rotation", "api key vault", "credential management tool"],
    blogTopics: [
      "How to Securely Store API Keys in 2026",
      "API Key Rotation Best Practices for DevOps Teams",
      "The Hidden Cost of Leaked API Keys",
      "Why Developers Need a Credential Manager",
      "API Key Security Checklist for Startups",
    ],
    socialAngles: ["security tips", "dev productivity", "horror stories of leaked keys"],
  },
  {
    pillar: "Cloud Security",
    keywords: ["cloud credential management", "multi-cloud security", "aws key management", "gcp api keys", "azure secrets"],
    blogTopics: [
      "Managing Credentials Across AWS, GCP, and Azure",
      "Cloud Security Mistakes That Cost Companies Millions",
      "How to Audit Your Cloud API Keys in 5 Minutes",
      "Multi-Cloud Credential Management Made Simple",
      "Zero Trust Architecture for API Credentials",
    ],
    socialAngles: ["cloud migration tips", "security audit guides", "cost savings"],
  },
  {
    pillar: "Developer Tools",
    keywords: ["developer security tools", "devsecops tools", "credential scanning", "secret detection", "developer productivity"],
    blogTopics: [
      "Top 10 Security Tools Every Developer Needs in 2026",
      "How to Prevent Secret Leaks in Git Repositories",
      "DevSecOps: Shifting Security Left Without Slowing Down",
      "Automating Credential Rotation with Archibald Titan",
      "The Developer's Guide to Secure Coding Practices",
    ],
    socialAngles: ["tool comparisons", "workflow optimization", "security automation"],
  },
  {
    pillar: "Cybersecurity Trends",
    keywords: ["cybersecurity trends 2026", "api security threats", "credential theft prevention", "zero day exploits", "security automation"],
    blogTopics: [
      "Cybersecurity Trends to Watch in 2026",
      "How AI is Changing Credential Security",
      "The Rise of Automated Credential Theft",
      "Why Traditional Password Managers Aren't Enough for Developers",
      "Building a Security-First Development Culture",
    ],
    socialAngles: ["trend analysis", "threat intelligence", "industry predictions"],
  },
  {
    pillar: "Compliance & Governance",
    keywords: ["api key compliance", "soc2 credential management", "gdpr api security", "security compliance tools", "audit trail credentials"],
    blogTopics: [
      "SOC 2 Compliance for API Key Management",
      "GDPR and API Credentials: What You Need to Know",
      "How to Build an Audit Trail for Your API Keys",
      "Compliance Automation for Development Teams",
      "Security Governance Best Practices for SaaS Companies",
    ],
    socialAngles: ["compliance guides", "regulatory updates", "audit preparation"],
  },
];

// Community platforms for free engagement
const COMMUNITY_TARGETS = {
  reddit: {
    subreddits: [
      "r/cybersecurity", "r/netsec", "r/devops", "r/programming",
      "r/webdev", "r/sysadmin", "r/aws", "r/googlecloud",
      "r/kubernetes", "r/devsecops", "r/selfhosted",
    ],
    strategy: "Provide genuine value in comments, share expertise, occasionally mention Titan when relevant",
  },
  hackernews: {
    strategy: "Submit blog posts, engage in security discussions, share Show HN when launching features",
  },
  devto: {
    strategy: "Cross-post blog articles, engage with developer community, build following",
  },
  producthunt: {
    strategy: "Launch new features as Product Hunt posts, engage with upvoters",
  },
  github: {
    strategy: "Open source security tools, contribute to security projects, build stars",
  },
  stackoverflow: {
    strategy: "Answer API key and credential management questions, build reputation",
  },
  twitter: {
    strategy: "Daily security tips, thread breakdowns of breaches, engage with infosec community",
  },
  tiktok: {
    strategy: "60-second security tip videos, screen recordings of Titan features, trending audio hooks",
  },
  youtube_shorts: {
    strategy: "Quick security demos, API key horror stories, tool comparisons under 60 seconds",
  },
  linkedin: {
    strategy: "Thought leadership posts, security breach analysis, CTO-level insights on credential management",
  },
  pinterest: {
    strategy: "Security infographics, cheat sheets, visual guides on API security best practices",
  },
  medium: {
    strategy: "Republish blog posts with canonical URLs, reach 100M+ monthly readers",
  },
  hashnode: {
    strategy: "Cross-post developer-focused articles, engage with Hashnode dev community",
  },
  discord: {
    strategy: "Daily security tips, community Q&A, feature announcements in cybersecurity servers",
  },
  mastodon: {
    strategy: "Infosec community engagement on infosec.exchange, privacy-focused audience",
  },
  telegram: {
    strategy: "Broadcast security alerts, product updates, and tips to channel subscribers",
  },
  skool: {
    strategy: "Free cybersecurity course content, community discussions, funnel to paid tier",
  },
  indiehackers: {
    strategy: "Building-in-public updates, revenue milestones, growth experiments",
  },
  lobsters: {
    strategy: "Technical security articles, tool announcements for invite-only tech community",
  },
  quora: {
    strategy: "Expert answers to API security, credential management, and cybersecurity questions",
  },
  twitch: {
    strategy: "Live coding security tools, bug bounty streams, Titan feature demos",
  },
  slack_communities: {
    strategy: "Value-first engagement in DevOps, Cloud Security, and OWASP Slack workspaces",
  },
  xda: {
    strategy: "Mobile security guides, app credential management tutorials",
  },
  spiceworks: {
    strategy: "IT admin security discussions, enterprise credential management advice",
  },
  bugcrowd: {
    strategy: "Security research posts, vulnerability disclosure best practices",
  },
  steam: {
    strategy: "Gaming account security guides, 2FA setup tutorials, anti-phishing tips",
  },
  lemmy: {
    strategy: "Privacy-focused security discussions, open-source security tool recommendations",
  },
  github_discussions: {
    strategy: "Help developers with credential management questions in popular repos",
  },
  whatsapp: {
    strategy: "Broadcast security alerts, weekly tips, and product updates to opted-in subscribers via WhatsApp Business",
  },
  hackforums: {
    strategy: "Position Titan as the go-to AI for credential management, automation, and security research. Share tools, scripts, and tutorials that showcase Titan's capabilities",
  },
  "0x00sec": {
    strategy: "Share advanced security research, reverse engineering insights, and exploit development tutorials. Position Titan as essential infrastructure for security researchers",
  },
  nullbyte: {
    strategy: "Post beginner-to-intermediate hacking tutorials that naturally integrate Titan for credential management and automation. WonderHowTo/Null Byte audience loves step-by-step guides",
  },
  hackthebox: {
    strategy: "Share CTF writeups, machine walkthroughs, and penetration testing tips. Show how Titan manages API keys and credentials during engagements",
  },
  tryhackme: {
    strategy: "Create learning path content, room walkthroughs, and security tool tutorials. Position Titan as a learning companion for aspiring security professionals",
  },
  owasp: {
    strategy: "Contribute to OWASP projects, share application security research, and participate in chapter meetings. Build credibility through genuine open-source contributions",
  },
  offensive_security: {
    strategy: "Share OSCP/OSCE prep tips, penetration testing methodologies, and red team tooling. Position Titan as essential for managing engagement credentials",
  },
  ctftime: {
    strategy: "Post CTF event announcements, writeups, and team recruitment. Build presence in the competitive hacking community",
  },
  breachforums_alt: {
    strategy: "Monitor breach notification communities for trending security topics. Generate content addressing current threats and how Titan protects against them",
  },
};

// ============================================
// TYPES
// ============================================

export interface AdvertisingCycleResult {
  timestamp: string;
  duration: number;
  actions: AdvertisingAction[];
  metrics: {
    blogPostsGenerated: number;
    socialPostsCreated: number;
    socialPostsPublished: number;
    communityEngagements: number;
    seoOptimizations: number;
    emailCampaignsSent: number;
    affiliateActionsTriggered: number;
    totalFreeActions: number;
    paidSpend: number;
  };
  nextScheduledRun: string;
  errors: string[];
}

export interface AdvertisingAction {
  channel: FreeChannel | "google_ads";
  action: string;
  status: "success" | "failed" | "skipped";
  details: string;
  cost: number; // 0 for free channels
}

export interface GrowthStrategy {
  channel: FreeChannel | "google_ads";
  frequency: string;
  description: string;
  expectedImpact: "high" | "medium" | "low";
  costPerMonth: number;
  automatable: boolean;
}

// ============================================
// GROWTH STRATEGY MATRIX
// ============================================

export const GROWTH_STRATEGIES: GrowthStrategy[] = [
  {
    channel: "seo_organic",
    frequency: "Daily auto-optimization",
    description: "Automated SEO health checks, keyword tracking, meta tag optimization, sitemap updates, and structured data maintenance via the SEO Engine",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "blog_content",
    frequency: "3 posts per week",
    description: "AI-generated long-form SEO blog posts targeting high-intent keywords across 5 content pillars. Each post is optimized for search and includes internal links to product pages",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "social_organic",
    frequency: "2x daily across platforms",
    description: "AI-generated social media posts for X/Twitter, LinkedIn, Reddit — security tips, product updates, industry commentary. Uses Marketing Engine content generation",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "community_engagement",
    frequency: "Daily participation",
    description: "Automated monitoring and engagement on Reddit (r/cybersecurity, r/devops), HackerNews, Dev.to, StackOverflow — providing genuine value while building brand awareness",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "affiliate_network",
    frequency: "Twice weekly discovery",
    description: "Automated affiliate partner discovery and signup via the Affiliate Discovery Engine. Contextual product recommendations woven into Titan chat for non-admin users",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "email_nurture",
    frequency: "Weekly drip + event-triggered",
    description: "Welcome sequences for new signups, weekly security tips newsletter, re-engagement campaigns for inactive users, upgrade prompts based on usage patterns",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "google_ads",
    frequency: "Continuous (budget-controlled)",
    description: "High-intent search campaigns targeting 'api key manager', 'credential management tool', 'secure api vault'. All $500 AUD/month allocated here for maximum ROI",
    expectedImpact: "high",
    costPerMonth: MONTHLY_BUDGET_AUD,
    automatable: true,
  },
  {
    channel: "product_hunt",
    frequency: "Monthly feature launches",
    description: "Launch new features on Product Hunt to drive awareness spikes. Coordinate with blog posts and social media for maximum visibility",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: false,
  },
  {
    channel: "github_presence",
    frequency: "Weekly contributions",
    description: "Open source security utilities, contribute to popular security repos, maintain GitHub profile with security-focused projects to build developer trust",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: false,
  },
  {
    channel: "backlink_outreach",
    frequency: "Weekly outreach",
    description: "AI-generated outreach emails to security bloggers, tool comparison sites, and developer publications requesting backlinks and reviews",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "forum_participation",
    frequency: "Daily monitoring",
    description: "Monitor and respond to questions about API key management, credential security, and related topics on forums, Quora, and community sites",
    expectedImpact: "low",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "tiktok_organic",
    frequency: "3x per week",
    description: "Auto-generate and post TikTok photo carousels from blog content — AI-generated cyberpunk infographics with hooks, hashtags, and CTAs. Direct posting via Content Posting API when configured.",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "devto_crosspost",
    frequency: "Every blog post",
    description: "Auto-cross-post blog articles to Dev.to via API with canonical URL back to main site (250K+ daily readers)",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "medium_republish",
    frequency: "Every blog post",
    description: "Auto-republish articles on Medium via API with canonical URL (100M+ monthly readers)",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "hashnode_crosspost",
    frequency: "Every blog post",
    description: "Auto-cross-post to Hashnode developer blog via GraphQL API",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "discord_community",
    frequency: "Daily",
    description: "Auto-post security tips, blog summaries, and product updates to Discord server via webhook",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "mastodon_infosec",
    frequency: "Daily",
    description: "Auto-post to infosec.exchange Mastodon instance — privacy-focused developer audience",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "telegram_channel",
    frequency: "Daily",
    description: "Auto-broadcast security alerts and tips to Telegram channel subscribers via Bot API",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "whatsapp_broadcast",
    frequency: "Weekly",
    description: "Broadcast security tips and product updates via WhatsApp Business Cloud API (1000 free conversations/month)",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "youtube_shorts",
    frequency: "3x per week",
    description: "Generate YouTube Shorts scripts — 60-second security demos and API key management tips",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "linkedin_organic",
    frequency: "Daily",
    description: "Auto-post thought leadership content to LinkedIn — CTO-level security insights",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "quora_answers",
    frequency: "3x per week",
    description: "Generate expert answers to cybersecurity and API management questions on Quora",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "skool_community",
    frequency: "2x per week",
    description: "Generate free cybersecurity course content and discussion posts for Skool community — funnel to paid tier",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "indiehackers",
    frequency: "Weekly",
    description: "Generate building-in-public updates, revenue milestones, and growth experiments for IndieHackers",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "pinterest_organic",
    frequency: "3x per week",
    description: "Generate security infographic pin descriptions and cheat sheet copy for Pinterest",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "hackernews_submit",
    frequency: "Weekly",
    description: "Generate Show HN posts and technical article submissions for Hacker News",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "lobsters",
    frequency: "Bi-weekly",
    description: "Generate technical security article submissions for Lobste.rs invite-only community",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "github_discussions",
    frequency: "3x per week",
    description: "Generate helpful responses for credential management questions in popular GitHub repos",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "twitch_dev",
    frequency: "Weekly",
    description: "Generate live coding stream outlines for security tool development on Twitch",
    expectedImpact: "low",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "slack_communities",
    frequency: "Daily",
    description: "Generate value-first messages for DevOps, OWASP, and Cloud Security Slack workspaces",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "xda_forums",
    frequency: "Weekly",
    description: "Generate mobile security and app credential management guides for XDA Developers",
    expectedImpact: "low",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "spiceworks",
    frequency: "2x per week",
    description: "Generate IT admin security discussion posts for Spiceworks community",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "bugcrowd_community",
    frequency: "Weekly",
    description: "Generate security research and vulnerability disclosure posts for bug bounty communities",
    expectedImpact: "low",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "steam_community",
    frequency: "Weekly",
    description: "Generate gaming account security guides, 2FA tutorials, and anti-phishing tips for Steam forums",
    expectedImpact: "low",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "lemmy_fediverse",
    frequency: "2x per week",
    description: "Generate privacy-focused security discussion posts for Lemmy/Fediverse communities",
    expectedImpact: "low",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "hackforums",
    frequency: "3x per week",
    description: "Generate tool tutorials, automation scripts, and security research posts for HackForums. Position Titan as the AI hackers need for credential management",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "0x00sec",
    frequency: "2x per week",
    description: "Generate advanced security research articles, exploit analysis, and reverse engineering tutorials for 0x00sec community",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "nullbyte",
    frequency: "2x per week",
    description: "Generate step-by-step hacking tutorials for Null Byte that naturally showcase Titan's automation and credential management",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "hackthebox_community",
    frequency: "3x per week",
    description: "Generate CTF writeups, machine walkthroughs, and penetration testing methodology posts for Hack The Box forums",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "tryhackme_community",
    frequency: "3x per week",
    description: "Generate room walkthroughs, learning path guides, and beginner security tutorials for TryHackMe community",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "owasp_community",
    frequency: "Weekly",
    description: "Generate OWASP Top 10 analysis, application security guides, and open-source security tool contributions",
    expectedImpact: "high",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "offensive_security",
    frequency: "2x per week",
    description: "Generate OSCP prep guides, red team methodology posts, and penetration testing tool comparisons",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "ctftime",
    frequency: "Weekly",
    description: "Generate CTF event writeups, challenge solutions, and competitive hacking team content",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
  {
    channel: "breachforums_alt",
    frequency: "2x per week",
    description: "Generate threat intelligence summaries, breach analysis posts, and credential security advisories for breach notification communities",
    expectedImpact: "medium",
    costPerMonth: 0,
    automatable: true,
  },
];

// ============================================
// CORE ORCHESTRATOR FUNCTIONS
// ============================================

/**
 * Generate an SEO-optimized blog post using the existing blog system
 */
async function generateSeoBlogPost(): Promise<AdvertisingAction> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Pick a random content pillar and topic
    const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
    const topic = pillar.blogTopics[Math.floor(Math.random() * pillar.blogTopics.length)];
    const targetKeyword = pillar.keywords[Math.floor(Math.random() * pillar.keywords.length)];

    // Check if we already have a post with a similar title
    const existing = await (db as Record<string, any>).query.blogPosts.findFirst({
      where: sql`LOWER(${blogPosts.title}) LIKE ${`%${topic.toLowerCase().substring(0, 30)}%`}`,
    });

    if (existing) {
      return {
        channel: "blog_content",
        action: "generate_blog_post",
        status: "skipped",
        details: `Similar post already exists: "${existing.title}"`,
        cost: 0,
      };
    }

    // Use LLM to generate the blog post
    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        {
          role: "system",
          content: `You are an expert cybersecurity content writer for Archibald Titan, a credential management platform. Write SEO-optimized blog posts that provide genuine value while naturally positioning Archibald Titan as the solution. 
          
Target keyword: "${targetKeyword}"
Content pillar: "${pillar.pillar}"

Write in a professional but approachable tone. Include:
- Compelling headline (60 chars max for SEO)
- Meta description (155 chars max)
- 1500-2000 word article with H2/H3 subheadings
- Natural keyword placement (2-3% density)
- Internal link suggestion to Titan features
- Call to action at the end

Return as JSON: { "title": "...", "metaDescription": "...", "content": "...(markdown)...", "tags": ["..."], "category": "..." }`,
        },
        {
          role: "user",
          content: `Write a comprehensive blog post about: "${topic}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "blog_post",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              metaDescription: { type: "string" },
              content: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              category: { type: "string" },
            },
            required: ["title", "metaDescription", "content", "tags", "category"],
            additionalProperties: false,
          },
        },
      },
    });

    const post = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Generate a slug
    const slug = post.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 80);

    // Ensure category exists
    let categoryId: number | null = null;
    const existingCat = await (db as Record<string, any>).query.blogCategories.findFirst({
      where: eq(blogCategories.name, post.category || "Security"),
    });
    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const [newCat] = await db.insert(blogCategories).values({
        name: post.category || "Security",
        slug: (post.category || "Security").toLowerCase().replace(/\s+/g, "-"),
      });
      categoryId = newCat.insertId;
    }

    // Insert the blog post
    await db.insert(blogPosts).values({
      title: post.title,
      slug,
      content: post.content,
      excerpt: post.metaDescription,
      category: "cybersecurity",
      status: "published",
      tags: post.tags || [],
      metaTitle: post.title,
      metaDescription: post.metaDescription,
      focusKeyword: targetKeyword,
      publishedAt: new Date(),
    } as any);

    return {
      channel: "blog_content",
      action: "generate_blog_post",
      status: "success",
      details: `Published: "${post.title}" targeting "${targetKeyword}"`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "blog_content",
      action: "generate_blog_post",
      status: "failed",
      details: `Blog generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Generate and post organic social media content using the Marketing Engine
 */
async function generateSocialContent(): Promise<AdvertisingAction[]> {
  const actions: AdvertisingAction[] = [];
  const connectedChannels = getConnectedChannels();

  // Generate content for X/Twitter
  const hasTwitter = connectedChannels.some((c) => c.id === "x_twitter");
  if (hasTwitter) {
    try {
      const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
      const angle = pillar.socialAngles[Math.floor(Math.random() * pillar.socialAngles.length)];

      const content = await generateContent({
        platform: "x_twitter",
        contentType: "organic_post",
        topic: `${pillar.pillar} - ${angle}`,
        includeImage: false,
      });

      const tweetText = `${content.headline}\n\n${content.body}\n\n${content.hashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}`.substring(0, 280);

      const result = await xAdapter.postTweet({ text: tweetText });

      actions.push({
        channel: "social_organic",
        action: "post_tweet",
        status: result.success ? "success" : "failed",
        details: result.success ? `Posted tweet: "${content.headline}"` : `Tweet failed: ${result.error}`,
        cost: 0,
      });
    } catch (err: unknown) {
      actions.push({
        channel: "social_organic",
        action: "post_tweet",
        status: "failed",
        details: `Twitter post failed: ${getErrorMessage(err)}`,
        cost: 0,
      });
    }
  }

  // Generate content for Reddit (value-first approach)
  const hasReddit = connectedChannels.some((c) => c.id === "reddit");
  if (hasReddit) {
    try {
      const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
      const subreddit = COMMUNITY_TARGETS.reddit.subreddits[
        Math.floor(Math.random() * COMMUNITY_TARGETS.reddit.subreddits.length)
      ].replace("r/", "");

      const content = await generateContent({
        platform: "reddit",
        contentType: "organic_post",
        topic: `${pillar.pillar} - educational content for ${subreddit}`,
        includeImage: false,
      });

      const result = await redditAdapter.submitPost({
        subreddit,
        title: content.headline.substring(0, 300),
        text: content.body,
      });

      actions.push({
        channel: "community_engagement",
        action: "reddit_post",
        status: result.success ? "success" : "failed",
        details: result.success ? `Posted to r/${subreddit}: "${content.headline}"` : `Reddit post failed: ${result.error}`,
        cost: 0,
      });
    } catch (err: unknown) {
      actions.push({
        channel: "community_engagement",
        action: "reddit_post",
        status: "failed",
        details: `Reddit post failed: ${getErrorMessage(err)}`,
        cost: 0,
      });
    }
  }

  // Generate a LinkedIn-style thought leadership post
  const hasLinkedin = connectedChannels.some((c) => c.id === "linkedin");
  if (hasLinkedin) {
    try {
      const content = await generateContent({
        platform: "linkedin",
        contentType: "organic_post",
        topic: "Cybersecurity thought leadership and developer security",
        includeImage: false,
      });

      actions.push({
        channel: "social_organic",
        action: "linkedin_post",
        status: "success",
        details: `Generated LinkedIn post: "${content.headline}" (queued for publishing)`,
        cost: 0,
      });
    } catch (err: unknown) {
      actions.push({
        channel: "social_organic",
        action: "linkedin_post",
        status: "failed",
        details: `LinkedIn content generation failed: ${getErrorMessage(err)}`,
        cost: 0,
      });
    }
  }

  return actions;
}

/**
 * Run SEO optimization cycle using the existing SEO Engine
 */
async function runSeoOptimization(): Promise<AdvertisingAction> {
  try {
    const report = await runScheduledSeoOptimization();
    if (!report) {
      return {
        channel: "seo_organic",
        action: "seo_optimization",
        status: "skipped",
        details: "SEO optimization skipped (kill switch active or recently ran)",
        cost: 0,
      };
    }

    return {
      channel: "seo_organic",
      action: "seo_optimization",
      status: "success",
      details: `SEO score: ${report.score.overall}/100, ${report.score.issues.length} issues found, ${report.keywords.primaryKeywords.length} keywords tracked`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "seo_organic",
      action: "seo_optimization",
      status: "failed",
      details: `SEO optimization failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Generate backlink outreach emails using LLM
 */
async function generateBacklinkOutreach(): Promise<AdvertisingAction> {
  try {
    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        {
          role: "system",
          content: `You are a professional outreach specialist for Archibald Titan, a cybersecurity credential management platform. Generate a personalized outreach email template for requesting backlinks from security bloggers and developer tool review sites.

The email should:
- Be concise (under 150 words)
- Offer genuine value (guest post, data, exclusive access)
- Not be pushy or spammy
- Include a clear but soft call to action
- Feel personal, not templated

Return as JSON: { "subject": "...", "body": "...", "targetType": "security_blog|dev_tools_review|tech_publication" }`,
        },
        {
          role: "user",
          content: "Generate a backlink outreach email for this week's campaign.",
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "outreach_email",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
              targetType: { type: "string" },
            },
            required: ["subject", "body", "targetType"],
            additionalProperties: false,
          },
        },
      },
    });

    const email = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Store the outreach template in marketing content
    const db = await getDb();
    if (db) {
      await db.insert(marketingContent).values({
        channel: "email_outreach",
        contentType: "backlink_outreach",
        title: email.subject,
        body: email.body,
        status: "approved",
      } as any);
    }

    return {
      channel: "backlink_outreach",
      action: "generate_outreach_template",
      status: "success",
      details: `Generated outreach template: "${email.subject}" targeting ${email.targetType}`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "backlink_outreach",
      action: "generate_outreach_template",
      status: "failed",
      details: `Outreach generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Generate email nurture content for different user segments
 */
async function generateEmailNurture(): Promise<AdvertisingAction> {
  try {
    const segments = [
      { name: "new_signup", description: "Users who signed up in the last 7 days", goal: "Onboard and activate" },
      { name: "free_tier", description: "Active free users who haven't upgraded", goal: "Demonstrate Pro value" },
      { name: "inactive", description: "Users who haven't logged in for 14+ days", goal: "Re-engage with security tips" },
      { name: "power_user", description: "Users with 10+ credentials stored", goal: "Upsell Enterprise features" },
    ];

    const segment = segments[Math.floor(Math.random() * segments.length)];

    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        {
          role: "system",
          content: `You are an email marketing specialist for Archibald Titan, a cybersecurity credential management platform. Write a nurture email for the "${segment.name}" segment.

Segment: ${segment.description}
Goal: ${segment.goal}

The email should:
- Have a compelling subject line (under 50 chars)
- Be concise (under 200 words)
- Provide genuine security value (not just a sales pitch)
- Include one clear CTA
- Feel personal and helpful

Return as JSON: { "subject": "...", "preheader": "...", "body": "...(html)...", "cta": { "text": "...", "url": "..." } }`,
        },
        {
          role: "user",
          content: `Write a nurture email for the ${segment.name} segment.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nurture_email",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              preheader: { type: "string" },
              body: { type: "string" },
              cta: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  url: { type: "string" },
                },
                required: ["text", "url"],
                additionalProperties: false,
              },
            },
            required: ["subject", "preheader", "body", "cta"],
            additionalProperties: false,
          },
        },
      },
    });

    const email = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Store in marketing content
    const db = await getDb();
    if (db) {
      await db.insert(marketingContent).values({
        channel: "sendgrid",
        contentType: "email_nurture",
        title: email.subject,
        body: JSON.stringify(email),
        status: "approved",
        metadata: { segment: segment.name, goal: segment.goal },
      } as any);
    }

    return {
      channel: "email_nurture",
      action: "generate_nurture_email",
      status: "success",
      details: `Generated nurture email for "${segment.name}": "${email.subject}"`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "email_nurture",
      action: "generate_nurture_email",
      status: "failed",
      details: `Email nurture generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Check affiliate performance and trigger optimizations
 */
async function optimizeAffiliateNetwork(): Promise<AdvertisingAction> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get affiliate stats
    const partners = await (db as any).query.affiliatePartners.findMany({
      where: eq(affiliatePartners.status, "active"),
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentClicks = await (db as any).query.affiliateClicks.findMany({
      where: gte(affiliateClicks.createdAt, thirtyDaysAgo),
    });

    const activePartners = partners.length;
    const totalClicks = recentClicks.length;

    return {
      channel: "affiliate_network",
      action: "optimize_network",
      status: "success",
      details: `Affiliate network: ${activePartners} active partners, ${totalClicks} clicks in last 30 days`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "affiliate_network",
      action: "optimize_network",
      status: "failed",
      details: `Affiliate optimization failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Generate forum/community engagement content
 */
async function generateCommunityContent(): Promise<AdvertisingAction> {
  try {
    const platforms = ["Reddit", "HackerNews", "Dev.to", "StackOverflow", "Quora"];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];

    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        {
          role: "system",
          content: `You are a cybersecurity expert who participates in online communities. Generate a helpful, value-first response for ${platform} about "${pillar.pillar}".

Rules:
- Provide genuine technical value (not marketing fluff)
- Be helpful and educational
- Only mention Archibald Titan if it naturally fits (max 1 subtle mention)
- Match the tone of ${platform} (technical for HN/SO, casual for Reddit)
- Keep it concise (under 200 words)

Return as JSON: { "platform": "${platform}", "topic": "...", "content": "...", "isPromotional": false }`,
        },
        {
          role: "user",
          content: `Generate a community engagement post about ${pillar.pillar} for ${platform}.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "community_post",
          strict: true,
          schema: {
            type: "object",
            properties: {
              platform: { type: "string" },
              topic: { type: "string" },
              content: { type: "string" },
              isPromotional: { type: "boolean" },
            },
            required: ["platform", "topic", "content", "isPromotional"],
            additionalProperties: false,
          },
        },
      },
    });

    const post = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Store in marketing content for review/publishing
    const db = await getDb();
    if (db) {
      await db.insert(marketingContent).values({
        channel: "content_seo" as any,
        contentType: "community_engagement" as any,
        title: post.topic,
        body: post.content,
        platform: platform.toLowerCase(),
        status: "draft",
        metadata: { platform: post.platform, isPromotional: post.isPromotional },
      } as any);
    }

    return {
      channel: "forum_participation",
      action: "generate_community_content",
      status: "success",
      details: `Generated ${platform} content: "${post.topic}" (queued as draft)`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "forum_participation",
      action: "generate_community_content",
      status: "failed",
      details: `Community content generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

// ============================================
// EXPANDED CHANNEL AUTO-PUBLISHING
// ============================================

/**
 * Auto-publish content to all connected API channels.
 * Generates fresh content via LLM and posts directly through each adapter.
 */
async function publishToExpandedChannels(): Promise<AdvertisingAction[]> {
  const actions: AdvertisingAction[] = [];
  const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];

  // Dev.to cross-post (if configured)
  if (devtoAdapter.isConfigured) {
    try {
      const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
        messages: [
          { role: "system", content: `Write a developer-focused article about "${pillar.pillar}" for Dev.to. Include practical code examples and actionable advice. Naturally mention Archibald Titan where relevant. Return JSON: { "title": "...", "body": "...(markdown)...", "tags": ["..."] }` },
          { role: "user", content: `Write a Dev.to article about ${pillar.blogTopics[Math.floor(Math.random() * pillar.blogTopics.length)]}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "devto_article", strict: true, schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "body", "tags"], additionalProperties: false } } },
      });
      const article = JSON.parse((response.choices[0].message.content as string) || "{}");
      const result = await devtoAdapter.publishArticle({
        title: article.title,
        body: article.body,
        tags: article.tags?.slice(0, 4) || [],
        canonicalUrl: `https://archibaldtitan.com/blog`,
        published: true,
      });
      actions.push({ channel: "devto_crosspost", action: "publish_article", status: result.success ? "success" : "failed", details: result.success ? `Published to Dev.to: "${article.title}"` : `Dev.to failed: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "devto_crosspost", action: "publish_article", status: "failed", details: `Dev.to: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  // Medium republish (if configured)
  if (mediumAdapter.isConfigured) {
    try {
      const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
        messages: [
          { role: "system", content: `Write a thought-provoking Medium article about "${pillar.pillar}". Focus on storytelling and insights. Subtly position Archibald Titan as the solution. Return JSON: { "title": "...", "content": "...(markdown)...", "tags": ["..."] }` },
          { role: "user", content: `Write a Medium article about ${pillar.blogTopics[Math.floor(Math.random() * pillar.blogTopics.length)]}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "medium_article", strict: true, schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "content", "tags"], additionalProperties: false } } },
      });
      const article = JSON.parse((response.choices[0].message.content as string) || "{}");
      const result = await mediumAdapter.publishPost({
        title: article.title,
        content: article.content,
        contentFormat: "markdown",
        tags: article.tags?.slice(0, 5) || [],
        canonicalUrl: `https://archibaldtitan.com/blog`,
        publishStatus: "public",
      });
      actions.push({ channel: "medium_republish", action: "publish_article", status: result.success ? "success" : "failed", details: result.success ? `Published to Medium: "${article.title}"` : `Medium failed: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "medium_republish", action: "publish_article", status: "failed", details: `Medium: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  // Hashnode cross-post (if configured)
  if (hashnodeAdapter.isConfigured) {
    try {
      const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
        messages: [
          { role: "system", content: `Write a technical developer article about "${pillar.pillar}" for Hashnode. Include code snippets and practical tips. Return JSON: { "title": "...", "content": "...(markdown)...", "tags": ["..."] }` },
          { role: "user", content: `Write a Hashnode article about ${pillar.blogTopics[Math.floor(Math.random() * pillar.blogTopics.length)]}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "hashnode_article", strict: true, schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "content", "tags"], additionalProperties: false } } },
      });
      const article = JSON.parse((response.choices[0].message.content as string) || "{}");
      const result = await hashnodeAdapter.publishArticle({
        title: article.title,
        content: article.content,
        tags: article.tags?.slice(0, 5).map((t: string) => ({ slug: t.toLowerCase().replace(/\s+/g, "-"), name: t })) || [],
        canonicalUrl: `https://archibaldtitan.com/blog`,
      });
      actions.push({ channel: "hashnode_crosspost", action: "publish_article", status: result.success ? "success" : "failed", details: result.success ? `Published to Hashnode: "${article.title}"` : `Hashnode failed: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "hashnode_crosspost", action: "publish_article", status: "failed", details: `Hashnode: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  // Discord webhook (if configured)
  if (discordAdapter.isConfigured) {
    try {
      const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
        messages: [
          { role: "system", content: `Generate a short, engaging Discord message about cybersecurity. Include an emoji, a security tip, and a link to https://archibaldtitan.com. Keep it under 200 words. Return JSON: { "content": "..." }` },
          { role: "user", content: `Generate a Discord security tip about ${pillar.pillar}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "discord_msg", strict: true, schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"], additionalProperties: false } } },
      });
      const msg = JSON.parse((response.choices[0].message.content as string) || "{}");
      const result = await discordAdapter.postMessage({ content: msg.content });
      actions.push({ channel: "discord_community", action: "send_message", status: result.success ? "success" : "failed", details: result.success ? `Posted to Discord` : `Discord failed: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "discord_community", action: "send_message", status: "failed", details: `Discord: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  // Mastodon (if configured)
  if (mastodonAdapter.isConfigured) {
    try {
      const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
        messages: [
          { role: "system", content: `Generate a Mastodon toot about cybersecurity for the infosec community. Include relevant hashtags (#infosec #cybersecurity #appsec). Keep under 500 chars. Return JSON: { "status": "..." }` },
          { role: "user", content: `Generate a Mastodon toot about ${pillar.pillar}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "mastodon_toot", strict: true, schema: { type: "object", properties: { status: { type: "string" } }, required: ["status"], additionalProperties: false } } },
      });
      const toot = JSON.parse((response.choices[0].message.content as string) || "{}");
      const result = await mastodonAdapter.postStatus({ status: toot.status });
      actions.push({ channel: "mastodon_infosec", action: "post_status", status: result.success ? "success" : "failed", details: result.success ? `Posted to Mastodon` : `Mastodon failed: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "mastodon_infosec", action: "post_status", status: "failed", details: `Mastodon: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  // Telegram (if configured)
  if (telegramAdapter.isConfigured) {
    try {
      const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
        messages: [
          { role: "system", content: `Generate a Telegram channel broadcast about cybersecurity. Include a security alert or tip, and a CTA to visit https://archibaldtitan.com. Use Telegram markdown formatting. Keep under 300 words. Return JSON: { "text": "..." }` },
          { role: "user", content: `Generate a Telegram broadcast about ${pillar.pillar}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "telegram_msg", strict: true, schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } } },
      });
      const raw = (response.choices[0].message.content as string) || "{}";
      let telegramText = "";
      try {
        const parsed = JSON.parse(raw);
        telegramText = parsed.text ?? raw;
        // Handle double-encoded JSON (LLM sometimes returns JSON string within JSON)
        if (typeof telegramText === "string" && telegramText.startsWith("{")) {
          try { const inner = JSON.parse(telegramText); telegramText = inner.text ?? telegramText; } catch { /* not double-encoded */ }
        }
      } catch {
        // If JSON parse fails entirely, use the raw string but strip any JSON wrapper
        const match = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        telegramText = match ? match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : raw;
      }
      const result = await telegramAdapter.sendMessage({ text: telegramText, parseMode: "Markdown" });
      actions.push({ channel: "telegram_channel", action: "send_broadcast", status: result.success ? "success" : "failed", details: result.success ? `Broadcast to Telegram` : `Telegram failed: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "telegram_channel", action: "send_broadcast", status: "failed", details: `Telegram: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  // WhatsApp (if configured — weekly only, to stay within free tier)
  if (whatsappAdapter.isConfigured && new Date().getDay() === 1) { // Monday only
    try {
      const result = await whatsappAdapter.sendTemplateMessage({
        to: "", // Requires subscriber list — will be populated from DB
        templateName: "security_tip_weekly",
        languageCode: "en_US",
      });
      actions.push({ channel: "whatsapp_broadcast", action: "send_template", status: result.success ? "success" : "failed", details: result.success ? `WhatsApp weekly broadcast sent` : `WhatsApp: ${result.error}`, cost: 0 });
    } catch (err: unknown) {
      actions.push({ channel: "whatsapp_broadcast", action: "send_template", status: "failed", details: `WhatsApp: ${getErrorMessage(err)}`, cost: 0 });
    }
  }

  return actions;
}

// ============================================
// HACKER FORUM & INFOSEC COMMUNITY CONTENT
// ============================================

/**
 * Generate content specifically for hacker forums and infosec communities.
 * This content is more technical and positions Titan as a tool hackers/researchers need.
 */
async function generateHackerForumContent(): Promise<AdvertisingAction> {
  try {
    const forums = [
      { name: "HackForums", channel: "hackforums" as FreeChannel, tone: "casual hacker", focus: "tools, scripts, automation" },
      { name: "0x00sec", channel: "0x00sec" as FreeChannel, tone: "advanced researcher", focus: "exploit development, reverse engineering, malware analysis" },
      { name: "Null Byte", channel: "nullbyte" as FreeChannel, tone: "tutorial/educational", focus: "step-by-step hacking guides, beginner-friendly" },
      { name: "Hack The Box", channel: "hackthebox_community" as FreeChannel, tone: "CTF player", focus: "machine writeups, penetration testing methodology" },
      { name: "TryHackMe", channel: "tryhackme_community" as FreeChannel, tone: "learning-focused", focus: "room walkthroughs, learning paths, beginner security" },
      { name: "OWASP", channel: "owasp_community" as FreeChannel, tone: "professional appsec", focus: "OWASP Top 10, secure coding, application security" },
      { name: "Offensive Security", channel: "offensive_security" as FreeChannel, tone: "red team professional", focus: "OSCP prep, penetration testing, red team ops" },
      { name: "CTFtime", channel: "ctftime" as FreeChannel, tone: "competitive hacker", focus: "CTF writeups, challenge solutions, team strategies" },
      { name: "Breach Communities", channel: "breachforums_alt" as FreeChannel, tone: "threat intelligence", focus: "breach analysis, threat intel, credential security" },
    ];

    const forum = forums[Math.floor(Math.random() * forums.length)];
    const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];

    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        {
          role: "system",
          content: `You are a respected member of the ${forum.name} community. Generate a high-quality post that provides genuine technical value.

Tone: ${forum.tone}
Focus areas: ${forum.focus}
Topic area: ${pillar.pillar}

Rules:
- Provide REAL technical value — code snippets, methodology, analysis
- Write in the authentic voice of the ${forum.name} community
- Only mention Archibald Titan if it naturally fits as a tool recommendation (max 1 subtle mention)
- Include actionable takeaways
- 300-600 words

Return JSON: { "title": "...", "content": "...(markdown)...", "forum": "${forum.name}", "tags": ["..."] }`,
        },
        {
          role: "user",
          content: `Generate a ${forum.name} post about ${pillar.pillar} focusing on ${forum.focus}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "forum_post",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              forum: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title", "content", "forum", "tags"],
            additionalProperties: false,
          },
        },
      },
    });

    const post = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Store in content queue
    const db = await getDb();
    if (db) {
      await db.insert(marketingContent).values({
        channel: "hacker_forum" as any,
        contentType: "hacker_forum_post" as any,
        title: post.title,
        body: post.content,
        platform: forum.name.toLowerCase().replace(/\s+/g, "_"),
        status: "approved",
        metadata: { forum: post.forum, tags: post.tags, channel: forum.channel },
      } as any);
    }

    return {
      channel: forum.channel,
      action: "generate_forum_post",
      status: "success",
      details: `Generated ${forum.name} post: "${post.title}" (queued for publishing)`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "hackforums",
      action: "generate_forum_post",
      status: "failed",
      details: `Hacker forum content generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

// ============================================
// VIDEO SCRIPT GENERATION (TikTok + YouTube Shorts)
// ============================================

/**
 * Generate video scripts for TikTok and YouTube Shorts.
 * These are ready-to-record scripts with hooks, visuals, and CTAs.
 */
async function generateVideoScripts(): Promise<AdvertisingAction> {
  try {
    const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
    const platform = Math.random() > 0.5 ? "TikTok" : "YouTube Shorts";
    const channel: FreeChannel = platform === "TikTok" ? "tiktok_organic" : "youtube_shorts";

    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        {
          role: "system",
          content: `You are a viral ${platform} content creator specializing in cybersecurity. Generate a 60-second video script.

Rules:
- Start with a HOOK in the first 3 seconds (pattern interrupt, shocking stat, or question)
- Include visual directions in [brackets]
- Keep it fast-paced and engaging
- End with a strong CTA to visit archibaldtitan.com
- Use trending ${platform} formats (storytime, "things you didn't know", "stop scrolling if...")
- Include suggested hashtags and audio/music suggestions

Return JSON: { "hook": "...", "script": "...", "visualDirections": ["..."], "hashtags": ["..."], "audioSuggestion": "...", "estimatedDuration": "60s", "platform": "${platform}" }`,
        },
        {
          role: "user",
          content: `Generate a viral ${platform} script about ${pillar.pillar}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "video_script",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hook: { type: "string" },
              script: { type: "string" },
              visualDirections: { type: "array", items: { type: "string" } },
              hashtags: { type: "array", items: { type: "string" } },
              audioSuggestion: { type: "string" },
              estimatedDuration: { type: "string" },
              platform: { type: "string" },
            },
            required: ["hook", "script", "visualDirections", "hashtags", "audioSuggestion", "estimatedDuration", "platform"],
            additionalProperties: false,
          },
        },
      },
    });

    const video = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Store in content queue
    const db = await getDb();
    if (db) {
      await db.insert(marketingContent).values({
        channel: "content_seo" as any,
        contentType: "video_script" as any,
        title: video.hook,
        body: JSON.stringify(video),
        platform: platform.toLowerCase().replace(/\s+/g, "_"),
        status: "approved",
        metadata: { platform: video.platform, hashtags: video.hashtags, duration: video.estimatedDuration },
      } as any);
    }

    // Generate actual video file using Pollinations (free)
    let videoUrl: string | null = null;
    if (isVideoGenerationAvailable()) {
      try {
        log.info(`Generating actual video for ${platform} script: "${video.hook}"`);
        const videoResult = await generateShortFormVideo(
          video.hook,
          video.script?.substring(0, 200) || video.hook
        );
        videoUrl = videoResult.url;
        log.info(`Video generated: ${videoUrl} (${videoResult.model}, ${videoResult.duration}s)`);

        // Store video reference alongside the script
        if (db) {
          await db.insert(marketingContent).values({
            channel: "content_seo" as any,
            contentType: "video" as any,
            title: `[VIDEO] ${video.hook}`,
            body: videoUrl,
            platform: platform.toLowerCase().replace(/\s+/g, "_"),
            status: "approved",
            metadata: { 
              platform: video.platform, 
              hashtags: video.hashtags, 
              model: videoResult.model,
              duration: videoResult.duration,
              aspectRatio: videoResult.aspectRatio,
              scriptId: video.hook,
            },
          } as any);
        }
      } catch (videoErr: unknown) {
        log.warn(`Video file generation failed (script still saved): ${getErrorMessage(videoErr)}`);
      }
    }

    const videoNote = videoUrl ? ` + video generated: ${videoUrl}` : " (script only, video gen unavailable)";
    return {
      channel,
      action: "generate_video_script",
      status: "success",
      details: `Generated ${platform} script: "${video.hook}" (${video.estimatedDuration})${videoNote}`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "tiktok_organic",
      action: "generate_video_script",
      status: "failed",
      details: `Video script generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

// ============================================
// VIDEO AD GENERATION (Pollinations.ai - FREE)
// ============================================

/**
 * Generate a marketing video ad for social media campaigns.
 * Uses Pollinations.ai free tier — zero cost.
 */
async function generateVideoAd(): Promise<AdvertisingAction> {
  try {
    if (!isVideoGenerationAvailable()) {
      return {
        channel: "social_organic" as FreeChannel,
        action: "generate_video_ad",
        status: "skipped",
        details: "Video generation not available",
        cost: 0,
      };
    }

    const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
    const topic = pillar.blogTopics[Math.floor(Math.random() * pillar.blogTopics.length)];
    const platforms = ["tiktok", "youtube", "linkedin", "twitter"] as const;
    const platform = platforms[Math.floor(Math.random() * platforms.length)];

    log.info(`Generating ${platform} video ad about: ${topic}`);

    const videoResult = await generateSocialClip(
      `${pillar.pillar}: ${topic}`,
      platform
    );

    // Store in content queue
    const db = await getDb();
    if (db) {
      await db.insert(marketingContent).values({
        channel: "content_seo" as any,
        contentType: "video" as any,
        title: `[AD] ${topic}`,
        body: videoResult.url,
        platform,
        status: "approved",
        metadata: {
          pillar: pillar.pillar,
          model: videoResult.model,
          duration: videoResult.duration,
          aspectRatio: videoResult.aspectRatio,
          type: "video_ad",
        },
      } as any);
    }

    return {
      channel: (platform === "tiktok" ? "tiktok_organic" : platform === "youtube" ? "youtube_shorts" : "social_organic") as FreeChannel,
      action: "generate_video_ad",
      status: "success",
      details: `Generated ${platform} video ad: "${topic}" (${videoResult.model}, ${videoResult.duration}s) → ${videoResult.url}`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "social_organic" as FreeChannel,
      action: "generate_video_ad",
      status: "failed",
      details: `Video ad generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

// ============================================
// CONTENT QUEUE FOR MANUAL-POST CHANNELS
// ============================================

/**
 * Generate ready-to-post content for channels without APIs.
 * Content is stored in the DB and surfaced in the admin dashboard
 * for one-click copy-paste publishing.
 */
async function generateContentQueueItems(): Promise<AdvertisingAction> {
  try {
    const manualChannels = [
      { name: "Quora", platform: "quora", type: "answer", prompt: "Generate an expert Quora answer about API security or credential management. Be genuinely helpful. Include a subtle mention of Archibald Titan only if natural. 200-400 words." },
      { name: "Skool", platform: "skool", type: "community_post", prompt: "Generate a Skool community post for a cybersecurity learning group. Share a free lesson or tip that provides value and encourages discussion. Subtly funnel to Titan. 200-300 words." },
      { name: "IndieHackers", platform: "indiehackers", type: "update", prompt: "Generate an IndieHackers building-in-public update about Archibald Titan. Share a growth metric, lesson learned, or technical challenge. Be authentic and transparent. 150-300 words." },
      { name: "Pinterest", platform: "pinterest", type: "pin_description", prompt: "Generate a Pinterest pin description for a cybersecurity infographic. Include keywords for Pinterest SEO. Describe what the infographic should show. 100-200 words." },
      { name: "Hacker News", platform: "hackernews", type: "submission", prompt: "Generate a Hacker News Show HN submission about a security tool or technique. Be technical and concise. HN audience hates marketing. 50-100 words." },
      { name: "LinkedIn", platform: "linkedin", type: "thought_leadership", prompt: "Generate a LinkedIn thought leadership post about cybersecurity trends. Write as a CTO/security leader. Include a personal insight. 200-400 words." },
      { name: "Slack Communities", platform: "slack", type: "community_message", prompt: "Generate a helpful message for a DevOps/Security Slack workspace. Share a tip, resource, or answer a common question. No self-promotion. 50-150 words." },
    ];

    // Pick 2-3 random channels to generate for today
    const shuffled = manualChannels.sort(() => Math.random() - 0.5);
    const todayChannels = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
    const pillar = CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
    let generated = 0;

    for (const ch of todayChannels) {
      try {
        const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
          messages: [
            { role: "system", content: `${ch.prompt}\n\nTopic area: ${pillar.pillar}\n\nReturn JSON: { "title": "...", "content": "...", "platform": "${ch.name}" }` },
            { role: "user", content: `Generate content for ${ch.name} about ${pillar.pillar}` },
          ],
          response_format: { type: "json_schema", json_schema: { name: "queue_content", strict: true, schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, platform: { type: "string" } }, required: ["title", "content", "platform"], additionalProperties: false } } },
        });

         const item = JSON.parse((response.choices[0].message.content as string) || "{}");
        const db = await getDb();
        if (db) {
          await db.insert(marketingContent).values({
            channel: "content_seo" as any,
            contentType: "blog_article" as any,
            title: item.title,
            body: item.content,
            status: "approved",
            metadata: { channel: ch.name, queueType: "manual_post", pillar: pillar.pillar },
          } as any);
        }
        generated++;
      } catch {
        // Skip failed individual items, continue with others
      }
    }

    return {
      channel: "forum_participation",
      action: "content_queue_generation",
      status: generated > 0 ? "success" : "failed",
      details: `Generated ${generated} content queue items for: ${todayChannels.map(c => c.name).join(", ")}`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "forum_participation",
      action: "content_queue_generation",
      status: "failed",
      details: `Content queue generation failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

// ============================================
// INTELLIGENCE LAYER v2
// ============================================

/**
 * Channel Performance Tracker
 * Tracks success/failure rates per channel and adjusts priority.
 * Channels with higher success rates get more content.
 */
interface ChannelPerformanceRecord {
  channel: string;
  totalAttempts: number;
  successes: number;
  failures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  avgResponseTime: number;
  priority: number; // 1-10, higher = more content
}

const channelPerformance = new Map<string, ChannelPerformanceRecord>();

function recordChannelPerformance(channel: string, success: boolean, responseTimeMs?: number): void {
  const existing = channelPerformance.get(channel) || {
    channel,
    totalAttempts: 0,
    successes: 0,
    failures: 0,
    lastSuccess: null,
    lastFailure: null,
    avgResponseTime: 0,
    priority: 5,
  };

  existing.totalAttempts++;
  if (success) {
    existing.successes++;
    existing.lastSuccess = Date.now();
  } else {
    existing.failures++;
    existing.lastFailure = Date.now();
  }

  if (responseTimeMs) {
    existing.avgResponseTime = Math.round(
      (existing.avgResponseTime * (existing.totalAttempts - 1) + responseTimeMs) / existing.totalAttempts
    );
  }

  // Recalculate priority based on success rate
  const successRate = existing.totalAttempts > 0 ? existing.successes / existing.totalAttempts : 0.5;
  existing.priority = Math.max(1, Math.min(10, Math.round(successRate * 10)));

  // Boost priority for channels that haven't failed recently
  if (existing.lastFailure && Date.now() - existing.lastFailure > 7 * 24 * 60 * 60 * 1000) {
    existing.priority = Math.min(10, existing.priority + 1);
  }

  channelPerformance.set(channel, existing);
}

export function getChannelPerformanceReport(): ChannelPerformanceRecord[] {
  return Array.from(channelPerformance.values())
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Should we skip this channel today based on performance?
 * Channels with very low success rates get throttled.
 */
function shouldSkipChannel(channel: string): boolean {
  const perf = channelPerformance.get(channel);
  if (!perf || perf.totalAttempts < 5) return false; // Not enough data

  const successRate = perf.successes / perf.totalAttempts;

  // Skip channels with < 10% success rate (after 10+ attempts)
  if (perf.totalAttempts >= 10 && successRate < 0.1) {
    log.info(`[AdvertisingOrchestrator] Throttling channel ${channel}: ${Math.round(successRate * 100)}% success rate`);
    return true;
  }

  // 50% chance to skip channels with < 30% success rate
  if (successRate < 0.3 && Math.random() > 0.5) {
    return true;
  }

  return false;
}

/**
 * A/B Testing Framework
 * Tests different content angles per channel and tracks which performs better.
 */
interface ABTest {
  id: string;
  channel: string;
  variantA: { description: string; attempts: number; successes: number };
  variantB: { description: string; attempts: number; successes: number };
  startedAt: number;
  winner: "A" | "B" | null;
  confidence: number; // 0-1
}

const activeABTests = new Map<string, ABTest>();

export function createABTest(channel: string, variantADesc: string, variantBDesc: string): ABTest {
  const id = `${channel}_${Date.now()}`;
  const test: ABTest = {
    id,
    channel,
    variantA: { description: variantADesc, attempts: 0, successes: 0 },
    variantB: { description: variantBDesc, attempts: 0, successes: 0 },
    startedAt: Date.now(),
    winner: null,
    confidence: 0,
  };
  activeABTests.set(id, test);
  return test;
}

export function getABTestVariant(channel: string): { testId: string; variant: "A" | "B"; description: string } | null {
  for (const [id, test] of activeABTests) {
    if (test.channel === channel && !test.winner) {
      // Thompson sampling: pick variant probabilistically based on success rates
      const aRate = test.variantA.attempts > 0 ? test.variantA.successes / test.variantA.attempts : 0.5;
      const bRate = test.variantB.attempts > 0 ? test.variantB.successes / test.variantB.attempts : 0.5;
      const variant = Math.random() < aRate / (aRate + bRate) ? "A" : "B";
      return {
        testId: id,
        variant,
        description: variant === "A" ? test.variantA.description : test.variantB.description,
      };
    }
  }
  return null;
}

export function recordABTestResult(testId: string, variant: "A" | "B", success: boolean): void {
  const test = activeABTests.get(testId);
  if (!test) return;

  const v = variant === "A" ? test.variantA : test.variantB;
  v.attempts++;
  if (success) v.successes++;

  // Check if we have enough data to declare a winner (minimum 20 attempts each)
  if (test.variantA.attempts >= 20 && test.variantB.attempts >= 20) {
    const aRate = test.variantA.successes / test.variantA.attempts;
    const bRate = test.variantB.successes / test.variantB.attempts;
    const diff = Math.abs(aRate - bRate);

    // Simple significance check: if difference > 15% with enough samples
    if (diff > 0.15) {
      test.winner = aRate > bRate ? "A" : "B";
      test.confidence = Math.min(0.95, diff * 2);
      log.info(`[A/B Test] Winner declared for ${test.channel}: Variant ${test.winner} (${Math.round(test.confidence * 100)}% confidence)`);
    }
  }
}

export function getActiveABTests(): ABTest[] {
  return Array.from(activeABTests.values());
}

/**
 * Content Recycling Engine
 * Finds top-performing content and repurposes it for other channels.
 */
async function recycleTopContent(): Promise<AdvertisingAction> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Find the most recent successful blog posts
    const topPosts = await db.select({
      title: blogPosts.title,
      content: blogPosts.content,
      slug: blogPosts.slug,
    }).from(blogPosts)
      .where(eq(blogPosts.status, "published"))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(5);

    if (topPosts.length === 0) {
      return {
        channel: "blog_content",
        action: "recycle_content",
        status: "skipped",
        details: "No published blog posts to recycle",
        cost: 0,
      };
    }

    const post = topPosts[Math.floor(Math.random() * topPosts.length)];

    // Use LLM to repurpose for a different format
    const formats = [
      { name: "Twitter Thread", prompt: "Convert this blog post into a compelling 5-7 tweet thread. Each tweet should be under 280 chars. Include a hook tweet and a CTA at the end." },
      { name: "LinkedIn Carousel", prompt: "Convert this blog post into 8-10 LinkedIn carousel slides. Each slide should have a headline and 2-3 bullet points. Start with a hook slide." },
      { name: "Email Newsletter", prompt: "Convert this blog post into a concise email newsletter (200 words max). Include a subject line, key takeaways, and a CTA to read the full article." },
      { name: "Infographic Outline", prompt: "Convert this blog post into an infographic outline with 5-7 sections. Each section should have a title, a stat or key point, and a visual suggestion." },
      { name: "Podcast Script", prompt: "Convert this blog post into a 3-minute podcast script. Include an intro hook, key talking points, and a CTA. Write conversationally." },
    ];

    const format = formats[Math.floor(Math.random() * formats.length)];

    const response = await invokeLLM({
        systemTag: "advertising",
        model: "fast",
      messages: [
        { role: "system", content: `${format.prompt}\n\nReturn JSON: { "title": "...", "content": "...", "format": "${format.name}" }` },
        { role: "user", content: `Original blog post title: ${post.title}\n\nContent (first 2000 chars):\n${(post.content || "").substring(0, 2000)}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "recycled_content", strict: true, schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, format: { type: "string" } }, required: ["title", "content", "format"], additionalProperties: false } } },
    });

    const recycled = JSON.parse((response.choices[0].message.content as string) || "{}");

    // Store recycled content
    await db.insert(marketingContent).values({
      channel: "content_seo" as any,
      contentType: "blog_article" as any,
      title: `[Recycled → ${format.name}] ${recycled.title}`,
      body: recycled.content,
      status: "approved",
      metadata: { recycledFrom: post.slug, format: format.name, originalTitle: post.title },
    } as any);

    return {
      channel: "blog_content",
      action: "recycle_content",
      status: "success",
      details: `Recycled "${post.title}" → ${format.name}: "${recycled.title}"`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "blog_content",
      action: "recycle_content",
      status: "failed",
      details: `Content recycling failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Smart Scheduling — determine optimal posting times based on channel.
 * Returns whether now is a good time to post to a given channel.
 */
function isOptimalPostingTime(channel: string): boolean {
  const hour = new Date().getUTCHours();

  // Optimal posting windows (UTC) based on platform research
  const optimalWindows: Record<string, number[]> = {
    // Twitter/X: 9-11 AM EST = 14-16 UTC
    social_organic: [13, 14, 15, 16, 17],
    // LinkedIn: 7-8 AM, 12 PM, 5-6 PM EST = 12-13, 17, 22-23 UTC
    linkedin_organic: [12, 13, 17, 22, 23],
    // Reddit: 6-9 AM EST = 11-14 UTC
    community_engagement: [11, 12, 13, 14],
    // Dev.to: 8-10 AM EST = 13-15 UTC
    devto_crosspost: [13, 14, 15],
    // HackerNews: 8-10 AM EST = 13-15 UTC
    hackernews_submit: [13, 14, 15],
    // TikTok: 7-9 AM, 12-3 PM, 7-11 PM EST
    tiktok_organic: [12, 13, 14, 17, 18, 19, 20, 0, 1, 2, 3, 4],
    // Discord: evenings EST = 23-4 UTC
    discord_community: [22, 23, 0, 1, 2, 3, 4],
    // Default: business hours
    default: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  };

  const windows = optimalWindows[channel] || optimalWindows.default;
  return windows.includes(hour);
}

/**
 * Campaign Health Monitor
 * Checks if any campaigns are underperforming and suggests pausing them.
 */
async function monitorCampaignHealth(): Promise<AdvertisingAction> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const recentActivity = await db.select()
      .from(marketingActivityLog)
      .where(gte(marketingActivityLog.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
      .orderBy(desc(marketingActivityLog.createdAt))
      .limit(100);

    // Analyze failure patterns
    const channelFailures = new Map<string, number>();
    const channelSuccesses = new Map<string, number>();

    for (const activity of recentActivity) {
      const details = activity.details as any;
      if (!details) continue;

      const channel = activity.channel || "unknown";
      if (activity.status === "failed") {
        channelFailures.set(channel, (channelFailures.get(channel) || 0) + 1);
      } else {
        channelSuccesses.set(channel, (channelSuccesses.get(channel) || 0) + 1);
      }
    }

    // Find unhealthy channels (>70% failure rate in last 7 days)
    const unhealthyChannels: string[] = [];
    for (const [channel, failures] of channelFailures) {
      const successes = channelSuccesses.get(channel) || 0;
      const total = failures + successes;
      if (total >= 3 && failures / total > 0.7) {
        unhealthyChannels.push(`${channel} (${Math.round(failures / total * 100)}% failure rate)`);
      }
    }

    if (unhealthyChannels.length > 0) {
      await notifyOwner({
        title: "Campaign Health Alert",
        content: `The following channels have high failure rates in the last 7 days:\n${unhealthyChannels.join("\n")}\n\nConsider checking API credentials or pausing these channels.`,
      });
    }

    return {
      channel: "google_ads",
      action: "campaign_health_check",
      status: "success",
      details: `Health check: ${unhealthyChannels.length} unhealthy channels detected out of ${channelFailures.size + channelSuccesses.size} active`,
      cost: 0,
    };
  } catch (err: unknown) {
    return {
      channel: "google_ads",
      action: "campaign_health_check",
      status: "failed",
      details: `Campaign health check failed: ${getErrorMessage(err)}`,
      cost: 0,
    };
  }
}

/**
 * Cross-Channel Attribution Summary
 * Provides a unified view of which channels drive the most value.
 */
export async function getCrossChannelAttribution(days = 30): Promise<{
  channelRankings: Array<{ channel: string; score: number; contentCount: number; successRate: number }>;
  topPerformingPillar: string;
  recommendedFocus: string[];
}> {
  const rankings: Array<{ channel: string; score: number; contentCount: number; successRate: number }> = [];

  for (const [channel, perf] of channelPerformance) {
    const successRate = perf.totalAttempts > 0 ? perf.successes / perf.totalAttempts : 0;
    // Score = success rate * log(attempts) — rewards both reliability and volume
    const score = Math.round(successRate * Math.log2(perf.totalAttempts + 1) * 100) / 100;
    rankings.push({ channel, score, contentCount: perf.totalAttempts, successRate: Math.round(successRate * 100) });
  }

  rankings.sort((a, b) => b.score - a.score);

  // Determine top performing pillar from recent content
  const pillarCounts = new Map<string, number>();
  for (const pillar of CONTENT_PILLARS) {
    pillarCounts.set(pillar.pillar, 0);
  }

  const topPerformingPillar = CONTENT_PILLARS[0]?.pillar || "API Key Security";

  // Generate recommendations
  const recommendedFocus: string[] = [];
  const topChannels = rankings.slice(0, 5);
  if (topChannels.length > 0) {
    recommendedFocus.push(`Double down on top channels: ${topChannels.map(c => c.channel).join(", ")}`);
  }
  const lowPerformers = rankings.filter(r => r.successRate < 30 && r.contentCount > 10);
  if (lowPerformers.length > 0) {
    recommendedFocus.push(`Consider pausing: ${lowPerformers.map(c => c.channel).join(", ")}`);
  }
  recommendedFocus.push("Focus content recycling on top-performing blog posts");
  recommendedFocus.push("Run A/B tests on underperforming channels before pausing");

  return { channelRankings: rankings, topPerformingPillar, recommendedFocus };
}

// ============================================
// MASTER ORCHESTRATION CYCLE
// ============================================

/**
 * Run the full autonomous advertising cycle.
 * This is the main entry point called by the cron scheduler.
 * 
 * Daily cycle:
 * 1. SEO optimization check
 * 2. Generate 1 blog post (if < 3 this week)
 * 3. Generate 2-3 social media posts
 * 4. Generate 1 community engagement piece
 * 5. Generate 1 email nurture template (if < 2 this week)
 * 6. Weekly: backlink outreach template
 * 7. Weekly: affiliate network optimization
 * 8. Trigger marketing engine cycle (handles paid campaigns)
 * 9. Report results to owner
 */
export async function runAdvertisingCycle(): Promise<AdvertisingCycleResult> {
  const startTime = Date.now();
  const actions: AdvertisingAction[] = [];
  const errors: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...

  log.info("[AdvertisingOrchestrator] Starting autonomous advertising cycle v2 (with intelligence layer)...");

  // 0. Campaign Health Monitor (runs first to inform decisions)
  try {
    const healthAction = await monitorCampaignHealth();
    actions.push(healthAction);
  } catch (err: unknown) {
    errors.push(`Health Monitor: ${getErrorMessage(err)}`);
  }

  // 1. SEO Optimization (daily)
  if (!shouldSkipChannel("seo_organic")) {
    const t0 = Date.now();
    try {
      const seoAction = await runSeoOptimization();
      actions.push(seoAction);
      recordChannelPerformance("seo_organic", seoAction.status === "success", Date.now() - t0);
    } catch (err: unknown) {
      errors.push(`SEO: ${getErrorMessage(err)}`);
      recordChannelPerformance("seo_organic", false, Date.now() - t0);
    }
  }

  // 2. Blog Post Generation (Mon/Wed/Fri)
  if ([1, 3, 5].includes(dayOfWeek) && !shouldSkipChannel("blog_content")) {
    const t0 = Date.now();
    try {
      const blogAction = await generateSeoBlogPost();
      actions.push(blogAction);
      recordChannelPerformance("blog_content", blogAction.status === "success", Date.now() - t0);
    } catch (err: unknown) {
      errors.push(`Blog: ${getErrorMessage(err)}`);
      recordChannelPerformance("blog_content", false, Date.now() - t0);
    }
  }

  // 2b. Content Recycling (Wed/Fri — repurpose top-performing blog posts)
  if ([3, 5].includes(dayOfWeek)) {
    const t0 = Date.now();
    try {
      const recycleAction = await recycleTopContent();
      actions.push(recycleAction);
      recordChannelPerformance("content_recycling", recycleAction.status === "success", Date.now() - t0);
    } catch (err: unknown) {
      errors.push(`Content Recycling: ${getErrorMessage(err)}`);
      recordChannelPerformance("content_recycling", false, Date.now() - t0);
    }
  }

  // 3. Social Media Content (daily, with optimal timing check)
  if (!shouldSkipChannel("social_organic") && isOptimalPostingTime("social_organic")) {
    const t0 = Date.now();
    try {
      const socialActions = await generateSocialContent();
      actions.push(...socialActions);
      const anySuccess = socialActions.some(a => a.status === "success");
      recordChannelPerformance("social_organic", anySuccess, Date.now() - t0);
    } catch (err: unknown) {
      errors.push(`Social: ${getErrorMessage(err)}`);
      recordChannelPerformance("social_organic", false, Date.now() - t0);
    }
  } else if (!isOptimalPostingTime("social_organic")) {
    actions.push({ channel: "social_organic", action: "post_social", status: "skipped", details: "Skipped: not optimal posting time (will run at next optimal window)", cost: 0 });
  }

  // 4. Community Engagement (daily)
  if (!shouldSkipChannel("community_engagement")) {
    const t0 = Date.now();
    try {
      const communityAction = await generateCommunityContent();
      actions.push(communityAction);
      recordChannelPerformance("community_engagement", communityAction.status === "success", Date.now() - t0);
    } catch (err: unknown) {
      errors.push(`Community: ${getErrorMessage(err)}`);
      recordChannelPerformance("community_engagement", false, Date.now() - t0);
    }
  }

  // 5. Email Nurture (Wednesday)
  if (dayOfWeek === 3) {
    try {
      const emailAction = await generateEmailNurture();
      actions.push(emailAction);
    } catch (err: unknown) {
      errors.push(`Email: ${getErrorMessage(err)}`);
    }
  }

  // 6. Backlink Outreach (Monday only)
  if (dayOfWeek === 1) {
    try {
      const outreachAction = await generateBacklinkOutreach();
      actions.push(outreachAction);
    } catch (err: unknown) {
      errors.push(`Outreach: ${getErrorMessage(err)}`);
    }
  }

  // 7. Affiliate Network Optimization (Wed/Fri)
  if ([3, 5].includes(dayOfWeek)) {
    try {
      const affiliateAction = await optimizeAffiliateNetwork();
      actions.push(affiliateAction);
    } catch (err: unknown) {
      errors.push(`Affiliate: ${getErrorMessage(err)}`);
    }
  }

  // 8. Expanded Channel Auto-Publishing (daily, with performance tracking)
  try {
    const expandedActions = await publishToExpandedChannels();
    actions.push(...expandedActions);
    // Track each expanded channel individually
    for (const action of expandedActions) {
      recordChannelPerformance(action.channel, action.status === "success");
    }
  } catch (err: unknown) {
    errors.push(`Expanded Channels: ${getErrorMessage(err)}`);
  }

  // 9. Hacker Forum & Infosec Community Content (every cycle, with throttling)
  if (!shouldSkipChannel("hackforums")) {
    const t0 = Date.now();
    try {
      const hackerAction = await generateHackerForumContent();
      actions.push(hackerAction);
      recordChannelPerformance(hackerAction.channel, hackerAction.status === "success", Date.now() - t0);
    } catch (err: unknown) {
      errors.push(`Hacker Forums: ${getErrorMessage(err)}`);
      recordChannelPerformance("hackforums", false, Date.now() - t0);
    }
  }

  // 10. TikTok Content Posting — auto-generate & post carousels (Wed/Fri)
  if ([3, 5].includes(dayOfWeek)) {
    try {
      const tiktokResult = await runTikTokContentPipeline();
      actions.push({
        channel: "tiktok_organic",
        action: tiktokResult.action,
        status: tiktokResult.success ? "success" : "failed",
        details: tiktokResult.details,
        cost: 0,
      });
    } catch (err: unknown) {
      errors.push(`TikTok Content: ${getErrorMessage(err)}`);
    }

    // Also generate YouTube Shorts scripts
    try {
      const videoAction = await generateVideoScripts();
      actions.push(videoAction);
    } catch (err: unknown) {
      errors.push(`Video Scripts: ${getErrorMessage(err)}`);
    }

    // Generate video ads using Pollinations.ai (FREE)
    try {
      const videoAdAction = await generateVideoAd();
      actions.push(videoAdAction);
    } catch (err: unknown) {
      errors.push(`Video Ads: ${getErrorMessage(err)}`);
    }
  }

  // 11. Content Queue Generation for manual-post channels (daily)
  try {
    const queueAction = await generateContentQueueItems();
    actions.push(queueAction);
  } catch (err: unknown) {
    errors.push(`Content Queue: ${getErrorMessage(err)}`);
  }

  // 12. Trigger Marketing Engine cycle (handles paid campaigns + social publishing)
  try {
    const marketingResult = await runMarketingCycle();
    actions.push({
      channel: "google_ads",
      action: "marketing_engine_cycle",
      status: "success",
      details: `Marketing engine: ${marketingResult.contentGenerated} content, ${marketingResult.contentPublished} published, ${marketingResult.campaignsOptimized} campaigns optimized`,
      cost: 0, // Tracked separately by marketing engine
    });
  } catch (err: unknown) {
    errors.push(`Marketing Engine: ${getErrorMessage(err)}`);
    actions.push({
      channel: "google_ads",
      action: "marketing_engine_cycle",
      status: "failed",
      details: `Marketing engine cycle failed: ${getErrorMessage(err)}`,
      cost: 0,
    });
  }

  // Log the cycle to the activity log
  try {
    const db = await getDb();
    if (db) {
      await db.insert(marketingActivityLog).values({
        action: "advertising_cycle",
        channel: "orchestrator",
        details: {
          totalActions: actions.length,
          successful: actions.filter((a) => a.status === "success").length,
          failed: actions.filter((a) => a.status === "failed").length,
          skipped: actions.filter((a) => a.status === "skipped").length,
          errors,
        },
        status: errors.length === 0 ? "success" : "failed",
      });
    }
  } catch (err: unknown) {
    log.error("[AdvertisingOrchestrator] Failed to log cycle:", { error: String(getErrorMessage(err)) });
  }

  // Calculate metrics
  const hackerForumChannels = ["hackforums", "0x00sec", "nullbyte", "hackthebox_community", "tryhackme_community", "owasp_community", "offensive_security", "ctftime", "breachforums_alt"];
  const expandedApiChannels = ["devto_crosspost", "medium_republish", "hashnode_crosspost", "discord_community", "mastodon_infosec", "telegram_channel", "whatsapp_broadcast"];
  const videoChannels = ["tiktok_organic", "youtube_shorts"];

  const metrics = {
    blogPostsGenerated: actions.filter((a) => a.channel === "blog_content" && a.status === "success").length,
    socialPostsCreated: actions.filter((a) => a.channel === "social_organic").length,
    socialPostsPublished: actions.filter((a) => a.channel === "social_organic" && a.status === "success").length,
    communityEngagements: actions.filter((a) => a.channel === "community_engagement" || a.channel === "forum_participation").filter((a) => a.status === "success").length,
    seoOptimizations: actions.filter((a) => a.channel === "seo_organic" && a.status === "success").length,
    emailCampaignsSent: actions.filter((a) => a.channel === "email_nurture" && a.status === "success").length,
    affiliateActionsTriggered: actions.filter((a) => a.channel === "affiliate_network" && a.status === "success").length,
    expandedChannelPosts: actions.filter((a) => expandedApiChannels.includes(a.channel) && a.status === "success").length,
    hackerForumPosts: actions.filter((a) => hackerForumChannels.includes(a.channel) && a.status === "success").length,
    tiktokContentPosts: actions.filter((a) => a.channel === "tiktok_organic" && a.action === "tiktok_content_post" && a.status === "success").length,
    videoScriptsGenerated: actions.filter((a) => videoChannels.includes(a.channel) && a.status === "success").length,
    contentQueueItems: actions.filter((a) => a.action === "content_queue_generation" && a.status === "success").length,
    totalFreeActions: actions.filter((a) => a.cost === 0 && a.status === "success").length,
    paidSpend: 0, // Tracked by marketing engine
  };

  const duration = Date.now() - startTime;

  // Notify owner with enhanced summary including intelligence layer data
  const successCount = actions.filter((a) => a.status === "success").length;
  const failCount = actions.filter((a) => a.status === "failed").length;
  const skippedCount = actions.filter((a) => a.status === "skipped").length;
  const perfReport = getChannelPerformanceReport();
  const topChannels = perfReport.slice(0, 5).map(c => `${c.channel}(${c.priority}/10)`).join(", ");
  const throttledChannels = perfReport.filter(c => c.priority <= 2).map(c => c.channel);
  try {
    await notifyOwner({
      title: `Advertising Cycle v2: ${successCount}/${actions.length} actions (${skippedCount} smart-skipped)`,
      content: `Duration: ${Math.round(duration / 1000)}s\nBlog posts: ${metrics.blogPostsGenerated}\nContent recycled: ${actions.filter(a => a.action === "recycle_content" && a.status === "success").length}\nSocial posts: ${metrics.socialPostsPublished}\nTikTok posts: ${metrics.tiktokContentPosts}\nCommunity: ${metrics.communityEngagements}\nSEO: ${metrics.seoOptimizations}\nEmails: ${metrics.emailCampaignsSent}\nErrors: ${failCount}\n\n📊 Intelligence Layer:\nTop channels: ${topChannels || "gathering data..."}\nThrottled: ${throttledChannels.length > 0 ? throttledChannels.join(", ") : "none"}\nActive A/B tests: ${getActiveABTests().length}${errors.length > 0 ? "\n\nErrors:\n" + errors.join("\n") : ""}`,
    });
  } catch {
    // Notification failure is non-critical
  }

  log.info(`[AdvertisingOrchestrator] Cycle complete: ${successCount} success, ${failCount} failed, ${duration}ms`);

  // Next run is tomorrow at 9 AM AEST
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(9, 0, 0, 0);

  return {
    timestamp: now.toISOString(),
    duration,
    actions,
    metrics,
    nextScheduledRun: nextRun.toISOString(),
    errors,
  };
}

// ============================================
// SCHEDULER
// ============================================

let advertisingInterval: ReturnType<typeof setInterval> | null = null;

/** Advertising run days: Monday (1), Wednesday (3), Friday (5) */
const ADVERTISING_RUN_DAYS = [1, 3, 5];

/**
 * Start the autonomous advertising scheduler.
 * Runs 3x per week (Mon/Wed/Fri) to balance reach and API credit usage.
 * Checks every 4 hours whether it's a run day and hasn't already run today.
 */
export function startAdvertisingScheduler(): void {
  log.info("[AdvertisingOrchestrator] Starting autonomous advertising scheduler (Mon/Wed/Fri)...");

  // COST OPTIMIZATION: Do NOT run on startup.
  // Every Railway deploy triggers a restart which was burning API credits.
  log.info("[AdvertisingOrchestrator] Skipping startup cycle (cost optimization). Checking every 4h for run days.");

  let lastRunDate = "";

  // Check every 4 hours if today is a run day and we haven't run yet today
  advertisingInterval = setInterval(async () => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      const hour = now.getHours();
      const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // Only run on designated days, between 8-10 AM server time, and only once per day
      if (ADVERTISING_RUN_DAYS.includes(dayOfWeek) && hour >= 8 && hour <= 10 && lastRunDate !== todayStr) {
        lastRunDate = todayStr;
        log.info(`[AdvertisingOrchestrator] Running scheduled advertising cycle (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek]})...`);
        await runAdvertisingCycle();
      }
    } catch (err: unknown) {
      log.error("[AdvertisingOrchestrator] Scheduled cycle failed:", { error: String(getErrorMessage(err)) });
    }
  }, 4 * 60 * 60 * 1000); // Check every 4 hours
}

/**
 * Stop the advertising scheduler
 */
export function stopAdvertisingScheduler(): void {
  if (advertisingInterval) {
    clearInterval(advertisingInterval);
    advertisingInterval = null;
    log.info("[AdvertisingOrchestrator] Scheduler stopped.");
  }
}

// ============================================
// PUBLIC API (for admin dashboard)
// ============================================

/**
 * Get the current advertising strategy overview
 */
export function getStrategyOverview() {
  const totalMonthlyBudget = MONTHLY_BUDGET_AUD;
  const freeStrategies = GROWTH_STRATEGIES.filter((s) => s.costPerMonth === 0);
  const paidStrategies = GROWTH_STRATEGIES.filter((s) => s.costPerMonth > 0);

  return {
    monthlyBudget: totalMonthlyBudget,
    currency: "AUD",
    budgetAllocation: {
      googleAds: GOOGLE_ADS_ALLOCATION,
      freeChannels: 0,
    },
    freeChannelCount: freeStrategies.length,
    paidChannelCount: paidStrategies.length,
    strategies: GROWTH_STRATEGIES,
    contentPillars: CONTENT_PILLARS.map((p) => ({
      name: p.pillar,
      keywordCount: p.keywords.length,
      blogTopicCount: p.blogTopics.length,
      socialAngleCount: p.socialAngles.length,
    })),
    communityTargets: Object.entries(COMMUNITY_TARGETS).map(([platform, config]) => ({
      platform,
      strategy: config.strategy,
      ...(platform === "reddit" ? { subreddits: (config as any).subreddits } : {}),
    })),
    schedule: {
      advertisingCycle: "Mon/Wed/Fri (3x per week, 8-10 AM server time)",
      seoOptimization: "Every cycle",
      blogPosts: "Mon/Wed/Fri",
      socialMedia: "Every cycle (2-3 posts)",
      communityEngagement: "Every cycle",
      emailNurture: "Wed only",
      backlinkOutreach: "Monday only",
      affiliateOptimization: "Wed/Fri",
      expandedChannels: "Every cycle (Dev.to, Medium, Hashnode, Discord, Mastodon, Telegram)",
      hackerForums: "Mon/Wed/Fri (HackForums, 0x00sec, HTB, TryHackMe, OWASP, etc.)",
      tiktokContent: "Wed/Fri (auto-generate & post carousels from blog content)",
      videoScripts: "Wed/Fri (YouTube Shorts scripts)",
      contentQueue: "Every cycle (Quora, Skool, IndieHackers, Pinterest, HN, LinkedIn, Slack)",
      whatsappBroadcast: "Monday (weekly security tip)",
      marketingEngineCycle: "Every cycle",
    },
  };
}

/**
 * Get recent advertising activity
 */
export async function getRecentActivity(limit = 50) {
  try {
    const db = await getDb();
    if (!db) return [];

    const activities = await (db as any).query.marketingActivityLog.findMany({
      orderBy: [desc(marketingActivityLog.createdAt)],
      limit,
    });

    return activities;
  } catch {
    return [];
  }
}

/**
 * Get advertising performance metrics for the last N days
 */
export async function getPerformanceMetrics(days = 30) {
  try {
    const db = await getDb();
    if (!db) return null;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

    // Blog stats
    const blogCount = await db.select({ count: count() }).from(blogPosts).where(gte(blogPosts.publishedAt, new Date(startDate)));

    // Marketing content stats
    const contentStats = await db
      .select({
        platform: marketingContent.channel,
        count: count(),
      })
      .from(marketingContent)
      .where(gte(marketingContent.createdAt, new Date(startDate)))
      .groupBy(marketingContent.channel);

    // Affiliate stats
    const affiliateClickCount = await db.select({ count: count() }).from(affiliateClicks).where(gte(affiliateClicks.createdAt, new Date(startDate)));

    // Campaign performance
    const campaignPerf = await (db as any).query.marketingPerformance.findMany({
      where: gte(marketingPerformance.date, startDate),
    });

    const totalImpressions = campaignPerf.reduce((sum: number, p: any) => sum + (p.impressions || 0), 0);
    const totalClicks = campaignPerf.reduce((sum: number, p: any) => sum + (p.clicks || 0), 0);
    const totalConversions = campaignPerf.reduce((sum: number, p: any) => sum + (p.conversions || 0), 0);
    const totalSpend = campaignPerf.reduce((sum: number, p: any) => sum + parseFloat(p.spend || "0"), 0);

    return {
      period: `Last ${days} days`,
      organic: {
        blogPostsPublished: blogCount[0]?.count || 0,
        contentPiecesCreated: contentStats.reduce((sum, s) => sum + Number(s.count), 0),
        contentByPlatform: Object.fromEntries(contentStats.map((s) => [s.platform, Number(s.count)])),
        affiliateClicks: affiliateClickCount[0]?.count || 0,
      },
      paid: {
        totalImpressions,
        totalClicks,
        totalConversions,
        totalSpend: Math.round(totalSpend * 100) / 100,
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
        conversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0,
      },
      budgetUtilization: {
        monthlyBudget: MONTHLY_BUDGET_AUD,
        spent: Math.round(totalSpend * 100) / 100,
        remaining: Math.round((MONTHLY_BUDGET_AUD - totalSpend) * 100) / 100,
        utilizationPercent: Math.round((totalSpend / MONTHLY_BUDGET_AUD) * 100),
      },
    };
  } catch {
    return null;
  }
}

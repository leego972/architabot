/**
 * Titan Autonomous Marketing Engine
 * 
 * The AI brain that runs Archibald Titan's marketing autonomously:
 * - Content Generation: Creates platform-specific posts, ad copy, blog articles
 * - Budget Allocation: AI distributes monthly spend across channels based on performance
 * - Campaign Orchestration: Creates, monitors, and optimizes campaigns
 * - Performance Analysis: Tracks ROI and reallocates underperforming budgets
 * - Quality Control: Ensures brand consistency and content quality
 */

import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { getDb } from "./db";
import * as schema from "../drizzle/schema";
import {
  marketingBudgets,
  marketingCampaigns,
  marketingContent,
  marketingPerformance,
  marketingActivityLog,
  marketingSettings,
} from "../drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  metaAdapter,
  googleAdsAdapter,
  xAdapter,
  linkedinAdapter,
  snapchatAdapter,
  sendgridAdapter,
  redditAdapter,
  tiktokAdapter,
  pinterestAdapter,
  getAllChannelStatuses,
  getConnectedChannels,
  postToAllChannels,
  type ChannelId,
  type PerformanceMetrics,
} from "./marketing-channels";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("MarketingEngine");

// ============================================
// TYPES
// ============================================

export interface BudgetAllocation {
  channel: ChannelId;
  amount: number;
  percentage: number;
  reasoning: string;
}

export interface ContentPiece {
  platform: string;
  type: "organic_post" | "ad_copy" | "blog_article" | "email_campaign";
  headline: string;
  body: string;
  hashtags: string[];
  callToAction: string;
  imagePrompt?: string;
  imageUrl?: string;
  scheduledFor?: Date;
}

export interface CampaignPlan {
  name: string;
  objective: string;
  channels: ChannelId[];
  budget: number;
  duration: number; // days
  targeting: {
    audiences: string[];
    locations: string[];
    interests: string[];
    ageRange: { min: number; max: number };
  };
  content: ContentPiece[];
}

// ============================================
// TITAN BRAND CONTEXT
// ============================================

const TITAN_BRAND = {
  name: "Archibald Titan",
  tagline: "The World's Most Advanced Local AI Agent",
  description:
    "Archibald Titan is a cutting-edge AI-powered platform that combines autonomous code execution, cybersecurity tools, credential management, and intelligent assistance into one powerful desktop and web application. Built for security professionals, developers, and power users who demand the best.",
  website: "https://architabot-f68pur9a.manus.space",
  keyFeatures: [
    "AI-powered chat assistant with autonomous code execution",
    "Secure credential vault with breach monitoring",
    "TOTP two-factor authentication manager",
    "Dark web leak scanner",
    "Website replication engine",
    "Sandbox code execution environment",
    "Credential health monitoring and scoring",
    "Cross-platform (Web + Desktop via Electron)",
  ],
  targetAudiences: [
    "Cybersecurity professionals and penetration testers",
    "Software developers and DevOps engineers",
    "IT administrators and security teams",
    "Tech-savvy professionals who value security",
    "Small business owners needing security tools",
  ],
  tone: "Confident, technical, authoritative but approachable. Think Iron Man's JARVIS meets a cybersecurity expert.",
  colors: { primary: "#dc2626", secondary: "#1e1e2e", accent: "#f59e0b" },
  competitors: ["1Password", "LastPass", "Bitwarden", "GitHub Copilot", "ChatGPT"],
  // Campaign creative assets uploaded by owner (rotated across campaigns)
  campaignImages: [
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/gvTVttaFEQstvWuh.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/KeTLfaSXYpSzZYrC.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/myFnaqFpXtIwMYmX.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/UmexBzectsHuvsNd.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/RGWrfdQoAtcdKjif.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/eLBbWQGICiDYYbYD.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/ZuWltnnHDFRmxrlQ.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/bhGHYADVuNfLtkhV.png",
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/wZJrLqfQjumeUtkd.png",
  ],
  campaignVideos: [
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663339631904/FEAdTmkvXlpjZyqd.mp4",
  ],
  get defaultCampaignVideo() {
    return this.campaignVideos[Math.floor(Math.random() * this.campaignVideos.length)];
  },
  get defaultCampaignImage() {
    return this.campaignImages[Math.floor(Math.random() * this.campaignImages.length)];
  },
  // Art style guide for AI-generated campaign images
  artStyle: {
    description: "Dark futuristic cyberpunk aesthetic with a chrome-armored knight/warrior figure as the Titan mascot. Deep navy/midnight blue background with glowing cyan and electric blue circuit board patterns, digital particle effects, and subtle cityscape silhouettes. The Titan character has glowing blue eyes and metallic silver armor with blue LED accents. Text uses bold metallic 3D lettering with chrome/silver gradients. Gold accent banners for key messaging. Overall mood: powerful, technological, futuristic, commanding.",
    imagePromptPrefix: "Dark futuristic cyberpunk digital art, chrome-armored AI knight warrior with glowing blue eyes, deep navy midnight blue background with electric blue circuit patterns and digital particles, metallic silver armor with blue LED accents, bold metallic 3D text,",
    imagePromptSuffix: "high quality digital illustration, cinematic lighting, tech aesthetic, dark background with blue glow effects, professional marketing campaign art",
    mustInclude: ["Archibald Titan branding", "futuristic tech aesthetic", "blue glow effects", "dark background"],
    avoid: ["cartoonish style", "flat design", "pastel colors", "minimalist", "stock photo look"],
  },
};

// ============================================
// CONTENT GENERATOR
// ============================================

export async function generateContent(params: {
  platform: "facebook" | "instagram" | "x_twitter" | "linkedin" | "snapchat" | "email" | "reddit" | "tiktok" | "pinterest" | "blog";
  contentType: "organic_post" | "ad_copy" | "blog_article";
  topic?: string;
  campaignGoal?: string;
  includeImage?: boolean;
}): Promise<ContentPiece> {
  const platformGuidelines: Record<string, string> = {
    facebook: "Max 500 chars for best engagement. Use emojis sparingly. Include a clear CTA. Link in post body works.",
    instagram: "Max 2200 chars but first 125 visible. Heavy on hashtags (20-30). Visual-first platform. No clickable links in captions.",
    x_twitter: "Max 280 chars. Punchy, witty, conversational. 2-5 hashtags max. Thread for longer content.",
    linkedin: "Professional tone. 1300 chars optimal. Industry insights perform well. Tag relevant companies/people.",
    snapchat: "Short, visual, casual. 10-second attention span. Behind-the-scenes content works well.",
    email: "Subject line under 50 chars. Preview text under 90 chars. Clear CTA button. Mobile-first HTML design. Personalization tokens where possible.",
    reddit: "Authentic, value-first. No hard selling. Community-appropriate tone. Detailed technical posts perform well. Engage in comments.",
    tiktok: "Hook in first 3 seconds. Vertical video format. Trending sounds/effects. 15-60 seconds optimal. Educational or entertaining.",
    pinterest: "Vertical image 2:3 ratio. SEO-rich descriptions. Keywords in title. Actionable content. Link to landing page.",
    blog: "800-1500 words. SEO-optimized. Include headers, bullet points. Technical depth appreciated by our audience.",
  };

  const systemPrompt = `You are the head of marketing for ${TITAN_BRAND.name} — ${TITAN_BRAND.tagline}.

BRAND VOICE: ${TITAN_BRAND.tone}

KEY FEATURES TO PROMOTE:
${TITAN_BRAND.keyFeatures.map((f) => `• ${f}`).join("\n")}

TARGET AUDIENCES:
${TITAN_BRAND.targetAudiences.map((a) => `• ${a}`).join("\n")}

COMPETITORS TO DIFFERENTIATE FROM: ${TITAN_BRAND.competitors.join(", ")}

WEBSITE: ${TITAN_BRAND.website}

You create compelling, authentic marketing content that drives engagement and conversions.
Never be generic. Every post should feel like it was written by someone who genuinely understands cybersecurity and AI.
Use real technical terminology. Our audience can smell fake marketing from a mile away.

IMAGE STYLE GUIDE: When writing the imagePrompt, describe a scene matching this aesthetic: ${TITAN_BRAND.artStyle.description}
Must include: ${TITAN_BRAND.artStyle.mustInclude.join(", ")}
Avoid: ${TITAN_BRAND.artStyle.avoid.join(", ")}

IMPORTANT: Return your response as valid JSON with these fields:
{
  "headline": "The main hook/headline",
  "body": "The full post/article body text",
  "hashtags": ["relevant", "hashtags"],
  "callToAction": "Clear CTA text",
  "imagePrompt": "Detailed prompt for generating an accompanying image in the dark cyberpunk Titan art style"
}`;

  const userPrompt = `Create a ${params.contentType} for ${params.platform}.

PLATFORM GUIDELINES: ${platformGuidelines[params.platform] || "General best practices."}

${params.topic ? `TOPIC/ANGLE: ${params.topic}` : "Choose a compelling angle based on our features and audience."}
${params.campaignGoal ? `CAMPAIGN GOAL: ${params.campaignGoal}` : ""}

Generate the content now. Make it genuinely compelling — not corporate fluff.`;

  const response = await invokeLLM({
    systemTag: "affiliate",
      model: "fast",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "marketing_content",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headline: { type: "string", description: "Main headline or hook" },
            body: { type: "string", description: "Full post body text" },
            hashtags: { type: "array", items: { type: "string" }, description: "Relevant hashtags" },
            callToAction: { type: "string", description: "Clear call to action" },
            imagePrompt: { type: "string", description: "Image generation prompt" },
          },
          required: ["headline", "body", "hashtags", "callToAction", "imagePrompt"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = JSON.parse(typeof rawContent === "string" ? rawContent : "{}");

  let imageUrl: string | undefined;
  if (params.includeImage && content.imagePrompt) {
    try {
      // Use the Titan art style for all campaign creatives
      const styledPrompt = `${TITAN_BRAND.artStyle.imagePromptPrefix} ${content.imagePrompt}. ${TITAN_BRAND.artStyle.imagePromptSuffix}. No text in image.`;
      const imgResult = await generateImage({
        prompt: styledPrompt,
        originalImages: [{
          url: TITAN_BRAND.defaultCampaignImage,
          mimeType: "image/png" as const,
        }],
      });
      imageUrl = imgResult.url;
    } catch (err) {
      log.error("[Marketing] Image generation failed:", { error: String(err) });
      // Fallback to default campaign image if generation fails
      imageUrl = TITAN_BRAND.defaultCampaignImage;
    }
  }

  return {
    platform: params.platform,
    type: params.contentType,
    headline: content.headline,
    body: content.body,
    hashtags: content.hashtags || [],
    callToAction: content.callToAction,
    imagePrompt: content.imagePrompt,
    imageUrl,
  };
}

// ============================================
// BUDGET ALLOCATOR
// ============================================

export async function allocateBudget(params: {
  monthlyBudget: number;
  historicalPerformance?: Record<string, PerformanceMetrics>;
}): Promise<BudgetAllocation[]> {
  const connectedChannels = getConnectedChannels();

  if (connectedChannels.length === 0) {
    return [];
  }

  const performanceContext = params.historicalPerformance
    ? Object.entries(params.historicalPerformance)
        .map(
          ([ch, m]) =>
            `${ch}: CTR=${(m.ctr * 100).toFixed(2)}%, CPC=$${m.cpc.toFixed(2)}, Conversions=${m.conversions}, ROI=${m.spend > 0 ? ((m.conversions * 50 - m.spend) / m.spend * 100).toFixed(1) : "N/A"}%`
        )
        .join("\n")
    : "No historical data yet — use industry benchmarks for initial allocation.";

  const systemPrompt = `You are a senior media buyer and marketing strategist for ${TITAN_BRAND.name}, a cybersecurity/AI SaaS product.

Your job is to allocate a monthly advertising budget across channels to maximize signups and brand awareness.

CONNECTED CHANNELS: ${connectedChannels.map((c) => c.name).join(", ")}

TARGET AUDIENCE: ${TITAN_BRAND.targetAudiences.join("; ")}

HISTORICAL PERFORMANCE:
${performanceContext}

INDUSTRY BENCHMARKS FOR CYBERSECURITY SAAS:
• Google Ads: CPC $3-8, CTR 2-4%, best for high-intent search traffic
• LinkedIn: CPC $5-12, CTR 0.4-0.8%, best for B2B professionals
• Meta (FB/IG): CPC $1-3, CTR 0.8-1.5%, best for awareness and retargeting
• X (Twitter): CPC $0.5-2, CTR 1-3%, best for tech community engagement
• Snapchat: CPC $1-3, CTR 0.3-0.5%, best for younger tech audience

Return your allocation as JSON:
{
  "allocations": [
    {
      "channel": "channel_id",
      "percentage": 25,
      "amount": 250,
      "reasoning": "Why this allocation"
    }
  ]
}`;

  const response = await invokeLLM({
    systemTag: "affiliate",
      model: "fast",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Allocate a monthly budget of $${params.monthlyBudget.toFixed(2)} across the connected channels. Optimize for maximum signups to ${TITAN_BRAND.website}. Consider that we're a cybersecurity/AI product targeting technical professionals.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "budget_allocation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            allocations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  channel: { type: "string" },
                  percentage: { type: "number" },
                  amount: { type: "number" },
                  reasoning: { type: "string" },
                },
                required: ["channel", "percentage", "amount", "reasoning"],
                additionalProperties: false,
              },
            },
          },
          required: ["allocations"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawResult = response.choices[0]?.message?.content;
  const result = JSON.parse(typeof rawResult === "string" ? rawResult : '{"allocations":[]}');
  return result.allocations;
}

// ============================================
// CAMPAIGN ORCHESTRATOR
// ============================================

export async function createCampaignPlan(params: {
  goal: "awareness" | "signups" | "engagement" | "retention";
  budget: number;
  durationDays: number;
  focusChannels?: ChannelId[];
}): Promise<CampaignPlan> {
  const connectedChannels = getConnectedChannels();
  const availableChannels = params.focusChannels
    ? connectedChannels.filter((c) => params.focusChannels!.includes(c.id))
    : connectedChannels;

  const systemPrompt = `You are the CMO of ${TITAN_BRAND.name}. Create a detailed campaign plan.

PRODUCT: ${TITAN_BRAND.description}
WEBSITE: ${TITAN_BRAND.website}
AVAILABLE CHANNELS: ${availableChannels.map((c) => `${c.name} (${c.capabilities.join(", ")})`).join("; ")}

Return a campaign plan as JSON:
{
  "name": "Campaign name",
  "objective": "Clear objective statement",
  "channels": ["channel_ids"],
  "budget": ${params.budget},
  "duration": ${params.durationDays},
  "targeting": {
    "audiences": ["audience segments"],
    "locations": ["country codes"],
    "interests": ["interest categories"],
    "ageRange": { "min": 25, "max": 55 }
  },
  "content": [
    {
      "platform": "platform_name",
      "type": "organic_post or ad_copy",
      "headline": "Headline text",
      "body": "Full body text",
      "hashtags": ["hashtags"],
      "callToAction": "CTA text"
    }
  ]
}`;

  const response = await invokeLLM({
    systemTag: "affiliate",
      model: "fast",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Create a ${params.durationDays}-day ${params.goal} campaign with a $${params.budget} budget. Make it specific, actionable, and optimized for our cybersecurity/AI audience.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "campaign_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            objective: { type: "string" },
            channels: { type: "array", items: { type: "string" } },
            budget: { type: "number" },
            duration: { type: "number" },
            targeting: {
              type: "object",
              properties: {
                audiences: { type: "array", items: { type: "string" } },
                locations: { type: "array", items: { type: "string" } },
                interests: { type: "array", items: { type: "string" } },
                ageRange: {
                  type: "object",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" },
                  },
                  required: ["min", "max"],
                  additionalProperties: false,
                },
              },
              required: ["audiences", "locations", "interests", "ageRange"],
              additionalProperties: false,
            },
            content: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  platform: { type: "string" },
                  type: { type: "string" },
                  headline: { type: "string" },
                  body: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  callToAction: { type: "string" },
                },
                required: ["platform", "type", "headline", "body", "hashtags", "callToAction"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "objective", "channels", "budget", "duration", "targeting", "content"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawPlan = response.choices[0]?.message?.content;
  return JSON.parse(typeof rawPlan === "string" ? rawPlan : "{}");
}

// ============================================
// CAMPAIGN EXECUTOR
// ============================================

export async function executeCampaign(params: {
  campaignId: number;
  plan: CampaignPlan;
  budgetAllocations: BudgetAllocation[];
}): Promise<{
  results: Record<string, { success: boolean; platformId?: string; error?: string }>;
  contentPublished: number;
  adsCreated: number;
}> {
  const results: Record<string, { success: boolean; platformId?: string; error?: string }> = {};
  let contentPublished = 0;
  let adsCreated = 0;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const content of params.plan.content) {
    try {
      // Generate image for the content if needed
      let imageUrl: string | undefined;
      if (content.type === "ad_copy" || content.platform === "instagram") {
        try {
          // Use the Titan art style for campaign ad creatives
          const adPrompt = `${TITAN_BRAND.artStyle.imagePromptPrefix} marketing campaign image for ${content.platform}, cybersecurity AI technology product promotion. ${TITAN_BRAND.artStyle.imagePromptSuffix}. No text in image.`;
          const imgResult = await generateImage({
            prompt: adPrompt,
            originalImages: [{
              url: TITAN_BRAND.defaultCampaignImage,
              mimeType: "image/png" as const,
            }],
          });
          imageUrl = imgResult.url;
        } catch {
          log.warn("[Marketing] Image generation failed, continuing without image");
        }
      }

      // Publish organic content
      if (content.type === "organic_post") {
        const fullMessage = `${content.headline}\n\n${content.body}\n\n${content.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;

        if (content.platform === "facebook" && metaAdapter.isConfigured) {
          const result = await metaAdapter.postToFacebook({
            message: fullMessage,
            link: TITAN_BRAND.website,
            imageUrl,
          });
          results[`fb_${contentPublished}`] = {
            success: result.success,
            platformId: result.platformPostId,
            error: result.error,
          };
          if (result.success) contentPublished++;
        }

        if (content.platform === "instagram" && metaAdapter.isConfigured && imageUrl) {
          const result = await metaAdapter.postToInstagram({
            imageUrl,
            caption: `${content.headline}\n\n${content.body}\n\n${content.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`,
          });
          results[`ig_${contentPublished}`] = {
            success: result.success,
            platformId: result.platformPostId,
            error: result.error,
          };
          if (result.success) contentPublished++;
        }

        if (content.platform === "x_twitter" && xAdapter.isConfigured) {
          let mediaIds: string[] | undefined;
          if (imageUrl) {
            const mediaId = await xAdapter.uploadMedia(imageUrl);
            if (mediaId) mediaIds = [mediaId];
          }
          const tweetText = `${content.headline}\n\n${content.body}`.substring(0, 260) +
            `\n${content.hashtags.slice(0, 3).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;
          const result = await xAdapter.postTweet({ text: tweetText.substring(0, 280), mediaIds });
          results[`x_${contentPublished}`] = {
            success: result.success,
            platformId: result.platformPostId,
            error: result.error,
          };
          if (result.success) contentPublished++;
        }

        if (content.platform === "linkedin" && linkedinAdapter.isConfigured) {
          const result = await linkedinAdapter.postToPage({
            text: fullMessage,
            link: TITAN_BRAND.website,
          });
          results[`li_${contentPublished}`] = {
            success: result.success,
            platformId: result.platformPostId,
            error: result.error,
          };
          if (result.success) contentPublished++;
        }
      }

      // Create paid ad campaigns
      if (content.type === "ad_copy") {
        const channelBudget = params.budgetAllocations.find(
          (a) => a.channel.includes(content.platform) || content.platform.includes(a.channel.split("_")[0])
        );
        const dailyBudget = channelBudget
          ? (channelBudget.amount / params.plan.duration)
          : (params.plan.budget / params.plan.content.filter((c) => c.type === "ad_copy").length / params.plan.duration);

        if (content.platform === "facebook" && metaAdapter.isConfigured) {
          const result = await metaAdapter.createAdCampaign({
            name: `${params.plan.name} - FB`,
            objective: "OUTCOME_TRAFFIC",
            dailyBudget: Math.round(dailyBudget * 100), // cents
            targeting: {
              ageMin: params.plan.targeting.ageRange.min,
              ageMax: params.plan.targeting.ageRange.max,
              interests: params.plan.targeting.interests,
              locations: { countries: params.plan.targeting.locations },
            },
            adCreative: {
              title: content.headline,
              body: content.body,
              imageUrl,
              linkUrl: TITAN_BRAND.website,
              callToAction: "LEARN_MORE",
            },
          });
          results[`fb_ad_${adsCreated}`] = {
            success: result.success,
            platformId: result.platformCampaignId,
            error: result.error,
          };
          if (result.success) adsCreated++;
        }

        if (content.platform === "google" && googleAdsAdapter.isConfigured) {
          const result = await googleAdsAdapter.createSearchCampaign({
            name: `${params.plan.name} - Google`,
            dailyBudget: Math.round(dailyBudget * 1_000_000), // micros
            keywords: params.plan.targeting.interests.concat([
              "AI security tool",
              "credential manager",
              "cybersecurity AI",
              "password manager alternative",
              "AI code assistant",
            ]),
            headlines: [
              content.headline.substring(0, 30),
              TITAN_BRAND.tagline.substring(0, 30),
              "Try Archibald Titan Free",
              "AI-Powered Security Suite",
            ],
            descriptions: [
              content.body.substring(0, 90),
              `${TITAN_BRAND.name} — ${TITAN_BRAND.tagline}`.substring(0, 90),
            ],
            finalUrl: TITAN_BRAND.website,
          });
          results[`google_ad_${adsCreated}`] = {
            success: result.success,
            platformId: result.platformCampaignId,
            error: result.error,
          };
          if (result.success) adsCreated++;
        }

        if (content.platform === "linkedin" && linkedinAdapter.isConfigured) {
          const result = await linkedinAdapter.createSponsoredCampaign({
            name: `${params.plan.name} - LinkedIn`,
            dailyBudget: Math.round(dailyBudget * 100),
            targetAudiences: {
              industries: params.plan.targeting.interests,
              jobTitles: ["Security Engineer", "DevOps Engineer", "CTO", "CISO", "Software Developer"],
            },
            adText: `${content.headline}\n\n${content.body}`,
            destinationUrl: TITAN_BRAND.website,
          });
          results[`li_ad_${adsCreated}`] = {
            success: result.success,
            platformId: result.platformCampaignId,
            error: result.error,
          };
          if (result.success) adsCreated++;
        }

        if (content.platform === "snapchat" && snapchatAdapter.isConfigured) {
          const result = await snapchatAdapter.createCampaign({
            name: `${params.plan.name} - Snap`,
            dailyBudget: Math.round(dailyBudget * 1_000_000),
            objective: "DRIVING_TRAFFIC",
            startTime: new Date().toISOString(),
            creative: {
              name: `${params.plan.name} Creative`,
              headline: content.headline.substring(0, 34),
              brandName: TITAN_BRAND.name,
              shareable: true,
              callToAction: "VIEW_MORE",
              webViewUrl: TITAN_BRAND.website,
            },
            targeting: {
              geos: params.plan.targeting.locations.map((c) => ({ countryCode: c })),
              demographics: {
                ageGroups: ["18-24", "25-34", "35-49"],
              },
            },
          });
          results[`snap_ad_${adsCreated}`] = {
            success: result.success,
            platformId: result.platformCampaignId,
            error: result.error,
          };
          if (result.success) adsCreated++;
        }
      }

      // Save content to database
      await db!.insert(marketingContent).values({
        campaignId: params.campaignId,
        channel: content.platform as any,
        contentType: content.type as any,
        title: content.headline,
        body: content.body,
        mediaUrl: imageUrl || null,
        hashtags: content.hashtags,
        status: "published",
        externalPostId: Object.values(results).find((r) => r.success)?.platformId || null,
        publishedAt: new Date(),
      });
    } catch (err: unknown) {
      log.error(`[Marketing] Failed to execute content for ${content.platform}:`, { error: String(getErrorMessage(err)) });
      results[`error_${content.platform}`] = { success: false, error: getErrorMessage(err) };
    }
  }

  return { results, contentPublished, adsCreated };
}

// ============================================
// PERFORMANCE ANALYZER
// ============================================

export async function analyzePerformance(campaignId: number): Promise<{
  overallMetrics: PerformanceMetrics;
  channelBreakdown: Record<string, PerformanceMetrics>;
  recommendations: string[];
  budgetReallocation?: BudgetAllocation[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dbWithSchema = db as any;

  // Get campaign details
  const campaign = await dbWithSchema.query.marketingCampaigns.findFirst({
    where: eq(marketingCampaigns.id, campaignId),
  });

  if (!campaign) throw new Error("Campaign not found");

  // Collect metrics from all channels
  const channelBreakdown: Record<string, PerformanceMetrics> = {};
  const contents = await dbWithSchema.query.marketingContent.findMany({
    where: eq(marketingContent.campaignId, campaignId),
  });

  for (const content of contents) {
    if (!content.externalPostId) continue;

    let metrics: PerformanceMetrics | null = null;

    if (content.channel === "meta" || content.channel === "meta_facebook" || content.channel === "meta_instagram") {
      metrics = await metaAdapter.getMetrics(content.externalPostId);
    } else if (content.channel === "google_ads") {
      metrics = await googleAdsAdapter.getMetrics(content.externalPostId);
    } else if (content.channel === "x_twitter") {
      metrics = await xAdapter.getMetrics(content.externalPostId);
    } else if (content.channel === "linkedin") {
      metrics = await linkedinAdapter.getMetrics(content.externalPostId);
    } else if (content.channel === "snapchat") {
      metrics = await snapchatAdapter.getMetrics(content.externalPostId);
    } else if (content.channel === "tiktok") {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      metrics = await tiktokAdapter.getReportData({ startDate: weekAgo, endDate: today, campaignIds: [content.externalPostId] });
    } else if (content.channel === "pinterest") {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      metrics = await pinterestAdapter.getAnalytics({ startDate: weekAgo, endDate: today });
    }

    if (metrics) {
      channelBreakdown[content.channel] = metrics;

      // Save to performance table
      await db!.insert(marketingPerformance).values({
        date: new Date().toISOString().substring(0, 10),
        channel: content.channel as any,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        spend: Math.round(metrics.spend * 100), // cents
        cpc: Math.round(metrics.cpc * 100), // cents
        cpm: Math.round(metrics.cpm * 100), // cents
        ctr: metrics.ctr.toFixed(4),
        roas: metrics.spend > 0 ? ((metrics.conversions * 50 - metrics.spend) / metrics.spend).toFixed(2) : "0",
      });
    }
  }

  // Aggregate overall metrics
  const overallMetrics: PerformanceMetrics = {
    impressions: 0,
    reach: 0,
    clicks: 0,
    engagement: 0,
    spend: 0,
    conversions: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
  };

  Object.values(channelBreakdown).forEach((m) => {
    overallMetrics.impressions += m.impressions;
    overallMetrics.reach += m.reach;
    overallMetrics.clicks += m.clicks;
    overallMetrics.engagement += m.engagement;
    overallMetrics.spend += m.spend;
    overallMetrics.conversions += m.conversions;
  });

  if (overallMetrics.impressions > 0) {
    overallMetrics.ctr = overallMetrics.clicks / overallMetrics.impressions;
    overallMetrics.cpm = (overallMetrics.spend / overallMetrics.impressions) * 1000;
  }
  if (overallMetrics.clicks > 0) {
    overallMetrics.cpc = overallMetrics.spend / overallMetrics.clicks;
  }

  // AI-powered recommendations
  const response = await invokeLLM({
    systemTag: "affiliate",
      model: "fast",
    messages: [
      {
        role: "system",
        content: `You are a performance marketing analyst for ${TITAN_BRAND.name}. Analyze campaign metrics and provide actionable recommendations.`,
      },
      {
        role: "user",
        content: `Analyze this campaign performance and give 3-5 specific, actionable recommendations:

Campaign: ${campaign.name}
Budget: $${campaign.totalBudget}
Duration: ${campaign.durationDays} days

Channel Performance:
${Object.entries(channelBreakdown)
  .map(
    ([ch, m]) =>
      `${ch}: ${m.impressions} impressions, ${m.clicks} clicks, CTR ${(m.ctr * 100).toFixed(2)}%, CPC $${m.cpc.toFixed(2)}, ${m.conversions} conversions, $${m.spend.toFixed(2)} spent`
  )
  .join("\n")}

Overall: ${overallMetrics.impressions} impressions, ${overallMetrics.clicks} clicks, ${overallMetrics.conversions} conversions, $${overallMetrics.spend.toFixed(2)} spent

Return JSON: { "recommendations": ["recommendation 1", "recommendation 2", ...] }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "recommendations",
        strict: true,
        schema: {
          type: "object",
          properties: {
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawRecs = response.choices[0]?.message?.content;
  const { recommendations } = JSON.parse(typeof rawRecs === "string" ? rawRecs : '{"recommendations":[]}');

  return {
    overallMetrics,
    channelBreakdown,
    recommendations,
  };
}

// ============================================
// AUTONOMOUS SCHEDULER
// ============================================

export async function runAutonomousCycle(): Promise<{
  contentGenerated: number;
  contentPublished: number;
  campaignsOptimized: number;
  budgetReallocated: boolean;
}> {
  const db = await getDb();
  if (!db) {
    log.info("[Marketing] Database not available, skipping cycle");
    return { contentGenerated: 0, contentPublished: 0, campaignsOptimized: 0, budgetReallocated: false };
  }
  const dbAny = db as any;
  let contentGenerated = 0;
  let contentPublished = 0;
  let campaignsOptimized = 0;
  let budgetReallocated = false;

  log.info("[Marketing] Starting autonomous cycle...");

  // 1. Check if marketing is enabled
  const settings = await dbAny.query.marketingSettings.findFirst({
    where: eq(marketingSettings.key, "enabled"),
  });

  if (settings?.value !== "true") {
    log.info("[Marketing] Marketing engine is disabled, skipping cycle");
    return { contentGenerated: 0, contentPublished: 0, campaignsOptimized: 0, budgetReallocated: false };
  }

  // 2. Get monthly budget
  const budgetSetting = await dbAny.query.marketingSettings.findFirst({
    where: eq(marketingSettings.key, "monthly_budget"),
  });
  const monthlyBudget = parseFloat(budgetSetting?.value || "0");

  if (monthlyBudget <= 0) {
    log.info("[Marketing] No budget set, skipping paid campaigns");
  }

  // 3. Generate and publish organic content for connected channels
  const connectedChannels = getConnectedChannels();
  const organicChannels = connectedChannels.filter((c) => c.capabilities.includes("organic_post"));

  for (const channel of organicChannels) {
    try {
      const platformMap: Record<string, string> = {
        meta_facebook: "facebook",
        meta_instagram: "instagram",
        x_twitter: "x_twitter",
        linkedin: "linkedin",
        snapchat: "snapchat",
        sendgrid: "email",
        reddit: "reddit",
        tiktok: "tiktok",
        pinterest: "pinterest",
      };

      const content = await generateContent({
        platform: (platformMap[channel.id] || channel.id) as any,
        contentType: "organic_post",
        includeImage: channel.capabilities.includes("image_post"),
      });

      contentGenerated++;

      // Publish the content
      const fullMessage = `${content.headline}\n\n${content.body}\n\n${content.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;

      let result;
      if (channel.id === "meta_facebook") {
        result = await metaAdapter.postToFacebook({
          message: fullMessage,
          link: TITAN_BRAND.website,
          imageUrl: content.imageUrl,
        });
      } else if (channel.id === "meta_instagram" && content.imageUrl) {
        result = await metaAdapter.postToInstagram({
          imageUrl: content.imageUrl,
          caption: fullMessage,
        });
      } else if (channel.id === "x_twitter") {
        let mediaIds: string[] | undefined;
        if (content.imageUrl) {
          const mediaId = await xAdapter.uploadMedia(content.imageUrl);
          if (mediaId) mediaIds = [mediaId];
        }
        result = await xAdapter.postTweet({
          text: fullMessage.substring(0, 280),
          mediaIds,
        });
      } else if (channel.id === "linkedin") {
        result = await linkedinAdapter.postToPage({
          text: fullMessage,
          link: TITAN_BRAND.website,
        });
      } else if (channel.id === "reddit") {
        result = await redditAdapter.submitPost({
          subreddit: "ArchibaldTitan",
          title: content.headline.substring(0, 300),
          text: content.body,
          url: TITAN_BRAND.website,
        });
      } else if (channel.id === "pinterest" && content.imageUrl) {
        result = await pinterestAdapter.createPin({
          title: content.headline.substring(0, 100),
          description: fullMessage.substring(0, 500),
          link: TITAN_BRAND.website,
          imageUrl: content.imageUrl,
        });
      }

      if (result?.success) {
        contentPublished++;
        log.info(`[Marketing] Published to ${channel.name}: ${content.headline}`);
      }
    } catch (err: unknown) {
      log.error(`[Marketing] Failed to publish to ${channel.name}:`, { error: String(getErrorMessage(err)) });
    }
  }

  // 4. Optimize active campaigns
  const activeCampaigns = await dbAny.query.marketingCampaigns.findMany({
    where: eq(marketingCampaigns.status, "active"),
  });

  for (const campaign of activeCampaigns) {
    try {
      const analysis = await analyzePerformance(campaign.id);

      // Update campaign with latest metrics
      await db!
        .update(marketingCampaigns)
        .set({
          impressions: analysis.overallMetrics.impressions,
          clicks: analysis.overallMetrics.clicks,
          conversions: analysis.overallMetrics.conversions,
          totalSpend: Math.round(analysis.overallMetrics.spend * 100), // cents
          updatedAt: new Date(),
        })
        .where(eq(marketingCampaigns.id, campaign.id));

      campaignsOptimized++;
      log.info(`[Marketing] Optimized campaign: ${campaign.name}`);
    } catch (err: unknown) {
      log.error(`[Marketing] Failed to optimize campaign ${campaign.name}:`, { error: String(getErrorMessage(err)) });
    }
  }

  // 5. Budget reallocation (monthly)
  if (monthlyBudget > 0 && activeCampaigns.length > 0) {
    try {
      const historicalPerformance: Record<string, PerformanceMetrics> = {};
      // Aggregate from analytics
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
      const recentAnalytics = await dbAny.query.marketingPerformance.findMany({
        where: gte(marketingPerformance.date, thirtyDaysAgo),
      });

      for (const a of recentAnalytics) {
        if (!historicalPerformance[a.channel]) {
          historicalPerformance[a.channel] = {
            impressions: 0, reach: 0, clicks: 0, engagement: 0,
            spend: 0, conversions: 0, ctr: 0, cpc: 0, cpm: 0,
          };
        }
        const hp = historicalPerformance[a.channel];
        hp.impressions += a.impressions || 0;
        hp.clicks += a.clicks || 0;
        hp.conversions += a.conversions || 0;
        hp.spend += parseFloat(a.spend || "0");
        hp.engagement += a.engagement || 0;
      }

      // Recalculate derived metrics
      Object.values(historicalPerformance).forEach((m) => {
        if (m.impressions > 0) m.ctr = m.clicks / m.impressions;
        if (m.clicks > 0) m.cpc = m.spend / m.clicks;
        if (m.impressions > 0) m.cpm = (m.spend / m.impressions) * 1000;
        m.reach = m.impressions;
      });

      const newAllocations = await allocateBudget({
        monthlyBudget,
        historicalPerformance,
      });

      // Save new allocations as a budget record
      const month = new Date().toISOString().substring(0, 7);
      await db!.insert(marketingBudgets).values({
        month,
        totalBudget: Math.round(monthlyBudget * 100), // cents
        status: "active",
        allocations: newAllocations.map((a) => ({
          channel: a.channel,
          amount: Math.round(a.amount * 100),
          reasoning: a.reasoning,
        })),
      });

      budgetReallocated = true;
      log.info("[Marketing] Budget reallocated based on performance data");
    } catch (err: unknown) {
      log.error("[Marketing] Budget reallocation failed:", { error: String(getErrorMessage(err)) });
    }
  }

  log.info(`[Marketing] Autonomous cycle complete: ${contentGenerated} generated, ${contentPublished} published, ${campaignsOptimized} optimized`);

  return { contentGenerated, contentPublished, campaignsOptimized, budgetReallocated };
}

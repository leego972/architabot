/**
 * TikTok Content Posting Service
 * 
 * Handles organic content posting to TikTok via the official Content Posting API v2.
 * Supports:
 * - Video posting (via URL pull or file upload)
 * - Photo carousel posting (via URL pull)
 * - Post status checking
 * - Creator info querying
 * - Auto-content generation from blog posts using LLM + image generation
 * 
 * API Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 */

import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { marketingContent, marketingActivityLog, blogPosts } from "../drizzle/schema";
import { eq, desc, and, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "./_core/logger.js";
const log = createLogger("TiktokContentService");

// ============================================
// TYPES
// ============================================

export interface TikTokPostResult {
  success: boolean;
  publishId?: string;
  uploadUrl?: string;
  error?: string;
}

export interface TikTokPostStatus {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_POST" | "PUBLISH_COMPLETE" | "FAILED";
  failReason?: string;
  publiclyAvailable?: boolean;
}

export interface TikTokCreatorInfo {
  creatorAvatarUrl?: string;
  creatorNickname?: string;
  privacyLevelOptions?: string[];
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
  maxVideoPostDurationSec?: number;
}

interface TikTokContentPlan {
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
  visualStyle: string;
  imagePrompt: string;
  contentType: "photo_carousel" | "video_script";
}

// ============================================
// TIKTOK CONTENT POSTING API CLIENT
// ============================================

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

/**
 * Check if TikTok Content Posting is configured
 */
export function isTikTokContentConfigured(): boolean {
  return !!(ENV.tiktokCreatorToken || ENV.tiktokAccessToken);
}

/**
 * Get the active TikTok access token (prefer creator token, fall back to marketing token)
 */
function getAccessToken(): string {
  return ENV.tiktokCreatorToken || ENV.tiktokAccessToken;
}

/**
 * Query creator info to get posting constraints and privacy options
 */
export async function queryCreatorInfo(): Promise<TikTokCreatorInfo | null> {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json() as any;
    if (data.error?.code !== "ok") {
      log.error("[TikTok Content] Creator info error:", { detail: data.error });
      return null;
    }

    return {
      creatorAvatarUrl: data.data?.creator_avatar_url,
      creatorNickname: data.data?.creator_nickname,
      privacyLevelOptions: data.data?.privacy_level_options,
      commentDisabled: data.data?.comment_disabled,
      duetDisabled: data.data?.duet_disabled,
      stitchDisabled: data.data?.stitch_disabled,
      maxVideoPostDurationSec: data.data?.max_video_post_duration_sec,
    };
  } catch (err: any) {
    log.error("[TikTok Content] Failed to query creator info:", { error: String(err.message) });
    return null;
  }
}

/**
 * Post a video to TikTok via URL pull
 */
export async function postVideoByUrl(params: {
  videoUrl: string;
  title: string;
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
}): Promise<TikTokPostResult> {
  const token = getAccessToken();
  if (!token) {
    return { success: false, error: "TikTok Content Posting not configured — no access token" };
  }

  try {
    const response = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: params.title.slice(0, 2200), // TikTok max caption length
          privacy_level: params.privacyLevel || "PUBLIC_TO_EVERYONE",
          disable_comment: params.disableComment ?? false,
          disable_duet: params.disableDuet ?? false,
          disable_stitch: params.disableStitch ?? false,
          video_cover_timestamp_ms: params.videoCoverTimestampMs ?? 1000,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: params.videoUrl,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json() as any;

    if (data.error?.code !== "ok") {
      return {
        success: false,
        error: `TikTok API error: ${data.error?.code} - ${data.error?.message}`,
      };
    }

    return {
      success: true,
      publishId: data.data?.publish_id,
    };
  } catch (err: any) {
    log.error("[TikTok Content] Video post failed:", { error: String(err.message) });
    return { success: false, error: err.message };
  }
}

/**
 * Post photos (carousel) to TikTok via URL pull
 */
export async function postPhotos(params: {
  photoUrls: string[];
  title: string;
  description?: string;
  privacyLevel?: string;
  disableComment?: boolean;
  autoAddMusic?: boolean;
  photoCoverIndex?: number;
}): Promise<TikTokPostResult> {
  const token = getAccessToken();
  if (!token) {
    return { success: false, error: "TikTok Content Posting not configured — no access token" };
  }

  if (!params.photoUrls.length || params.photoUrls.length > 35) {
    return { success: false, error: "Photo count must be between 1 and 35" };
  }

  try {
    const response = await fetch(`${TIKTOK_API_BASE}/post/publish/content/init/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: params.title.slice(0, 2200),
          description: params.description?.slice(0, 2200) || "",
          privacy_level: params.privacyLevel || "PUBLIC_TO_EVERYONE",
          disable_comment: params.disableComment ?? false,
          auto_add_music: params.autoAddMusic ?? true,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: params.photoCoverIndex ?? 0,
          photo_images: params.photoUrls,
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json() as any;

    if (data.error?.code !== "ok") {
      return {
        success: false,
        error: `TikTok API error: ${data.error?.code} - ${data.error?.message}`,
      };
    }

    return {
      success: true,
      publishId: data.data?.publish_id,
    };
  } catch (err: any) {
    log.error("[TikTok Content] Photo post failed:", { error: String(err.message) });
    return { success: false, error: err.message };
  }
}

/**
 * Check the status of a TikTok post
 */
export async function getPostStatus(publishId: string): Promise<TikTokPostStatus | null> {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json() as any;

    if (data.error?.code !== "ok") {
      log.error("[TikTok Content] Status check error:", { detail: data.error });
      return null;
    }

    return {
      status: data.data?.status,
      failReason: data.data?.fail_reason,
      publiclyAvailable: data.data?.publicly_available,
    };
  } catch (err: any) {
    log.error("[TikTok Content] Status check failed:", { error: String(err.message) });
    return null;
  }
}

// ============================================
// CONTENT AUTO-GENERATION
// ============================================

/**
 * Generate TikTok content plan from a blog post using LLM
 */
export async function generateTikTokContentPlan(blogPost: {
  title: string;
  excerpt: string;
  slug: string;
}): Promise<TikTokContentPlan | null> {
  try {
    const response = await invokeLLM({
      systemTag: "misc",
      messages: [
        {
          role: "system",
          content: `You are a viral TikTok content strategist for Archibald Titan, an AI-powered cybersecurity platform. 
Generate a TikTok content plan from the given blog post. The content should be:
- Attention-grabbing with a strong hook in the first line
- Educational but entertaining (edutainment)
- Optimized for the TikTok algorithm with trending hashtags
- Include a CTA to visit archibaldtitan.com

Return JSON with these fields:
- title: The TikTok post title/caption (max 150 chars, include hashtags inline)
- description: Extended description with hashtags and CTA
- hashtags: Array of relevant hashtags (include #cybersecurity #infosec #tech #ai)
- hook: The attention-grabbing opening line
- visualStyle: Description of the visual style for the carousel/video
- imagePrompt: A detailed prompt for generating a cyberpunk-style infographic image
- contentType: "photo_carousel" (prefer this for organic reach)`,
        },
        {
          role: "user",
          content: `Blog post: "${blogPost.title}"\nExcerpt: ${blogPost.excerpt}\nURL: https://www.archibaldtitan.com/blog/${blogPost.slug}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tiktok_content_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
              hook: { type: "string" },
              visualStyle: { type: "string" },
              imagePrompt: { type: "string" },
              contentType: { type: "string", enum: ["photo_carousel", "video_script"] },
            },
            required: ["title", "description", "hashtags", "hook", "visualStyle", "imagePrompt", "contentType"],
            additionalProperties: false,
          },
        },
      },
    });

    const plan = JSON.parse((response.choices[0].message.content as string) || "{}");
    return plan as TikTokContentPlan;
  } catch (err: any) {
    log.error("[TikTok Content] Plan generation failed:", { error: String(err.message) });
    return null;
  }
}

/**
 * Generate carousel images for a TikTok photo post
 * Creates 3-5 slides: hook slide, 2-3 info slides, CTA slide
 */
export async function generateCarouselImages(plan: TikTokContentPlan): Promise<string[]> {
  const imageUrls: string[] = [];

  const slidePrompts = [
    // Slide 1: Hook
    `Cyberpunk-style social media slide for TikTok. Bold neon text: "${plan.hook}" on a dark tech background with circuit patterns. Archibald Titan branding. ${plan.visualStyle}. Clean, readable text. 1080x1920 portrait.`,
    // Slide 2: Key insight
    `Cyberpunk infographic slide for TikTok. Topic: ${plan.title}. Dark background with neon accents, tech grid patterns. Key statistics or facts displayed with icons. Professional cybersecurity aesthetic. 1080x1920 portrait.`,
    // Slide 3: CTA
    `Cyberpunk call-to-action slide for TikTok. Text: "Try Archibald Titan Free" with "archibaldtitan.com" prominently displayed. Neon glow effects, dark tech background, shield/lock icon. 1080x1920 portrait.`,
  ];

  for (const prompt of slidePrompts) {
    try {
      const result = await generateImage({ prompt });
      if (result?.url) {
        // Upload to S3 for permanent storage
        const imageResponse = await fetch(result.url);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const key = `tiktok-content/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const { url: s3Url } = await storagePut(key, imageBuffer, "image/png");
        imageUrls.push(s3Url);
      }
    } catch (err: any) {
      log.error("[TikTok Content] Image generation failed:", { error: String(err.message) });
    }
  }

  return imageUrls;
}

// ============================================
// ORCHESTRATOR INTEGRATION
// ============================================

/**
 * Run the full TikTok content creation and posting pipeline.
 * Called by the advertising orchestrator on schedule.
 * 
 * Flow:
 * 1. Pick an unpromoted blog post
 * 2. Generate a TikTok content plan via LLM
 * 3. Generate carousel images via image generation
 * 4. Post to TikTok via Content Posting API
 * 5. Log the result
 */
export async function runTikTokContentPipeline(): Promise<{
  success: boolean;
  action: string;
  details: string;
  publishId?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, action: "tiktok_content_post", details: "Database not available" };
  }

  // Step 1: Find a blog post that hasn't been posted to TikTok yet
  const postedSlugs = await db
    .select({ platform: marketingContent.platform, title: marketingContent.title })
    .from(marketingContent)
    .where(
      and(
        eq(marketingContent.channel, "tiktok"),
        eq(marketingContent.contentType, "social_post"),
        eq(marketingContent.status, "published")
      )
    );

  const postedTitles = new Set(postedSlugs.map((p) => p.title));

  const availablePosts = await db
    .select({
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      slug: blogPosts.slug,
    })
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(20);

  const unpostedBlog = availablePosts.find((p) => !postedTitles.has(p.title));

  if (!unpostedBlog) {
    // All blog posts have been promoted — pick a random one for re-promotion
    const randomIndex = Math.floor(Math.random() * availablePosts.length);
    const repromote = availablePosts[randomIndex];
    if (!repromote) {
      return { success: false, action: "tiktok_content_post", details: "No blog posts available for TikTok promotion" };
    }
    Object.assign(unpostedBlog || {}, repromote);
  }

  const blogPost = unpostedBlog!;

  // Step 2: Generate content plan
  log.info(`[TikTok Content] Generating content plan for: ${blogPost.title}`);
  const plan = await generateTikTokContentPlan({
    title: blogPost.title,
    excerpt: blogPost.excerpt || "",
    slug: blogPost.slug,
  });
  if (!plan) {
    return { success: false, action: "tiktok_content_post", details: "Failed to generate content plan" };
  }

  // Step 3: Generate carousel images
  log.info(`[TikTok Content] Generating ${plan.contentType === "photo_carousel" ? "carousel images" : "video script"}`);

  let postResult: TikTokPostResult;
  let imageUrls: string[] = [];

  if (plan.contentType === "photo_carousel") {
    imageUrls = await generateCarouselImages(plan);

    if (imageUrls.length === 0) {
      // Store as content queue item if image generation fails
      await db.insert(marketingContent).values({
        channel: "tiktok",
        contentType: "social_post",
        title: plan.title,
        body: plan.description,
        hashtags: plan.hashtags,
        platform: "tiktok_organic",
        status: "draft",
        metadata: { plan, blogSlug: blogPost.slug, contentType: "photo_carousel" },
      } as any);

      return {
        success: true,
        action: "tiktok_content_queue",
        details: `Queued TikTok carousel for "${blogPost.title}" (image generation unavailable, saved as draft)`,
      };
    }

    // Step 4: Post to TikTok
    if (isTikTokContentConfigured()) {
      const fullCaption = `${plan.title}\n\n${plan.description}\n\n${plan.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
      postResult = await postPhotos({
        photoUrls: imageUrls,
        title: fullCaption,
        description: plan.description,
        autoAddMusic: true,
      });
    } else {
      // Not configured — store as ready-to-post content
      postResult = { success: false, error: "TikTok Content Posting API not configured" };
    }
  } else {
    // Video script — store for manual recording
    postResult = { success: false, error: "Video scripts require manual recording" };
  }

  // Step 5: Store in marketing content
  const contentStatus = postResult.success ? "published" : "approved";
  await db.insert(marketingContent).values({
    channel: "tiktok",
    contentType: "social_post",
    title: plan.title,
    body: plan.description,
    mediaUrl: imageUrls[0] || null,
    hashtags: plan.hashtags,
    platform: "tiktok_organic",
    status: contentStatus,
    externalPostId: postResult.publishId || null,
    publishedAt: postResult.success ? new Date() : null,
    metadata: {
      plan,
      blogSlug: blogPost.slug,
      imageUrls,
      contentType: plan.contentType,
      hook: plan.hook,
      publishResult: postResult,
    },
  } as any);

  // Log activity
  await db.insert(marketingActivityLog).values({
    action: "tiktok_content_post",
    channel: "tiktok",
    details: {
      blogTitle: blogPost.title,
      contentType: plan.contentType,
      imagesGenerated: imageUrls.length,
      posted: postResult.success,
      publishId: postResult.publishId,
      error: postResult.error,
    },
    status: postResult.success ? "success" : (imageUrls.length > 0 ? "success" : "failed"),
  });

  if (postResult.success) {
    return {
      success: true,
      action: "tiktok_content_post",
      details: `Posted TikTok carousel for "${blogPost.title}" — ${imageUrls.length} slides, publish_id: ${postResult.publishId}`,
      publishId: postResult.publishId,
    };
  } else {
    return {
      success: true, // Content was generated successfully even if posting failed
      action: "tiktok_content_generate",
      details: `Generated TikTok content for "${blogPost.title}" — ${imageUrls.length} images created, ${contentStatus} status${postResult.error ? ` (${postResult.error})` : ""}`,
    };
  }
}

/**
 * Get TikTok content posting status summary
 */
export async function getTikTokContentStats(): Promise<{
  configured: boolean;
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  approvedPosts: number;
  recentPosts: Array<{
    title: string;
    status: string;
    publishedAt: Date | null;
    imageCount: number;
  }>;
}> {
  const db = await getDb();
  if (!db) {
    return { configured: isTikTokContentConfigured(), totalPosts: 0, publishedPosts: 0, draftPosts: 0, approvedPosts: 0, recentPosts: [] };
  }

  const allContent = await db
    .select()
    .from(marketingContent)
    .where(
      and(
        eq(marketingContent.channel, "tiktok"),
        eq(marketingContent.contentType, "social_post")
      )
    )
    .orderBy(desc(marketingContent.createdAt))
    .limit(20);

  return {
    configured: isTikTokContentConfigured(),
    totalPosts: allContent.length,
    publishedPosts: allContent.filter((c) => c.status === "published").length,
    draftPosts: allContent.filter((c) => c.status === "draft").length,
    approvedPosts: allContent.filter((c) => c.status === "approved").length,
    recentPosts: allContent.slice(0, 10).map((c) => ({
      title: c.title || "Untitled",
      status: c.status,
      publishedAt: c.publishedAt,
      imageCount: (c.metadata as any)?.imageUrls?.length || 0,
    })),
  };
}

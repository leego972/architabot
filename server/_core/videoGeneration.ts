/**
 * Video Generation Module — Pollinations.ai (Free)
 * 
 * Generates AI video content for:
 * - TikTok organic posts (vertical 9:16)
 * - YouTube Shorts (vertical 9:16)
 * - Social media ads (horizontal 16:9)
 * - Marketing promo clips (horizontal 16:9)
 * 
 * Uses Pollinations.ai free tier — no cost, no credit card.
 * Models: seedance (best free), grok-video (alpha/free)
 */

import { storagePut } from "server/storage";
import { ENV } from "./env";
import { createLogger } from "./logger.js";

const log = createLogger("VideoGeneration");

// ─── Types ───

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoModel = "seedance" | "grok-video";

export interface GenerateVideoOptions {
  /** Text prompt describing the video to generate */
  prompt: string;
  /** Duration in seconds (1-8, default 4) */
  duration?: number;
  /** Aspect ratio (default "16:9") */
  aspectRatio?: VideoAspectRatio;
  /** Preferred model (default tries seedance first, then grok-video) */
  model?: VideoModel;
  /** Optional seed for reproducibility */
  seed?: number;
}

export interface GenerateVideoResponse {
  /** Public URL of the generated video */
  url: string;
  /** Model that was used */
  model: VideoModel;
  /** Duration in seconds */
  duration: number;
  /** Aspect ratio used */
  aspectRatio: VideoAspectRatio;
}

// ─── Resolution Presets ───

const RESOLUTION_MAP: Record<VideoAspectRatio, { width: number; height: number }> = {
  "16:9": { width: 848, height: 480 },
  "9:16": { width: 480, height: 848 },
  "1:1": { width: 480, height: 480 },
};

// ─── Core Generation ───

async function generateWithModel(
  model: VideoModel,
  options: GenerateVideoOptions
): Promise<Buffer> {
  const duration = Math.min(Math.max(options.duration || 4, 1), 8);
  const aspectRatio = options.aspectRatio || "16:9";
  const resolution = RESOLUTION_MAP[aspectRatio];
  const encodedPrompt = encodeURIComponent(options.prompt);

  const params = new URLSearchParams();
  params.set("model", model);
  params.set("duration", String(duration));
  params.set("width", String(resolution.width));
  params.set("height", String(resolution.height));
  if (options.seed !== undefined) {
    params.set("seed", String(options.seed));
  }

  const url = `https://gen.pollinations.ai/video/${encodedPrompt}?${params.toString()}`;

  log.info(`Requesting video from Pollinations (model: ${model}, ${resolution.width}x${resolution.height}, ${duration}s)`);

  const headers: Record<string, string> = {};
  const apiKey = ENV.pollinationsApiKey;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const resp = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(300000), // 5 minute timeout — video gen is slow
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "Unknown error");
    throw new Error(`Pollinations ${model} failed (${resp.status}): ${errText}`);
  }

  const contentType = resp.headers.get("content-type") || "";

  // Direct video binary
  if (contentType.includes("video") || contentType.includes("octet-stream")) {
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 1000) {
      throw new Error(`Pollinations ${model} returned too-small response (${buffer.length} bytes)`);
    }
    return buffer;
  }

  // JSON response with URL
  if (contentType.includes("json")) {
    const data = await resp.json() as any;
    const videoUrl = data.url || data.video_url || data.output;
    if (videoUrl) {
      log.info(`Pollinations ${model} returned URL, downloading...`);
      const downloadResp = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
      if (!downloadResp.ok) throw new Error(`Failed to download video from ${videoUrl}`);
      return Buffer.from(await downloadResp.arrayBuffer());
    }
    throw new Error(`Pollinations ${model} returned JSON without video URL`);
  }

  // Redirect — the final URL is the video
  if (resp.url && resp.url !== url) {
    log.info(`Pollinations ${model} redirected, downloading from: ${resp.url}`);
    const downloadResp = await fetch(resp.url, { signal: AbortSignal.timeout(120000) });
    if (!downloadResp.ok) throw new Error(`Failed to download redirected video`);
    return Buffer.from(await downloadResp.arrayBuffer());
  }

  throw new Error(`Pollinations ${model} returned unexpected content-type: ${contentType}`);
}

// ─── Main Entry Point ───

/**
 * Generate a video using Pollinations.ai (free).
 * Tries seedance first, falls back to grok-video.
 * Uploads result to storage and returns a public URL.
 */
export async function generateVideo(
  options: GenerateVideoOptions
): Promise<GenerateVideoResponse> {
  const modelsToTry: VideoModel[] = options.model
    ? [options.model]
    : ["seedance", "grok-video"];

  const duration = Math.min(Math.max(options.duration || 4, 1), 8);
  const aspectRatio = options.aspectRatio || "16:9";
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      log.info(`Attempting video generation with ${model}...`);
      const videoBuffer = await generateWithModel(model, options);

      // Upload to storage
      const filename = `videos/pollinations-${model}-${Date.now()}.mp4`;
      const { url } = await storagePut(filename, videoBuffer, "video/mp4");

      log.info(`Video generated successfully with ${model} (${videoBuffer.length} bytes) → ${url}`);

      return {
        url,
        model,
        duration,
        aspectRatio,
      };
    } catch (err: any) {
      lastError = err;
      log.warn(`Model ${model} failed: ${err.message}`);
    }
  }

  throw new Error(`Video generation failed with all models. Last error: ${lastError?.message || "Unknown"}`);
}

// ─── Convenience Functions for Advertising ───

/**
 * Generate a TikTok/YouTube Shorts vertical video from a script hook.
 */
export async function generateShortFormVideo(
  hook: string,
  scriptSummary: string
): Promise<GenerateVideoResponse> {
  const prompt = `Cinematic cybersecurity themed short video. Scene: ${hook}. ${scriptSummary}. Dark futuristic aesthetic with neon blue and green accents, digital particles, holographic interfaces. Professional quality, dramatic lighting.`;

  return generateVideo({
    prompt,
    duration: 5,
    aspectRatio: "9:16",
  });
}

/**
 * Generate a horizontal marketing/ad video.
 */
export async function generateMarketingVideo(
  topic: string,
  cta: string
): Promise<GenerateVideoResponse> {
  const prompt = `Professional cybersecurity marketing video about ${topic}. Sleek dark UI with glowing elements, data streams, shield icons, lock animations. Modern tech aesthetic. Call to action: ${cta}. Archibald Titan branding. High quality, cinematic.`;

  return generateVideo({
    prompt,
    duration: 6,
    aspectRatio: "16:9",
  });
}

/**
 * Generate a social media promo clip.
 */
export async function generateSocialClip(
  feature: string,
  platform: "tiktok" | "youtube" | "linkedin" | "twitter" | "instagram"
): Promise<GenerateVideoResponse> {
  const isVertical = ["tiktok", "youtube", "instagram"].includes(platform);

  const prompt = `Dynamic tech product showcase video for ${feature}. Cybersecurity theme with dark background, neon accents, floating UI elements, encrypted data visualization. Fast-paced, engaging, modern. Professional quality for ${platform}.`;

  return generateVideo({
    prompt,
    duration: isVertical ? 5 : 4,
    aspectRatio: isVertical ? "9:16" : "16:9",
  });
}

// ─── Status Check ───

/**
 * Check if video generation is available.
 */
export function isVideoGenerationAvailable(): boolean {
  // Pollinations works without a key, but having one gives priority
  return true; // Always available — Pollinations free tier
}

export function getVideoGenerationStatus(): {
  available: boolean;
  provider: string;
  hasApiKey: boolean;
  models: VideoModel[];
} {
  return {
    available: true,
    provider: "Pollinations.ai (Free)",
    hasApiKey: !!ENV.pollinationsApiKey,
    models: ["seedance", "grok-video"],
  };
}

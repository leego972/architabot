/**
 * Expanded Channel Adapters — Real API integrations for free advertising platforms
 * 
 * Each adapter makes actual HTTP calls to the platform's API.
 * Channels that don't have APIs get content queued for manual posting.
 */

import { ENV } from "./_core/env";
import { getErrorMessage } from "./_core/errors.js";

// ============================================
// TYPES
// ============================================

export interface ChannelPostResult {
  success: boolean;
  platformPostId?: string;
  url?: string;
  error?: string;
}

// ============================================
// DEV.TO API ADAPTER
// Docs: https://developers.forem.com/api/v1
// Free API, key from https://dev.to/settings/extensions
// ============================================

export const devtoAdapter = {
  get isConfigured() {
    return !!ENV.devtoApiKey;
  },

  /**
   * Publish an article to Dev.to
   * Supports markdown content, tags, canonical URL for cross-posting
   */
  async publishArticle(params: {
    title: string;
    body: string; // Markdown
    tags: string[];
    canonicalUrl?: string;
    series?: string;
    published?: boolean;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Dev.to API key not configured. Add DEVTO_API_KEY in Settings → Secrets." };
    }
    try {
      const response = await fetch("https://dev.to/api/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": ENV.devtoApiKey,
        },
        body: JSON.stringify({
          article: {
            title: params.title,
            body_markdown: params.body,
            tags: params.tags.slice(0, 4), // Dev.to max 4 tags
            published: params.published ?? true,
            ...(params.canonicalUrl && { canonical_url: params.canonicalUrl }),
            ...(params.series && { series: params.series }),
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `Dev.to API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      return {
        success: true,
        platformPostId: String(data.id),
        url: data.url,
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },

  /**
   * Get published articles to check for duplicates
   */
  async getMyArticles(page = 1, perPage = 30): Promise<any[]> {
    if (!this.isConfigured) return [];
    try {
      const response = await fetch(`https://dev.to/api/articles/me?page=${page}&per_page=${perPage}`, {
        headers: { "api-key": ENV.devtoApiKey },
      });
      if (!response.ok) return [];
      return await response.json() as any[];
    } catch {
      return [];
    }
  },
};

// ============================================
// MEDIUM API ADAPTER
// Docs: https://github.com/Medium/medium-api-docs
// Token from https://medium.com/me/settings/security
// ============================================

export const mediumAdapter = {
  get isConfigured() {
    return !!(ENV.mediumAccessToken && ENV.mediumAuthorId);
  },

  /**
   * Publish a post to Medium
   * Supports markdown/html, tags, canonical URL for cross-posting
   */
  async publishPost(params: {
    title: string;
    content: string; // HTML or Markdown
    contentFormat?: "html" | "markdown";
    tags?: string[];
    canonicalUrl?: string;
    publishStatus?: "public" | "draft" | "unlisted";
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Medium API not configured. Add MEDIUM_ACCESS_TOKEN and MEDIUM_AUTHOR_ID in Settings → Secrets." };
    }
    try {
      const response = await fetch(`https://api.medium.com/v1/users/${ENV.mediumAuthorId}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.mediumAccessToken}`,
        },
        body: JSON.stringify({
          title: params.title,
          contentFormat: params.contentFormat || "markdown",
          content: params.content,
          tags: params.tags?.slice(0, 5) || [],
          publishStatus: params.publishStatus || "public",
          ...(params.canonicalUrl && { canonicalUrl: params.canonicalUrl }),
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `Medium API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      return {
        success: true,
        platformPostId: data.data?.id,
        url: data.data?.url,
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },
};

// ============================================
// HASHNODE GRAPHQL API ADAPTER
// Docs: https://apidocs.hashnode.com
// Token from https://hashnode.com/settings/developer
// ============================================

export const hashnodeAdapter = {
  get isConfigured() {
    return !!(ENV.hashnodeApiKey && ENV.hashnodePublicationId);
  },

  /**
   * Publish an article to Hashnode via GraphQL
   */
  async publishArticle(params: {
    title: string;
    content: string; // Markdown
    tags?: { slug: string; name: string }[];
    canonicalUrl?: string;
    subtitle?: string;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Hashnode API not configured. Add HASHNODE_API_KEY and HASHNODE_PUBLICATION_ID in Settings → Secrets." };
    }
    try {
      const slug = params.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 80);

      const mutation = `
        mutation PublishPost($input: PublishPostInput!) {
          publishPost(input: $input) {
            post {
              id
              url
              slug
            }
          }
        }
      `;

      const variables = {
        input: {
          title: params.title,
          contentMarkdown: params.content,
          publicationId: ENV.hashnodePublicationId,
          slug,
          ...(params.subtitle && { subtitle: params.subtitle }),
          ...(params.tags && { tags: params.tags.map(t => ({ slug: t.slug, name: t.name })) }),
          ...(params.canonicalUrl && { originalArticleURL: params.canonicalUrl }),
        },
      };

      const response = await fetch("https://gql.hashnode.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ENV.hashnodeApiKey,
        },
        body: JSON.stringify({ query: mutation, variables }),
      });

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `Hashnode API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      if (data.errors) {
        return { success: false, error: data.errors[0]?.message || "Hashnode GraphQL error" };
      }

      const post = data.data?.publishPost?.post;
      return {
        success: true,
        platformPostId: post?.id,
        url: post?.url,
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },
};

// ============================================
// DISCORD WEBHOOK ADAPTER
// No auth needed — just a webhook URL
// Create webhook: Server Settings → Integrations → Webhooks
// ============================================

export const discordAdapter = {
  get isConfigured() {
    return !!ENV.discordWebhookUrl;
  },

  /**
   * Post a message to a Discord channel via webhook
   * Supports embeds for rich content
   */
  async postMessage(params: {
    content?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string };
      thumbnail?: { url: string };
    }>;
    username?: string;
    avatarUrl?: string;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Discord webhook not configured. Add DISCORD_WEBHOOK_URL in Settings → Secrets." };
    }
    try {
      const response = await fetch(ENV.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: params.content,
          embeds: params.embeds,
          username: params.username || "Archibald Titan",
          avatar_url: params.avatarUrl || "https://archibaldtitan.com/favicon.ico",
        }),
      });

      // Discord webhooks return 204 No Content on success
      if (response.status === 204 || response.ok) {
        return { success: true };
      }

      const errData = await response.text();
      return { success: false, error: `Discord webhook ${response.status}: ${errData}` };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },
};

// ============================================
// MASTODON API ADAPTER
// Docs: https://docs.joinmastodon.org/methods/statuses/
// Targets infosec.exchange or any Mastodon instance
// ============================================

export const mastodonAdapter = {
  get isConfigured() {
    return !!(ENV.mastodonAccessToken && ENV.mastodonInstanceUrl);
  },

  /**
   * Post a status (toot) to Mastodon
   */
  async postStatus(params: {
    status: string; // Max 500 chars on most instances
    visibility?: "public" | "unlisted" | "private" | "direct";
    spoilerText?: string;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Mastodon not configured. Add MASTODON_ACCESS_TOKEN and MASTODON_INSTANCE_URL in Settings → Secrets." };
    }
    try {
      const instanceUrl = ENV.mastodonInstanceUrl.replace(/\/$/, "");
      const response = await fetch(`${instanceUrl}/api/v1/statuses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.mastodonAccessToken}`,
        },
        body: JSON.stringify({
          status: params.status.substring(0, 500),
          visibility: params.visibility || "public",
          ...(params.spoilerText && { spoiler_text: params.spoilerText }),
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `Mastodon API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      return {
        success: true,
        platformPostId: data.id,
        url: data.url,
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },
};

// ============================================
// TELEGRAM BOT API ADAPTER
// Docs: https://core.telegram.org/bots/api
// Create bot via @BotFather, get channel ID
// ============================================

export const telegramAdapter = {
  get isConfigured() {
    return !!(ENV.telegramBotToken && ENV.telegramChannelId);
  },

  /**
   * Send a message to a Telegram channel
   * Supports HTML or Markdown formatting
   */
  async sendMessage(params: {
    text: string;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    disableWebPagePreview?: boolean;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Telegram bot not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in Settings → Secrets." };
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${ENV.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ENV.telegramChannelId,
          text: params.text,
          parse_mode: params.parseMode || "HTML",
          disable_web_page_preview: params.disableWebPagePreview || false,
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `Telegram API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      if (!data.ok) {
        return { success: false, error: data.description || "Telegram API error" };
      }

      return {
        success: true,
        platformPostId: String(data.result?.message_id),
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },

  /**
   * Send a photo with caption to a Telegram channel
   */
  async sendPhoto(params: {
    photoUrl: string;
    caption?: string;
    parseMode?: "HTML" | "Markdown";
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Telegram bot not configured." };
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${ENV.telegramBotToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ENV.telegramChannelId,
          photo: params.photoUrl,
          caption: params.caption,
          parse_mode: params.parseMode || "HTML",
        }),
      });

      const data = await response.json() as any;
      if (!data.ok) {
        return { success: false, error: data.description || "Telegram API error" };
      }
      return { success: true, platformPostId: String(data.result?.message_id) };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },
};

// ============================================
// WHATSAPP BUSINESS CLOUD API ADAPTER
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// Free tier: 1000 business-initiated conversations/month
// ============================================

export const whatsappAdapter = {
  get isConfigured() {
    return !!(ENV.whatsappAccessToken && ENV.whatsappPhoneNumberId);
  },

  /**
   * Send a template message to a WhatsApp number
   * For broadcasting, you need approved message templates
   */
  async sendTemplateMessage(params: {
    to: string; // Phone number with country code, e.g. "14155238886"
    templateName: string;
    languageCode?: string;
    components?: Array<{
      type: "header" | "body" | "button";
      parameters: Array<{ type: "text"; text: string } | { type: "image"; image: { link: string } }>;
    }>;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "WhatsApp Business API not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Settings → Secrets." };
    }
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${ENV.whatsappPhoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ENV.whatsappAccessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: params.to,
            type: "template",
            template: {
              name: params.templateName,
              language: { code: params.languageCode || "en_US" },
              ...(params.components && { components: params.components }),
            },
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `WhatsApp API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      return {
        success: true,
        platformPostId: data.messages?.[0]?.id,
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },

  /**
   * Send a text message to a WhatsApp number (requires user opt-in within 24h window)
   */
  async sendTextMessage(params: {
    to: string;
    text: string;
    previewUrl?: boolean;
  }): Promise<ChannelPostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "WhatsApp Business API not configured." };
    }
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${ENV.whatsappPhoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ENV.whatsappAccessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: params.to,
            type: "text",
            text: {
              body: params.text,
              preview_url: params.previewUrl ?? true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.text();
        return { success: false, error: `WhatsApp API ${response.status}: ${errData}` };
      }

      const data = await response.json() as any;
      return {
        success: true,
        platformPostId: data.messages?.[0]?.id,
      };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) };
    }
  },
};

// ============================================
// CHANNEL STATUS HELPERS
// ============================================

export interface ExpandedChannelStatus {
  id: string;
  name: string;
  connected: boolean;
  type: "api_automated" | "content_queue";
  description: string;
}

/**
 * Get status of all expanded channels
 */
export function getExpandedChannelStatuses(): ExpandedChannelStatus[] {
  return [
    // API-automated channels (real posting)
    {
      id: "devto",
      name: "Dev.to",
      connected: devtoAdapter.isConfigured,
      type: "api_automated",
      description: "Cross-post blog articles to Dev.to developer community (250K+ daily readers)",
    },
    {
      id: "medium",
      name: "Medium",
      connected: mediumAdapter.isConfigured,
      type: "api_automated",
      description: "Republish articles on Medium for broader reach (100M+ monthly readers)",
    },
    {
      id: "hashnode",
      name: "Hashnode",
      connected: hashnodeAdapter.isConfigured,
      type: "api_automated",
      description: "Cross-post to Hashnode developer blogging platform",
    },
    {
      id: "discord",
      name: "Discord",
      connected: discordAdapter.isConfigured,
      type: "api_automated",
      description: "Post updates to Discord community server via webhook",
    },
    {
      id: "mastodon",
      name: "Mastodon (infosec.exchange)",
      connected: mastodonAdapter.isConfigured,
      type: "api_automated",
      description: "Post to Mastodon infosec community (decentralized, privacy-focused audience)",
    },
    {
      id: "telegram",
      name: "Telegram Channel",
      connected: telegramAdapter.isConfigured,
      type: "api_automated",
      description: "Broadcast to Telegram channel subscribers",
    },
    // Content queue channels (generate content, manual posting)
    {
      id: "tiktok_organic",
      name: "TikTok (Video Scripts)",
      connected: true, // Always available — generates scripts
      type: "content_queue",
      description: "Generate TikTok video scripts with hooks, captions, and hashtags for recording",
    },
    {
      id: "youtube_shorts",
      name: "YouTube Shorts (Scripts)",
      connected: true,
      type: "content_queue",
      description: "Generate YouTube Shorts scripts optimized for 60-second dev/security content",
    },
    {
      id: "quora",
      name: "Quora Answers",
      connected: true,
      type: "content_queue",
      description: "Generate expert answers to security/dev questions on Quora",
    },
    {
      id: "skool",
      name: "Skool Community",
      connected: true,
      type: "content_queue",
      description: "Generate lesson content and discussion posts for Skool cybersecurity community",
    },
    {
      id: "indiehackers",
      name: "IndieHackers",
      connected: true,
      type: "content_queue",
      description: "Generate milestone posts and building-in-public updates for IndieHackers",
    },
    {
      id: "lobsters",
      name: "Lobste.rs",
      connected: true,
      type: "content_queue",
      description: "Generate technical article submissions for Lobste.rs (invite-only tech community)",
    },
    {
      id: "hackernews",
      name: "Hacker News",
      connected: true,
      type: "content_queue",
      description: "Generate Show HN posts and technical submissions for Hacker News",
    },
    {
      id: "twitch",
      name: "Twitch (Stream Plans)",
      connected: true,
      type: "content_queue",
      description: "Generate live coding/security demo stream outlines for Twitch",
    },
    {
      id: "slack_communities",
      name: "Slack Communities",
      connected: true,
      type: "content_queue",
      description: "Generate value-first messages for DevOps, Security, and Cloud Slack workspaces",
    },
    {
      id: "xda",
      name: "XDA Developers",
      connected: true,
      type: "content_queue",
      description: "Generate security tool guides for XDA developer forums",
    },
    {
      id: "spiceworks",
      name: "Spiceworks",
      connected: true,
      type: "content_queue",
      description: "Generate IT security discussion posts for Spiceworks IT community",
    },
    {
      id: "bugcrowd",
      name: "BugCrowd/Hacker101",
      connected: true,
      type: "content_queue",
      description: "Generate security research posts for bug bounty communities",
    },
    {
      id: "steam",
      name: "Steam Community",
      connected: true,
      type: "content_queue",
      description: "Generate game account security guides for Steam community forums",
    },
    {
      id: "lemmy",
      name: "Lemmy/Fediverse",
      connected: true,
      type: "content_queue",
      description: "Generate posts for Lemmy privacy and security communities",
    },
    {
      id: "github_discussions",
      name: "GitHub Discussions",
      connected: true,
      type: "content_queue",
      description: "Generate helpful responses for security-related GitHub Discussions",
    },
    {
      id: "pinterest",
      name: "Pinterest (Infographics)",
      connected: true,
      type: "content_queue",
      description: "Generate security infographic descriptions and pin copy for Pinterest",
    },
    {
      id: "whatsapp",
      name: "WhatsApp Business",
      connected: whatsappAdapter.isConfigured,
      type: "api_automated",
      description: "Broadcast security tips and product updates via WhatsApp Business Cloud API (1000 free conversations/month)",
    },
    // Hacker forums & infosec communities
    {
      id: "hackforums",
      name: "HackForums",
      connected: true,
      type: "content_queue",
      description: "Generate tool tutorials, automation scripts, and security research posts for HackForums",
    },
    {
      id: "0x00sec",
      name: "0x00sec",
      connected: true,
      type: "content_queue",
      description: "Generate advanced security research and reverse engineering articles for 0x00sec",
    },
    {
      id: "nullbyte",
      name: "Null Byte (WonderHowTo)",
      connected: true,
      type: "content_queue",
      description: "Generate step-by-step hacking tutorials for Null Byte community",
    },
    {
      id: "hackthebox",
      name: "Hack The Box Community",
      connected: true,
      type: "content_queue",
      description: "Generate CTF writeups and penetration testing methodology posts for HTB forums",
    },
    {
      id: "tryhackme",
      name: "TryHackMe Community",
      connected: true,
      type: "content_queue",
      description: "Generate room walkthroughs and learning path guides for TryHackMe",
    },
    {
      id: "owasp",
      name: "OWASP Community",
      connected: true,
      type: "content_queue",
      description: "Generate OWASP Top 10 analysis and application security guides",
    },
    {
      id: "offensive_security",
      name: "Offensive Security / OSCP",
      connected: true,
      type: "content_queue",
      description: "Generate OSCP prep guides, red team methodology, and pentest tool comparisons",
    },
    {
      id: "ctftime",
      name: "CTFtime",
      connected: true,
      type: "content_queue",
      description: "Generate CTF event writeups and challenge solutions",
    },
    {
      id: "breachforums_alt",
      name: "Breach Notification Communities",
      connected: true,
      type: "content_queue",
      description: "Generate threat intelligence summaries and credential security advisories",
    },
  ];
}

/**
 * Get only the API-automated channels that are connected
 */
export function getConnectedExpandedChannels(): ExpandedChannelStatus[] {
  return getExpandedChannelStatuses().filter(c => c.connected && c.type === "api_automated");
}

/**
 * Get all content queue channels (always available)
 */
export function getContentQueueChannels(): ExpandedChannelStatus[] {
  return getExpandedChannelStatuses().filter(c => c.type === "content_queue");
}

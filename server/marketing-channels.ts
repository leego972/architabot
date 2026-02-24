/**
 * Marketing Channel Adapters — Direct API Integrations
 * Meta (Facebook + Instagram), Google Ads, X (Twitter), LinkedIn, Snapchat,
 * SendGrid (Email), Reddit, TikTok, Pinterest
 * 
 * Each adapter handles:
 * - Authentication & token management
 * - Organic content posting
 * - Paid campaign creation & management
 * - Performance metrics retrieval
 * - Rate limiting & error handling
 */

import { ENV } from "./_core/env";
import { createLogger } from "./_core/logger.js";
const log = createLogger("MarketingChannels");

// ============================================
// TYPES
// ============================================

export type ChannelId = "meta_facebook" | "meta_instagram" | "google_ads" | "x_twitter" | "linkedin" | "snapchat" | "sendgrid" | "reddit" | "tiktok" | "pinterest";

export interface ChannelStatus {
  id: ChannelId;
  name: string;
  connected: boolean;
  capabilities: ("organic_post" | "paid_ads" | "analytics" | "image_post" | "video_post" | "stories")[];
  lastError?: string;
  rateLimitRemaining?: number;
}

export interface PostResult {
  success: boolean;
  platformPostId?: string;
  url?: string;
  error?: string;
}

export interface AdCampaignResult {
  success: boolean;
  platformCampaignId?: string;
  platformAdSetId?: string;
  platformAdId?: string;
  error?: string;
}

export interface PerformanceMetrics {
  impressions: number;
  reach: number;
  clicks: number;
  engagement: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
}

interface ApiCallOptions {
  maxRetries?: number;
  retryDelay?: number;
}

// ============================================
// HELPER: Resilient API caller with retries
// ============================================

async function apiCall(
  url: string,
  options: RequestInit & ApiCallOptions = {}
): Promise<any> {
  const { maxRetries = 3, retryDelay = 1000, ...fetchOptions } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 429) {
        // Rate limited — exponential backoff
        const waitMs = retryDelay * Math.pow(2, attempt);
        log.warn(`[Marketing] Rate limited on ${url}, waiting ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || data?.detail || JSON.stringify(data);
        throw new Error(`HTTP ${response.status}: ${errMsg}`);
      }

      return data;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error("API call failed after retries");
}

// ============================================
// META (FACEBOOK + INSTAGRAM) ADAPTER
// ============================================

export const metaAdapter = {
  get isConfigured(): boolean {
    return !!(ENV.metaAccessToken && (ENV.metaPageId || ENV.metaAdAccountId));
  },

  getStatus(): ChannelStatus[] {
    const statuses: ChannelStatus[] = [];

    if (ENV.metaAccessToken && ENV.metaPageId) {
      statuses.push({
        id: "meta_facebook",
        name: "Facebook",
        connected: true,
        capabilities: ["organic_post", "paid_ads", "analytics", "image_post", "video_post"],
      });
    } else {
      statuses.push({
        id: "meta_facebook",
        name: "Facebook",
        connected: false,
        capabilities: [],
      });
    }

    if (ENV.metaAccessToken && ENV.metaInstagramAccountId) {
      statuses.push({
        id: "meta_instagram",
        name: "Instagram",
        connected: true,
        capabilities: ["organic_post", "analytics", "image_post", "stories"],
      });
    } else {
      statuses.push({
        id: "meta_instagram",
        name: "Instagram",
        connected: false,
        capabilities: [],
      });
    }

    return statuses;
  },

  /** Post text/link to Facebook Page */
  async postToFacebook(params: {
    message: string;
    link?: string;
    imageUrl?: string;
  }): Promise<PostResult> {
    if (!ENV.metaAccessToken || !ENV.metaPageId) {
      return { success: false, error: "Meta Facebook not configured" };
    }

    try {
      let endpoint: string;
      const body: Record<string, string> = {
        access_token: ENV.metaAccessToken,
      };

      if (params.imageUrl) {
        endpoint = `https://graph.facebook.com/v19.0/${ENV.metaPageId}/photos`;
        body.url = params.imageUrl;
        body.caption = params.message;
      } else {
        endpoint = `https://graph.facebook.com/v19.0/${ENV.metaPageId}/feed`;
        body.message = params.message;
        if (params.link) body.link = params.link;
      }

      const data = await apiCall(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
      });

      return {
        success: true,
        platformPostId: data.id || data.post_id,
        url: `https://facebook.com/${data.id}`,
      };
    } catch (err: any) {
      log.error("[Meta FB] Post failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Post image to Instagram via Content Publishing API */
  async postToInstagram(params: {
    imageUrl: string;
    caption: string;
  }): Promise<PostResult> {
    if (!ENV.metaAccessToken || !ENV.metaInstagramAccountId) {
      return { success: false, error: "Meta Instagram not configured" };
    }

    try {
      // Step 1: Create media container
      const container = await apiCall(
        `https://graph.facebook.com/v19.0/${ENV.metaInstagramAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            image_url: params.imageUrl,
            caption: params.caption,
            access_token: ENV.metaAccessToken,
          }).toString(),
        }
      );

      // Step 2: Publish the container
      const publish = await apiCall(
        `https://graph.facebook.com/v19.0/${ENV.metaInstagramAccountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            creation_id: container.id,
            access_token: ENV.metaAccessToken,
          }).toString(),
        }
      );

      return {
        success: true,
        platformPostId: publish.id,
        url: `https://instagram.com/p/${publish.id}`,
      };
    } catch (err: any) {
      log.error("[Meta IG] Post failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Create a Facebook/Instagram ad campaign */
  async createAdCampaign(params: {
    name: string;
    objective: "OUTCOME_AWARENESS" | "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_LEADS" | "OUTCOME_SALES";
    dailyBudget: number; // in cents
    targeting: {
      ageMin?: number;
      ageMax?: number;
      genders?: number[];
      interests?: string[];
      locations?: { countries: string[] };
    };
    adCreative: {
      title: string;
      body: string;
      imageUrl?: string;
      linkUrl: string;
      callToAction: string;
    };
    platforms?: ("facebook" | "instagram")[];
  }): Promise<AdCampaignResult> {
    if (!ENV.metaAccessToken || !ENV.metaAdAccountId) {
      return { success: false, error: "Meta Ads not configured" };
    }

    try {
      const actId = ENV.metaAdAccountId.startsWith("act_")
        ? ENV.metaAdAccountId
        : `act_${ENV.metaAdAccountId}`;

      // Step 1: Create Campaign
      const campaign = await apiCall(
        `https://graph.facebook.com/v19.0/${actId}/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            name: params.name,
            objective: params.objective,
            status: "PAUSED",
            special_ad_categories: "[]",
            access_token: ENV.metaAccessToken,
          }).toString(),
        }
      );

      // Step 2: Create Ad Set with targeting
      const publisherPlatforms = (params.platforms || ["facebook", "instagram"]).join(",");
      const targeting: Record<string, any> = {
        geo_locations: params.targeting.locations || { countries: ["AU", "US", "GB"] },
        age_min: params.targeting.ageMin || 18,
        age_max: params.targeting.ageMax || 65,
        publisher_platforms: publisherPlatforms.split(","),
      };
      if (params.targeting.genders) targeting.genders = params.targeting.genders;
      if (params.targeting.interests) {
        targeting.flexible_spec = [{ interests: params.targeting.interests.map((i) => ({ name: i })) }];
      }

      const adSet = await apiCall(
        `https://graph.facebook.com/v19.0/${actId}/adsets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            name: `${params.name} - Ad Set`,
            campaign_id: campaign.id,
            daily_budget: params.dailyBudget.toString(),
            billing_event: "IMPRESSIONS",
            optimization_goal: "LINK_CLICKS",
            targeting: JSON.stringify(targeting),
            status: "PAUSED",
            access_token: ENV.metaAccessToken,
          }).toString(),
        }
      );

      // Step 3: Create Ad Creative
      const creativeData: Record<string, string> = {
        name: `${params.name} - Creative`,
        object_story_spec: JSON.stringify({
          page_id: ENV.metaPageId,
          link_data: {
            message: params.adCreative.body,
            link: params.adCreative.linkUrl,
            name: params.adCreative.title,
            call_to_action: { type: params.adCreative.callToAction, value: { link: params.adCreative.linkUrl } },
            ...(params.adCreative.imageUrl ? { picture: params.adCreative.imageUrl } : {}),
          },
        }),
        access_token: ENV.metaAccessToken,
      };

      const creative = await apiCall(
        `https://graph.facebook.com/v19.0/${actId}/adcreatives`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(creativeData).toString(),
        }
      );

      // Step 4: Create Ad
      const ad = await apiCall(
        `https://graph.facebook.com/v19.0/${actId}/ads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            name: `${params.name} - Ad`,
            adset_id: adSet.id,
            creative: JSON.stringify({ creative_id: creative.id }),
            status: "PAUSED",
            access_token: ENV.metaAccessToken,
          }).toString(),
        }
      );

      return {
        success: true,
        platformCampaignId: campaign.id,
        platformAdSetId: adSet.id,
        platformAdId: ad.id,
      };
    } catch (err: any) {
      log.error("[Meta Ads] Campaign creation failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Get campaign performance metrics */
  async getMetrics(campaignId: string): Promise<PerformanceMetrics | null> {
    if (!ENV.metaAccessToken) return null;

    try {
      const data = await apiCall(
        `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=impressions,reach,clicks,spend,actions,ctr,cpc,cpm&access_token=${ENV.metaAccessToken}`
      );

      const insight = data.data?.[0];
      if (!insight) return null;

      const conversions = (insight.actions || [])
        .filter((a: any) => a.action_type === "offsite_conversion" || a.action_type === "lead")
        .reduce((sum: number, a: any) => sum + parseInt(a.value || "0"), 0);

      return {
        impressions: parseInt(insight.impressions || "0"),
        reach: parseInt(insight.reach || "0"),
        clicks: parseInt(insight.clicks || "0"),
        engagement: parseInt(insight.clicks || "0"),
        spend: parseFloat(insight.spend || "0"),
        conversions,
        ctr: parseFloat(insight.ctr || "0"),
        cpc: parseFloat(insight.cpc || "0"),
        cpm: parseFloat(insight.cpm || "0"),
      };
    } catch (err: any) {
      log.error("[Meta] Metrics fetch failed:", { error: String(err.message) });
      return null;
    }
  },
};

// ============================================
// GOOGLE ADS ADAPTER
// ============================================

export const googleAdsAdapter = {
  get isConfigured(): boolean {
    return !!(
      ENV.googleAdsDevToken &&
      ENV.googleAdsCustomerId &&
      (ENV.googleAdsClientId || ENV.googleClientId) &&
      (ENV.googleAdsClientSecret || ENV.googleClientSecret) &&
      ENV.googleAdsRefreshToken
    );
  },

  getStatus(): ChannelStatus {
    return {
      id: "google_ads",
      name: "Google Ads",
      connected: this.isConfigured,
      capabilities: this.isConfigured ? ["paid_ads", "analytics"] : [],
    };
  },

  /** Get a fresh OAuth access token using the refresh token */
  async _getAccessToken(): Promise<string> {
    const clientId = ENV.googleAdsClientId || ENV.googleClientId;
    const clientSecret = ENV.googleAdsClientSecret || ENV.googleClientSecret;

    const data = await apiCall("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: ENV.googleAdsRefreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    return data.access_token;
  },

  /** Create a Google Ads search campaign */
  async createSearchCampaign(params: {
    name: string;
    dailyBudget: number; // in micros (1 dollar = 1_000_000)
    keywords: string[];
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
    locationIds?: string[];
  }): Promise<AdCampaignResult> {
    if (!this.isConfigured) {
      return { success: false, error: "Google Ads not configured" };
    }

    try {
      const accessToken = await this._getAccessToken();
      const customerId = ENV.googleAdsCustomerId.replace(/-/g, "");
      const baseUrl = `https://googleads.googleapis.com/v16/customers/${customerId}`;

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": ENV.googleAdsDevToken,
        "Content-Type": "application/json",
      };

      // Step 1: Create campaign budget
      const budgetOp = {
        create: {
          name: `${params.name} Budget`,
          amountMicros: params.dailyBudget.toString(),
          deliveryMethod: "STANDARD",
        },
      };

      const budgetResp = await apiCall(`${baseUrl}/campaignBudgets:mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [budgetOp] }),
      });

      const budgetResourceName = budgetResp.results[0].resourceName;

      // Step 2: Create campaign
      const campaignOp = {
        create: {
          name: params.name,
          advertisingChannelType: "SEARCH",
          status: "PAUSED",
          campaignBudget: budgetResourceName,
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
          },
          startDate: new Date().toISOString().split("T")[0].replace(/-/g, ""),
        },
      };

      const campaignResp = await apiCall(`${baseUrl}/campaigns:mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [campaignOp] }),
      });

      const campaignResourceName = campaignResp.results[0].resourceName;

      // Step 3: Create ad group
      const adGroupOp = {
        create: {
          name: `${params.name} - Ad Group`,
          campaign: campaignResourceName,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
          cpcBidMicros: "1000000", // $1 default bid
        },
      };

      const adGroupResp = await apiCall(`${baseUrl}/adGroups:mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [adGroupOp] }),
      });

      const adGroupResourceName = adGroupResp.results[0].resourceName;

      // Step 4: Add keywords
      const keywordOps = params.keywords.slice(0, 20).map((kw) => ({
        create: {
          adGroup: adGroupResourceName,
          keyword: { text: kw, matchType: "BROAD" },
          status: "ENABLED",
        },
      }));

      if (keywordOps.length > 0) {
        await apiCall(`${baseUrl}/adGroupCriteria:mutate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ operations: keywordOps }),
        });
      }

      // Step 5: Create responsive search ad
      const adOp = {
        create: {
          adGroup: adGroupResourceName,
          ad: {
            responsiveSearchAd: {
              headlines: params.headlines.slice(0, 15).map((h) => ({ text: h })),
              descriptions: params.descriptions.slice(0, 4).map((d) => ({ text: d })),
            },
            finalUrls: [params.finalUrl],
          },
          status: "ENABLED",
        },
      };

      const adResp = await apiCall(`${baseUrl}/adGroupAds:mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [adOp] }),
      });

      return {
        success: true,
        platformCampaignId: campaignResourceName,
        platformAdSetId: adGroupResourceName,
        platformAdId: adResp.results[0].resourceName,
      };
    } catch (err: any) {
      log.error("[Google Ads] Campaign creation failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Get campaign performance metrics */
  async getMetrics(campaignResourceName: string): Promise<PerformanceMetrics | null> {
    if (!this.isConfigured) return null;

    try {
      const accessToken = await this._getAccessToken();
      const customerId = ENV.googleAdsCustomerId.replace(/-/g, "");

      const query = `
        SELECT campaign.id, campaign.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.ctr, metrics.average_cpc,
               metrics.average_cpm, metrics.interactions
        FROM campaign
        WHERE campaign.resource_name = '${campaignResourceName}'
        AND segments.date DURING LAST_30_DAYS`;

      const data = await apiCall(
        `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": ENV.googleAdsDevToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        }
      );

      const row = data[0]?.results?.[0]?.metrics;
      if (!row) return null;

      return {
        impressions: parseInt(row.impressions || "0"),
        reach: parseInt(row.impressions || "0"),
        clicks: parseInt(row.clicks || "0"),
        engagement: parseInt(row.interactions || "0"),
        spend: parseInt(row.costMicros || "0") / 1_000_000,
        conversions: parseFloat(row.conversions || "0"),
        ctr: parseFloat(row.ctr || "0"),
        cpc: parseInt(row.averageCpc || "0") / 1_000_000,
        cpm: parseInt(row.averageCpm || "0") / 1_000_000,
      };
    } catch (err: any) {
      log.error("[Google Ads] Metrics fetch failed:", { error: String(err.message) });
      return null;
    }
  },
};

// ============================================
// X (TWITTER) ADAPTER
// ============================================

export const xAdapter = {
  get isConfigured(): boolean {
    return !!(ENV.xApiKey && ENV.xApiSecret && ENV.xAccessToken && ENV.xAccessTokenSecret);
  },

  getStatus(): ChannelStatus {
    return {
      id: "x_twitter",
      name: "X (Twitter)",
      connected: this.isConfigured,
      capabilities: this.isConfigured
        ? ["organic_post", "analytics", "image_post"]
        : [],
    };
  },

  /** Generate OAuth 1.0a signature for X API */
  _generateOAuthHeader(method: string, url: string, params: Record<string, string> = {}): string {
    const crypto = require("crypto");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString("hex");

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: ENV.xApiKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: ENV.xAccessToken,
      oauth_version: "1.0",
      ...params,
    };

    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
      .join("&");

    const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(ENV.xApiSecret)}&${encodeURIComponent(ENV.xAccessTokenSecret)}`;
    const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");

    const authParams = {
      ...oauthParams,
      oauth_signature: signature,
    };

    // Remove non-oauth params
    Object.keys(params).forEach((k) => delete (authParams as Record<string, any>)[k]);
    (authParams as Record<string, any>).oauth_signature = signature;

    return (
      "OAuth " +
      Object.keys(authParams)
        .sort()
        .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent((authParams as Record<string, any>)[k])}"`)
        .join(", ")
    );
  },

  /** Post a tweet */
  async postTweet(params: { text: string; mediaIds?: string[] }): Promise<PostResult> {
    if (!this.isConfigured) {
      return { success: false, error: "X (Twitter) not configured" };
    }

    try {
      const url = "https://api.x.com/2/tweets";
      const body: Record<string, any> = { text: params.text };
      if (params.mediaIds?.length) {
        body.media = { media_ids: params.mediaIds };
      }

      const authHeader = this._generateOAuthHeader("POST", url);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || data?.title || JSON.stringify(data));
      }

      return {
        success: true,
        platformPostId: data.data?.id,
        url: `https://x.com/i/status/${data.data?.id}`,
      };
    } catch (err: any) {
      log.error("[X] Tweet failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Upload media to X for attaching to tweets */
  async uploadMedia(imageUrl: string): Promise<string | null> {
    if (!this.isConfigured) return null;

    try {
      // Download the image first
      const imgResponse = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
      const base64 = imgBuffer.toString("base64");

      const url = "https://upload.twitter.com/1.1/media/upload.json";
      const authHeader = this._generateOAuthHeader("POST", url);

      const formData = new URLSearchParams();
      formData.append("media_data", base64);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(60000),
      });

      const data = await response.json();
      return data.media_id_string || null;
    } catch (err: any) {
      log.error("[X] Media upload failed:", { error: String(err.message) });
      return null;
    }
  },

  /** Get tweet metrics */
  async getMetrics(tweetId: string): Promise<PerformanceMetrics | null> {
    if (!this.isConfigured) return null;

    try {
      const url = `https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`;
      const authHeader = this._generateOAuthHeader("GET", url);

      const response = await fetch(url, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json();
      const m = data.data?.public_metrics;
      if (!m) return null;

      return {
        impressions: m.impression_count || 0,
        reach: m.impression_count || 0,
        clicks: m.url_link_clicks || 0,
        engagement: (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0),
        spend: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
      };
    } catch (err: any) {
      log.error("[X] Metrics fetch failed:", { error: String(err.message) });
      return null;
    }
  },
};

// ============================================
// LINKEDIN ADAPTER
// ============================================

export const linkedinAdapter = {
  get isConfigured(): boolean {
    return !!(ENV.linkedinAccessToken && (ENV.linkedinOrgId || ENV.linkedinAdAccountId));
  },

  getStatus(): ChannelStatus {
    return {
      id: "linkedin",
      name: "LinkedIn",
      connected: this.isConfigured,
      capabilities: this.isConfigured
        ? ["organic_post", "paid_ads", "analytics", "image_post"]
        : [],
    };
  },

  /** Post to LinkedIn company page */
  async postToPage(params: {
    text: string;
    link?: string;
    imageUrl?: string;
  }): Promise<PostResult> {
    if (!ENV.linkedinAccessToken || !ENV.linkedinOrgId) {
      return { success: false, error: "LinkedIn not configured" };
    }

    try {
      const author = `urn:li:organization:${ENV.linkedinOrgId}`;
      const body: Record<string, any> = {
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: params.text },
            shareMediaCategory: params.link || params.imageUrl ? "ARTICLE" : "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      if (params.link) {
        body.specificContent["com.linkedin.ugc.ShareContent"].media = [
          {
            status: "READY",
            originalUrl: params.link,
            description: { text: params.text.substring(0, 200) },
          },
        ];
      }

      const data = await apiCall("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.linkedinAccessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(body),
      });

      return {
        success: true,
        platformPostId: data.id,
        url: `https://linkedin.com/feed/update/${data.id}`,
      };
    } catch (err: any) {
      log.error("[LinkedIn] Post failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Create a LinkedIn sponsored content campaign */
  async createSponsoredCampaign(params: {
    name: string;
    dailyBudget: number; // in cents
    targetAudiences: {
      locations?: string[];
      industries?: string[];
      jobTitles?: string[];
      companySize?: string[];
    };
    adText: string;
    destinationUrl: string;
  }): Promise<AdCampaignResult> {
    if (!ENV.linkedinAccessToken || !ENV.linkedinAdAccountId) {
      return { success: false, error: "LinkedIn Ads not configured" };
    }

    try {
      const accountUrn = `urn:li:sponsoredAccount:${ENV.linkedinAdAccountId}`;

      // Step 1: Create campaign group
      const campaignGroup = await apiCall(
        "https://api.linkedin.com/v2/adCampaignGroupsV2",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.linkedinAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account: accountUrn,
            name: params.name,
            status: "PAUSED",
          }),
        }
      );

      // Step 2: Create campaign
      const campaign = await apiCall(
        "https://api.linkedin.com/v2/adCampaignsV2",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.linkedinAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account: accountUrn,
            campaignGroup: campaignGroup.id ? `urn:li:sponsoredCampaignGroup:${campaignGroup.id}` : undefined,
            name: `${params.name} - Campaign`,
            type: "SPONSORED_UPDATES",
            costType: "CPM",
            dailyBudget: { amount: (params.dailyBudget / 100).toFixed(2), currencyCode: "USD" },
            status: "PAUSED",
            objectiveType: "WEBSITE_VISIT",
          }),
        }
      );

      return {
        success: true,
        platformCampaignId: campaignGroup.id,
        platformAdSetId: campaign.id,
      };
    } catch (err: any) {
      log.error("[LinkedIn Ads] Campaign creation failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Get campaign metrics */
  async getMetrics(campaignId: string): Promise<PerformanceMetrics | null> {
    if (!ENV.linkedinAccessToken) return null;

    try {
      const data = await apiCall(
        `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&campaigns=urn:li:sponsoredCampaign:${campaignId}&dateRange.start.year=2024&dateRange.start.month=1&dateRange.start.day=1&timeGranularity=ALL`,
        {
          headers: {
            Authorization: `Bearer ${ENV.linkedinAccessToken}`,
          },
        }
      );

      const el = data.elements?.[0];
      if (!el) return null;

      return {
        impressions: el.impressions || 0,
        reach: el.impressions || 0,
        clicks: el.clicks || 0,
        engagement: (el.likes || 0) + (el.comments || 0) + (el.shares || 0),
        spend: parseFloat(el.costInLocalCurrency || "0"),
        conversions: el.externalWebsiteConversions || 0,
        ctr: el.clicks && el.impressions ? el.clicks / el.impressions : 0,
        cpc: el.clicks && el.costInLocalCurrency ? parseFloat(el.costInLocalCurrency) / el.clicks : 0,
        cpm: el.impressions ? (parseFloat(el.costInLocalCurrency || "0") / el.impressions) * 1000 : 0,
      };
    } catch (err: any) {
      log.error("[LinkedIn] Metrics fetch failed:", { error: String(err.message) });
      return null;
    }
  },
};

// ============================================
// SNAPCHAT ADAPTER
// ============================================

export const snapchatAdapter = {
  get isConfigured(): boolean {
    return !!(ENV.snapchatAccessToken && ENV.snapchatAdAccountId);
  },

  getStatus(): ChannelStatus {
    return {
      id: "snapchat",
      name: "Snapchat",
      connected: this.isConfigured,
      capabilities: this.isConfigured ? ["paid_ads", "analytics", "image_post", "video_post"] : [],
    };
  },

  /** Create a Snapchat ad campaign */
  async createCampaign(params: {
    name: string;
    dailyBudget: number; // in micros
    objective: "AWARENESS" | "APP_INSTALLS" | "DRIVING_TRAFFIC" | "ENGAGEMENT" | "VIDEO_VIEWS" | "LEAD_GENERATION";
    startTime: string;
    creative: {
      name: string;
      headline: string;
      brandName: string;
      shareable: boolean;
      topSnapMediaId?: string;
      callToAction?: string;
      webViewUrl?: string;
    };
    targeting?: {
      geos?: { countryCode: string }[];
      demographics?: { ageGroups: string[] };
      interests?: string[];
    };
  }): Promise<AdCampaignResult> {
    if (!ENV.snapchatAccessToken || !ENV.snapchatAdAccountId) {
      return { success: false, error: "Snapchat not configured" };
    }

    try {
      const baseUrl = "https://adsapi.snapchat.com/v1";
      const headers = {
        Authorization: `Bearer ${ENV.snapchatAccessToken}`,
        "Content-Type": "application/json",
      };

      // Step 1: Create campaign
      const campaignResp = await apiCall(
        `${baseUrl}/adaccounts/${ENV.snapchatAdAccountId}/campaigns`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            campaigns: [
              {
                name: params.name,
                ad_account_id: ENV.snapchatAdAccountId,
                status: "PAUSED",
                objective: params.objective,
                daily_budget_micro: params.dailyBudget,
                start_time: params.startTime,
              },
            ],
          }),
        }
      );

      const campaignId = campaignResp.campaigns?.[0]?.campaign?.id;

      // Step 2: Create ad squad (ad set)
      const adSquadResp = await apiCall(
        `${baseUrl}/campaigns/${campaignId}/adsquads`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            adsquads: [
              {
                name: `${params.name} - Squad`,
                campaign_id: campaignId,
                type: "SNAP_ADS",
                placement_v2: { config: "AUTOMATIC" },
                billing_event: "IMPRESSION",
                bid_micro: 1000000,
                daily_budget_micro: params.dailyBudget,
                start_time: params.startTime,
                status: "PAUSED",
                targeting: params.targeting
                  ? {
                      geos: params.targeting.geos,
                      demographics: params.targeting.demographics
                        ? [{ age_groups: params.targeting.demographics.ageGroups }]
                        : undefined,
                    }
                  : undefined,
              },
            ],
          }),
        }
      );

      const adSquadId = adSquadResp.adsquads?.[0]?.adsquad?.id;

      // Step 3: Create creative
      const creativeResp = await apiCall(
        `${baseUrl}/adaccounts/${ENV.snapchatAdAccountId}/creatives`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            creatives: [
              {
                ad_account_id: ENV.snapchatAdAccountId,
                name: params.creative.name,
                type: "WEB_VIEW",
                headline: params.creative.headline,
                brand_name: params.creative.brandName,
                shareable: params.creative.shareable,
                top_snap_media_id: params.creative.topSnapMediaId,
                call_to_action: params.creative.callToAction || "VIEW_MORE",
                web_view_properties: params.creative.webViewUrl
                  ? { url: params.creative.webViewUrl }
                  : undefined,
              },
            ],
          }),
        }
      );

      const creativeId = creativeResp.creatives?.[0]?.creative?.id;

      // Step 4: Create ad
      const adResp = await apiCall(
        `${baseUrl}/adsquads/${adSquadId}/ads`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ads: [
              {
                name: `${params.name} - Ad`,
                ad_squad_id: adSquadId,
                creative_id: creativeId,
                status: "PAUSED",
                type: "SNAP_AD",
              },
            ],
          }),
        }
      );

      return {
        success: true,
        platformCampaignId: campaignId,
        platformAdSetId: adSquadId,
        platformAdId: adResp.ads?.[0]?.ad?.id,
      };
    } catch (err: any) {
      log.error("[Snapchat] Campaign creation failed:", { error: String(err.message) });
      return { success: false, error: err.message };
    }
  },

  /** Get campaign performance metrics */
  async getMetrics(campaignId: string): Promise<PerformanceMetrics | null> {
    if (!ENV.snapchatAccessToken) return null;

    try {
      const data = await apiCall(
        `https://adsapi.snapchat.com/v1/campaigns/${campaignId}/stats?granularity=TOTAL&fields=impressions,swipes,spend,video_views`,
        {
          headers: {
            Authorization: `Bearer ${ENV.snapchatAccessToken}`,
          },
        }
      );

      const stats = data.total_stats?.[0]?.stats;
      if (!stats) return null;

      return {
        impressions: stats.impressions || 0,
        reach: stats.impressions || 0,
        clicks: stats.swipes || 0,
        engagement: stats.swipes || 0,
        spend: (stats.spend || 0) / 1_000_000,
        conversions: 0,
        ctr: stats.impressions ? (stats.swipes || 0) / stats.impressions : 0,
        cpc: stats.swipes ? ((stats.spend || 0) / 1_000_000) / stats.swipes : 0,
        cpm: stats.impressions ? ((stats.spend || 0) / 1_000_000 / stats.impressions) * 1000 : 0,
      };
    } catch (err: any) {
      log.error("[Snapchat] Metrics fetch failed:", { error: String(err.message) });
      return null;
    }
  },
};

// ============================================
// SENDGRID (EMAIL MARKETING) ADAPTER
// ============================================

const sendgridAdapter = {
  get isConfigured() {
    return !!ENV.sendgridApiKey;
  },

  getStatus(): ChannelStatus {
    if (!this.isConfigured) {
      return { id: "sendgrid", name: "SendGrid (Email)", connected: false, capabilities: [] };
    }
    return {
      id: "sendgrid",
      name: "SendGrid (Email)",
      connected: true,
      capabilities: ["organic_post", "analytics"],
    };
  },

  async sendCampaignEmail(params: {
    subject: string;
    htmlContent: string;
    recipients: string[];
    listId?: string;
  }): Promise<PostResult> {
    try {
      // Send to each recipient (for small lists) or use marketing campaigns API
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: params.recipients.map((email) => ({ to: [{ email }] })),
          from: { email: ENV.sendgridFromEmail, name: ENV.sendgridFromName },
          subject: params.subject,
          content: [{ type: "text/html", value: params.htmlContent }],
          tracking_settings: {
            click_tracking: { enable: true },
            open_tracking: { enable: true },
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `SendGrid error: ${response.status} - ${err}` };
      }

      return { success: true, platformPostId: response.headers.get("x-message-id") || undefined };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async createMarketingCampaign(params: {
    title: string;
    subject: string;
    htmlContent: string;
    listIds: string[];
    sendAt?: string;
  }): Promise<AdCampaignResult> {
    try {
      // Create single send
      const response = await fetch("https://api.sendgrid.com/v3/marketing/singlesends", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: params.title,
          send_to: { list_ids: params.listIds },
          email_config: {
            subject: params.subject,
            html_content: params.htmlContent,
            sender_id: 1,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `SendGrid campaign error: ${err}` };
      }

      const data = await response.json() as any;

      // Schedule or send immediately
      if (params.sendAt) {
        await fetch(`https://api.sendgrid.com/v3/marketing/singlesends/${data.id}/schedule`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${ENV.sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ send_at: params.sendAt }),
        });
      }

      return { success: true, platformCampaignId: data.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getStats(startDate: string, endDate: string): Promise<PerformanceMetrics> {
    try {
      const response = await fetch(
        `https://api.sendgrid.com/v3/stats?start_date=${startDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${ENV.sendgridApiKey}` } }
      );
      const data = await response.json() as any[];
      let totalDelivered = 0, totalOpens = 0, totalClicks = 0;
      for (const day of data) {
        for (const stat of day.stats || []) {
          totalDelivered += stat.metrics?.delivered || 0;
          totalOpens += stat.metrics?.unique_opens || 0;
          totalClicks += stat.metrics?.unique_clicks || 0;
        }
      }
      return {
        impressions: totalDelivered,
        reach: totalDelivered,
        clicks: totalClicks,
        engagement: totalOpens,
        spend: 0,
        conversions: totalClicks,
        ctr: totalDelivered > 0 ? totalClicks / totalDelivered : 0,
        cpc: 0,
        cpm: 0,
      };
    } catch {
      return { impressions: 0, reach: 0, clicks: 0, engagement: 0, spend: 0, conversions: 0, ctr: 0, cpc: 0, cpm: 0 };
    }
  },
};

// ============================================
// REDDIT ADAPTER
// ============================================

const redditAdapter = {
  get isConfigured() {
    return !!(ENV.redditClientId && ENV.redditClientSecret && ENV.redditRefreshToken);
  },

  _accessToken: "" as string,
  _tokenExpiry: 0 as number,

  async getAccessToken(): Promise<string> {
    if (this._accessToken && Date.now() < this._tokenExpiry) return this._accessToken;

    const auth = Buffer.from(`${ENV.redditClientId}:${ENV.redditClientSecret}`).toString("base64");
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ArchibaldTitan/1.0",
      },
      body: `grant_type=refresh_token&refresh_token=${ENV.redditRefreshToken}`,
    });

    const data = await response.json() as any;
    this._accessToken = data.access_token;
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this._accessToken;
  },

  getStatus(): ChannelStatus {
    if (!this.isConfigured) {
      return { id: "reddit", name: "Reddit", connected: false, capabilities: [] };
    }
    return {
      id: "reddit",
      name: "Reddit",
      connected: true,
      capabilities: ["organic_post", "analytics"],
    };
  },

  async submitPost(params: {
    subreddit: string;
    title: string;
    text?: string;
    url?: string;
  }): Promise<PostResult> {
    try {
      const token = await this.getAccessToken();
      const body = new URLSearchParams({
        sr: params.subreddit,
        title: params.title,
        kind: params.url ? "link" : "self",
        ...(params.text && { text: params.text }),
        ...(params.url && { url: params.url }),
        resubmit: "true",
      });

      const response = await fetch("https://oauth.reddit.com/api/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "ArchibaldTitan/1.0",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const data = await response.json() as any;
      if (data.json?.errors?.length > 0) {
        return { success: false, error: data.json.errors.map((e: any) => e[1]).join(", ") };
      }

      const postUrl = data.json?.data?.url;
      return { success: true, platformPostId: data.json?.data?.id, url: postUrl };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getSubredditStats(subreddit: string): Promise<{ subscribers: number; activeUsers: number }> {
    try {
      const token = await this.getAccessToken();
      const response = await fetch(`https://oauth.reddit.com/r/${subreddit}/about`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "ArchibaldTitan/1.0" },
      });
      const data = await response.json() as any;
      return {
        subscribers: data.data?.subscribers || 0,
        activeUsers: data.data?.accounts_active || 0,
      };
    } catch {
      return { subscribers: 0, activeUsers: 0 };
    }
  },
};

// ============================================
// TIKTOK MARKETING API ADAPTER
// ============================================

const tiktokAdapter = {
  get isConfigured() {
    return !!(ENV.tiktokAccessToken && ENV.tiktokAdvertiserId);
  },

  getStatus(): ChannelStatus {
    if (!this.isConfigured) {
      return { id: "tiktok", name: "TikTok", connected: false, capabilities: [] };
    }
    return {
      id: "tiktok",
      name: "TikTok",
      connected: true,
      capabilities: ["paid_ads", "video_post", "analytics"],
    };
  },

  async createCampaign(params: {
    name: string;
    objective: string;
    budget: number;
    budgetMode: "BUDGET_MODE_DAY" | "BUDGET_MODE_TOTAL";
  }): Promise<AdCampaignResult> {
    try {
      const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/create/", {
        method: "POST",
        headers: {
          "Access-Token": ENV.tiktokAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: ENV.tiktokAdvertiserId,
          campaign_name: params.name,
          objective_type: params.objective,
          budget: params.budget,
          budget_mode: params.budgetMode,
        }),
      });

      const data = await response.json() as any;
      if (data.code !== 0) {
        return { success: false, error: `TikTok error: ${data.message}` };
      }

      return { success: true, platformCampaignId: data.data?.campaign_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async createAdGroup(params: {
    campaignId: string;
    name: string;
    budget: number;
    placements: string[];
    targeting: { ageGroups?: string[]; genders?: string[]; interests?: string[]; locations?: string[] };
    scheduleStartTime: string;
    scheduleEndTime?: string;
  }): Promise<{ success: boolean; adGroupId?: string; error?: string }> {
    try {
      const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/adgroup/create/", {
        method: "POST",
        headers: {
          "Access-Token": ENV.tiktokAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: ENV.tiktokAdvertiserId,
          campaign_id: params.campaignId,
          adgroup_name: params.name,
          budget: params.budget,
          placement_type: "PLACEMENT_TYPE_NORMAL",
          placements: params.placements,
          schedule_start_time: params.scheduleStartTime,
          ...(params.scheduleEndTime && { schedule_end_time: params.scheduleEndTime }),
          age_groups: params.targeting.ageGroups,
          gender: params.targeting.genders?.[0],
          interest_category_ids: params.targeting.interests,
          location_ids: params.targeting.locations,
        }),
      });

      const data = await response.json() as any;
      if (data.code !== 0) {
        return { success: false, error: `TikTok error: ${data.message}` };
      }
      return { success: true, adGroupId: data.data?.adgroup_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async uploadVideo(params: { videoUrl: string; fileName: string }): Promise<{ success: boolean; videoId?: string; error?: string }> {
    try {
      const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/", {
        method: "POST",
        headers: {
          "Access-Token": ENV.tiktokAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: ENV.tiktokAdvertiserId,
          upload_type: "UPLOAD_BY_URL",
          video_url: params.videoUrl,
          file_name: params.fileName,
        }),
      });

      const data = await response.json() as any;
      if (data.code !== 0) return { success: false, error: data.message };
      return { success: true, videoId: data.data?.video_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getReportData(params: {
    startDate: string;
    endDate: string;
    campaignIds?: string[];
  }): Promise<PerformanceMetrics> {
    try {
      const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
        method: "POST",
        headers: {
          "Access-Token": ENV.tiktokAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: ENV.tiktokAdvertiserId,
          report_type: "BASIC",
          data_level: "AUCTION_CAMPAIGN",
          dimensions: ["campaign_id"],
          metrics: ["spend", "impressions", "clicks", "conversion", "ctr", "cpc", "reach"],
          start_date: params.startDate,
          end_date: params.endDate,
          ...(params.campaignIds && { filtering: { campaign_ids: params.campaignIds } }),
        }),
      });

      const data = await response.json() as any;
      const rows = data.data?.list || [];
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalReach = 0;
      for (const row of rows) {
        const m = row.metrics || {};
        totalSpend += parseFloat(m.spend || "0");
        totalImpressions += parseInt(m.impressions || "0");
        totalClicks += parseInt(m.clicks || "0");
        totalConversions += parseInt(m.conversion || "0");
        totalReach += parseInt(m.reach || "0");
      }
      return {
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        engagement: totalClicks,
        spend: totalSpend * 100,
        conversions: totalConversions,
        ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
        cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      };
    } catch {
      return { impressions: 0, reach: 0, clicks: 0, engagement: 0, spend: 0, conversions: 0, ctr: 0, cpc: 0, cpm: 0 };
    }
  },
};

// ============================================
// PINTEREST API ADAPTER
// ============================================

const pinterestAdapter = {
  get isConfigured() {
    return !!ENV.pinterestAccessToken;
  },

  getStatus(): ChannelStatus {
    if (!this.isConfigured) {
      return { id: "pinterest", name: "Pinterest", connected: false, capabilities: [] };
    }
    return {
      id: "pinterest",
      name: "Pinterest",
      connected: true,
      capabilities: ["organic_post", "paid_ads", "image_post", "analytics"],
    };
  },

  async createPin(params: {
    title: string;
    description: string;
    link: string;
    imageUrl: string;
    boardId?: string;
  }): Promise<PostResult> {
    try {
      const response = await fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.pinterestAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: params.title,
          description: params.description,
          link: params.link,
          board_id: params.boardId || ENV.pinterestBoardId,
          media_source: {
            source_type: "image_url",
            url: params.imageUrl,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `Pinterest error: ${response.status} - ${err}` };
      }

      const data = await response.json() as any;
      return {
        success: true,
        platformPostId: data.id,
        url: `https://pinterest.com/pin/${data.id}`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async createAdCampaign(params: {
    name: string;
    dailyBudget: number;
    objective: string;
    startTime: number;
    endTime?: number;
  }): Promise<AdCampaignResult> {
    try {
      const response = await fetch(
        `https://api.pinterest.com/v5/ad_accounts/${ENV.pinterestAdAccountId}/campaigns`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.pinterestAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{
            name: params.name,
            status: "ACTIVE",
            lifetime_spend_cap: null,
            daily_spend_cap: params.dailyBudget,
            objective_type: params.objective,
            start_time: params.startTime,
            ...(params.endTime && { end_time: params.endTime }),
          }]),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `Pinterest campaign error: ${err}` };
      }

      const data = await response.json() as any;
      const campaign = data.items?.[0]?.data;
      return { success: true, platformCampaignId: campaign?.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getAnalytics(params: {
    startDate: string;
    endDate: string;
  }): Promise<PerformanceMetrics> {
    try {
      const response = await fetch(
        `https://api.pinterest.com/v5/ad_accounts/${ENV.pinterestAdAccountId}/analytics?start_date=${params.startDate}&end_date=${params.endDate}&granularity=TOTAL&columns=SPEND_IN_MICRO_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,TOTAL_CONVERSIONS`,
        { headers: { Authorization: `Bearer ${ENV.pinterestAccessToken}` } }
      );

      const data = await response.json() as any[];
      const row = data?.[0] || {};
      const spend = (row.SPEND_IN_MICRO_DOLLAR || 0) / 1_000_000;
      const impressions = row.IMPRESSION_1 || 0;
      const clicks = row.CLICKTHROUGH_1 || 0;
      const conversions = row.TOTAL_CONVERSIONS || 0;

      return {
        impressions,
        reach: impressions,
        clicks,
        engagement: clicks,
        spend: spend * 100,
        conversions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      };
    } catch {
      return { impressions: 0, reach: 0, clicks: 0, engagement: 0, spend: 0, conversions: 0, ctr: 0, cpc: 0, cpm: 0 };
    }
  },
};

// ============================================
// AGGREGATE HELPERS
// ============================================

export function getAllChannelStatuses(): ChannelStatus[] {
  return [
    ...metaAdapter.getStatus(),
    googleAdsAdapter.getStatus(),
    xAdapter.getStatus(),
    linkedinAdapter.getStatus(),
    snapchatAdapter.getStatus(),
    sendgridAdapter.getStatus(),
    redditAdapter.getStatus(),
    tiktokAdapter.getStatus(),
    pinterestAdapter.getStatus(),
  ];
}

export function getConnectedChannels(): ChannelStatus[] {
  return getAllChannelStatuses().filter((c) => c.connected);
}

export function getDisconnectedChannels(): ChannelStatus[] {
  return getAllChannelStatuses().filter((c) => !c.connected);
}

/** Post organic content to all connected organic channels */
export async function postToAllChannels(params: {
  message: string;
  link?: string;
  imageUrl?: string;
}): Promise<Record<ChannelId, PostResult>> {
  const results: Record<string, PostResult> = {};

  // Facebook
  if (metaAdapter.isConfigured && ENV.metaPageId) {
    results.meta_facebook = await metaAdapter.postToFacebook(params);
  }

  // Instagram (requires image)
  if (metaAdapter.isConfigured && ENV.metaInstagramAccountId && params.imageUrl) {
    results.meta_instagram = await metaAdapter.postToInstagram({
      imageUrl: params.imageUrl,
      caption: params.message,
    });
  }

  // X (Twitter)
  if (xAdapter.isConfigured) {
    let mediaIds: string[] | undefined;
    if (params.imageUrl) {
      const mediaId = await xAdapter.uploadMedia(params.imageUrl);
      if (mediaId) mediaIds = [mediaId];
    }
    results.x_twitter = await xAdapter.postTweet({
      text: params.message.substring(0, 280),
      mediaIds,
    });
  }

  // LinkedIn
  if (linkedinAdapter.isConfigured && ENV.linkedinOrgId) {
    results.linkedin = await linkedinAdapter.postToPage({
      text: params.message,
      link: params.link,
      imageUrl: params.imageUrl,
    });
  }

  // Reddit (posts to configured subreddit)
  if (redditAdapter.isConfigured) {
    results.reddit = await redditAdapter.submitPost({
      subreddit: "ArchibaldTitan",
      title: params.message.substring(0, 300),
      url: params.link,
    });
  }

  // Pinterest (requires image)
  if (pinterestAdapter.isConfigured && params.imageUrl) {
    results.pinterest = await pinterestAdapter.createPin({
      title: params.message.substring(0, 100),
      description: params.message,
      link: params.link || "https://archibaldtitan.com",
      imageUrl: params.imageUrl,
    });
  }

  return results as Record<ChannelId, PostResult>;
}

// ============================================
// EXPORTED ADAPTER INSTANCES
// ============================================

export {
  sendgridAdapter,
  redditAdapter,
  tiktokAdapter,
  pinterestAdapter,
};

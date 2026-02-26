// ─── Fetcher Shared Types & Provider Config ─────────────────────────

export interface Provider {
  id: string;
  name: string;
  category: string;
  url: string;
  loginUrl: string;
  keysUrl: string;
  keyTypes: string[];
  description: string;
  /** Whether this provider requires a residential proxy to bypass bot detection */
  requiresResidentialProxy: boolean;
  /** Human-readable reason for proxy requirement */
  proxyNote: string;
}

export const PROVIDERS: Record<string, Provider> = {
  openai: {
    id: "openai", name: "OpenAI", category: "ai",
    url: "https://platform.openai.com",
    loginUrl: "https://platform.openai.com/login",
    keysUrl: "https://platform.openai.com/api-keys",
    keyTypes: ["api_key"],
    description: "GPT, DALL-E, Whisper API keys",
    requiresResidentialProxy: false,
    proxyNote: "Residential proxy recommended for reliability but not required",
  },
  anthropic: {
    id: "anthropic", name: "Anthropic", category: "ai",
    url: "https://www.anthropic.com",
    loginUrl: "https://console.anthropic.com/login",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keyTypes: ["api_key"],
    description: "Claude API keys",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy from most IPs",
  },
  huggingface: {
    id: "huggingface", name: "Hugging Face", category: "ai",
    url: "https://huggingface.co",
    loginUrl: "https://huggingface.co/login",
    keysUrl: "https://huggingface.co/settings/tokens",
    keyTypes: ["access_token"],
    description: "Model inference & Hub API tokens",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  github: {
    id: "github", name: "GitHub", category: "devtools",
    url: "https://github.com",
    loginUrl: "https://github.com/login",
    keysUrl: "https://github.com/settings/tokens",
    keyTypes: ["personal_access_token"],
    description: "Personal access tokens",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  aws: {
    id: "aws", name: "AWS", category: "cloud",
    url: "https://aws.amazon.com",
    loginUrl: "https://signin.aws.amazon.com/signin",
    keysUrl: "https://console.aws.amazon.com/iam/home#/security_credentials",
    keyTypes: ["access_key_id", "secret_access_key"],
    description: "Programmatic access keys",
    requiresResidentialProxy: false,
    proxyNote: "Residential proxy improves reliability but not strictly required",
  },
  google_cloud: {
    id: "google_cloud", name: "Google Cloud", category: "cloud",
    url: "https://cloud.google.com",
    loginUrl: "https://accounts.google.com/signin",
    keysUrl: "https://console.cloud.google.com/apis/credentials",
    keyTypes: ["api_key", "oauth_client_id", "oauth_client_secret"],
    description: "API keys & OAuth credentials",
    requiresResidentialProxy: true,
    proxyNote: "Google blocks datacenter IPs — residential proxy required",
  },
  firebase: {
    id: "firebase", name: "Firebase", category: "cloud",
    url: "https://firebase.google.com",
    loginUrl: "https://accounts.google.com/signin",
    keysUrl: "https://console.firebase.google.com/project/_/settings/general",
    keyTypes: ["api_key", "project_id", "app_id"],
    description: "Firebase config keys",
    requiresResidentialProxy: true,
    proxyNote: "Uses Google auth — residential proxy required",
  },
  stripe: {
    id: "stripe", name: "Stripe", category: "payments",
    url: "https://stripe.com",
    loginUrl: "https://dashboard.stripe.com/login",
    keysUrl: "https://dashboard.stripe.com/apikeys",
    keyTypes: ["publishable_key", "secret_key"],
    description: "Payment processing API keys",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy from most IPs",
  },
  twilio: {
    id: "twilio", name: "Twilio", category: "communications",
    url: "https://www.twilio.com",
    loginUrl: "https://www.twilio.com/login",
    keysUrl: "https://console.twilio.com",
    keyTypes: ["account_sid", "auth_token"],
    description: "SMS, voice & communications API",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  sendgrid: {
    id: "sendgrid", name: "SendGrid", category: "communications",
    url: "https://sendgrid.com",
    loginUrl: "https://app.sendgrid.com/login",
    keysUrl: "https://app.sendgrid.com/settings/api_keys",
    keyTypes: ["api_key"],
    description: "Email delivery API keys",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  mailgun: {
    id: "mailgun", name: "Mailgun", category: "communications",
    url: "https://www.mailgun.com",
    loginUrl: "https://login.mailgun.com/login/",
    keysUrl: "https://app.mailgun.com/settings/api_security",
    keyTypes: ["api_key"],
    description: "Email services API keys",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  heroku: {
    id: "heroku", name: "Heroku", category: "hosting",
    url: "https://heroku.com",
    loginUrl: "https://id.heroku.com/login",
    keysUrl: "https://dashboard.heroku.com/account",
    keyTypes: ["api_key"],
    description: "Platform management API key",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  digitalocean: {
    id: "digitalocean", name: "DigitalOcean", category: "hosting",
    url: "https://www.digitalocean.com",
    loginUrl: "https://cloud.digitalocean.com/login",
    keysUrl: "https://cloud.digitalocean.com/account/api/tokens",
    keyTypes: ["personal_access_token"],
    description: "Cloud infrastructure API tokens",
    requiresResidentialProxy: false,
    proxyNote: "Works without proxy",
  },
  cloudflare: {
    id: "cloudflare", name: "Cloudflare", category: "hosting",
    url: "https://www.cloudflare.com",
    loginUrl: "https://dash.cloudflare.com/login",
    keysUrl: "https://dash.cloudflare.com/profile/api-tokens",
    keyTypes: ["api_token", "global_api_key"],
    description: "CDN & security API tokens",
    requiresResidentialProxy: true,
    proxyNote: "Cloudflare has strong bot detection — residential proxy required",
  },
  godaddy: {
    id: "godaddy", name: "GoDaddy", category: "domains",
    url: "https://www.godaddy.com",
    loginUrl: "https://sso.godaddy.com",
    keysUrl: "https://developer.godaddy.com/keys",
    keyTypes: ["api_key", "api_secret"],
    description: "Domain management & DNS API keys",
    requiresResidentialProxy: true,
    proxyNote: "GoDaddy uses Akamai Bot Manager — residential proxy required",
  },
  meta: {
    id: "meta", name: "Meta (Facebook/Instagram)", category: "social_media",
    url: "https://developers.facebook.com",
    loginUrl: "https://www.facebook.com/login",
    keysUrl: "https://developers.facebook.com/apps",
    keyTypes: ["app_id", "app_secret", "access_token", "page_access_token"],
    description: "Facebook & Instagram Graph API, Marketing API, Page tokens",
    requiresResidentialProxy: true,
    proxyNote: "Meta aggressively blocks datacenter IPs — residential proxy required",
  },
  tiktok: {
    id: "tiktok", name: "TikTok", category: "social_media",
    url: "https://ads.tiktok.com",
    loginUrl: "https://ads.tiktok.com/marketing_api/auth",
    keysUrl: "https://ads.tiktok.com/marketing_api/apps",
    keyTypes: ["app_id", "app_secret", "access_token", "advertiser_id"],
    description: "TikTok Marketing API, Ads Manager, content posting",
    requiresResidentialProxy: true,
    proxyNote: "TikTok blocks datacenter IPs — residential proxy required",
  },
  google_ads: {
    id: "google_ads", name: "Google Ads", category: "advertising",
    url: "https://ads.google.com",
    loginUrl: "https://accounts.google.com/signin",
    keysUrl: "https://console.cloud.google.com/apis/credentials",
    keyTypes: ["developer_token", "client_id", "client_secret", "refresh_token", "customer_id"],
    description: "Google Ads API, campaign management, reporting",
    requiresResidentialProxy: true,
    proxyNote: "Google blocks datacenter IPs — residential proxy required",
  },
  snapchat: {
    id: "snapchat", name: "Snapchat", category: "social_media",
    url: "https://business.snapchat.com",
    loginUrl: "https://accounts.snapchat.com/accounts/v2/login",
    keysUrl: "https://business.snapchat.com/manage",
    keyTypes: ["client_id", "client_secret", "refresh_token", "ad_account_id"],
    description: "Snap Marketing API, Ads Manager, audience targeting",
    requiresResidentialProxy: true,
    proxyNote: "Snapchat blocks datacenter IPs — residential proxy required",
  },
  discord: {
    id: "discord", name: "Discord", category: "social_media",
    url: "https://discord.com",
    loginUrl: "https://discord.com/login",
    keysUrl: "https://discord.com/developers/applications",
    keyTypes: ["bot_token", "client_id", "client_secret", "application_id"],
    description: "Discord Bot tokens, OAuth2 credentials, webhook URLs",
    requiresResidentialProxy: true,
    proxyNote: "Discord blocks datacenter IPs aggressively — residential proxy required",
  },
  roblox: {
    id: "roblox", name: "Roblox", category: "gaming",
    url: "https://www.roblox.com",
    loginUrl: "https://www.roblox.com/login",
    keysUrl: "https://create.roblox.com/credentials",
    keyTypes: ["api_key", "cloud_api_key", "universe_id"],
    description: "Roblox Open Cloud API keys, Universe IDs, OAuth tokens",
    requiresResidentialProxy: true,
    proxyNote: "Roblox has strong bot detection — residential proxy required",
  },
};

export const CATEGORIES: Record<string, string> = {
  ai: "AI & ML",
  cloud: "Cloud Platforms",
  payments: "Payments",
  communications: "Communications",
  devtools: "Developer Tools",
  hosting: "Hosting & CDN",
  domains: "Domain & DNS",
  social_media: "Social Media",
  advertising: "Advertising",
  gaming: "Gaming",
  custom: "Custom",
};

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TaskStatus = "queued" | "running" | "retrying" | "logging_in" | "navigating" | "extracting" | "captcha_wait" | "completed" | "failed";

export function generateRandomHexColor(): string {
  return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

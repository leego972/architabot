export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerEmails: (process.env.OWNER_EMAILS ?? "ptyltd555@gmail.com,leego972@gmail.com,mark.goldbourt@gmail.com,archibaldtitan@gmail.com").split(",").map(e => e.trim().toLowerCase()),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  publicUrl: process.env.PUBLIC_URL ?? "",
  // Marketing Engine - Direct Platform APIs
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  metaAccessToken: process.env.META_ACCESS_TOKEN ?? "",
  metaAdAccountId: process.env.META_AD_ACCOUNT_ID ?? "",
  metaPageId: process.env.META_PAGE_ID ?? "",
  metaInstagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID ?? "",
  googleAdsDevToken: process.env.GOOGLE_ADS_DEV_TOKEN ?? "",
  googleAdsCustomerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? "",
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsRefreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
  xApiKey: process.env.X_API_KEY ?? "",
  xApiSecret: process.env.X_API_KEY_SECRET ?? "",
  xAccessToken: process.env.X_ACCESS_TOKEN ?? "",
  xAccessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET ?? "",
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID ?? "",
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
  linkedinAccessToken: process.env.LINKEDIN_ACCESS_TOKEN ?? "",
  linkedinAdAccountId: process.env.LINKEDIN_AD_ACCOUNT_ID ?? "",
  linkedinOrgId: process.env.LINKEDIN_ORG_ID ?? "",
  snapchatClientId: process.env.SNAPCHAT_CLIENT_ID ?? "",
  snapchatClientSecret: process.env.SNAPCHAT_CLIENT_SECRET ?? "",
  snapchatAccessToken: process.env.SNAPCHAT_ACCESS_TOKEN ?? "",
  snapchatAdAccountId: process.env.SNAPCHAT_AD_ACCOUNT_ID ?? "",
  // SendGrid / Email Marketing
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? "marketing@archibaldtitan.com",
  sendgridFromName: process.env.SENDGRID_FROM_NAME ?? "Archibald Titan",
  // Reddit
  redditClientId: process.env.REDDIT_CLIENT_ID ?? "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET ?? "",
  redditRefreshToken: process.env.REDDIT_REFRESH_TOKEN ?? "",
  redditUsername: process.env.REDDIT_USERNAME ?? "",
  // TikTok Marketing API
  tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN ?? "",
  tiktokAdvertiserId: process.env.TIKTOK_ADVERTISER_ID ?? "",
  tiktokAppId: process.env.TIKTOK_APP_ID ?? "",
  tiktokAppSecret: process.env.TIKTOK_APP_SECRET ?? "",
  // TikTok Content Posting API (organic)
  tiktokOpenId: process.env.TIKTOK_OPEN_ID ?? "",
  tiktokCreatorToken: process.env.TIKTOK_CREATOR_TOKEN ?? "",
  // Pinterest
  pinterestAccessToken: process.env.PINTEREST_ACCESS_TOKEN ?? "",
  pinterestAdAccountId: process.env.PINTEREST_AD_ACCOUNT_ID ?? "",
  pinterestBoardId: process.env.PINTEREST_BOARD_ID ?? "",
  // Dev.to
  devtoApiKey: process.env.DEVTO_API_KEY ?? "",
  // Medium
  mediumAccessToken: process.env.MEDIUM_ACCESS_TOKEN ?? "",
  mediumAuthorId: process.env.MEDIUM_AUTHOR_ID ?? "",
  // Discord
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
  discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
  // YouTube
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID ?? "",
  // Skool
  skoolCommunityUrl: process.env.SKOOL_COMMUNITY_URL ?? "",
  skoolApiKey: process.env.SKOOL_API_KEY ?? "",
  // Hashnode
  hashnodeApiKey: process.env.HASHNODE_API_KEY ?? "",
  hashnodePublicationId: process.env.HASHNODE_PUBLICATION_ID ?? "",
  // IndieHackers
  indieHackersUsername: process.env.INDIEHACKERS_USERNAME ?? "",
  // Mastodon
  mastodonAccessToken: process.env.MASTODON_ACCESS_TOKEN ?? "",
  mastodonInstanceUrl: process.env.MASTODON_INSTANCE_URL ?? "https://infosec.exchange",
  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID ?? "",
  // WhatsApp Business Cloud API
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "",
  // Pollinations.ai - Free AI Video Generation
  pollinationsApiKey: process.env.POLLINATIONS_API_KEY ?? "sk_KZ0EBVOHXycDd8YnvEZAvLDGnvhK33SP",
};

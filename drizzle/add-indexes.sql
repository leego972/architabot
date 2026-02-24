-- ─── Performance Indexes ─────────────────────────────────────────────
-- Add indexes on frequently queried foreign key columns.
-- These are idempotent (IF NOT EXISTS) so safe to run multiple times.

-- Core user-scoped tables (every query filters by userId)
CREATE INDEX IF NOT EXISTS idx_fetcher_jobs_userId ON fetcher_jobs(userId);
CREATE INDEX IF NOT EXISTS idx_fetcher_tasks_userId ON fetcher_tasks(userId);
CREATE INDEX IF NOT EXISTS idx_fetcher_credentials_userId ON fetcher_credentials(userId);
CREATE INDEX IF NOT EXISTS idx_subscriptions_userId ON subscriptions(userId);
CREATE INDEX IF NOT EXISTS idx_download_tokens_userId ON download_tokens(userId);
CREATE INDEX IF NOT EXISTS idx_download_audit_log_userId ON download_audit_log(userId);
CREATE INDEX IF NOT EXISTS idx_api_keys_userId ON api_keys(userId);
CREATE INDEX IF NOT EXISTS idx_team_members_userId ON team_members(userId);
CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs(userId);
CREATE INDEX IF NOT EXISTS idx_credential_watches_userId ON credential_watches(userId);
CREATE INDEX IF NOT EXISTS idx_credential_history_userId ON credential_history(userId);
CREATE INDEX IF NOT EXISTS idx_bulk_sync_jobs_userId ON bulk_sync_jobs(userId);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_userId ON sync_schedules(userId);
CREATE INDEX IF NOT EXISTS idx_provider_health_snapshots_userId ON provider_health_snapshots(userId);
CREATE INDEX IF NOT EXISTS idx_fetch_recommendations_userId ON fetch_recommendations(userId);
CREATE INDEX IF NOT EXISTS idx_leak_scans_userId ON leak_scans(userId);
CREATE INDEX IF NOT EXISTS idx_vault_items_userId ON vault_items(userId);
CREATE INDEX IF NOT EXISTS idx_vault_access_log_userId ON vault_access_log(userId);

-- Marketplace (high-traffic browse/search queries)
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_sellerId ON marketplace_listings(sellerId);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON marketplace_listings(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_buyerId ON marketplace_purchases(buyerId);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_listingId ON marketplace_purchases(listingId);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listingId ON marketplace_reviews(listingId);

-- Chat/Conversations (queried on every message send)
CREATE INDEX IF NOT EXISTS idx_conversations_userId ON conversations(userId);
CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON messages(conversationId);

-- Blog (public-facing, SEO-critical)
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);

-- Timestamp-based queries (for sorting, pagination)
CREATE INDEX IF NOT EXISTS idx_fetcher_jobs_createdAt ON fetcher_jobs(createdAt);
CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs(createdAt);
CREATE INDEX IF NOT EXISTS idx_leak_scans_createdAt ON leak_scans(createdAt);

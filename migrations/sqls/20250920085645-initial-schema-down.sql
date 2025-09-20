-- Drop tables in reverse order of creation (due to foreign key constraints)
DROP TABLE IF EXISTS article_affiliate_links;
DROP TABLE IF EXISTS ad_revenue;
DROP TABLE IF EXISTS article_analytics;
DROP TABLE IF EXISTS affiliate_link_stats;
DROP TABLE IF EXISTS affiliate_links;
DROP TABLE IF EXISTS email_campaign_stats;
DROP TABLE IF EXISTS email_campaigns;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS subscribers;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS users;

-- Drop the function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop the UUID extension (only if not used by other databases)
-- DROP EXTENSION IF EXISTS "uuid-ossp";
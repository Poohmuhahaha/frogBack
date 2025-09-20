-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    bio TEXT,
    avatar_url VARCHAR(500),
    role VARCHAR(20) NOT NULL CHECK (role IN ('creator', 'subscriber', 'admin')),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Articles table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) NOT NULL,
    content TEXT NOT NULL,
    excerpt VARCHAR(500),
    featured_image_url VARCHAR(500),
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
    is_premium BOOLEAN DEFAULT FALSE,
    seo_title VARCHAR(200),
    seo_description VARCHAR(300),
    tags TEXT[] DEFAULT '{}',
    reading_time INTEGER,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(author_id, slug)
);

-- Subscribers table
CREATE TABLE subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'unsubscribed', 'bounced')),
    source VARCHAR(20) CHECK (source IN ('website', 'social', 'referral', 'import')),
    tags TEXT[] DEFAULT '{}',
    email_verified BOOLEAN DEFAULT FALSE,
    engagement_score INTEGER DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
    last_opened TIMESTAMP WITH TIME ZONE,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMP WITH TIME ZONE
);

-- Subscription plans table
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    features TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    stripe_price_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(100),
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    canceled_at TIMESTAMP WITH TIME ZONE
);

-- Email campaigns table
CREATE TABLE email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('newsletter', 'automation', 'announcement')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    recipient_count INTEGER DEFAULT 0,
    open_rate DECIMAL(5,4) DEFAULT 0,
    click_rate DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email campaign stats table
CREATE TABLE email_campaign_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    subscriber_id UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE
);

-- Affiliate links table
CREATE TABLE affiliate_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    original_url VARCHAR(1000) NOT NULL,
    tracking_code VARCHAR(100) UNIQUE NOT NULL,
    network VARCHAR(50) NOT NULL CHECK (network IN ('amazon', 'shareasale', 'cj', 'custom')),
    commission_rate DECIMAL(5,2) CHECK (commission_rate >= 0 AND commission_rate <= 100),
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Affiliate link stats table
CREATE TABLE affiliate_link_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    link_id UUID NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    clicked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address_hash VARCHAR(64),
    user_agent TEXT,
    referrer VARCHAR(1000),
    converted BOOLEAN DEFAULT FALSE,
    commission_amount INTEGER,
    conversion_date TIMESTAMP WITH TIME ZONE
);

-- Article analytics table
CREATE TABLE article_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    page_views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    avg_time_on_page INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5,4) DEFAULT 0,
    social_shares INTEGER DEFAULT 0,
    ad_revenue INTEGER DEFAULT 0,
    affiliate_clicks INTEGER DEFAULT 0,
    newsletter_signups INTEGER DEFAULT 0,
    UNIQUE(article_id, date)
);

-- Ad revenue table
CREATE TABLE ad_revenue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('adsense', 'media_net', 'direct')),
    revenue INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr DECIMAL(5,4) DEFAULT 0,
    rpm DECIMAL(8,2) DEFAULT 0,
    UNIQUE(creator_id, date, source)
);

-- Article-affiliate link junction table
CREATE TABLE article_affiliate_links (
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    affiliate_link_id UUID NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, affiliate_link_id)
);

-- Create indexes for better performance
CREATE INDEX idx_articles_author_id ON articles(author_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published_at ON articles(published_at);
CREATE INDEX idx_articles_tags ON articles USING GIN(tags);
CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_status ON subscribers(status);
CREATE INDEX idx_subscriptions_subscriber_id ON subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_email_campaign_stats_campaign_id ON email_campaign_stats(campaign_id);
CREATE INDEX idx_email_campaign_stats_subscriber_id ON email_campaign_stats(subscriber_id);
CREATE INDEX idx_affiliate_link_stats_link_id ON affiliate_link_stats(link_id);
CREATE INDEX idx_affiliate_link_stats_article_id ON affiliate_link_stats(article_id);
CREATE INDEX idx_article_analytics_article_id ON article_analytics(article_id);
CREATE INDEX idx_article_analytics_date ON article_analytics(date);
CREATE INDEX idx_ad_revenue_creator_id ON ad_revenue(creator_id);
CREATE INDEX idx_ad_revenue_date ON ad_revenue(date);

-- Add function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
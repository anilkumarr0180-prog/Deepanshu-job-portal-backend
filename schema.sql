-- ==========================================================
-- PRODUCTION POSTGRESQL / RELATIONAL DATABASE SCHEMA REFERENCE
-- (DrawSQL & Relational DB Compatible)
-- All 25+ Entities Aligned with Active Mongoose Models & Indexes
-- ==========================================================

-- ==========================================================
-- 1. USERS (Core Identity & Authentication)
-- ==========================================================
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    google_id VARCHAR(255) UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'candidate',
    profile_picture_url TEXT,
    resume_url TEXT,
    phone VARCHAR(20),
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_role_status ON users (role, is_blocked, is_deleted);

-- ==========================================================
-- 2. COMPANIES (Organization Profiles)
-- ==========================================================
CREATE TABLE companies (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo TEXT,
    website VARCHAR(255),
    industry VARCHAR(150),
    company_size VARCHAR(100),
    founded_year INTEGER,
    description TEXT NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    social_links JSONB DEFAULT '{}',
    is_verified BOOLEAN DEFAULT FALSE,
    recruiter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_companies_verified ON companies (is_verified, is_deleted);
CREATE INDEX idx_companies_recruiter ON companies (recruiter_id, is_deleted);

-- ==========================================================
-- 3. RECRUITER PROFILES
-- ==========================================================
CREATE TABLE recruiter_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL, -- Deprecated legacy link
    designation VARCHAR(150),
    department VARCHAR(150),
    phone VARCHAR(20),
    profile_picture TEXT,
    bio TEXT,
    social_links JSONB DEFAULT '{}',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recruiter_profiles_company ON recruiter_profiles (company_id, is_deleted);

-- ==========================================================
-- 4. COMPANY RECRUITERS (Authoritative Multi-Recruiter Membership)
-- ==========================================================
CREATE TABLE company_recruiters (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recruiter_profile_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'recruiter',
    is_primary BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_company_recruiters_pair ON company_recruiters (company_id, recruiter_profile_id);
CREATE UNIQUE INDEX idx_company_primary_recruiter ON company_recruiters (company_id) WHERE is_primary = TRUE AND is_deleted = FALSE;
CREATE INDEX idx_company_recruiters_lookup ON company_recruiters (recruiter_profile_id, is_deleted);

-- ==========================================================
-- 5. CANDIDATE PROFILES
-- ==========================================================
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    headline VARCHAR(255),
    bio TEXT,
    phone VARCHAR(20),
    profile_picture TEXT,
    resume_url TEXT,
    resume_public_id TEXT,
    resume_file_name VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    skills JSONB DEFAULT '[]',
    social_links JSONB DEFAULT '{}',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidate_profiles_location ON candidate_profiles (city, country);

-- ==========================================================
-- 6. CANDIDATE EXPERIENCES
-- ==========================================================
CREATE TABLE candidate_experiences (
    id UUID PRIMARY KEY,
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    job_title VARCHAR(150) NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    location VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 7. CANDIDATE EDUCATIONS
-- ==========================================================
CREATE TABLE candidate_educations (
    id UUID PRIMARY KEY,
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    institution_name VARCHAR(200) NOT NULL,
    degree VARCHAR(150) NOT NULL,
    field_of_study VARCHAR(150),
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 8. SKILLS
-- ==========================================================
CREATE TABLE skills (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 9. CANDIDATE SKILLS (Junction)
-- ==========================================================
CREATE TABLE candidate_skills (
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (candidate_profile_id, skill_id)
);

-- ==========================================================
-- 10. JOBS
-- ==========================================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    posted_by UUID REFERENCES recruiter_profiles(id) ON DELETE SET NULL, -- Deprecated legacy field
    recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,     -- Authoritative owner
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    work_mode VARCHAR(20) NOT NULL DEFAULT 'onsite',
    salary_min NUMERIC(12,2) NOT NULL DEFAULT 0,
    salary_max NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    salary_period VARCHAR(20) DEFAULT 'yearly',
    employment_type VARCHAR(50) NOT NULL DEFAULT 'full-time',
    experience_level VARCHAR(50) NOT NULL DEFAULT 'mid',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'DRAFT', 'ACTIVE', 'CLOSED'
    is_featured BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_feed ON jobs (is_featured DESC, status, is_deleted, created_at DESC);
CREATE INDEX idx_jobs_recruiter ON jobs (recruiter_id, status, is_deleted, created_at DESC);
CREATE INDEX idx_jobs_recruiter_simple ON jobs (recruiter_id, is_deleted, created_at DESC);
CREATE INDEX idx_jobs_company ON jobs (company_id, status, is_deleted);
CREATE INDEX idx_jobs_facets ON jobs (status, is_deleted, employment_type, experience_level);

-- ==========================================================
-- 11. JOB SKILLS (Junction)
-- ==========================================================
CREATE TABLE job_skills (
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, skill_id)
);

-- ==========================================================
-- 12. JOB APPLICATIONS (With Point-in-Time Resume & Profile Snapshots)
-- ==========================================================
CREATE TABLE job_applications (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    applicant_name VARCHAR(150),
    applicant_email VARCHAR(255),
    applicant_phone VARCHAR(50),
    applicant_designation VARCHAR(150),
    experience_years NUMERIC(4,1) DEFAULT 0,
    relevant_skills JSONB DEFAULT '[]',
    notice_period VARCHAR(50),
    resume_url TEXT NOT NULL,
    resume_public_id TEXT,
    resume_file_name VARCHAR(255),
    cover_letter TEXT,
    interview_details JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'applied', -- 'applied', 'under_review', 'shortlisted', 'interview', 'hired', 'rejected'
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_job_applicant ON job_applications (job_id, applicant_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_job_applications_candidate ON job_applications (applicant_id, is_deleted, created_at DESC);
CREATE INDEX idx_job_applications_candidate_status ON job_applications (applicant_id, status);
CREATE INDEX idx_job_applications_job_status ON job_applications (job_id, status, is_deleted);
CREATE INDEX idx_job_applications_job_sort ON job_applications (job_id, is_deleted, created_at DESC);

-- ==========================================================
-- 13. SAVED JOBS (Candidate Bookmarks)
-- ==========================================================
CREATE TABLE saved_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_profile_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_saved_job ON saved_jobs (user_id, job_id);
CREATE INDEX idx_saved_jobs_user_sort ON saved_jobs (user_id, created_at DESC);

-- ==========================================================
-- 14. POSTS (Community Feed)
-- ==========================================================
CREATE TABLE posts (
    id UUID PRIMARY KEY,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url TEXT,
    media_public_id TEXT,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    likes_count INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_feed ON posts (is_published, is_deleted, created_at DESC);
CREATE INDEX idx_posts_author ON posts (author_id, is_deleted, created_at DESC);

-- ==========================================================
-- 15. POST COMMENTS (Threaded Single-Level Tree)
-- ==========================================================
CREATE TABLE post_comments (
    id UUID PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_post_comments_tree ON post_comments (post_id, parent_comment_id, is_deleted, created_at ASC);
CREATE INDEX idx_post_comments_post ON post_comments (post_id, is_deleted, created_at ASC);

-- ==========================================================
-- 16. POST REACTIONS (Idempotent Likes)
-- ==========================================================
CREATE TABLE post_reactions (
    id UUID PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'like',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_post_reactions_unique ON post_reactions (post_id, user_id);

-- ==========================================================
-- 17. SUBSCRIPTION PLANS
-- ==========================================================
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    usd_price NUMERIC(10,2),
    description TEXT NOT NULL,
    target_role VARCHAR(50) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
    features JSONB DEFAULT '{}',
    provider VARCHAR(50) DEFAULT 'razorpay',
    provider_plan_id VARCHAR(255),
    provider_mappings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    is_popular BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 18. SUBSCRIPTIONS
-- ==========================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    plan_code VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'canceled', 'expired'
    billing_type VARCHAR(50) NOT NULL DEFAULT 'one_time', -- 'one_time', 'recurring'
    current_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    provider VARCHAR(50) DEFAULT 'internal',
    provider_subscription_id VARCHAR(255),
    provider_order_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    provider_customer_id VARCHAR(255),
    usages JSONB DEFAULT '{"jobsPostedCount":0, "featuredJobsCount":0, "inmailCreditsUsed":0}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_active_user_subscription ON subscriptions (user_id) WHERE status = 'active';
CREATE INDEX idx_subscriptions_user_status ON subscriptions (user_id, status);

-- ==========================================================
-- 19. PAYMENT ORDERS (Pre-Order Checkout Persistence)
-- ==========================================================
CREATE TABLE payment_orders (
    id UUID PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code VARCHAR(100) NOT NULL,
    coupon_code VARCHAR(100),
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    provider VARCHAR(50) DEFAULT 'razorpay',
    status VARCHAR(50) DEFAULT 'created', -- 'created', 'paid', 'failed', 'expired'
    subscription_id VARCHAR(255),
    payment_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_orders_user_status ON payment_orders (user_id, status);

-- ==========================================================
-- 20. PAYMENT TRANSACTIONS (Billing & Invoices)
-- ==========================================================
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    provider VARCHAR(50) DEFAULT 'internal',
    transaction_id VARCHAR(255) NOT NULL UNIQUE,
    provider_order_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'succeeded',
    type VARCHAR(50) DEFAULT 'checkout',
    payment_method VARCHAR(50) DEFAULT 'card',
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    invoice_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_transactions_user_sort ON payment_transactions (user_id, created_at DESC);

-- ==========================================================
-- 21. WEBHOOK EVENTS (Atomic Deduplication Audit Log)
-- ==========================================================
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'processed',
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_webhook_events_provider_event ON webhook_events (provider, event_id);

-- ==========================================================
-- 22. COUPONS (Promo Codes)
-- ==========================================================
CREATE TABLE coupons (
    id UUID PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type VARCHAR(20) DEFAULT 'percentage',
    discount_value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_type != 'percentage' OR discount_value <= 100),
    max_uses INTEGER DEFAULT -1,
    times_used INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 23. CONVERSATIONS (Application-Gated Channels)
-- ==========================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_conversations_tripartite ON conversations (job_id, candidate_id, recruiter_id);
CREATE INDEX idx_conversations_candidate_inbox ON conversations (candidate_id, is_deleted, last_message_at DESC);
CREATE INDEX idx_conversations_recruiter_inbox ON conversations (recruiter_id, is_deleted, last_message_at DESC);

-- ==========================================================
-- 24. MESSAGES (1:1 Chat)
-- ==========================================================
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    attachments JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    is_edited BOOLEAN DEFAULT FALSE,
    deleted_for JSONB DEFAULT '[]',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_history ON messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages (conversation_id, is_read, sender_id);

-- ==========================================================
-- 25. NOTIFICATIONS (In-App Alerts)
-- ==========================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link TEXT DEFAULT '',
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_feed ON notifications (recipient_id, created_at DESC);

-- ==========================================================
-- 26. USER LOCATIONS (Live Coordinates)
-- ==========================================================
CREATE TABLE user_locations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    latitude NUMERIC(10,8) NOT NULL,
    longitude NUMERIC(11,8) NOT NULL,
    accuracy NUMERIC(10,2),
    heading NUMERIC(5,2),
    speed NUMERIC(5,2),
    city VARCHAR(100) DEFAULT '',
    area VARCHAR(100) DEFAULT '',
    state VARCHAR(100) DEFAULT '',
    country VARCHAR(100) DEFAULT '',
    captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 27. LOCATION SHARES (Candidate Privacy Permissions)
-- ==========================================================
CREATE TABLE location_shares (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    privacy_level VARCHAR(50) NOT NULL DEFAULT 'APPROXIMATE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_location_share ON location_shares (application_id, user_id);
CREATE INDEX idx_location_shares_app ON location_shares (application_id, is_active);

-- ==========================================================
-- 28. LOCATION ACCESS LOGS (Audit Trail)
-- ==========================================================
CREATE TABLE location_access_logs (
    id UUID PRIMARY KEY,
    accessor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id UUID REFERENCES job_applications(id) ON DELETE SET NULL,
    privacy_level VARCHAR(50) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_location_access_logs_accessor ON location_access_logs (accessor_id, created_at DESC);
CREATE INDEX idx_location_access_logs_target ON location_access_logs (target_user_id, created_at DESC);

-- ==========================================================
-- 29. PENDING EMAIL NOTIFICATIONS (Offline Chat Debouncer)
-- ==========================================================
CREATE TABLE pending_email_notifications (
    id UUID PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    send_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pending_emails_send_at ON pending_email_notifications (send_at);

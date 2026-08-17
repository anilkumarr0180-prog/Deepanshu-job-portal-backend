-- ==========================================================
-- PROD-READY PRODUCTION-GRADE POSTGRESQL SCHEMA (v2 COMPLETE)
-- Contains 100% parity with all 20 Mongoose Models
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================
-- ENUMS
-- ==========================================================

CREATE TYPE user_role AS ENUM ('candidate', 'recruiter', 'admin');
CREATE TYPE application_status AS ENUM ('applied', 'screening', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn');
CREATE TYPE job_status AS ENUM ('draft', 'published', 'paused', 'closed', 'expired');
CREATE TYPE employment_type AS ENUM ('full-time', 'part-time', 'internship', 'contract', 'freelance');
CREATE TYPE experience_level AS ENUM ('fresher', 'junior', 'mid', 'senior', 'lead');
CREATE TYPE work_mode AS ENUM ('onsite', 'remote', 'hybrid');
CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'system');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'expired');
CREATE TYPE payment_provider AS ENUM ('mock', 'stripe', 'razorpay');
CREATE TYPE payment_status AS ENUM ('succeeded', 'failed', 'pending', 'refunded');
CREATE TYPE payment_type AS ENUM ('checkout', 'renewal', 'refund');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');
CREATE TYPE location_privacy_level AS ENUM ('EXACT', 'APPROXIMATE', 'CITY_ONLY', 'HIDDEN');

-- ==========================================================
-- USERS (Core Identity)
-- ==========================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'candidate',
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_role_status ON users(role, is_blocked, deleted_at);

-- ==========================================================
-- COMPANIES
-- ==========================================================

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    website_url TEXT,
    industry VARCHAR(150),
    company_size VARCHAR(100),
    founded_year INT CHECK (founded_year >= 1800 AND founded_year <= 2100),
    description TEXT NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    social_links JSONB DEFAULT '{}',
    is_verified BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_company_search ON companies USING GIN(to_tsvector('english', coalesce(company_name,'') || ' ' || coalesce(industry,'')));

-- ==========================================================
-- RECRUITER PROFILES
-- ==========================================================

CREATE TABLE recruiter_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    designation VARCHAR(150),
    department VARCHAR(150),
    phone VARCHAR(20),
    profile_picture_url TEXT,
    bio TEXT,
    social_links JSONB DEFAULT '{}',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- COMPANY RECRUITERS (Junction N:M)
-- ==========================================================

CREATE TABLE company_recruiters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recruiter_profile_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'recruiter',
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, recruiter_profile_id)
);

-- ==========================================================
-- CANDIDATE PROFILES
-- ==========================================================

CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    headline VARCHAR(255),
    bio TEXT,
    phone VARCHAR(20),
    profile_picture_url TEXT,
    resume_url TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    social_links JSONB DEFAULT '{}',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- CANDIDATE EXPERIENCES
-- ==========================================================

CREATE TABLE candidate_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    job_title VARCHAR(150) NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    location VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ==========================================================
-- CANDIDATE EDUCATIONS
-- ==========================================================

CREATE TABLE candidate_educations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    institution_name VARCHAR(200) NOT NULL,
    degree VARCHAR(150) NOT NULL,
    field_of_study VARCHAR(150),
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ==========================================================
-- SKILLS
-- ==========================================================

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE candidate_skills (
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (candidate_profile_id, skill_id)
);

-- ==========================================================
-- JOBS
-- ==========================================================

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    posted_by UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE RESTRICT,
    job_title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    work_mode work_mode NOT NULL DEFAULT 'onsite',
    salary_min NUMERIC(12,2) NOT NULL CHECK (salary_min >= 0),
    salary_max NUMERIC(12,2) NOT NULL CHECK (salary_max >= 0),
    currency VARCHAR(3) DEFAULT 'INR',
    salary_period VARCHAR(20) DEFAULT 'yearly',
    employment_type employment_type NOT NULL,
    experience_level experience_level NOT NULL,
    status job_status DEFAULT 'published',
    published_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (salary_min <= salary_max)
);

CREATE INDEX idx_job_status_published ON jobs(status, deleted_at, published_at DESC);
CREATE INDEX idx_job_search ON jobs USING GIN(to_tsvector('english', coalesce(job_title,'') || ' ' || coalesce(description,'')));

-- ==========================================================
-- JOB SKILLS (Fixed Table Creation Order)
-- ==========================================================

CREATE TABLE job_skills (
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, skill_id)
);

-- ==========================================================
-- JOB APPLICATIONS
-- ==========================================================

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE RESTRICT,
    resume_url TEXT NOT NULL,
    cover_letter TEXT,
    status application_status DEFAULT 'applied',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, candidate_profile_id)
);

CREATE INDEX idx_app_candidate ON job_applications(candidate_profile_id, deleted_at, created_at DESC);

-- ==========================================================
-- SAVED JOBS
-- ==========================================================

CREATE TABLE saved_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(candidate_profile_id, job_id)
);

CREATE INDEX idx_saved_cand_created ON saved_jobs(candidate_profile_id, created_at DESC);

-- ==========================================================
-- SUBSCRIPTION PLANS
-- ==========================================================

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    target_role user_role NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) DEFAULT 'INR',
    billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
    features JSONB DEFAULT '{}',
    provider payment_provider DEFAULT 'razorpay',
    provider_plan_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_popular BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- SUBSCRIPTIONS
-- ==========================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    plan_code VARCHAR(100) NOT NULL,
    status subscription_status NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    provider payment_provider DEFAULT 'mock',
    provider_subscription_id VARCHAR(255),
    provider_customer_id VARCHAR(255),
    usages JSONB DEFAULT '{"jobs_posted":0, "featured_jobs":0, "inmail_credits":0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sub_user_status ON subscriptions(user_id, status);

-- ==========================================================
-- PAYMENT TRANSACTIONS
-- ==========================================================

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'INR',
    provider payment_provider DEFAULT 'mock',
    transaction_id VARCHAR(255) NOT NULL UNIQUE,
    provider_order_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    status payment_status DEFAULT 'succeeded',
    type payment_type DEFAULT 'checkout',
    payment_method VARCHAR(50) DEFAULT 'card',
    invoice_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payment_transactions(user_id, created_at DESC);


-- ==========================================================
-- WEBHOOK EVENTS (Idempotency Audit Log)
-- ==========================================================

CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'processed',
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, event_id)
);

-- ==========================================================
-- COUPONS
-- ==========================================================

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type discount_type DEFAULT 'percentage',
    discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value >= 0),
    max_uses INT DEFAULT -1,
    times_used INT DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- CONVERSATIONS & CHAT MESSAGES
-- ==========================================================

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, candidate_id, recruiter_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    message_type message_type DEFAULT 'text',
    attachments JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_edited BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, deleted_at, created_at DESC);

-- Add Foreign Key for conversation's last_message_id
ALTER TABLE conversations ADD COLUMN last_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- ==========================================================
-- NOTIFICATIONS
-- ==========================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link TEXT DEFAULT '',
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient ON notifications(recipient_id, is_read, created_at DESC);

-- ==========================================================
-- USER LOCATIONS & SHARING
-- ==========================================================

CREATE TABLE user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    latitude NUMERIC(10,8) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(11,8) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    accuracy NUMERIC(10,2),
    heading NUMERIC(5,2),
    speed NUMERIC(5,2),
    city VARCHAR(100) DEFAULT '',
    area VARCHAR(100) DEFAULT '',
    state VARCHAR(100) DEFAULT '',
    country VARCHAR(100) DEFAULT '',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE location_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    privacy_level location_privacy_level NOT NULL DEFAULT 'APPROXIMATE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application_id, user_id)
);

CREATE TABLE location_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id UUID REFERENCES job_applications(id) ON DELETE SET NULL,
    privacy_level location_privacy_level NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- PENDING EMAIL NOTIFICATIONS (Job Queue)
-- ==========================================================

CREATE TABLE pending_email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    send_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(recipient_id, conversation_id)
);

CREATE INDEX idx_pending_email_send_at ON pending_email_notifications(send_at);


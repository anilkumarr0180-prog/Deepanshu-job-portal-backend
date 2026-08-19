-- ==========================================================
-- PRODUCTION POSTGRESQL DATABASE SCHEMA (DrawSQL Compatible)
-- All 20+ Entities with Complete Foreign Key Relationships
-- ==========================================================

-- ==========================================================
-- 1. USERS (Core Identity)
-- ==========================================================
CREATE TABLE users (
    id UUID PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'candidate',
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 2. COMPANIES
-- ==========================================================
CREATE TABLE companies (
    id UUID PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    website_url TEXT,
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
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 3. RECRUITER PROFILES
-- ==========================================================
CREATE TABLE recruiter_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    designation VARCHAR(150),
    department VARCHAR(150),
    phone VARCHAR(20),
    profile_picture_url TEXT,
    bio TEXT,
    social_links JSONB DEFAULT '{}',
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 4. COMPANY RECRUITERS (Canonical Junction)
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

-- ==========================================================
-- 5. CANDIDATE PROFILES
-- ==========================================================
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    headline VARCHAR(255),
    bio TEXT,
    phone VARCHAR(20),
    profile_picture_url TEXT,
    resume_url TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    social_links JSONB DEFAULT '{}',
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    skill_name VARCHAR(100) NOT NULL UNIQUE,
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
    posted_by UUID REFERENCES recruiter_profiles(id) ON DELETE SET NULL,
    recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    company_name VARCHAR(255) NOT NULL,
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
    status VARCHAR(50) DEFAULT 'published',
    is_featured BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 11. JOB SKILLS (Junction)
-- ==========================================================
CREATE TABLE job_skills (
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, skill_id)
);

-- ==========================================================
-- 12. JOB APPLICATIONS (With Historical Point-in-Time Snapshots)
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
    status VARCHAR(50) DEFAULT 'applied',
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_job_applicant ON job_applications (job_id, applicant_id);

-- ==========================================================
-- 13. SAVED JOBS
-- ==========================================================
CREATE TABLE saved_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_profile_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_unique_saved_job ON saved_jobs (user_id, job_id);

-- ==========================================================
-- 14. SUBSCRIPTION PLANS
-- ==========================================================
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    target_role VARCHAR(50) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
    features JSONB DEFAULT '{}',
    provider VARCHAR(50) DEFAULT 'razorpay',
    provider_plan_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_popular BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 15. SUBSCRIPTIONS
-- ==========================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    plan_code VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    billing_type VARCHAR(50) NOT NULL DEFAULT 'one_time',
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

-- ==========================================================
-- 16. PAYMENT TRANSACTIONS
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

-- ==========================================================
-- 17. WEBHOOK EVENTS (Idempotency Audit Log)
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
-- 18. COUPONS
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
-- 19. CONVERSATIONS
-- ==========================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 20. MESSAGES
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
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 21. NOTIFICATIONS
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

-- ==========================================================
-- 22. USER LOCATIONS
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
-- 23. LOCATION SHARES
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

-- ==========================================================
-- 24. LOCATION ACCESS LOGS
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

-- ==========================================================
-- 25. PENDING EMAIL NOTIFICATIONS
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

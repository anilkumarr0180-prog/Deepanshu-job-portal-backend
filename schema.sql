-- ==========================================================
-- PROD-READY PRODUCTION-GRADE POSTGRESQL SCHEMA (v2 REDESIGN)
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
    founded_year INT CHECK (founded_year >= 1800 AND founded_year <= EXTRACT(YEAR FROM CURRENT_DATE)),
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
-- SKILLS & JUNCTION TABLES
-- ==========================================================

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_skills (
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, skill_id)
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
    currency VARCHAR(3) DEFAULT 'USD',
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
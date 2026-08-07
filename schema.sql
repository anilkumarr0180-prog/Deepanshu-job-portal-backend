-- ==========================================================
-- PROD-READY PRODUCTION-GRADE POSTGRESQL SCHEMA
-- ==========================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================
-- ENUMS
-- ==========================================================

CREATE TYPE user_role AS ENUM (
    'candidate',
    'recruiter',
    'admin'
);

CREATE TYPE application_status AS ENUM (
    'applied',
    'screening',
    'shortlisted',
    'interview',
    'offered',
    'hired',
    'rejected',
    'withdrawn'
);

CREATE TYPE job_status AS ENUM (
    'active',
    'paused',
    'closed',
    'expired'
);

CREATE TYPE employment_type AS ENUM (
    'full-time',
    'part-time',
    'internship',
    'contract',
    'freelance'
);

CREATE TYPE experience_level AS ENUM (
    'fresher',
    'junior',
    'mid',
    'senior',
    'lead'
);

-- ==========================================================
-- USERS (Core Authentication & Identity)
-- ==========================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'candidate',
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index covering role & account status queries
CREATE INDEX idx_users_role_blocked_deleted 
ON users(role, is_blocked, deleted_at);

-- ==========================================================
-- COMPANIES
-- ==========================================================

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    logo TEXT,
    website TEXT,
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
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full text search index on Company Name + Industry
CREATE INDEX idx_company_search
ON companies
USING GIN(
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(industry,''))
);

CREATE INDEX idx_companies_verified_deleted
ON companies(is_verified, deleted_at);

-- ==========================================================
-- RECRUITER PROFILES
-- ==========================================================

CREATE TABLE recruiter_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE RESTRICT,
    company_id UUID
        REFERENCES companies(id)
        ON DELETE SET NULL,
    designation VARCHAR(150),
    department VARCHAR(150),
    phone VARCHAR(20),
    profile_picture TEXT,
    bio TEXT,
    social_links JSONB DEFAULT '{}',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recruiter_company
ON recruiter_profiles(company_id);

-- ==========================================================
-- CANDIDATE PROFILES
-- ==========================================================

CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE RESTRICT,
    headline VARCHAR(255),
    bio TEXT,
    phone VARCHAR(20),
    profile_picture TEXT,
    resume_url TEXT,
    skills TEXT[] DEFAULT '{}',
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    social_links JSONB DEFAULT '{}',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GIN Index on Candidate Skills array
CREATE INDEX idx_candidate_skills
ON candidate_profiles
USING GIN(skills);

-- ==========================================================
-- CANDIDATE EXPERIENCES (Normalized 1:N Table)
-- ==========================================================

CREATE TABLE candidate_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_profile_id UUID NOT NULL
        REFERENCES candidate_profiles(id)
        ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
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

CREATE INDEX idx_cand_exp_profile
ON candidate_experiences(candidate_profile_id);

-- ==========================================================
-- CANDIDATE EDUCATIONS (Normalized 1:N Table)
-- ==========================================================

CREATE TABLE candidate_educations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_profile_id UUID NOT NULL
        REFERENCES candidate_profiles(id)
        ON DELETE CASCADE,
    institution VARCHAR(200) NOT NULL,
    degree VARCHAR(150) NOT NULL,
    field_of_study VARCHAR(150),
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_cand_edu_profile
ON candidate_educations(candidate_profile_id);

-- ==========================================================
-- JOBS
-- ==========================================================

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE RESTRICT,
    recruiter_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    salary_min NUMERIC(12,2) NOT NULL CHECK (salary_min >= 0),
    salary_max NUMERIC(12,2) NOT NULL CHECK (salary_max >= 0),
    employment_type employment_type NOT NULL,
    experience_level experience_level NOT NULL,
    status job_status DEFAULT 'active',
    skills TEXT[] DEFAULT '{}',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (salary_min <= salary_max)
);

-- Compound filtering index for active non-deleted jobs sorted by creation date
CREATE INDEX idx_job_status_deleted_created
ON jobs(status, deleted_at, created_at DESC);

CREATE INDEX idx_job_company
ON jobs(company_id, status);

CREATE INDEX idx_job_skills
ON jobs
USING GIN(skills);

-- Full Text Search Index on Jobs (Title + Description)
CREATE INDEX idx_job_search
ON jobs
USING GIN(
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
);

-- ==========================================================
-- APPLICATIONS
-- ==========================================================

CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL
        REFERENCES jobs(id)
        ON DELETE RESTRICT,
    applicant_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,
    resume TEXT NOT NULL,
    cover_letter TEXT,
    status application_status DEFAULT 'applied',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, applicant_id)
);

CREATE INDEX idx_application_candidate
ON applications(applicant_id, deleted_at, created_at DESC);

CREATE INDEX idx_application_job_status
ON applications(job_id, status, deleted_at);

-- ==========================================================
-- SAVED JOBS
-- ==========================================================

CREATE TABLE saved_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
    job_id UUID NOT NULL
        REFERENCES jobs(id)
        ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, job_id)
);

CREATE INDEX idx_saved_user_created
ON saved_jobs(user_id, created_at DESC);
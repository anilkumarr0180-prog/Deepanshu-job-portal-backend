-- ==========================================================
-- Enable UUID generation
-- ==========================================================

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
-- USERS
-- ==========================================================

CREATE TABLE users (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(150) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password TEXT NOT NULL,

    role user_role NOT NULL DEFAULT 'candidate',

    phone VARCHAR(20),

    profile_picture TEXT,

    resume_url TEXT,

    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_role
ON users(role);

CREATE INDEX idx_users_blocked
ON users(is_blocked);

CREATE INDEX idx_users_role_blocked
ON users(role,is_blocked);

-- ==========================================================
-- CANDIDATE PROFILE
-- ==========================================================

CREATE TABLE candidate_profiles (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    headline VARCHAR(255),

    bio TEXT,

    phone VARCHAR(20),

    profile_picture TEXT,

    resume_url TEXT,

    skills TEXT[] DEFAULT '{}',

    experience JSONB DEFAULT '[]',

    education JSONB DEFAULT '[]',

    city VARCHAR(100),

    state VARCHAR(100),

    country VARCHAR(100),

    social_links JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidate_skills
ON candidate_profiles
USING GIN(skills);

-- ==========================================================
-- COMPANIES
-- ==========================================================

CREATE TABLE companies (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recruiter_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,

    logo TEXT,

    website TEXT,

    industry VARCHAR(150),

    company_size VARCHAR(100),

    founded_year INT,

    description TEXT NOT NULL,

    email VARCHAR(255),

    phone VARCHAR(20),

    address TEXT,

    city VARCHAR(100),

    state VARCHAR(100),

    country VARCHAR(100),

    social_links JSONB DEFAULT '{}',

    is_verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_company_search
ON companies
USING GIN(
to_tsvector(
'english',
coalesce(name,'') || ' ' ||
coalesce(industry,'')
)
);

-- ==========================================================
-- RECRUITER PROFILE
-- ==========================================================

CREATE TABLE recruiter_profiles (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    designation VARCHAR(150),

    department VARCHAR(150),

    phone VARCHAR(20),

    profile_picture TEXT,

    company_id UUID
        REFERENCES companies(id)
        ON DELETE SET NULL,

    bio TEXT,

    social_links JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- JOBS
-- ==========================================================

CREATE TABLE jobs (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recruiter_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    company VARCHAR(255) NOT NULL,

    title VARCHAR(255) NOT NULL,

    description TEXT NOT NULL,

    location VARCHAR(255) NOT NULL,

    salary_min NUMERIC(12,2) NOT NULL,

    salary_max NUMERIC(12,2) NOT NULL,

    employment_type employment_type NOT NULL,

    experience_level experience_level NOT NULL,

    status job_status DEFAULT 'active',

    skills TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (salary_min <= salary_max)
);

CREATE INDEX idx_job_status
ON jobs(status);

CREATE INDEX idx_job_created
ON jobs(status,created_at DESC);

CREATE INDEX idx_job_skills
ON jobs
USING GIN(skills);

CREATE INDEX idx_job_search
ON jobs
USING GIN(
to_tsvector(
'english',
coalesce(title,'') || ' ' ||
coalesce(company,'') || ' ' ||
coalesce(description,'')
)
);

-- ==========================================================
-- APPLICATIONS
-- ==========================================================

CREATE TABLE applications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_id UUID NOT NULL
        REFERENCES jobs(id)
        ON DELETE CASCADE,

    applicant_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    resume TEXT NOT NULL,

    cover_letter TEXT,

    status application_status
        DEFAULT 'applied',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(job_id,applicant_id)
);

CREATE INDEX idx_application_candidate
ON applications(applicant_id,created_at DESC);

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

    UNIQUE(user_id,job_id)
);

CREATE INDEX idx_saved_user
ON saved_jobs(user_id);

CREATE INDEX idx_saved_job
ON saved_jobs(job_id);
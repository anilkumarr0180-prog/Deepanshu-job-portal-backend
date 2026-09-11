import { z } from "zod";

// ==========================================
// 1. RECRUITER: JOB DESCRIPTION SCHEMAS
// ==========================================

export const generateJobDescriptionInputSchema = z.object({
  body: z.object({
    jobTitle: z.string().min(2, "Job title is required (min 2 characters)"),
    skills: z.array(z.string()).min(1, "At least one skill or keyword is required"),
    experienceLevel: z.enum(["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD"]).default("MID"),
    jobType: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Remote", "Hybrid"]).default("Full-time"),
    additionalNotes: z.string().optional(),
  }),
});

export const generatedJobDescriptionResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  niceToHave: z.array(z.string()),
  suggestedTags: z.array(z.string()),
});

// ==========================================
// 2. CANDIDATE: RESUME EXTRACTION SCHEMA
// ==========================================

export const parsedResumeResponseSchema = z.object({
  personalInfo: z.object({
    fullName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    portfolioUrls: z.array(z.string()).default([]),
  }),
  totalYearsExperience: z.number().default(0),
  skills: z.object({
    technical: z.array(z.string()).default([]),
    soft: z.array(z.string()).default([]),
  }),
  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string().nullable(),
      description: z.string().nullable(),
    })
  ).default([]),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      fieldOfStudy: z.string().nullable(),
      year: z.string().nullable(),
    })
  ).default([]),
  certifications: z.array(z.string()).default([]),
});

// ==========================================
// 3. MATCH SCORE & GAP ANALYSIS SCHEMAS
// ==========================================

export const matchAnalysisInputSchema = z.object({
  body: z.object({
    jobId: z.string().optional(),
    candidateProfile: z.object({
      skills: z.array(z.string()),
      experienceYears: z.number().optional(),
      summary: z.string().optional(),
    }),
    jobRequirements: z.object({
      title: z.string(),
      requiredSkills: z.array(z.string()),
      description: z.string(),
    }),
  }),
});

export const matchAnalysisResponseSchema = z.object({
  overallScore: z.number().min(0).max(100),
  grade: z.enum(["STRONG_FIT", "POTENTIAL_FIT", "BORDERLINE", "NOT_RECOMMENDED"]),
  summary: z.string(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  actionableFeedback: z.array(z.string()),
  suggestedInterviewQuestions: z.array(z.string()),
});

// TypeScript inferred types
export type GenerateJobDescriptionInput = z.infer<typeof generateJobDescriptionInputSchema>["body"];
export type GeneratedJobDescription = z.infer<typeof generatedJobDescriptionResponseSchema>;
export type ParsedResume = z.infer<typeof parsedResumeResponseSchema>;
export type MatchAnalysisResult = z.infer<typeof matchAnalysisResponseSchema>;

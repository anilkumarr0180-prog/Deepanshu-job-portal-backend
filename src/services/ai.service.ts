import { aiClient, AI_MODEL } from "../config/ai.config";
import {
  GenerateJobDescriptionInput,
  GeneratedJobDescription,
  generatedJobDescriptionResponseSchema,
  ParsedResume,
  parsedResumeResponseSchema,
  MatchAnalysisResult,
  matchAnalysisResponseSchema,
} from "../validations/ai.validations";

export class AIService {
  /**
   * 1. RECRUITER COPILOT: Generate Structured Job Description
   */
  static async generateJobDescription(input: GenerateJobDescriptionInput): Promise<GeneratedJobDescription> {
    const prompt = `
You are an expert Executive Technical Recruiter.
Generate a high-converting, professional, and SEO-optimized job description based on the following input:

- Target Job Title: ${input.jobTitle}
- Core Skills / Tech Stack: ${input.skills.join(", ")}
- Seniority Level: ${input.experienceLevel}
- Employment Type: ${input.jobType}
${input.additionalNotes ? `- Additional Context: ${input.additionalNotes}` : ""}

Ensure the tone is welcoming and professional. Output MUST be valid JSON strictly matching this schema:
{
  "title": string,
  "summary": string,
  "responsibilities": string[],
  "requirements": string[],
  "niceToHave": string[],
  "suggestedTags": string[]
}
`;

    const response = await aiClient.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const rawText = response.text || "{}";
    const parsedJson = JSON.parse(rawText);
    return generatedJobDescriptionResponseSchema.parse(parsedJson);
  }

  /**
   * 2. CANDIDATE COPILOT: Parse Resume Text into Structured Candidate Profile
   */
  static async parseResume(rawResumeText: string): Promise<ParsedResume> {
    // Sanitize length to stay within token limits & avoid memory spikes
    const truncatedText = rawResumeText.slice(0, 15000);

    const prompt = `
You are an enterprise ATS (Applicant Tracking System) Data Ingestion Engine.
Extract structured candidate profile information from the following raw resume text:

--- BEGIN RESUME ---
${truncatedText}
--- END RESUME ---

RULES:
1. Normalize technical skill names (e.g., "React.js" -> "React", "Nodejs" -> "Node.js").
2. Calculate totalYearsExperience as a realistic single number (float or integer).
3. If any detail is missing, provide null or an empty array. Do not invent facts.

Output MUST be valid JSON strictly matching this schema:
{
  "personalInfo": {
    "fullName": string | null,
    "email": string | null,
    "phone": string | null,
    "location": string | null,
    "headline": string | null,
    "summary": string | null,
    "portfolioUrls": string[]
  },
  "totalYearsExperience": number,
  "skills": {
    "technical": string[],
    "soft": string[]
  },
  "experience": [
    {
      "company": string,
      "role": string,
      "duration": string | null,
      "description": string | null
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string,
      "fieldOfStudy": string | null,
      "year": string | null
    }
  ],
  "certifications": string[]
}
`;

    const response = await aiClient.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawText = response.text || "{}";
    const parsedJson = JSON.parse(rawText);
    return parsedResumeResponseSchema.parse(parsedJson);
  }

  /**
   * 3. DUAL-SIDED: Real-time ATS Match Score & Fit Gap Analysis
   */
  static async analyzeMatch(params: {
    candidateProfile: { skills: string[]; experienceYears?: number; summary?: string };
    jobRequirements: { title: string; requiredSkills: string[]; description: string };
  }): Promise<MatchAnalysisResult> {
    const prompt = `
You are a Principal Talent Acquisition AI and Executive Technical Recruiter.
Conduct an objective, rigorous ATS match evaluation between this candidate and the target job:

CANDIDATE:
- Skills: ${params.candidateProfile.skills.join(", ")}
- Years of Experience: ${params.candidateProfile.experienceYears || "Not specified"}
- Summary: ${params.candidateProfile.summary || "Not specified"}

JOB REQUIREMENTS:
- Job Title: ${params.jobRequirements.title}
- Required Skills: ${params.jobRequirements.requiredSkills.join(", ")}
- Description Snippet: ${params.jobRequirements.description.slice(0, 2000)}

EVALUATION RULES:
1. overallScore (0-100): Calculated realistically based on skill overlap and role alignment.
2. grade: "STRONG_FIT" (80-100), "POTENTIAL_FIT" (60-79), "BORDERLINE" (40-59), or "NOT_RECOMMENDED" (<40).
3. Identify exactly which skills are matched vs missing.
4. Provide 2-3 actionable tips for the candidate.
5. Provide 2-3 technical interview probe questions for the recruiter to verify candidate weak spots.

Output MUST be valid JSON strictly matching this schema:
{
  "overallScore": number,
  "grade": "STRONG_FIT" | "POTENTIAL_FIT" | "BORDERLINE" | "NOT_RECOMMENDED",
  "summary": string,
  "matchedSkills": string[],
  "missingSkills": string[],
  "actionableFeedback": string[],
  "suggestedInterviewQuestions": string[]
}
`;

    const response = await aiClient.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const rawText = response.text || "{}";
    const parsedJson = JSON.parse(rawText);
    return matchAnalysisResponseSchema.parse(parsedJson);
  }
}

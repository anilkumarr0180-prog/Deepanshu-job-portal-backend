import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import { asyncHandler } from "../middleware/async-handler";
import { AIService } from "../services/ai.service";
import { ResumeParserService } from "../services/resume-parser.service";
import { AppError } from "../utils/app-error";

/**
 * 1. POST /api/ai/generate-job-description
 */
export const generateJobDescription = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const generatedData = await AIService.generateJobDescription(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job description generated successfully.",
      data: generatedData,
    });
  }
);

/**
 * 2. POST /api/ai/parse-resume
 * Accepts { resumeUrl: string } (e.g. from Cloudinary) or { rawText: string }
 */
export const parseResume = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { resumeUrl, resumePublicId, rawText } = req.body;

    let textToParse = rawText;

    if (!textToParse && (resumeUrl || resumePublicId)) {
      textToParse = await ResumeParserService.extractTextFromUrl(
        resumeUrl || resumePublicId
      );
    }

    if (!textToParse || textToParse.trim().length === 0) {
      throw new AppError(
        "Could not extract any text from the provided resume. Please ensure the PDF contains selectable text or provide raw text directly.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const parsedData = await AIService.parseResume(textToParse);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Resume parsed successfully.",
      data: parsedData,
    });
  }
);

/**
 * 3. POST /api/ai/analyze-match
 * Accepts { candidateProfile: {...}, jobRequirements: {...} }
 */
export const analyzeMatch = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const matchResult = await AIService.analyzeMatch(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Match analysis completed successfully.",
      data: matchResult,
    });
  }
);

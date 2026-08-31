import { Response } from "express";

import { AuthRequest } from "../middleware/auth.middleware";

import cloudinaryService, {
  CloudinaryUploadType,
} from "../services/cloudinary.service";

import { USER_ROLES } from "../constants/roles";

import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

export const generateUploadSignature = (
  req: AuthRequest,
  res: Response
): void => {
  if (!req.user) {
    throw new AppError(
      "Authenticated user not found.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const { type } = req.body as {
    type: CloudinaryUploadType;
  };

  const { role } = req.user;

  // -------------------------------------------------------------------------
  // Profile image
  // Candidate + Recruiter
  // -------------------------------------------------------------------------

  if (
    type === "profile" &&
    role !== USER_ROLES.CANDIDATE &&
    role !== USER_ROLES.RECRUITER &&
    role !== USER_ROLES.ADMIN
  ) {
    throw new AppError(
      "You are not authorized to upload a profile image.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // -------------------------------------------------------------------------
  // Resume
  // Candidate only
  // -------------------------------------------------------------------------

  if (
    type === "resume" &&
    role !== USER_ROLES.CANDIDATE
  ) {
    throw new AppError(
      "Only candidates can upload resumes.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // -------------------------------------------------------------------------
  // Company logo
  // Recruiter only
  // -------------------------------------------------------------------------

  if (
    type === "company-logo" &&
    role !== USER_ROLES.RECRUITER
  ) {
    throw new AppError(
      "Only recruiters can upload company logos.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // -------------------------------------------------------------------------
  // Post media
  // Candidate, Recruiter, Admin
  // -------------------------------------------------------------------------

  if (
    type === "post" &&
    role !== USER_ROLES.CANDIDATE &&
    role !== USER_ROLES.RECRUITER &&
    role !== USER_ROLES.ADMIN
  ) {
    throw new AppError(
      "You are not authorized to upload post media.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // -------------------------------------------------------------------------
  // Chat media
  // Candidate, Recruiter, Admin
  // -------------------------------------------------------------------------

  if (
    type === "chat-media" &&
    role !== USER_ROLES.CANDIDATE &&
    role !== USER_ROLES.RECRUITER &&
    role !== USER_ROLES.ADMIN
  ) {
    throw new AppError(
      "You are not authorized to upload chat media.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // -------------------------------------------------------------------------
  // Generate Cloudinary signature
  // -------------------------------------------------------------------------

  const signature =
    cloudinaryService.generateUploadSignature(type);

  res.status(200).json({
    success: true,
    data: signature,
  });
};

export const getAuthenticatedResumeUrl = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError(
      "Authenticated user not found.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const { publicId, applicationId, candidateUserId } = req.body as {
    publicId?: string;
    applicationId?: string;
    candidateUserId?: string;
  };

  const userId = req.user.userId;
  const role = req.user.role;

  let targetPublicId = publicId;

  const CandidateProfile = (
    await import("../models/candidate-profile.model")
  ).default;
  const Application = (await import("../models/application.model")).default;
  const Job = (await import("../models/job.model")).default;

  if (role === USER_ROLES.ADMIN) {
    // Admin authorized for all resumes
    if (!targetPublicId && applicationId) {
      const app = await Application.findById(applicationId);
      targetPublicId = app?.resumePublicId || app?.resume;
    }
  } else if (role === USER_ROLES.CANDIDATE) {
    // Candidate can view their own resume
    const candidateProfile = await CandidateProfile.findOne({ userId });
    const isOwnProfileResume =
      targetPublicId && candidateProfile?.resumePublicId === targetPublicId;

    let isOwnAppResume = false;
    if (applicationId) {
      const app = await Application.findOne({
        _id: applicationId,
        applicantId: userId,
      });
      if (app) {
        isOwnAppResume = true;
        targetPublicId = targetPublicId || app.resumePublicId || app.resume;
      }
    } else if (targetPublicId) {
      const app = await Application.findOne({
        applicantId: userId,
        $or: [{ resumePublicId: targetPublicId }, { resume: targetPublicId }],
      });
      if (app) isOwnAppResume = true;
    }

    if (!isOwnProfileResume && !isOwnAppResume) {
      throw new AppError(
        "You are not authorized to view this resume.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (role === USER_ROLES.RECRUITER) {
    // Recruiter can view candidate resumes for jobs posted by recruiter or their company teammates
    const { getAuthorizedCompanyForRecruiter } = await import(
      "../services/company.service"
    );
    const auth = await getAuthorizedCompanyForRecruiter(userId);

    const jobQuery: Record<string, unknown> = {
      isDeleted: false,
    };

    if (auth?.company?._id) {
      jobQuery.$or = [
        { recruiterId: userId },
        { companyId: auth.company._id },
      ];
    } else {
      jobQuery.recruiterId = userId;
    }

    const recruiterJobs = await Job.find(jobQuery).select("_id");
    const jobIds = recruiterJobs.map((j) => j._id);

    let isAuthorized = false;

    if (applicationId) {
      const app = await Application.findOne({
        _id: applicationId,
        jobId: { $in: jobIds },
        isDeleted: false,
      });
      if (app) {
        isAuthorized = true;
        targetPublicId = targetPublicId || app.resumePublicId || app.resume;
      }
    } else if (candidateUserId) {
      const app = await Application.findOne({
        applicantId: candidateUserId,
        jobId: { $in: jobIds },
        isDeleted: false,
      });
      if (app) {
        isAuthorized = true;
        targetPublicId = targetPublicId || app.resumePublicId || app.resume;
      }
    } else if (targetPublicId) {
      const app = await Application.findOne({
        jobId: { $in: jobIds },
        isDeleted: false,
        $or: [{ resumePublicId: targetPublicId }, { resume: targetPublicId }],
      });
      if (app) isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new AppError(
        "You are not authorized to view this resume.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else {
    throw new AppError("Access denied.", HTTP_STATUS.FORBIDDEN);
  }

  if (!targetPublicId) {
    throw new AppError(
      "Cloudinary public ID or resume reference is required.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const authenticatedUrl =
    cloudinaryService.generateAuthenticatedUrl(targetPublicId);

  res.status(200).json({
    success: true,
    data: {
      url: authenticatedUrl,
      publicId: targetPublicId,
    },
  });
};
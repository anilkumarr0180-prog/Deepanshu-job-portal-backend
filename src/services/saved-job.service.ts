import SavedJob from "../models/saved-job.model";
import Job from "../models/job.model";
import { JOB_STATUS } from "../constants/job-status";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

export interface SavedJobFilters {
  page?: number | string;
  limit?: number | string;
  sort?: string;
}

/*
|--------------------------------------------------------------------------
| Save Job (Bookmark)
|--------------------------------------------------------------------------
*/
export const saveJob = async (userId: string, jobId: string) => {
  const User = (await import("../models/user.model")).default;
  const user = await User.findById(userId).select("isBlocked");

  if (user?.isBlocked) {
    throw new AppError(
      "Your account has been blocked.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (job.status !== JOB_STATUS.ACTIVE) {
    throw new AppError(
      "Cannot save an inactive or closed job.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const existingSavedJob = await SavedJob.findOne({ userId, jobId });

  if (existingSavedJob) {
    throw new AppError(
      "Job is already saved.",
      HTTP_STATUS.CONFLICT
    );
  }

  const CandidateProfile = (await import("../models/candidate-profile.model")).default;
  const candidateProfile = await CandidateProfile.findOne({ userId }).select("_id").lean();

  await SavedJob.create({
    userId,
    candidateProfileId: candidateProfile?._id,
    jobId,
  });

  return { saved: true };
};

/*
|--------------------------------------------------------------------------
| Remove Saved Job
|--------------------------------------------------------------------------
*/
export const removeSavedJob = async (userId: string, jobId: string) => {
  const savedJob = await SavedJob.findOneAndDelete({ userId, jobId });

  if (!savedJob) {
    throw new AppError(
      "Saved job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return { saved: false };
};

/*
|--------------------------------------------------------------------------
| Get My Saved Jobs (Candidate Only)
|--------------------------------------------------------------------------
*/
export const getMySavedJobs = async (
  userId: string,
  filters: SavedJobFilters = {}
) => {
  const { page, limit, skip } = getPaginationOptions(filters);

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };

  if (filters.sort === "oldest") {
    sortOptions = { createdAt: 1 };
  }

  const [savedJobs, totalSavedJobs] = await Promise.all([
    SavedJob.find({ userId })
      .populate({
        path: "jobId",
        populate: {
          path: "recruiterId",
          select: "name email",
        },
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    SavedJob.countDocuments({ userId }),
  ]);

  // Filter out orphan records where the bookmarked job was deleted
  const validSavedJobs = savedJobs.filter((item) => item.jobId !== null);

  return buildPaginatedResult(validSavedJobs, totalSavedJobs, page, limit);
};

/*
|--------------------------------------------------------------------------
| Check Saved Status
|--------------------------------------------------------------------------
*/
export const checkSavedStatus = async (userId: string, jobId: string) => {
  const exists = await SavedJob.exists({ userId, jobId });

  return { saved: !!exists };
};

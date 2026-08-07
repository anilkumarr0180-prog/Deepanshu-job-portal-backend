import { Types } from "mongoose";
import Job from "../models/job.model";
import Application from "../models/application.model";
import SavedJob from "../models/saved-job.model";

import { JOB_STATUS } from "../constants/job-status";
import { APPLICATION_STATUS } from "../constants/application-status";

/*
|--------------------------------------------------------------------------
| Recruiter Dashboard
|--------------------------------------------------------------------------
*/

export const getRecruiterDashboard = async (
  recruiterId: string
) => {
  const recruiterObjectId = new Types.ObjectId(recruiterId);

  const recruiterJobIds = await Job.find({
    recruiterId,
  }).distinct("_id");

  const [
    jobStatusCounts,
    totalApplications,
    recentJobs,
    recentApplications,
  ] = await Promise.all([
    Job.aggregate([
      { $match: { recruiterId: recruiterObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    Application.countDocuments({
      jobId: {
        $in: recruiterJobIds,
      },
    }),

    Job.find({
      recruiterId,
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .populate("recruiterId", "name email")
      .lean(),

    Application.find({
      jobId: {
        $in: recruiterJobIds,
      },
    })
      .populate({
        path: "jobId",
        select: "title company location status",
      })
      .populate({
        path: "applicantId",
        select: "name email",
      })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .lean(),
  ]);

  const statusMap = jobStatusCounts.reduce<Record<string, number>>((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const activeJobs = statusMap[JOB_STATUS.ACTIVE] || 0;
  const draftJobs = statusMap[JOB_STATUS.DRAFT] || 0;
  const closedJobs = statusMap[JOB_STATUS.CLOSED] || 0;
  const totalJobs = activeJobs + draftJobs + closedJobs;

  const validRecentApplications = recentApplications.filter(
    (app) => app.jobId !== null
  );

  return {
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    totalApplications,
    recentJobs,
    recentApplications: validRecentApplications,
  };
};

/*
|--------------------------------------------------------------------------
| Candidate Dashboard
|--------------------------------------------------------------------------
*/

export const getCandidateDashboard = async (
  candidateId: string
) => {
  const candidateObjectId = new Types.ObjectId(candidateId);

  const [
    statusCounts,
    totalSavedJobs,
    recentApplications,
  ] = await Promise.all([
    Application.aggregate([
      { $match: { applicantId: candidateObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    SavedJob.countDocuments({
      userId: candidateId,
    }),

    Application.find({
      applicantId: candidateId,
    })
      .populate({
        path: "jobId",
        select:
          "title company location salaryMin salaryMax employmentType experienceLevel status",
        populate: {
          path: "recruiterId",
          select: "name email",
        },
      })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .lean(),
  ]);

  const statusMap = statusCounts.reduce<Record<string, number>>((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const applied = statusMap[APPLICATION_STATUS.APPLIED] || 0;
  const shortlisted = statusMap[APPLICATION_STATUS.SHORTLISTED] || 0;
  const interview = statusMap[APPLICATION_STATUS.INTERVIEW] || 0;
  const hired = statusMap[APPLICATION_STATUS.HIRED] || 0;
  const rejected = statusMap[APPLICATION_STATUS.REJECTED] || 0;
  const totalApplications = applied + shortlisted + interview + hired + rejected;

  const validRecentApplications = recentApplications.filter(
    (app) => app.jobId !== null
  );

  return {
    totalApplications,
    applied,
    shortlisted,
    interview,
    hired,
    rejected,
    totalSavedJobs,
    recentApplications: validRecentApplications,
  };
};
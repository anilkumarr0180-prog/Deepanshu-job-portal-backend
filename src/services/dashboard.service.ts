import Job from "../models/job.model";
import Application from "../models/application.model";

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
  const recruiterJobIds = await Job.find({
    recruiterId,
  }).distinct("_id");

  const [
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    totalApplications,
    recentJobs,
    recentApplications,
  ] = await Promise.all([
    Job.countDocuments({
      recruiterId,
    }),

    Job.countDocuments({
      recruiterId,
      status: JOB_STATUS.ACTIVE,
    }),

    Job.countDocuments({
      recruiterId,
      status: JOB_STATUS.DRAFT,
    }),

    Job.countDocuments({
      recruiterId,
      status: JOB_STATUS.CLOSED,
    }),

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
      .populate("recruiterId", "name email"),

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
      .limit(5),
  ]);

  return {
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    totalApplications,
    recentJobs,
    recentApplications,
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
  const [
    totalApplications,
    applied,
    shortlisted,
    interview,
    hired,
    rejected,
    recentApplications,
  ] = await Promise.all([
    Application.countDocuments({
      applicantId: candidateId,
    }),

    Application.countDocuments({
      applicantId: candidateId,
      status: APPLICATION_STATUS.APPLIED,
    }),

    Application.countDocuments({
      applicantId: candidateId,
      status: APPLICATION_STATUS.SHORTLISTED,
    }),

    Application.countDocuments({
      applicantId: candidateId,
      status: APPLICATION_STATUS.INTERVIEW,
    }),

    Application.countDocuments({
      applicantId: candidateId,
      status: APPLICATION_STATUS.HIRED,
    }),

    Application.countDocuments({
      applicantId: candidateId,
      status: APPLICATION_STATUS.REJECTED,
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
      .limit(5),
  ]);

  return {
    totalApplications,
    applied,
    shortlisted,
    interview,
    hired,
    rejected,
    recentApplications,
  };
};
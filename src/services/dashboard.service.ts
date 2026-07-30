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
  const [
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    totalApplications,
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
        $in: await Job.find({
          recruiterId,
        }).distinct("_id"),
      },
    }),
  ]);

  return {
    totalJobs,
    activeJobs,
    draftJobs,
    closedJobs,
    totalApplications,
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
  ]);

  return {
    totalApplications,
    applied,
    shortlisted,
    interview,
    hired,
    rejected,
  };
};
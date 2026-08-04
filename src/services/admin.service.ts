import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";
import { USER_ROLES } from "../constants/roles";

export const getDashboardStats = async () => {
  const [
    totalUsers,
    totalRecruiters,
    totalCandidates,
    totalJobs,
    totalApplications,
    recentUsers,
    recentJobs,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: USER_ROLES.RECRUITER }),
    User.countDocuments({ role: USER_ROLES.CANDIDATE }),
    Job.countDocuments(),
    Application.countDocuments(),
    User.find()
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("-password"),
    Job.find()
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .populate("recruiterId", "name email"),
  ]);

  return {
    totalUsers,
    totalRecruiters,
    totalCandidates,
    totalJobs,
    totalApplications,
    recentUsers,
    recentJobs,
  };
};
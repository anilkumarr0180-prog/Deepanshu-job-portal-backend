import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";
import { USER_ROLES } from "../constants/roles";
import { JOB_STATUS } from "../constants/job-status";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { sanitizeUser } from "../utils/sanitize-user";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

interface UserFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  role?: string;
  isBlocked?: string;
  sort?: string;
}

interface AdminJobFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  recruiterId?: string;
  status?: string;
  sort?: string;
}

/*
|--------------------------------------------------------------------------
| Admin Dashboard Statistics
|--------------------------------------------------------------------------
*/

export const getDashboardStats = async () => {
  const now = new Date();

  // Start of Today (00:00:00.000)
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  // Start of Current Week (Monday 00:00:00.000)
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - diffToMonday
  );

  // Start of Current Month (1st 00:00:00.000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    totalRecruiters,
    totalCandidates,
    activeRecruiters,
    activeCandidates,
    blockedUsers,
    totalJobs,
    activeJobs,
    closedJobs,
    draftJobs,
    totalApplications,
    applicationsToday,
    applicationsThisWeek,
    applicationsThisMonth,
    recentUsers,
    recentJobs,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: USER_ROLES.RECRUITER }),
    User.countDocuments({ role: USER_ROLES.CANDIDATE }),
    User.countDocuments({ role: USER_ROLES.RECRUITER, isBlocked: false }),
    User.countDocuments({ role: USER_ROLES.CANDIDATE, isBlocked: false }),
    User.countDocuments({ isBlocked: true }),
    Job.countDocuments(),
    Job.countDocuments({ status: JOB_STATUS.ACTIVE }),
    Job.countDocuments({ status: JOB_STATUS.CLOSED }),
    Job.countDocuments({ status: JOB_STATUS.DRAFT }),
    Application.countDocuments(),
    Application.countDocuments({ createdAt: { $gte: startOfToday } }),
    Application.countDocuments({ createdAt: { $gte: startOfWeek } }),
    Application.countDocuments({ createdAt: { $gte: startOfMonth } }),
    User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-password")
      .lean(),
    Job.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("recruiterId", "name email")
      .lean(),
  ]);

  return {
    users: {
      totalUsers,
      totalRecruiters,
      totalCandidates,
      activeRecruiters,
      activeCandidates,
      blockedUsers,
    },
    jobs: {
      totalJobs,
      activeJobs,
      closedJobs,
      draftJobs,
    },
    applications: {
      totalApplications,
      applicationsToday,
      applicationsThisWeek,
      applicationsThisMonth,
    },
    recentUsers,
    recentJobs,
  };
};

/*
|--------------------------------------------------------------------------
| Regex Escape Helper
|--------------------------------------------------------------------------
*/
const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/*
|--------------------------------------------------------------------------
| Get All Users + Search + Filter + Pagination + Sorting
|--------------------------------------------------------------------------
*/

export const getUsers = async (filters: UserFilters = {}) => {
  const query: Record<string, unknown> = {};

  if (filters.search) {
    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      const escaped = escapeRegex(trimmedSearch);
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  if (filters.role) {
    query.role = filters.role;
  }

  if (filters.isBlocked !== undefined) {
    query.isBlocked = filters.isBlocked === "true";
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };

  switch (filters.sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "name-asc":
      sortOptions = { name: 1 };
      break;
    case "name-desc":
      sortOptions = { name: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [users, totalUsers] = await Promise.all([
    User.find(query)
      .select("-password")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return buildPaginatedResult(users, totalUsers, page, limit);
};

/*
|--------------------------------------------------------------------------
| Get User By ID
|--------------------------------------------------------------------------
*/

export const getUserById = async (userId: string) => {
  const user = await User.findById(userId).select("-password").lean();

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  return user;
};

/*
|--------------------------------------------------------------------------
| Block User
|--------------------------------------------------------------------------
*/

export const blockUser = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === USER_ROLES.ADMIN) {
    throw new AppError("Cannot block an admin user.", HTTP_STATUS.FORBIDDEN);
  }

  if (user.isBlocked) {
    throw new AppError("User is already blocked.", HTTP_STATUS.BAD_REQUEST);
  }

  user.isBlocked = true;
  await user.save();

  return sanitizeUser(user);
};

/*
|--------------------------------------------------------------------------
| Unblock User
|--------------------------------------------------------------------------
*/

export const unblockUser = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === USER_ROLES.ADMIN) {
    throw new AppError(
      "Cannot perform this action on an admin account.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (!user.isBlocked) {
    throw new AppError("User is already active.", HTTP_STATUS.BAD_REQUEST);
  }

  user.isBlocked = false;
  await user.save();

  return sanitizeUser(user);
};

/*
|--------------------------------------------------------------------------
| Get Admin Jobs + Search + Filters + Pagination + Sorting
|--------------------------------------------------------------------------
*/

export const getAdminJobs = async (filters: AdminJobFilters = {}) => {
  const query: Record<string, unknown> = {};

  if (filters.search) {
    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      const escaped = escapeRegex(trimmedSearch);
      query.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { company: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  if (filters.recruiterId) {
    query.recruiterId = filters.recruiterId;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };

  switch (filters.sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "salary-high":
      sortOptions = { salaryMax: -1 };
      break;
    case "salary-low":
      sortOptions = { salaryMin: 1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [jobs, totalJobs] = await Promise.all([
    Job.find(query)
      .populate("recruiterId", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(query),
  ]);

  return buildPaginatedResult(jobs, totalJobs, page, limit);
};

/*
|--------------------------------------------------------------------------
| Delete Admin Job
|--------------------------------------------------------------------------
*/

export const deleteAdminJob = async (jobId: string) => {
  const existingApplication = await Application.findOne({ jobId });

  if (existingApplication) {
    throw new AppError(
      "Cannot delete a job with existing applications. Close the job instead.",
      HTTP_STATUS.CONFLICT
    );
  }

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  await job.deleteOne();

  return null;
};

/*
|--------------------------------------------------------------------------
| Verify Company (Admin Only)
|--------------------------------------------------------------------------
*/
export const verifyCompany = async (companyId: string, isVerified: boolean) => {
  const Company = (await import("../models/company.model")).default;
  const company = await Company.findById(companyId);

  if (!company) {
    throw new AppError("Company not found.", HTTP_STATUS.NOT_FOUND);
  }

  company.isVerified = isVerified;
  await company.save();

  // Efficient cascade update using updateMany() if company is unverified
  if (!isVerified) {
    await Job.updateMany(
      { recruiterId: company.recruiterId, status: JOB_STATUS.ACTIVE },
      { $set: { status: JOB_STATUS.CLOSED } }
    );
  }

  return company;
};
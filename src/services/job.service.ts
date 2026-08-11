import Job from "../models/job.model";
import { Types } from "mongoose";
import { EmploymentType } from "../constants/employment-type";
import { ExperienceLevel } from "../constants/experience-level";
import {
  JOB_STATUS,
  JobStatus,
} from "../constants/job-status";
import { USER_ROLES } from "../constants/roles";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

interface CreateJobInput {
  title: string;
  description: string;
  company: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  status?: JobStatus;
  skills: string[];
}

interface UpdateJobInput {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  employmentType?: EmploymentType;
  experienceLevel?: ExperienceLevel;
  status?: JobStatus;
  skills?: string[];
}

interface JobFilters {
  search?: string;
  location?: string;
  employmentType?: EmploymentType;
  experienceLevel?: EmploymentType;
  minSalary?: string;
  maxSalary?: string;
  skills?: string;

  page?: string;
  limit?: string;
  sort?: string;
}

/*
|--------------------------------------------------------------------------
| Create Job
|--------------------------------------------------------------------------
*/

export const createJob = async (
  jobData: CreateJobInput,
  recruiterId: Types.ObjectId
) => {
  const Company = (await import("../models/company.model")).default;
  let company = await Company.findOne({ recruiterId });

  if (!company) {
    const companyName = jobData.company?.trim() || "My Company";
    company = await Company.create({
      name: companyName,
      description: `${companyName} hiring organization.`,
      recruiterId,
      isVerified: true,
    });
  } else if (!company.isVerified) {
    company.isVerified = true;
    await company.save();
  }

  const RecruiterProfile = (await import("../models/recruiter-profile.model")).default;
  const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });

  let salaryMin = Number(jobData.salaryMin) || 0;
  let salaryMax = Number(jobData.salaryMax) || 0;

  if (salaryMin > salaryMax && salaryMax > 0) {
    const temp = salaryMin;
    salaryMin = salaryMax;
    salaryMax = temp;
  } else if (salaryMax === 0 && salaryMin > 0) {
    salaryMax = salaryMin;
  }

  const job = await Job.create({
    title: jobData.title,
    description: jobData.description,
    company: company.name,
    companyId: company._id,
    location: jobData.location,
    salaryMin,
    salaryMax,
    employmentType: jobData.employmentType,
    experienceLevel: jobData.experienceLevel,
    status: jobData.status,
    skills: jobData.skills,
    recruiterId,
    postedBy: recruiterProfile?._id,
  });

  return job;
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
| Get All Jobs + Search + Filters + Pagination + Sorting
|--------------------------------------------------------------------------
*/

export const getJobs = async (
  filters: JobFilters = {}
) => {
  const query: Record<string, unknown> = {
    status: JOB_STATUS.ACTIVE,
  };

  /*
  |--------------------------------------------------------------------------
  | Search
  |--------------------------------------------------------------------------
  */

  if (filters.search) {
    const trimmed = filters.search.trim();
    if (trimmed) {
      const escaped = escapeRegex(trimmed);
      query.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { company: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Location
  |--------------------------------------------------------------------------
  */

  if (filters.location) {
    const trimmed = filters.location.trim();
    if (trimmed) {
      query.location = {
        $regex: escapeRegex(trimmed),
        $options: "i",
      };
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Employment Type
  |--------------------------------------------------------------------------
  */

  if (filters.employmentType) {
    query.employmentType = filters.employmentType;
  }

  /*
  |--------------------------------------------------------------------------
  | Experience Level
  |--------------------------------------------------------------------------
  */

  if (filters.experienceLevel) {
    query.experienceLevel = filters.experienceLevel;
  }

  /*
  |--------------------------------------------------------------------------
  | Salary Range
  |--------------------------------------------------------------------------
  */

  if (filters.minSalary || filters.maxSalary) {
    query.$and = [];

    if (filters.minSalary) {
      (query.$and as object[]).push({
        salaryMax: {
          $gte: Number(filters.minSalary),
        },
      });
    }

    if (filters.maxSalary) {
      (query.$and as object[]).push({
        salaryMin: {
          $lte: Number(filters.maxSalary),
        },
      });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Skills
  |--------------------------------------------------------------------------
  */

  if (filters.skills) {
    const skills = filters.skills
      .split(",")
      .map((skill) => skill.trim());

    query.skills = {
      $all: skills,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Pagination
  |--------------------------------------------------------------------------
  */

  const page = Number(filters.page) || 1;
  const limit = Number(filters.limit) || 10;
  const skip = (page - 1) * limit;

  /*
  |--------------------------------------------------------------------------
  | Sorting
  |--------------------------------------------------------------------------
  */

  let sortOptions: Record<string, 1 | -1> = {
    isFeatured: -1,
    createdAt: -1,
  };

  switch (filters.sort) {
    case "oldest":
      sortOptions = {
        isFeatured: -1,
        createdAt: 1,
      };
      break;

    case "salary-high":
      sortOptions = {
        isFeatured: -1,
        salaryMax: -1,
      };
      break;

    case "salary-low":
      sortOptions = {
        isFeatured: -1,
        salaryMin: 1,
      };
      break;

    default:
      sortOptions = {
        isFeatured: -1,
        createdAt: -1,
      };
  }

  /*
  |--------------------------------------------------------------------------
  | Execute Queries
  |--------------------------------------------------------------------------
  */

  const [jobs, totalJobs] = await Promise.all([
    Job.find(query)
      .populate("recruiterId", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),

    Job.countDocuments(query),
  ]);

  return {
    jobs,
    pagination: {
      page,
      limit,
      totalJobs,
      totalPages: Math.ceil(totalJobs / limit),
      hasNextPage: page * limit < totalJobs,
      hasPrevPage: page > 1,
    },
  };
};

/*
|--------------------------------------------------------------------------
| Get My Jobs
|--------------------------------------------------------------------------
*/

export const getMyJobs = async (
  recruiterId: string
) => {
  const jobs = await Job.find({
    recruiterId,
  })
    .sort({
      createdAt: -1,
    })
    .populate("recruiterId", "name email")
    .lean();

  return jobs;
};

/*
|--------------------------------------------------------------------------
| Get Job By Id
|--------------------------------------------------------------------------
*/

export const getJobById = async (
  jobId: string,
  user?: { userId: string; role: string }
) => {
  const job = await Job.findById(jobId)
    .populate("recruiterId", "name email")
    .lean();

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Restrict access for non-ACTIVE jobs (only owner recruiter or admin can view draft/closed jobs)
  if (job.status !== JOB_STATUS.ACTIVE) {
    const rawRecruiterId = (job.recruiterId as unknown as { _id?: Types.ObjectId })._id || job.recruiterId;
    const isOwner = user && user.userId === rawRecruiterId.toString();
    const isAdmin = user && user.role === USER_ROLES.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new AppError(
        "Job not found.",
        HTTP_STATUS.NOT_FOUND
      );
    }
  }

  return job;
};

/*
|--------------------------------------------------------------------------
| Update Job
|--------------------------------------------------------------------------
*/

export const updateJob = async (
  jobId: string,
  recruiterId: string,
  updateData: UpdateJobInput
) => {
  const Company = (await import("../models/company.model")).default;
  const company = await Company.findOne({ recruiterId });

  if (!company) {
    throw new AppError(
      "Create your company profile before updating jobs.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (!company.isVerified) {
    if (process.env.NODE_ENV !== "production") {
      company.isVerified = true;
      await company.save();
    } else if (updateData.status && updateData.status !== "DRAFT") {
      throw new AppError(
        "Your company must be verified before publishing active jobs.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (job.recruiterId.toString() !== recruiterId) {
    throw new AppError(
      "You are not allowed to update this job.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const effectiveSalaryMin =
    updateData.salaryMin !== undefined ? updateData.salaryMin : job.salaryMin;
  const effectiveSalaryMax =
    updateData.salaryMax !== undefined ? updateData.salaryMax : job.salaryMax;

  if (effectiveSalaryMin > effectiveSalaryMax) {
    throw new AppError(
      "Maximum salary must be greater than or equal to minimum salary.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (updateData.title !== undefined) job.title = updateData.title;
  if (updateData.description !== undefined) job.description = updateData.description;
  if (updateData.location !== undefined) job.location = updateData.location;
  if (updateData.salaryMin !== undefined) job.salaryMin = updateData.salaryMin;
  if (updateData.salaryMax !== undefined) job.salaryMax = updateData.salaryMax;
  if (updateData.employmentType !== undefined) job.employmentType = updateData.employmentType;
  if (updateData.experienceLevel !== undefined) job.experienceLevel = updateData.experienceLevel;
  if (updateData.status !== undefined) job.status = updateData.status;
  if (updateData.skills !== undefined) job.skills = updateData.skills;

  await job.save();

  return job;
};

/*
|--------------------------------------------------------------------------
| Delete Job
|--------------------------------------------------------------------------
*/

export const deleteJob = async (
  jobId: string,
  recruiterId: string
) => {
  const Application = (await import("../models/application.model")).default;
  const existingApplication = await Application.findOne({ jobId });

  if (existingApplication) {
    throw new AppError(
      "Cannot delete a job with existing applications. Close the job instead.",
      HTTP_STATUS.CONFLICT
    );
  }

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (job.recruiterId.toString() !== recruiterId) {
    throw new AppError(
      "You are not allowed to delete this job.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  await job.deleteOne();

  return job;
};
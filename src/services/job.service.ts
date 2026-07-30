import Job from "../models/job.model";
import { Types } from "mongoose";
import { EmploymentType } from "../constants/employment-type";
import { ExperienceLevel } from "../constants/experience-level";
import {
  JOB_STATUS,
  JobStatus,
} from "../constants/job-status";
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
  const job = await Job.create({
    ...jobData,
    recruiterId,
  });

  return job;
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
    query.$or = [
      {
        title: {
          $regex: filters.search,
          $options: "i",
        },
      },
      {
        company: {
          $regex: filters.search,
          $options: "i",
        },
      },
      {
        description: {
          $regex: filters.search,
          $options: "i",
        },
      },
    ];
  }

  /*
  |--------------------------------------------------------------------------
  | Location
  |--------------------------------------------------------------------------
  */

  if (filters.location) {
    query.location = {
      $regex: filters.location,
      $options: "i",
    };
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
    createdAt: -1,
  };

  switch (filters.sort) {
    case "oldest":
      sortOptions = {
        createdAt: 1,
      };
      break;

    case "salary-high":
      sortOptions = {
        salaryMax: -1,
      };
      break;

    case "salary-low":
      sortOptions = {
        salaryMin: 1,
      };
      break;

    default:
      sortOptions = {
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
      .limit(limit),

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
    .populate("recruiterId", "name email");

  return jobs;
};

/*
|--------------------------------------------------------------------------
| Get Job By Id
|--------------------------------------------------------------------------
*/

export const getJobById = async (
  jobId: string
) => {
  const job = await Job.findById(jobId).populate(
    "recruiterId",
    "name email"
  );

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
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

  Object.assign(job, updateData);

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
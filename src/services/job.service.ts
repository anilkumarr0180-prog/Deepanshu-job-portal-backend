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
import { getAuthorizedCompanyForRecruiter } from "./company.service";

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
| Helper: Resolve Skill names to Skill Document IDs
|--------------------------------------------------------------------------
*/
export const resolveSkills = async (
  skillNames: string[]
): Promise<{ skillIds: Types.ObjectId[]; skills: string[] }> => {
  const Skill = (await import("../models/skill.model")).default;
  const seenSlugs = new Set<string>();
  const uniqueItems: { name: string; slug: string }[] = [];

  for (const rawName of skillNames) {
    const name = rawName.trim();
    if (!name) continue;
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "skill";

    if (!seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      uniqueItems.push({ name, slug });
    }
  }

  const skillIds: Types.ObjectId[] = [];
  const skills: string[] = [];

  for (const { name, slug } of uniqueItems) {
    let skill = await Skill.findOne({ slug });
    if (!skill) {
      try {
        skill = await Skill.create({
          name,
          slug,
          isVerified: true,
        });
      } catch (err: any) {
        skill = await Skill.findOne({ slug });
        if (!skill) {
          skill = await Skill.findOne({ name });
        }
      }
    }
    if (skill) {
      skillIds.push(skill._id as Types.ObjectId);
      skills.push(skill.name);
    }
  }

  return { skillIds, skills };
};

/*
|--------------------------------------------------------------------------
| Create Job
|--------------------------------------------------------------------------
*/

export const createJob = async (
  jobData: CreateJobInput,
  recruiterId: Types.ObjectId
) => {
  const recruiterIdStr = recruiterId.toString();

  // Enforce company membership via CompanyRecruiter
  let auth = await getAuthorizedCompanyForRecruiter(recruiterIdStr);

  if (!auth) {
    // Auto-create company if none exists
    const { createCompany } = await import("./company.service");
    const companyName = jobData.company?.trim() || "My Company";
    await createCompany(recruiterIdStr, {
      name: companyName,
      description: `${companyName} hiring organization.`,
    });
    auth = await getAuthorizedCompanyForRecruiter(recruiterIdStr);
  }

  if (!auth) {
    throw new AppError(
      "Recruiter is not authorized for any active company profile.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const { company, recruiterProfile } = auth;

  let salaryMin = Number(jobData.salaryMin) || 0;
  let salaryMax = Number(jobData.salaryMax) || 0;

  if (salaryMin > salaryMax && salaryMax > 0) {
    const temp = salaryMin;
    salaryMin = salaryMax;
    salaryMax = temp;
  } else if (salaryMax === 0 && salaryMin > 0) {
    salaryMax = salaryMin;
  }

  // Resolve skill string array to canonical Skill document IDs
  const { skillIds, skills } = await resolveSkills(jobData.skills || []);

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
    skills,
    skillIds,
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
    isDeleted: false,
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
      .populate("recruiterId", "name email profilePicture")
      .populate("companyId", "name logo website location")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),

    Job.countDocuments(query),
  ]);

  const Company = (await import("../models/company.model")).default;
  const RecruiterProfile = (await import("../models/recruiter-profile.model")).default;

  // Batch-resolve missing logos in a single parallel query (Zero N+1)
  const missingRecruiterIds = Array.from(
    new Set(
      jobs
        .filter((job: any) => !(job.companyId?.logo || job.recruiterId?.profilePicture) && job.recruiterId?._id)
        .map((job: any) => job.recruiterId._id.toString())
    )
  );

  const companyLogoMap = new Map<string, string>();
  const profilePicMap = new Map<string, string>();

  if (missingRecruiterIds.length > 0) {
    const [companies, profiles] = await Promise.all([
      Company.find({ recruiterId: { $in: missingRecruiterIds }, isDeleted: false })
        .select("recruiterId logo")
        .lean(),
      RecruiterProfile.find({ userId: { $in: missingRecruiterIds }, isDeleted: false })
        .select("userId profilePicture")
        .lean(),
    ]);

    companies.forEach((c: any) => {
      if (c.logo && c.recruiterId) {
        companyLogoMap.set(c.recruiterId.toString(), c.logo);
      }
    });

    profiles.forEach((p: any) => {
      if (p.profilePicture && p.userId) {
        profilePicMap.set(p.userId.toString(), p.profilePicture);
      }
    });
  }

  const enrichedJobs = jobs.map((job: any) => {
    let companyLogo = job.companyId?.logo || job.recruiterId?.profilePicture || "";

    if (!companyLogo && job.recruiterId?._id) {
      const recIdStr = job.recruiterId._id.toString();
      companyLogo = companyLogoMap.get(recIdStr) || profilePicMap.get(recIdStr) || "";
    }

    return {
      ...job,
      companyLogo,
    };
  });

  return {
    jobs: enrichedJobs,
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
    isDeleted: false,
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
  const job = await Job.findOne({ _id: jobId, isDeleted: false })
    .populate("recruiterId", "name email profilePicture")
    .populate("companyId", "name logo website location description email phone address city state country")
    .lean();

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Restrict access for non-ACTIVE jobs (only owner recruiter, authorized company teammates, or admin can view draft/closed jobs)
  if (job.status !== JOB_STATUS.ACTIVE) {
    const rawRecruiterId = (job.recruiterId as unknown as { _id?: Types.ObjectId })._id || job.recruiterId;
    const isOwner = Boolean(user && user.userId === rawRecruiterId?.toString());
    const isAdmin = Boolean(user && user.role === USER_ROLES.ADMIN);

    let isCompanyTeammate = false;
    if (user && user.role === USER_ROLES.RECRUITER && !isOwner && !isAdmin) {
      const rawCompanyId = (job.companyId as unknown as { _id?: Types.ObjectId })?._id || job.companyId;
      if (rawCompanyId) {
        const auth = await getAuthorizedCompanyForRecruiter(user.userId);
        if (auth && auth.company._id.toString() === rawCompanyId.toString()) {
          isCompanyTeammate = true;
        }
      }
    }

    if (!isOwner && !isAdmin && !isCompanyTeammate) {
      throw new AppError(
        "Job not found.",
        HTTP_STATUS.NOT_FOUND
      );
    }
  }

  let companyLogo = (job.companyId as any)?.logo || (job.recruiterId as any)?.profilePicture || "";

  if (!companyLogo && job.recruiterId) {
    const rawRecruiterId = (job.recruiterId as any)._id || job.recruiterId;
    const Company = (await import("../models/company.model")).default;
    const RecruiterProfile = (await import("../models/recruiter-profile.model")).default;

    const company = await Company.findOne({ recruiterId: rawRecruiterId }).select("logo");
    if (company?.logo) {
      companyLogo = company.logo;
    } else {
      const profile = await RecruiterProfile.findOne({ userId: rawRecruiterId }).select("profilePicture");
      if (profile?.profilePicture) {
        companyLogo = profile.profilePicture;
      }
    }
  }

  return {
    ...job,
    companyLogo,
  };
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
  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);

  if (!auth) {
    throw new AppError(
      "Create your company profile before updating jobs.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const { company } = auth;

  const job = await Job.findOne({ _id: jobId, isDeleted: false });

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const isOwnerRecruiter = job.recruiterId.toString() === recruiterId;
  const isCompanyRecruiter = job.companyId && company._id.toString() === job.companyId.toString();

  if (!isOwnerRecruiter && !isCompanyRecruiter) {
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

  if (updateData.skills !== undefined) {
    const { skillIds, skills } = await resolveSkills(updateData.skills);
    job.skillIds = skillIds;
    job.skills = skills;
  }

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
  const existingApplication = await Application.findOne({ jobId, isDeleted: false });

  if (existingApplication) {
    throw new AppError(
      "Cannot delete a job with existing applications. Close the job instead.",
      HTTP_STATUS.CONFLICT
    );
  }

  const job = await Job.findOne({ _id: jobId, isDeleted: false });

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);
  const isOwnerRecruiter = job.recruiterId.toString() === recruiterId;
  const isCompanyRecruiter = auth && job.companyId && auth.company._id.toString() === job.companyId.toString();

  if (!isOwnerRecruiter && !isCompanyRecruiter) {
    throw new AppError(
      "You are not allowed to delete this job.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  job.isDeleted = true;
  job.status = JOB_STATUS.CLOSED;
  await job.save();

  return job;
};
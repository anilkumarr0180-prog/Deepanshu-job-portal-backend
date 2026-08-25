import Company, { ISocialLinks } from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import cloudinaryService from "./cloudinary.service";

import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

// ---------------------------------------------------------------------------
// Helper: Get Authorized Company for Recruiter (via CompanyRecruiter)
// ---------------------------------------------------------------------------

export const getAuthorizedCompanyForRecruiter = async (recruiterUserId: string) => {
  let profile = await RecruiterProfile.findOne({ userId: recruiterUserId });
  if (!profile) {
    profile = await RecruiterProfile.create({ userId: recruiterUserId });
  }

  const companyRecruiter = await CompanyRecruiter.findOne({
    recruiterProfileId: profile._id,
    isDeleted: false,
  });

  if (companyRecruiter) {
    const company = await Company.findOne({ _id: companyRecruiter.companyId, isDeleted: false });
    if (company) {
      return { company, recruiterProfile: profile, companyRecruiter };
    }
  }

  // Legacy fallback with auto-healing
  const legacyCompany = await Company.findOne({ recruiterId: recruiterUserId, isDeleted: false });
  if (legacyCompany) {
    let healedCR = await CompanyRecruiter.findOne({
      companyId: legacyCompany._id,
      recruiterProfileId: profile._id,
    });
    if (!healedCR) {
      healedCR = await CompanyRecruiter.create({
        companyId: legacyCompany._id,
        recruiterProfileId: profile._id,
        role: "owner",
        isPrimary: true,
        isDeleted: false,
      });
    } else if (healedCR.isDeleted) {
      healedCR.isDeleted = false;
      await healedCR.save();
    }
    if (!profile.companyId) {
      profile.companyId = legacyCompany._id;
      await profile.save();
    }
    return { company: legacyCompany, recruiterProfile: profile, companyRecruiter: healedCR };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Create Company Input
// ---------------------------------------------------------------------------

export interface CreateCompanyInput {
  name: string;
  description: string;

  // Cloudinary
  logo?: string;
  logoPublicId?: string;

  website?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  socialLinks?: ISocialLinks;
}

// ---------------------------------------------------------------------------
// Update Company Input
// ---------------------------------------------------------------------------

export interface UpdateCompanyInput {
  name?: string;
  description?: string;

  // Cloudinary
  logo?: string;
  logoPublicId?: string;

  website?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  socialLinks?: ISocialLinks;
}

// ---------------------------------------------------------------------------
// Company Filters
// ---------------------------------------------------------------------------

export interface CompanyFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  industry?: string;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Regex Escape Helper
// Prevents regex injection / ReDoS through search input.
// ---------------------------------------------------------------------------

const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ---------------------------------------------------------------------------
// Create Company Profile
// ---------------------------------------------------------------------------

export const createCompany = async (
  recruiterId: string,
  companyData: CreateCompanyInput
) => {
  const existingAuth = await getAuthorizedCompanyForRecruiter(recruiterId);

  if (existingAuth) {
    throw new AppError(
      "Recruiter already owns or belongs to a company profile.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  let recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
  if (!recruiterProfile) {
    recruiterProfile = await RecruiterProfile.create({ userId: recruiterId });
  }

  // Normalize email before storing.
  const normalizedEmail = companyData.email
    ? companyData.email.trim().toLowerCase()
    : undefined;

  const company = await Company.create({
    name: companyData.name,
    description: companyData.description,

    logo: companyData.logo,
    logoPublicId: companyData.logoPublicId,

    website: companyData.website,
    industry: companyData.industry,
    companySize: companyData.companySize,
    foundedYear: companyData.foundedYear,

    email: normalizedEmail,

    phone: companyData.phone,
    address: companyData.address,
    city: companyData.city,
    state: companyData.state,
    country: companyData.country,

    socialLinks: companyData.socialLinks,

    recruiterId,

    isVerified: false,
  });

  // Authoritative link: CompanyRecruiter
  await CompanyRecruiter.create({
    companyId: company._id,
    recruiterProfileId: recruiterProfile._id,
    role: "owner",
    isPrimary: true,
    isDeleted: false,
  });

  // Sync compatibility link
  recruiterProfile.companyId = company._id;
  await recruiterProfile.save();

  return company;
};

// ---------------------------------------------------------------------------
// Get Logged-In Recruiter's Company
// ---------------------------------------------------------------------------

export const getMyCompany = async (
  recruiterId: string
) => {
  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);

  if (!auth) {
    throw new AppError(
      "Company profile not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const { company } = auth;

  // Keep existing verification behavior.
  if (!company.isVerified) {
    company.isVerified = true;
    await company.save();
  }

  const companyDoc = await Company.findById(company._id)
    .populate("recruiterId", "name email phone")
    .lean();

  if (!companyDoc) {
    throw new AppError(
      "Company profile not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return companyDoc;
};

// ---------------------------------------------------------------------------
// Update Logged-In Recruiter's Company
// ---------------------------------------------------------------------------

export const updateMyCompany = async (
  recruiterId: string,
  updateData: UpdateCompanyInput
) => {
  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);

  if (!auth) {
    throw new AppError(
      "Company profile not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const company = auth.company;
  const oldLogoPublicId = company.logoPublicId;

  // -------------------------------------------------------------------------
  // Basic Company Information
  // -------------------------------------------------------------------------

  if (updateData.name !== undefined) {
    company.name = updateData.name;
  }

  if (updateData.description !== undefined) {
    company.description = updateData.description;
  }

  // -------------------------------------------------------------------------
  // Cloudinary Company Logo
  // -------------------------------------------------------------------------

  if (updateData.logo !== undefined) {
    company.logo = updateData.logo;
  }

  if (updateData.logoPublicId !== undefined) {
    company.logoPublicId = updateData.logoPublicId;
  }

  // -------------------------------------------------------------------------
  // Company Information
  // -------------------------------------------------------------------------

  if (updateData.website !== undefined) {
    company.website = updateData.website;
  }

  if (updateData.industry !== undefined) {
    company.industry = updateData.industry;
  }

  if (updateData.companySize !== undefined) {
    company.companySize = updateData.companySize;
  }

  if (updateData.foundedYear !== undefined) {
    company.foundedYear = updateData.foundedYear;
  }

  if (updateData.email !== undefined) {
    company.email = updateData.email
      ? updateData.email.trim().toLowerCase()
      : undefined;
  }

  if (updateData.phone !== undefined) {
    company.phone = updateData.phone;
  }

  if (updateData.address !== undefined) {
    company.address = updateData.address;
  }

  if (updateData.city !== undefined) {
    company.city = updateData.city;
  }

  if (updateData.state !== undefined) {
    company.state = updateData.state;
  }

  if (updateData.country !== undefined) {
    company.country = updateData.country;
  }

  if (updateData.socialLinks !== undefined) {
    company.socialLinks = updateData.socialLinks;
  }

  try {
    await company.save();
  } catch (error) {
    // If DB update fails after a new Cloudinary upload, attempt cleanup of new asset
    if (
      updateData.logoPublicId &&
      updateData.logoPublicId !== oldLogoPublicId
    ) {
      try {
        await cloudinaryService.deleteAsset(updateData.logoPublicId, "image");
      } catch (cleanupErr) {
        console.error(
          "Failed to cleanup new logo asset after DB error:",
          cleanupErr
        );
      }
    }
    throw error;
  }

  // After DB update succeeds, delete old Cloudinary asset if replaced/removed
  if (
    oldLogoPublicId &&
    oldLogoPublicId !== company.logoPublicId
  ) {
    try {
      await cloudinaryService.deleteAsset(oldLogoPublicId, "image");
    } catch (cleanupErr) {
      console.error(
        "Failed to delete old company logo asset from Cloudinary:",
        cleanupErr
      );
    }
  }

  return company;
};

// ---------------------------------------------------------------------------
// Get Company By ID - Public
// ---------------------------------------------------------------------------

export const getCompanyById = async (
  companyId: string
) => {
  const company = await Company.findById(companyId)
    .populate("recruiterId", "name email")
    .lean();

  if (!company) {
    throw new AppError(
      "Company not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return company;
};

// ---------------------------------------------------------------------------
// Get All Companies
// Search + Filtering + Pagination
// ---------------------------------------------------------------------------

export const getCompanies = async (
  filters: CompanyFilters = {}
) => {
  const query: Record<string, unknown> = {};

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  if (filters.search) {
    const trimmedSearch = filters.search.trim();

    if (trimmedSearch) {
      const escaped = escapeRegex(trimmedSearch);

      query.$or = [
        {
          name: {
            $regex: escaped,
            $options: "i",
          },
        },
        {
          industry: {
            $regex: escaped,
            $options: "i",
          },
        },
        {
          description: {
            $regex: escaped,
            $options: "i",
          },
        },
      ];
    }
  }

  // -------------------------------------------------------------------------
  // Industry Filter
  // -------------------------------------------------------------------------

  if (filters.industry) {
    const escapedIndustry = escapeRegex(
      filters.industry.trim()
    );

    query.industry = {
      $regex: escapedIndustry,
      $options: "i",
    };
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  const { page, limit, skip } =
    getPaginationOptions(filters);

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  let sortOptions: Record<string, 1 | -1> = {
    createdAt: -1,
  };

  switch (filters.sort) {
    case "oldest":
      sortOptions = {
        createdAt: 1,
      };
      break;

    case "name-asc":
      sortOptions = {
        name: 1,
      };
      break;

    case "name-desc":
      sortOptions = {
        name: -1,
      };
      break;

    default:
      sortOptions = {
        createdAt: -1,
      };
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  const [companies, totalCompanies] =
    await Promise.all([
      Company.find(query)
        .populate("recruiterId", "name email")
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),

      Company.countDocuments(query),
    ]);

  return buildPaginatedResult(
    companies,
    totalCompanies,
    page,
    limit
  );
};

// ---------------------------------------------------------------------------
// Delete Company - Admin Only
// ---------------------------------------------------------------------------

export const deleteCompany = async (
  companyId: string
) => {
  const company = await Company.findById(companyId);

  if (!company) {
    throw new AppError(
      "Company not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const Job =
    (await import("../models/job.model")).default;

  const { JOB_STATUS } =
    await import("../constants/job-status");

  const activeJob = await Job.findOne({
    recruiterId: company.recruiterId,
    status: JOB_STATUS.ACTIVE,
  });

  if (activeJob) {
    throw new AppError(
      "Company cannot be deleted while active jobs exist.",
      HTTP_STATUS.CONFLICT
    );
  }

  await company.deleteOne();

  return null;
};
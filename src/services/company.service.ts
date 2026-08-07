import Company, { ISocialLinks } from "../models/company.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

export interface CreateCompanyInput {
  name: string;
  description: string;
  logo?: string;
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

export interface UpdateCompanyInput {
  name?: string;
  description?: string;
  logo?: string;
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

export interface CompanyFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  industry?: string;
  sort?: string;
}

/*
|--------------------------------------------------------------------------
| Regex Escape Helper
|--------------------------------------------------------------------------
| Escapes user-supplied search strings to prevent ReDoS and regex injection.
|--------------------------------------------------------------------------
*/
const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/*
|--------------------------------------------------------------------------
| Create Company Profile
|--------------------------------------------------------------------------
*/
export const createCompany = async (
  recruiterId: string,
  companyData: CreateCompanyInput
) => {
  const existingCompany = await Company.findOne({ recruiterId });

  if (existingCompany) {
    throw new AppError(
      "Recruiter already owns a company profile.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const normalizedEmail = companyData.email
    ? companyData.email.trim().toLowerCase()
    : undefined;

  const company = await Company.create({
    name: companyData.name,
    description: companyData.description,
    logo: companyData.logo,
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

  return company;
};

/*
|--------------------------------------------------------------------------
| Get Logged-In Recruiter's Company
|--------------------------------------------------------------------------
*/
export const getMyCompany = async (recruiterId: string) => {
  const company = await Company.findOne({ recruiterId })
    .populate("recruiterId", "name email phone")
    .lean();

  if (!company) {
    throw new AppError(
      "Company profile not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return company;
};

/*
|--------------------------------------------------------------------------
| Update Logged-In Recruiter's Company
|--------------------------------------------------------------------------
*/
export const updateMyCompany = async (
  recruiterId: string,
  updateData: UpdateCompanyInput
) => {
  const company = await Company.findOne({ recruiterId });

  if (!company) {
    throw new AppError(
      "Company profile not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (updateData.name !== undefined) company.name = updateData.name;
  if (updateData.description !== undefined) company.description = updateData.description;
  if (updateData.logo !== undefined) company.logo = updateData.logo;
  if (updateData.website !== undefined) company.website = updateData.website;
  if (updateData.industry !== undefined) company.industry = updateData.industry;
  if (updateData.companySize !== undefined) company.companySize = updateData.companySize;
  if (updateData.foundedYear !== undefined) company.foundedYear = updateData.foundedYear;
  if (updateData.email !== undefined) {
    company.email = updateData.email ? updateData.email.trim().toLowerCase() : undefined;
  }
  if (updateData.phone !== undefined) company.phone = updateData.phone;
  if (updateData.address !== undefined) company.address = updateData.address;
  if (updateData.city !== undefined) company.city = updateData.city;
  if (updateData.state !== undefined) company.state = updateData.state;
  if (updateData.country !== undefined) company.country = updateData.country;
  if (updateData.socialLinks !== undefined) company.socialLinks = updateData.socialLinks;

  await company.save();

  return company;
};

/*
|--------------------------------------------------------------------------
| Get Company By ID (Public)
|--------------------------------------------------------------------------
*/
export const getCompanyById = async (companyId: string) => {
  const company = await Company.findById(companyId)
    .populate("recruiterId", "name email")
    .lean();

  if (!company) {
    throw new AppError("Company not found.", HTTP_STATUS.NOT_FOUND);
  }

  return company;
};

/*
|--------------------------------------------------------------------------
| Get All Companies + Search + Filtering + Pagination
|--------------------------------------------------------------------------
*/
export const getCompanies = async (filters: CompanyFilters = {}) => {
  const query: Record<string, unknown> = {};

  if (filters.search) {
    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      const escaped = escapeRegex(trimmedSearch);
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { industry: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  if (filters.industry) {
    const escapedIndustry = escapeRegex(filters.industry.trim());
    query.industry = { $regex: escapedIndustry, $options: "i" };
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

  const [companies, totalCompanies] = await Promise.all([
    Company.find(query)
      .populate("recruiterId", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Company.countDocuments(query),
  ]);

  return buildPaginatedResult(companies, totalCompanies, page, limit);
};

/*
|--------------------------------------------------------------------------
| Delete Company (Admin Only)
|--------------------------------------------------------------------------
*/
export const deleteCompany = async (companyId: string) => {
  const company = await Company.findById(companyId);

  if (!company) {
    throw new AppError("Company not found.", HTTP_STATUS.NOT_FOUND);
  }

  const Job = (await import("../models/job.model")).default;
  const { JOB_STATUS } = await import("../constants/job-status");

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

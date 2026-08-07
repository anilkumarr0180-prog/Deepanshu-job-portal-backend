import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as companyService from "../services/company.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Create Company Profile
|--------------------------------------------------------------------------
*/
export const createCompany = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = req.user!.userId;

    const company = await companyService.createCompany(
      recruiterId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Company profile created successfully.",
      data: company,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Logged-In Recruiter's Company
|--------------------------------------------------------------------------
*/
export const getMyCompany = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = req.user!.userId;

    const company = await companyService.getMyCompany(recruiterId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Company profile fetched successfully.",
      data: company,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Update Logged-In Recruiter's Company
|--------------------------------------------------------------------------
*/
export const updateMyCompany = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = req.user!.userId;

    const company = await companyService.updateMyCompany(
      recruiterId,
      req.body
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Company profile updated successfully.",
      data: company,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Company By ID (Public)
|--------------------------------------------------------------------------
*/
export const getCompanyById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const company = await companyService.getCompanyById(req.params.id as string);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Company details fetched successfully.",
      data: company,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get All Companies (Public / Admin)
|--------------------------------------------------------------------------
*/
export const getCompanies = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await companyService.getCompanies(req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Companies fetched successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Company (Admin Only)
|--------------------------------------------------------------------------
*/
export const deleteCompany = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await companyService.deleteCompany(req.params.id as string);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Company deleted successfully.",
      data: null,
    });
  }
);

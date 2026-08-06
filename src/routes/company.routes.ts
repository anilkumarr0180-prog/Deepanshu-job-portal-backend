import { Router } from "express";
import {
  createCompany,
  getMyCompany,
  updateMyCompany,
  getCompanyById,
  getCompanies,
  deleteCompany,
} from "../controllers/company.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";
import { USER_ROLES } from "../constants/roles";
import {
  createCompanySchema,
  updateCompanySchema,
  getCompaniesQuerySchema,
  companyIdParamSchema,
} from "../validations/company.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Create Company Profile
|--------------------------------------------------------------------------
| Route: POST /api/company
| Access: Recruiter Only
|--------------------------------------------------------------------------
*/
router.post(
  "/",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(createCompanySchema),
  createCompany
);

/*
|--------------------------------------------------------------------------
| Get Logged-In Recruiter's Company Profile
|--------------------------------------------------------------------------
| Route: GET /api/company/me
| Access: Recruiter Only
|--------------------------------------------------------------------------
*/
router.get(
  "/me",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  getMyCompany
);

/*
|--------------------------------------------------------------------------
| Update Logged-In Recruiter's Company Profile
|--------------------------------------------------------------------------
| Route: PUT /api/company/me
| Access: Recruiter Only
|--------------------------------------------------------------------------
*/
router.put(
  "/me",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(updateCompanySchema),
  updateMyCompany
);

/*
|--------------------------------------------------------------------------
| Get All Companies (Public / Admin)
|--------------------------------------------------------------------------
| Route: GET /api/company
| Access: Public
|--------------------------------------------------------------------------
*/
router.get(
  "/",
  validate(getCompaniesQuerySchema),
  getCompanies
);

/*
|--------------------------------------------------------------------------
| Get Company By ID (Public)
|--------------------------------------------------------------------------
| Route: GET /api/company/:id
| Access: Public
|--------------------------------------------------------------------------
*/
router.get(
  "/:id",
  validate(companyIdParamSchema),
  getCompanyById
);

/*
|--------------------------------------------------------------------------
| Delete Company Profile
|--------------------------------------------------------------------------
| Route: DELETE /api/company/:id
| Access: Admin Only
|--------------------------------------------------------------------------
*/
router.delete(
  "/:id",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(companyIdParamSchema),
  deleteCompany
);

export default router;

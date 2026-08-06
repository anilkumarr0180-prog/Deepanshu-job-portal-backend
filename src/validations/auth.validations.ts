import { z } from "zod";
import { USER_ROLES } from "../constants/roles";

/*
|--------------------------------------------------------------------------
| Register Validation Schema
|--------------------------------------------------------------------------
| This schema validates incoming registration requests before they
| reach the controller.
|
| Route:
| POST /api/auth/register
|--------------------------------------------------------------------------
*/

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(100, "Name cannot exceed 100 characters."),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address."),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(100, "Password cannot exceed 100 characters.")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/,
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character."
      ),

    role: z
      .enum([USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER])
      .optional(),

    phone: z
      .string()
      .trim()
      .min(10, "Phone number must be at least 10 digits.")
      .max(15, "Phone number cannot exceed 15 digits.")
      .optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Login Validation Schema
|--------------------------------------------------------------------------
| This schema validates incoming login requests before they
| reach the controller.
|
| Route:
| POST /api/auth/login
|--------------------------------------------------------------------------
*/
export const loginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address."),

    password: z
      .string()
      .min(1, "Password is required."),
  }),
});
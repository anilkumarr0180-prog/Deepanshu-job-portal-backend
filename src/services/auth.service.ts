import User from "../models/user.model";
import { USER_ROLES } from "../constants/roles";
import { sanitizeUser } from "../utils/sanitize-user";
import { hashPassword, comparePassword } from "../utils/password";
import { generateAccessToken } from "../utils/jwt";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

/*
|
| Register User
|
| Business logic belongs here.
|
| Current implementation:
| - Checks duplicate email
| - Hashes password
| - Creates user in database
| - Returns sanitized user response
|
| We will add:
| - JWT generation
| - More business rules
|--------------------------------------------------------------------------
*/

interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  role: typeof USER_ROLES.CANDIDATE | typeof USER_ROLES.RECRUITER;
  phone?: string;
}
interface LoginUserInput {
  email: string;
  password: string;
}

export const register = async (userData: RegisterUserInput) => {
  // Check if the email is already registered
  const existingUser = await User.findOne({
    email: userData.email,
  });

  if (existingUser) {
    throw new AppError("Email already registered.", HTTP_STATUS.CONFLICT);
  }

  // Hash the password before storing it
  const hashedPassword = await hashPassword(userData.password);

  // Create the user with the hashed password
  const user = await User.create({
    ...userData,
    password: hashedPassword,
  });

  // Return a safe response without sensitive fields
  return sanitizeUser(user);
};

export const login = async (
  userData: LoginUserInput
) => {
  // Find user and include password
  const user = await User.findOne({
    email: userData.email,
  }).select("+password");

  // Invalid credentials
  if (!user) {
    throw new AppError(
      "Invalid email or password.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  // Blocked account
  if (user.isBlocked) {
    throw new AppError(
      "Your account has been blocked.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Verify password
  const isPasswordValid = await comparePassword(
    userData.password,
    user.password
  );

  if (!isPasswordValid) {
    throw new AppError(
      "Invalid email or password.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  // Generate access token
  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
  });

  return {
    user: sanitizeUser(user),
    accessToken,
  };
};

export const getCurrentUser = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      "User not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return sanitizeUser(user);
};
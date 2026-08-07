import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import { USER_ROLES } from "../constants/roles";
import { sanitizeUser } from "../utils/sanitize-user";
import { hashPassword, comparePassword } from "../utils/password";
import { generateAccessToken } from "../utils/jwt";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

/*
|--------------------------------------------------------------------------
| Register User
|--------------------------------------------------------------------------
| Business logic belongs here.
|
| Current implementation:
| - Checks duplicate email
| - Hashes password
| - Creates user in database
| - Automatically creates CandidateProfile / RecruiterProfile
| - Transactional rollback if profile creation fails
| - Returns sanitized user response
|--------------------------------------------------------------------------
*/

interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  role?: typeof USER_ROLES.CANDIDATE | typeof USER_ROLES.RECRUITER;
  phone?: string;
  profilePicture?: string;
  resumeUrl?: string;
}

interface LoginUserInput {
  email: string;
  password: string;
}

export const register = async (userData: RegisterUserInput) => {
  // Prevent admin registration via public endpoint
  if (userData.role && (userData.role as string) === USER_ROLES.ADMIN) {
    throw new AppError(
      "Admin registration is not allowed.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const normalizedEmail = userData.email.trim().toLowerCase();

  // Check if the email is already registered
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    throw new AppError("Email already registered.", HTTP_STATUS.CONFLICT);
  }

  // Hash the password before storing it
  const hashedPassword = await hashPassword(userData.password);

  // Create the user with the hashed password and normalized email
  const user = await User.create({
    ...userData,
    email: normalizedEmail,
    password: hashedPassword,
  });

  // Rollback Safety: Automatically create empty associated profile linked via userId.
  // Profile fields are NOT copied here to prevent establishing duplicate sources of truth.
  // User model remains the single source of truth for existing user attributes.
  // Explicit try/catch rollback (findByIdAndDelete) is used instead of MongoDB multi-document transactions
  // to ensure compatibility across standalone MongoDB instances and replica sets without requiring replica set configuration.
  try {
    const role = user.role || USER_ROLES.CANDIDATE;

    if (role === USER_ROLES.RECRUITER) {
      await RecruiterProfile.create({
        userId: user._id,
      });
    } else {
      await CandidateProfile.create({
        userId: user._id,
      });
    }
  } catch (profileError) {
    // Explicit rollback to maintain atomicity and prevent orphaned User records
    await User.findByIdAndDelete(user._id);
    throw profileError;
  }

  // Return a safe response without sensitive fields
  return sanitizeUser(user);
};

export const login = async (
  userData: LoginUserInput
) => {
  const normalizedEmail = userData.email.trim().toLowerCase();

  // Find user and include password
  const user = await User.findOne({
    email: normalizedEmail,
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
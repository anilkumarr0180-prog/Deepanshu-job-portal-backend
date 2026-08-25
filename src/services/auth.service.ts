import { OAuth2Client } from "google-auth-library";
import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import { USER_ROLES } from "../constants/roles";
import { sanitizeUser } from "../utils/sanitize-user";
import { hashPassword, comparePassword } from "../utils/password";
import { generateAccessToken } from "../utils/jwt";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

interface GoogleAuthInput {
  credential?: string;
  token?: string;
  role?: typeof USER_ROLES.CANDIDATE | typeof USER_ROLES.RECRUITER;
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
  if (!user.password) {
    throw new AppError(
      "This account was registered using Google Login. Please sign in with Google.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

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

export const googleAuth = async (input: GoogleAuthInput) => {
  const idToken = input.credential || input.token;
  if (!idToken) {
    throw new AppError(
      "Google authentication token is required.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  let payload: { sub: string; email?: string; name?: string; picture?: string } | undefined;

  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId && !googleClientId.includes("your-google-client-id") ? googleClientId : undefined,
    });
    const googlePayload = ticket.getPayload();
    if (googlePayload) {
      payload = {
        sub: googlePayload.sub,
        email: googlePayload.email,
        name: googlePayload.name,
        picture: googlePayload.picture,
      };
    }
  } catch (error) {
    // Fallback: If verifyIdToken fails (e.g. token is an OAuth2 access_token), query Google UserInfo API
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${idToken}`
      );
      if (response.ok) {
        const userInfo = (await response.json()) as any;
        if (userInfo && userInfo.sub && userInfo.email) {
          payload = {
            sub: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
          };
        }
      }
    } catch (fallbackError) {
      // Ignored
    }
  }

  if (!payload || !payload.email) {
    throw new AppError(
      "Failed to verify Google authentication token.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const { sub: googleId, email, name, picture } = payload;
  const normalizedEmail = email.trim().toLowerCase();

  // Search existing user by googleId or email
  let user = await User.findOne({
    $or: [{ googleId }, { email: normalizedEmail }],
  });

  let isNewUser = false;
  let isAccountLinked = false;

  if (user) {
    if (user.isBlocked) {
      throw new AppError(
        "Your account has been blocked.",
        HTTP_STATUS.FORBIDDEN
      );
    }

    let isModified = false;
    if (!user.googleId) {
      user.googleId = googleId;
      isModified = true;
      isAccountLinked = true;
    }
    if (!user.profilePicture && picture) {
      user.profilePicture = picture;
      isModified = true;
    }
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      isModified = true;
    }

    if (isModified) {
      await user.save();
    }
  } else {
    isNewUser = true;
    // Role selection: default to CANDIDATE if not specified or invalid
    const requestedRole =
      input.role && [USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER].includes(input.role as any)
        ? input.role
        : USER_ROLES.CANDIDATE;

    user = await User.create({
      name: name || "Google User",
      email: normalizedEmail,
      googleId,
      authProvider: "google",
      profilePicture: picture,
      role: requestedRole,
      isEmailVerified: true,
    });

    try {
      if (user.role === USER_ROLES.RECRUITER) {
        await RecruiterProfile.create({
          userId: user._id,
        });
      } else {
        await CandidateProfile.create({
          userId: user._id,
        });
      }
    } catch (profileError) {
      await User.findByIdAndDelete(user._id);
      throw profileError;
    }
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
  });

  return {
    user: sanitizeUser(user),
    accessToken,
    isNewUser,
    isAccountLinked,
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

  const safeUser = sanitizeUser(user);

  if (!safeUser.profilePicture) {
    if (user.role === USER_ROLES.RECRUITER) {
      const recProfile = await RecruiterProfile.findOne({ userId: user._id });
      if (recProfile?.profilePicture) {
        safeUser.profilePicture = recProfile.profilePicture;
      }
    } else if (user.role === USER_ROLES.CANDIDATE) {
      const candProfile = await CandidateProfile.findOne({ userId: user._id });
      if (candProfile?.profilePicture) {
        safeUser.profilePicture = candProfile.profilePicture;
      }
    }
  }

  return safeUser;
};

export const changePassword = async (
  userId: string,
  input: { currentPassword?: string; newPassword?: string }
) => {
  const user = await User.findById(userId).select("+password");

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (user.authProvider === "google" && !user.password) {
    throw new AppError(
      "This account was authenticated with Google OAuth. Passwords cannot be changed here.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!input.currentPassword || !input.newPassword) {
    throw new AppError("Current password and new password are required.", HTTP_STATUS.BAD_REQUEST);
  }

  const isPasswordValid = await comparePassword(
    input.currentPassword,
    user.password!
  );

  if (!isPasswordValid) {
    throw new AppError("Incorrect current password.", HTTP_STATUS.BAD_REQUEST);
  }

  if (input.currentPassword === input.newPassword) {
    throw new AppError("New password must be different from current password.", HTTP_STATUS.BAD_REQUEST);
  }

  const hashedPassword = await hashPassword(input.newPassword);
  user.password = hashedPassword;
  await user.save();

  return { message: "Password updated successfully." };
};

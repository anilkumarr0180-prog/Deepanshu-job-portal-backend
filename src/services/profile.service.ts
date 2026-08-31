import User from "../models/user.model";
import CandidateProfile, {
  ICandidateExperience,
  ICandidateEducation,
  ICandidateSocialLinks,
  ICandidateJobPreferences,
} from "../models/candidate-profile.model";
import RecruiterProfile, {
  IRecruiterSocialLinks,
} from "../models/recruiter-profile.model";
import { USER_ROLES } from "../constants/roles";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { sanitizeUser } from "../utils/sanitize-user";
import { Types } from "mongoose";
import cloudinaryService from "./cloudinary.service";
import { resolveSkills } from "./job.service";
import { EmploymentType } from "../constants/employment-type";
import { ExperienceLevel } from "../constants/experience-level";

interface UpdateJobPreferencesInput {
  preferredRoles?: string[];
  preferredSkills?: string[];
  preferredSkillIds?: string[];
  preferredLocations?: string[];
  workMode?: "onsite" | "remote" | "hybrid" | null | "";
  employmentType?: EmploymentType | null | "";
  experienceLevel?: ExperienceLevel | null | "";
  minSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: "yearly" | "monthly" | "hourly" | null | "";
}

interface UpdateProfileInput {
  name?: string;
  phone?: string;
  profilePicture?: string;
  profilePicturePublicId?: string;
  resumeUrl?: string;
  resumePublicId?: string;
  resumeFileName?: string;
  resumeUploadedAt?: Date;
  headline?: string;
  bio?: string;
  skills?: string[];
  experience?: ICandidateExperience[];
  education?: ICandidateEducation[];
  city?: string;
  state?: string;
  country?: string;
  socialLinks?: ICandidateSocialLinks & IRecruiterSocialLinks;
  designation?: string;
  department?: string;
  companyId?: string;
  jobPreferences?: UpdateJobPreferencesInput;
}

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  const safeUser = sanitizeUser(user);

  if (user.role === USER_ROLES.ADMIN) {
    return {
      ...safeUser,
      phone: user.phone || "",
      profilePicture: user.profilePicture || "",
    };
  }

  if (user.role === USER_ROLES.RECRUITER) {
    let profile = await RecruiterProfile.findOne({ userId: user._id }).lean();

    // Automatic creation for legacy users missing a profile record
    if (!profile) {
      const created = await RecruiterProfile.create({ userId: user._id });
      profile = created.toObject();
    }

    return {
      ...safeUser,
      phone: profile.phone ?? safeUser.phone,
      profilePicture: profile.profilePicture ?? safeUser.profilePicture,
      profilePicturePublicId: profile.profilePicturePublicId,
      designation: profile.designation,
      department: profile.department,
      companyId: profile.companyId,
      bio: profile.bio,
      socialLinks: profile.socialLinks,
    };
  }

  // Default to Candidate role
  let profile = await CandidateProfile.findOne({ userId: user._id }).lean();

  // Automatic creation for legacy users missing a profile record
  if (!profile) {
    const created = await CandidateProfile.create({ userId: user._id });
    profile = created.toObject();
  }

  return {
    ...safeUser,
    phone: profile.phone ?? safeUser.phone,
    profilePicture: profile.profilePicture ?? safeUser.profilePicture,
    profilePicturePublicId: profile.profilePicturePublicId,
    resumeUrl: profile.resumeUrl ?? safeUser.resumeUrl,
    resumePublicId: profile.resumePublicId,
    resumeFileName: profile.resumeFileName,
    resumeUploadedAt: profile.resumeUploadedAt,
    headline: profile.headline,
    bio: profile.bio,
    skills: profile.skills || [],
    experience: profile.experience || [],
    education: profile.education || [],
    city: profile.city,
    state: profile.state,
    country: profile.country,
    socialLinks: profile.socialLinks,
    jobPreferences: profile.jobPreferences
      ? {
          preferredRoles: profile.jobPreferences.preferredRoles || [],
          preferredSkills: profile.jobPreferences.preferredSkills || [],
          preferredSkillIds: profile.jobPreferences.preferredSkillIds || [],
          preferredLocations: profile.jobPreferences.preferredLocations || [],
          workMode: profile.jobPreferences.workMode || null,
          employmentType: profile.jobPreferences.employmentType || null,
          experienceLevel: profile.jobPreferences.experienceLevel || null,
          minSalary: profile.jobPreferences.minSalary ?? null,
          currency: profile.jobPreferences.currency || "USD",
          salaryPeriod: profile.jobPreferences.salaryPeriod || "yearly",
        }
      : {
          preferredRoles: [],
          preferredSkills: [],
          preferredSkillIds: [],
          preferredLocations: [],
          workMode: null,
          employmentType: null,
          experienceLevel: null,
          minSalary: null,
          currency: "USD",
          salaryPeriod: "yearly",
        },
  };
};

export const updateProfile = async (
  userId: string,
  profileData: UpdateProfileInput
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Account identity field update (remains on User)
  if (profileData.name !== undefined) {
    user.name = profileData.name;
  }
  if (profileData.phone !== undefined && user.role === USER_ROLES.ADMIN) {
    user.phone = profileData.phone;
  }
  if (profileData.profilePicture !== undefined && user.role === USER_ROLES.ADMIN) {
    user.profilePicture = profileData.profilePicture;
  }
  await user.save();

  if (user.role === USER_ROLES.ADMIN) {
    return getProfile(userId);
  }

  if (user.role === USER_ROLES.RECRUITER) {
    let profile = await RecruiterProfile.findOne({ userId: user._id });

    // Automatic creation for legacy users missing a profile record
    if (!profile) {
      profile = await RecruiterProfile.create({ userId: user._id });
    }

    const oldPicPublicId = profile.profilePicturePublicId;

    if (profileData.phone !== undefined) profile.phone = profileData.phone;
    if (profileData.profilePicture !== undefined)
      profile.profilePicture = profileData.profilePicture;
    if (profileData.profilePicturePublicId !== undefined)
      profile.profilePicturePublicId = profileData.profilePicturePublicId;
    if (profileData.designation !== undefined)
      profile.designation = profileData.designation;
    if (profileData.department !== undefined)
      profile.department = profileData.department;
    if (profileData.bio !== undefined) profile.bio = profileData.bio;
    if (profileData.socialLinks !== undefined)
      profile.socialLinks = profileData.socialLinks;
    if (profileData.companyId !== undefined)
      profile.companyId = new Types.ObjectId(profileData.companyId);

    try {
      await profile.save();

      const userUpdates: Record<string, unknown> = {};
      if (profileData.name !== undefined) userUpdates.name = profileData.name;
      if (profileData.profilePicture !== undefined)
        userUpdates.profilePicture = profileData.profilePicture;
      if (Object.keys(userUpdates).length > 0) {
        await User.findByIdAndUpdate(user._id, userUpdates);
      }
    } catch (err) {
      if (
        profileData.profilePicturePublicId &&
        profileData.profilePicturePublicId !== oldPicPublicId
      ) {
        try {
          await cloudinaryService.deleteAsset(
            profileData.profilePicturePublicId,
            "image"
          );
        } catch (cleanupErr) {
          console.error(
            "Failed to cleanup new profile picture asset on DB error:",
            cleanupErr
          );
        }
      }
      throw err;
    }

    if (
      oldPicPublicId &&
      oldPicPublicId !== profile.profilePicturePublicId
    ) {
      try {
        await cloudinaryService.deleteAsset(oldPicPublicId, "image");
      } catch (cleanupErr) {
        console.error(
          "Failed to delete old recruiter profile picture asset:",
          cleanupErr
        );
      }
    }
  } else {
    let profile = await CandidateProfile.findOne({ userId: user._id });

    // Automatic creation for legacy users missing a profile record
    if (!profile) {
      profile = await CandidateProfile.create({ userId: user._id });
    }

    const oldPicPublicId = profile.profilePicturePublicId;
    const oldResumePublicId = profile.resumePublicId;

    if (profileData.phone !== undefined) profile.phone = profileData.phone;
    if (profileData.profilePicture !== undefined)
      profile.profilePicture = profileData.profilePicture;
    if (profileData.profilePicturePublicId !== undefined)
      profile.profilePicturePublicId = profileData.profilePicturePublicId;

    if (profileData.resumeUrl !== undefined) {
      profile.resumeUrl = profileData.resumeUrl;
      if (profileData.resumeUploadedAt === undefined && profileData.resumeUrl) {
        profile.resumeUploadedAt = new Date();
      }
    }
    if (profileData.resumePublicId !== undefined)
      profile.resumePublicId = profileData.resumePublicId;
    if (profileData.resumeFileName !== undefined)
      profile.resumeFileName = profileData.resumeFileName;
    if (profileData.resumeUploadedAt !== undefined)
      profile.resumeUploadedAt = profileData.resumeUploadedAt;

    if (profileData.headline !== undefined)
      profile.headline = profileData.headline;
    if (profileData.bio !== undefined) profile.bio = profileData.bio;
    if (profileData.skills !== undefined) profile.skills = profileData.skills;
    if (profileData.experience !== undefined)
      profile.experience = profileData.experience;
    if (profileData.education !== undefined)
      profile.education = profileData.education;
    if (profileData.city !== undefined) profile.city = profileData.city;
    if (profileData.state !== undefined) profile.state = profileData.state;
    if (profileData.country !== undefined)
      profile.country = profileData.country;
    if (profileData.socialLinks !== undefined)
      profile.socialLinks = profileData.socialLinks;

    if (profileData.jobPreferences !== undefined) {
      const existingPrefs = profile.jobPreferences || {
        preferredRoles: [],
        preferredSkills: [],
        preferredSkillIds: [],
        preferredLocations: [],
        workMode: null,
        employmentType: null,
        experienceLevel: null,
        minSalary: null,
        currency: "USD",
        salaryPeriod: "yearly",
      };

      const rawPrefs = profileData.jobPreferences;
      const updatedPrefs: any = {
        preferredRoles: existingPrefs.preferredRoles || [],
        preferredSkills: existingPrefs.preferredSkills || [],
        preferredSkillIds: existingPrefs.preferredSkillIds || [],
        preferredLocations: existingPrefs.preferredLocations || [],
        workMode: existingPrefs.workMode ?? null,
        employmentType: existingPrefs.employmentType ?? null,
        experienceLevel: existingPrefs.experienceLevel ?? null,
        minSalary: existingPrefs.minSalary ?? null,
        currency: existingPrefs.currency || "USD",
        salaryPeriod: existingPrefs.salaryPeriod || "yearly",
      };

      if (rawPrefs.preferredRoles !== undefined) {
        updatedPrefs.preferredRoles = Array.from(
          new Set(rawPrefs.preferredRoles.map((r) => r.trim()).filter(Boolean))
        );
      }

      if (rawPrefs.preferredLocations !== undefined) {
        updatedPrefs.preferredLocations = Array.from(
          new Set(rawPrefs.preferredLocations.map((l) => l.trim()).filter(Boolean))
        );
      }

      if (rawPrefs.preferredSkills !== undefined) {
        const { skillIds, skills } = await resolveSkills(rawPrefs.preferredSkills);
        updatedPrefs.preferredSkills = skills;
        updatedPrefs.preferredSkillIds = skillIds;
      } else if (rawPrefs.preferredSkillIds !== undefined) {
        updatedPrefs.preferredSkillIds = rawPrefs.preferredSkillIds.map(
          (id) => new Types.ObjectId(id)
        );
      }

      if (rawPrefs.workMode !== undefined) {
        updatedPrefs.workMode = rawPrefs.workMode === "" ? null : rawPrefs.workMode;
      }

      if (rawPrefs.employmentType !== undefined) {
        updatedPrefs.employmentType = rawPrefs.employmentType === "" ? null : rawPrefs.employmentType;
      }

      if (rawPrefs.experienceLevel !== undefined) {
        updatedPrefs.experienceLevel = rawPrefs.experienceLevel === "" ? null : rawPrefs.experienceLevel;
      }

      if (rawPrefs.minSalary !== undefined) {
        updatedPrefs.minSalary =
          rawPrefs.minSalary === null || rawPrefs.minSalary === undefined
            ? null
            : Number(rawPrefs.minSalary);
      }

      if (rawPrefs.currency !== undefined) {
        updatedPrefs.currency = rawPrefs.currency
          ? rawPrefs.currency.trim().toUpperCase()
          : "USD";
      }

      if (rawPrefs.salaryPeriod !== undefined) {
        updatedPrefs.salaryPeriod =
          rawPrefs.salaryPeriod === "" ? null : rawPrefs.salaryPeriod;
      }

      profile.jobPreferences = updatedPrefs;
    }

    try {
      await profile.save();

      const userUpdates: Record<string, unknown> = {};
      if (profileData.name !== undefined) userUpdates.name = profileData.name;
      if (profileData.profilePicture !== undefined)
        userUpdates.profilePicture = profileData.profilePicture;
      if (Object.keys(userUpdates).length > 0) {
        await User.findByIdAndUpdate(user._id, userUpdates);
      }
    } catch (err) {
      if (
        profileData.profilePicturePublicId &&
        profileData.profilePicturePublicId !== oldPicPublicId
      ) {
        try {
          await cloudinaryService.deleteAsset(
            profileData.profilePicturePublicId,
            "image"
          );
        } catch (cleanupErr) {
          console.error(
            "Failed to cleanup new profile picture asset on DB error:",
            cleanupErr
          );
        }
      }
      if (
        profileData.resumePublicId &&
        profileData.resumePublicId !== oldResumePublicId
      ) {
        try {
          await cloudinaryService.deleteAsset(
            profileData.resumePublicId,
            "raw"
          );
        } catch (cleanupErr) {
          console.error(
            "Failed to cleanup new resume asset on DB error:",
            cleanupErr
          );
        }
      }
      throw err;
    }

    if (
      oldPicPublicId &&
      oldPicPublicId !== profile.profilePicturePublicId
    ) {
      try {
        await cloudinaryService.deleteAsset(oldPicPublicId, "image");
      } catch (cleanupErr) {
        console.error(
          "Failed to delete old candidate profile picture asset:",
          cleanupErr
        );
      }
    }

    if (
      oldResumePublicId &&
      oldResumePublicId !== profile.resumePublicId
    ) {
      try {
        await cloudinaryService.deleteAsset(oldResumePublicId, "raw");
      } catch (cleanupErr) {
        console.error(
          "Failed to delete old candidate resume asset:",
          cleanupErr
        );
      }
    }
  }

  return getProfile(userId);
};

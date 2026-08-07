import User from "../models/user.model";
import CandidateProfile, {
  ICandidateExperience,
  ICandidateEducation,
  ICandidateSocialLinks,
} from "../models/candidate-profile.model";
import RecruiterProfile, {
  IRecruiterSocialLinks,
} from "../models/recruiter-profile.model";
import { USER_ROLES } from "../constants/roles";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { sanitizeUser } from "../utils/sanitize-user";
import { Types } from "mongoose";

interface UpdateProfileInput {
  name?: string;
  phone?: string;
  profilePicture?: string;
  resumeUrl?: string;
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
}

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  const safeUser = sanitizeUser(user);

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
    resumeUrl: profile.resumeUrl ?? safeUser.resumeUrl,
    headline: profile.headline,
    bio: profile.bio,
    skills: profile.skills || [],
    experience: profile.experience || [],
    education: profile.education || [],
    city: profile.city,
    state: profile.state,
    country: profile.country,
    socialLinks: profile.socialLinks,
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
    await user.save();
  }

  if (user.role === USER_ROLES.RECRUITER) {
    let profile = await RecruiterProfile.findOne({ userId: user._id });

    // Automatic creation for legacy users missing a profile record
    if (!profile) {
      profile = await RecruiterProfile.create({ userId: user._id });
    }

    if (profileData.phone !== undefined) profile.phone = profileData.phone;
    if (profileData.profilePicture !== undefined)
      profile.profilePicture = profileData.profilePicture;
    if (profileData.designation !== undefined)
      profile.designation = profileData.designation;
    if (profileData.department !== undefined)
      profile.department = profileData.department;
    if (profileData.bio !== undefined) profile.bio = profileData.bio;
    if (profileData.socialLinks !== undefined)
      profile.socialLinks = profileData.socialLinks;
    if (profileData.companyId !== undefined)
      profile.companyId = new Types.ObjectId(profileData.companyId);

    await profile.save();
  } else {
    let profile = await CandidateProfile.findOne({ userId: user._id });

    // Automatic creation for legacy users missing a profile record
    if (!profile) {
      profile = await CandidateProfile.create({ userId: user._id });
    }

    if (profileData.phone !== undefined) profile.phone = profileData.phone;
    if (profileData.profilePicture !== undefined)
      profile.profilePicture = profileData.profilePicture;
    if (profileData.resumeUrl !== undefined)
      profile.resumeUrl = profileData.resumeUrl;
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

    await profile.save();
  }

  return getProfile(userId);
};
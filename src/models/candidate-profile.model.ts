import { Schema, model, Document, Types } from "mongoose";
import {
  EMPLOYMENT_TYPE,
  EmploymentType,
} from "../constants/employment-type";
import {
  EXPERIENCE_LEVEL,
  ExperienceLevel,
} from "../constants/experience-level";

export interface ICandidateSocialLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
}

export interface ICandidateExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
  current?: boolean;
  description?: string;
}

export interface ICandidateEducation {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate?: Date;
  endDate?: Date;
  current?: boolean;
}

export interface ICandidateJobPreferences {
  preferredRoles: string[];
  preferredSkills: string[];
  preferredSkillIds: Types.ObjectId[];
  preferredLocations: string[];
  workMode?: "onsite" | "remote" | "hybrid" | null;
  employmentType?: EmploymentType | null;
  experienceLevel?: ExperienceLevel | null;
  minSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: "yearly" | "monthly" | "hourly" | null;
}

export interface ICandidateProfile extends Document {
  userId: Types.ObjectId;
  headline?: string;
  bio?: string;
  phone?: string;
  profilePicture?: string;
  profilePicturePublicId?: string;
  resumeUrl?: string;
  resumePublicId?: string;
  resumeFileName?: string;
  resumeUploadedAt?: Date;
  skills: string[];
  experience: ICandidateExperience[];
  education: ICandidateEducation[];
  city?: string;
  state?: string;
  country?: string;
  socialLinks?: ICandidateSocialLinks;
  jobPreferences?: ICandidateJobPreferences;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const candidateProfileSchema = new Schema<ICandidateProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    headline: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    profilePicture: {
      type: String,
      trim: true,
    },
    profilePicturePublicId: {
      type: String,
      trim: true,
    },
    resumeUrl: {
      type: String,
      trim: true,
    },
    resumePublicId: {
      type: String,
      trim: true,
    },
    resumeFileName: {
      type: String,
      trim: true,
    },
    resumeUploadedAt: {
      type: Date,
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    experience: [
      {
        title: { type: String, required: true, trim: true },
        company: { type: String, required: true, trim: true },
        location: { type: String, trim: true },
        startDate: { type: Date },
        endDate: {
          type: Date,
          validate: {
            validator: function (this: any, value: Date) {
              if (!value || !this.startDate) return true;
              return value >= this.startDate;
            },
            message: "Experience end date cannot be earlier than start date",
          },
        },
        current: { type: Boolean, default: false },
        description: { type: String, trim: true },
      },
    ],
    education: [
      {
        institution: { type: String, required: true, trim: true },
        degree: { type: String, required: true, trim: true },
        fieldOfStudy: { type: String, trim: true },
        startDate: { type: Date },
        endDate: {
          type: Date,
          validate: {
            validator: function (this: any, value: Date) {
              if (!value || !this.startDate) return true;
              return value >= this.startDate;
            },
            message: "Education end date cannot be earlier than start date",
          },
        },
        current: { type: Boolean, default: false },
      },
    ],
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    socialLinks: {
      linkedin: { type: String, trim: true },
      github: { type: String, trim: true },
      portfolio: { type: String, trim: true },
      twitter: { type: String, trim: true },
    },
    jobPreferences: {
      preferredRoles: [{ type: String, trim: true }],
      preferredSkills: [{ type: String, trim: true }],
      preferredSkillIds: [{ type: Schema.Types.ObjectId, ref: "Skill" }],
      preferredLocations: [{ type: String, trim: true }],
      workMode: {
        type: String,
        enum: ["onsite", "remote", "hybrid", null],
        default: null,
      },
      employmentType: {
        type: String,
        enum: [...Object.values(EMPLOYMENT_TYPE), null],
        default: null,
      },
      experienceLevel: {
        type: String,
        enum: [...Object.values(EXPERIENCE_LEVEL), null],
        default: null,
      },
      minSalary: {
        type: Number,
        min: 0,
        default: null,
      },
      currency: {
        type: String,
        trim: true,
        default: "USD",
      },
      salaryPeriod: {
        type: String,
        enum: ["yearly", "monthly", "hourly", null],
        default: "yearly",
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

candidateProfileSchema.index({ skills: 1 });
candidateProfileSchema.index({ city: 1, country: 1 });

const CandidateProfile = model<ICandidateProfile>(
  "CandidateProfile",
  candidateProfileSchema
);

export default CandidateProfile;

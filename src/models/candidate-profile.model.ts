import { Schema, model, Document, Types } from "mongoose";

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

export interface ICandidateProfile extends Document {
  userId: Types.ObjectId;
  headline?: string;
  bio?: string;
  phone?: string;
  profilePicture?: string;
  resumeUrl?: string;
  skills: string[];
  experience: ICandidateExperience[];
  education: ICandidateEducation[];
  city?: string;
  state?: string;
  country?: string;
  socialLinks?: ICandidateSocialLinks;
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
    resumeUrl: {
      type: String,
      trim: true,
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

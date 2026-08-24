import "./company.model";
import { Schema, model, Document, Types } from "mongoose";

export interface IRecruiterSocialLinks {
  linkedin?: string;
  twitter?: string;
  website?: string;
}

export interface IRecruiterProfile extends Document {
  userId: Types.ObjectId;
  designation?: string;
  department?: string;
  phone?: string;
  profilePicture?: string;
  profilePicturePublicId?: string;
  companyId?: Types.ObjectId;
  bio?: string;
  socialLinks?: IRecruiterSocialLinks;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const recruiterProfileSchema = new Schema<IRecruiterProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    designation: {
      type: String,
      trim: true,
    },
    department: {
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
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    socialLinks: {
      linkedin: { type: String, trim: true },
      twitter: { type: String, trim: true },
      website: { type: String, trim: true },
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

const RecruiterProfile = model<IRecruiterProfile>(
  "RecruiterProfile",
  recruiterProfileSchema
);

export default RecruiterProfile;

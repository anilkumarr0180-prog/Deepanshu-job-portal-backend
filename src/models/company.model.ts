import { Schema, model, Document, Types } from "mongoose";

export interface ISocialLinks {
  linkedin?: string;
  twitter?: string;
  github?: string;
  website?: string;
}

export interface ICompany extends Document {
  name: string;
  logo?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  description: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  recruiterId: Types.ObjectId;
  socialLinks?: ISocialLinks;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    companySize: {
      type: String,
      trim: true,
    },
    foundedYear: {
      type: Number,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
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
    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    socialLinks: {
      linkedin: { type: String, trim: true },
      twitter: { type: String, trim: true },
      github: { type: String, trim: true },
      website: { type: String, trim: true },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

companySchema.index({ name: "text", industry: "text" });

const Company = model<ICompany>("Company", companySchema);

export default Company;

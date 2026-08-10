import { Schema, model, Document, Types } from "mongoose";

import {
  EMPLOYMENT_TYPE,
  EmploymentType,
} from "../constants/employment-type";

import {
  EXPERIENCE_LEVEL,
  ExperienceLevel,
} from "../constants/experience-level";

import {
  JOB_STATUS,
  JobStatus,
} from "../constants/job-status";

export interface IJob extends Document {
  title: string;
  description: string;
  company: string;
  companyId?: Types.ObjectId;
  location: string;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  salaryPeriod: string;
  workMode: string;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  status: JobStatus;
  skills: string[];
  skillIds?: Types.ObjectId[];
  postedBy: Types.ObjectId;
  recruiterId: Types.ObjectId;
  publishedAt?: Date;
  expiresAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    company: {
      type: String,
      required: true,
      trim: true,
    },

    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },

    location: {
      type: String,
      required: true,
      trim: true,
    },

    salaryMin: {
      type: Number,
      required: true,
      min: 0,
    },

    salaryMax: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (this: any, value: number) {
          if (this.salaryMin === undefined) return true;
          return value >= this.salaryMin;
        },
        message: "salaryMax must be greater than or equal to salaryMin",
      },
    },

    currency: {
      type: String,
      default: "USD",
      trim: true,
    },

    salaryPeriod: {
      type: String,
      enum: ["yearly", "monthly", "hourly"],
      default: "yearly",
    },

    workMode: {
      type: String,
      enum: ["onsite", "remote", "hybrid"],
      default: "onsite",
    },

    employmentType: {
      type: String,
      enum: Object.values(EMPLOYMENT_TYPE),
      required: true,
    },

    experienceLevel: {
      type: String,
      enum: Object.values(EXPERIENCE_LEVEL),
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.ACTIVE,
    },

    skills: [
      {
        type: String,
        trim: true,
      },
    ],

    skillIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Skill",
      },
    ],

    postedBy: {
      type: Schema.Types.ObjectId,
      ref: "RecruiterProfile",
      index: true,
    },

    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for searching, filtering, and listing
jobSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
jobSchema.index({ recruiterId: 1, status: 1, isDeleted: 1, createdAt: -1 });
jobSchema.index({ status: 1, isDeleted: 1, employmentType: 1, experienceLevel: 1 });
jobSchema.index({ companyId: 1, status: 1, isDeleted: 1 });
jobSchema.index({ postedBy: 1, isDeleted: 1 });
jobSchema.index({ title: "text", company: "text", description: "text" });

const Job = model<IJob>("Job", jobSchema);

export default Job;
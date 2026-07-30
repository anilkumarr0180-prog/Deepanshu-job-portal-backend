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
  location: string;
  salaryMin: number;
  salaryMax: number;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  status: JobStatus;
  skills: string[];
  recruiterId: Types.ObjectId;
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

    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Job = model<IJob>("Job", jobSchema);

export default Job;
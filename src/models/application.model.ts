import { Schema, model, Document, Types } from "mongoose";
import {
  APPLICATION_STATUS,
  ApplicationStatus,
} from "../constants/application-status";


export interface IApplication extends Document {
  jobId: Types.ObjectId;
  candidateProfileId?: Types.ObjectId;
  applicantId: Types.ObjectId;
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  applicantDesignation?: string;
  experienceYears?: number;
  relevantSkills?: string[];
  noticePeriod?: string;
  resume: string;
  resumePublicId?: string;
  resumeFileName?: string;
  coverLetter?: string;
  interviewDetails?: {
    mode?: "video" | "in-person" | "phone";
    date?: string;
    time?: string;
    type?: string;
    locationOrLink?: string;
    notes?: string;
    timezone?: string;
  };
  status: ApplicationStatus;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}


const applicationSchema = new Schema<IApplication>(
  {
    /*
    |--------------------------------------------------------------------------
    | Job Reference
    |--------------------------------------------------------------------------
    | The job for which candidate applied.
    |--------------------------------------------------------------------------
    */
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    candidateProfileId: {
      type: Schema.Types.ObjectId,
      ref: "CandidateProfile",
      index: true,
    },

    applicantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    applicantName: {
      type: String,
      trim: true,
    },

    applicantEmail: {
      type: String,
      trim: true,
    },

    applicantPhone: {
      type: String,
      trim: true,
    },

    applicantDesignation: {
      type: String,
      trim: true,
    },

    experienceYears: {
      type: Number,
      default: 0,
    },

    relevantSkills: {
      type: [String],
      default: [],
    },

    noticePeriod: {
      type: String,
      trim: true,
    },

    resume: {
      type: String,
      required: true,
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

    coverLetter: {
      type: String,
      trim: true,
    },

    interviewDetails: {
      mode: { type: String, enum: ["video", "in-person", "phone"], default: "video" },
      date: { type: String, trim: true },
      time: { type: String, trim: true },
      type: { type: String, trim: true },
      locationOrLink: { type: String, trim: true },
      notes: { type: String, trim: true },
      timezone: { type: String, trim: true, default: 'UTC' },
    },

    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.APPLIED,
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

applicationSchema.index(
  {
    jobId: 1,
    applicantId: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

applicationSchema.index({ applicantId: 1, isDeleted: 1, createdAt: -1 });
applicationSchema.index({ applicantId: 1, status: 1 });
applicationSchema.index({ candidateProfileId: 1, isDeleted: 1, createdAt: -1 });
applicationSchema.index({ jobId: 1, status: 1, isDeleted: 1 });
applicationSchema.index({ jobId: 1, isDeleted: 1, createdAt: -1 });

const Application = model<IApplication>(
  "Application",
  applicationSchema
);

export default Application;
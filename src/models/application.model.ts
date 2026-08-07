import { Schema, model, Document, Types } from "mongoose";
import {
  APPLICATION_STATUS,
  ApplicationStatus,
} from "../constants/application-status";


export interface IApplication extends Document {
  jobId: Types.ObjectId;
  applicantId: Types.ObjectId;
  resume: string;
  coverLetter?: string;
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

    applicantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    resume: {
      type: String,
      required: true,
      trim: true,
    },

    coverLetter: {
      type: String,
      trim: true,
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
  }
);

applicationSchema.index(
  {
    jobId: 1,
    applicantId: 1,
  },
  {
    unique: true,
  }
);

applicationSchema.index({ applicantId: 1, isDeleted: 1, createdAt: -1 });
applicationSchema.index({ jobId: 1, status: 1, isDeleted: 1 });

const Application = model<IApplication>(
  "Application",
  applicationSchema
);

export default Application;
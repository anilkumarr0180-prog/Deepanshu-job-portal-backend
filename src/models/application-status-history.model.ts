import { Schema, model, Document, Types } from "mongoose";
import {
  APPLICATION_STATUS,
  ApplicationStatus,
} from "../constants/application-status";

export interface IApplicationStatusHistory extends Document {
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  changedBy: Types.ObjectId;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const applicationStatusHistorySchema = new Schema<IApplicationStatusHistory>(
  {
    /*
    |--------------------------------------------------------------------------
    | Application Reference
    |--------------------------------------------------------------------------
    */
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Job Reference
    |--------------------------------------------------------------------------
    */
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Previous Status
    |--------------------------------------------------------------------------
    */
    fromStatus: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      required: true,
    },

    /*
    |--------------------------------------------------------------------------
    | New Target Status
    |--------------------------------------------------------------------------
    */
    toStatus: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      required: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Actor (User who triggered transition)
    |--------------------------------------------------------------------------
    */
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Optional Reason / Notes for Status Transition
    |--------------------------------------------------------------------------
    */
    reason: {
      type: String,
      trim: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Optional Structured Transition Metadata (e.g., Interview details)
    |--------------------------------------------------------------------------
    */
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// High performance compound indexes for audit log queries
applicationStatusHistorySchema.index({ applicationId: 1, createdAt: -1 });
applicationStatusHistorySchema.index({ jobId: 1, createdAt: -1 });
applicationStatusHistorySchema.index({ changedBy: 1, createdAt: -1 });

const ApplicationStatusHistory = model<IApplicationStatusHistory>(
  "ApplicationStatusHistory",
  applicationStatusHistorySchema
);

export default ApplicationStatusHistory;

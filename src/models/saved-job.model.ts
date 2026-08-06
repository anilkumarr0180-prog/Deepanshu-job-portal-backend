import { Schema, model, Document, Types } from "mongoose";

export interface ISavedJob extends Document {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const savedJobSchema = new Schema<ISavedJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index to prevent duplicate saved jobs per user
savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });

const SavedJob = model<ISavedJob>("SavedJob", savedJobSchema);

export default SavedJob;

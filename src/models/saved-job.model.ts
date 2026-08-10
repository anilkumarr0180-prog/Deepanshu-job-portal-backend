import { Schema, model, Document, Types } from "mongoose";

export interface ISavedJob extends Document {
  userId: Types.ObjectId;
  candidateProfileId?: Types.ObjectId;
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
    candidateProfileId: {
      type: Schema.Types.ObjectId,
      ref: "CandidateProfile",
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique indexes to prevent duplicate saved jobs per candidate
savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
savedJobSchema.index({ candidateProfileId: 1, jobId: 1 }, { unique: true, sparse: true });
savedJobSchema.index({ userId: 1, createdAt: -1 });

const SavedJob = model<ISavedJob>("SavedJob", savedJobSchema);

export default SavedJob;

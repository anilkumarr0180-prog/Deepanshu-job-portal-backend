import { Schema, model, Document, Types } from "mongoose";

export type ReportTargetType = "post" | "comment" | "user";
export type ReportReason =
  | "spam"
  | "harassment"
  | "inappropriate"
  | "hate_speech"
  | "misinformation"
  | "impersonation"
  | "other";
export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  resolvedBy?: Types.ObjectId;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["post", "comment", "user"],
      required: true,
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: [
        "spam",
        "harassment",
        "inappropriate",
        "hate_speech",
        "misinformation",
        "impersonation",
        "other",
      ],
      required: true,
    },
    description: {
      type: String,
      default: "",
      maxlength: 1000,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
      index: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolutionNotes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index to prevent duplicate reports by same user on same target
reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });

const Report = model<IReport>("Report", reportSchema);

export default Report;

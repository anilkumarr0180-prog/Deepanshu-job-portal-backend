import { Schema, model, Document, Types } from "mongoose";

export interface ICompanyRecruiter extends Document {
  companyId: Types.ObjectId;
  recruiterProfileId: Types.ObjectId;
  role: string;
  isPrimary: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const companyRecruiterSchema = new Schema<ICompanyRecruiter>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    recruiterProfileId: {
      type: Schema.Types.ObjectId,
      ref: "RecruiterProfile",
      required: true,
    },
    role: {
      type: String,
      default: "recruiter",
      trim: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
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

companyRecruiterSchema.index(
  { companyId: 1, recruiterProfileId: 1 },
  { unique: true }
);

// Fast recruiter profile lookup for authorization
companyRecruiterSchema.index({ recruiterProfileId: 1, isDeleted: 1 });

// Enforce at most ONE active primary recruiter per company
companyRecruiterSchema.index(
  { companyId: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true, isDeleted: false },
  }
);

const CompanyRecruiter = model<ICompanyRecruiter>(
  "CompanyRecruiter",
  companyRecruiterSchema
);

export default CompanyRecruiter;

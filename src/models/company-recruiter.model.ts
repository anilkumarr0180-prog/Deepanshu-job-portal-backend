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
      index: true,
    },
    recruiterProfileId: {
      type: Schema.Types.ObjectId,
      ref: "RecruiterProfile",
      required: true,
      index: true,
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

const CompanyRecruiter = model<ICompanyRecruiter>(
  "CompanyRecruiter",
  companyRecruiterSchema
);

export default CompanyRecruiter;

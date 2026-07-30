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
    },


    /*
    |--------------------------------------------------------------------------
    | Applicant Reference
    |--------------------------------------------------------------------------
    | Candidate who applied for the job.
    |--------------------------------------------------------------------------
    */
    applicantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },


    /*
    |--------------------------------------------------------------------------
    | Resume
    |--------------------------------------------------------------------------
    | Required because candidate must have resume before applying.
    |--------------------------------------------------------------------------
    */
    resume: {
      type: String,
      required: true,
      trim: true,
    },


    /*
    |--------------------------------------------------------------------------
    | Cover Letter
    |--------------------------------------------------------------------------
    */
    coverLetter: {
      type: String,
      trim: true,
    },


    /*
    |--------------------------------------------------------------------------
    | Application Status
    |--------------------------------------------------------------------------
    | Default status when candidate applies.
    |--------------------------------------------------------------------------
    */
    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.APPLIED,
    },
  },
  {
    timestamps: true,
  }
);


/*
|--------------------------------------------------------------------------
| Prevent Duplicate Applications
|--------------------------------------------------------------------------
| A candidate cannot apply for the same job twice.
|
| Database-level protection.
|--------------------------------------------------------------------------
*/
applicationSchema.index(
  {
    jobId: 1,
    applicantId: 1,
  },
  {
    unique: true,
  }
);


const Application = model<IApplication>(
  "Application",
  applicationSchema
);


export default Application;
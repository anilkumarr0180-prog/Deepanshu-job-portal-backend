import { Schema, model } from "mongoose";
import {
  INTERVIEW_STATUS,
  INTERVIEW_MODE,
  CANDIDATE_RSVP_STATUS,
} from "../constants/interview-status";
import { IInterview } from "../types/interview.types";

const candidateResponseSchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(CANDIDATE_RSVP_STATUS),
      default: CANDIDATE_RSVP_STATUS.PENDING,
    },
    respondedAt: {
      type: Date,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    suggestedTime: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { _id: false }
);

const interviewFeedbackSchema = new Schema(
  {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const interviewSchema = new Schema<IInterview>(
  {
    /*
    |--------------------------------------------------------------------------
    | Primary Application Reference
    |--------------------------------------------------------------------------
    | The application for which this interview round is scheduled.
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
    | Job Reference (Stored for fast indexed lookups & direct job scheduling)
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
    | Candidate User Reference (Stored for fast upcoming candidate queries)
    |--------------------------------------------------------------------------
    */
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Recruiter User Reference (Stored for fast recruiter calendar queries)
    |--------------------------------------------------------------------------
    */
    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Multi-Round & Type Metadata
    |--------------------------------------------------------------------------
    */
    roundNumber: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      default: "Technical Interview",
      maxlength: 150,
    },

    type: {
      type: String,
      required: true,
      trim: true,
      default: "Technical Interview",
      maxlength: 100,
    },

    mode: {
      type: String,
      enum: Object.values(INTERVIEW_MODE),
      default: INTERVIEW_MODE.VIDEO,
      required: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Date & Time Specifications (Canonical UTC + Timezone)
    |--------------------------------------------------------------------------
    */
    scheduledStartTime: {
      type: Date,
      required: true,
    },

    scheduledEndTime: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: any, value: Date) {
          if (!value || !this.scheduledStartTime) return true;
          return value > this.scheduledStartTime;
        },
        message: "scheduledEndTime must be strictly after scheduledStartTime",
      },
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 5,
      max: 480,
      default: 45,
    },

    timezone: {
      type: String,
      trim: true,
      default: "UTC",
    },

    /*
    |--------------------------------------------------------------------------
    | Meeting Access Details & Instructions
    |--------------------------------------------------------------------------
    */
    locationOrLink: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    /*
    |--------------------------------------------------------------------------
    | Lifecycle & RSVP Status
    |--------------------------------------------------------------------------
    */
    status: {
      type: String,
      enum: Object.values(INTERVIEW_STATUS),
      default: INTERVIEW_STATUS.SCHEDULED,
      index: true,
    },

    candidateResponse: {
      type: candidateResponseSchema,
      default: () => ({ status: CANDIDATE_RSVP_STATUS.PENDING }),
    },

    feedback: {
      type: interviewFeedbackSchema,
    },

    /*
    |--------------------------------------------------------------------------
    | Automated Reminder Dispatch State
    |--------------------------------------------------------------------------
    */
    reminderSent24h: {
      type: Boolean,
      default: false,
      index: true,
    },

    reminderSent1h: {
      type: Boolean,
      default: false,
      index: true,
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

/*
|--------------------------------------------------------------------------
| Performance Compound Indexes Matching Core Query Patterns
|--------------------------------------------------------------------------
*/
// 1. Candidate upcoming/past interviews schedule
interviewSchema.index({ candidateId: 1, scheduledStartTime: 1, isDeleted: 1 });

// 2. Recruiter upcoming/past calendar & interviews
interviewSchema.index({ recruiterId: 1, scheduledStartTime: 1, isDeleted: 1 });

// 3. Application multi-round interview history
interviewSchema.index({ applicationId: 1, roundNumber: 1, isDeleted: 1 });

// 4. Job level interviews and status filtering
interviewSchema.index({ jobId: 1, status: 1, isDeleted: 1 });

// 5. Automated background reminder cron worker scanning index
interviewSchema.index({
  scheduledStartTime: 1,
  status: 1,
  reminderSent24h: 1,
  reminderSent1h: 1,
  isDeleted: 1,
});

const Interview = model<IInterview>("Interview", interviewSchema);

export default Interview;

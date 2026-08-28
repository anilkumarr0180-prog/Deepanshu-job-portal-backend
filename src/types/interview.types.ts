import { Types, Document } from "mongoose";
import {
  InterviewStatus,
  InterviewMode,
  CandidateRsvpStatus,
} from "../constants/interview-status";

export interface ICandidateResponse {
  status: CandidateRsvpStatus;
  respondedAt?: Date;
  note?: string;
  suggestedTime?: string;
}

export interface IInterviewFeedback {
  rating?: number;
  notes?: string;
  submittedAt?: Date;
}

export interface IInterview extends Document {
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  recruiterId: Types.ObjectId;

  roundNumber: number;
  title: string;
  type: string;
  mode: InterviewMode;

  scheduledStartTime: Date;
  scheduledEndTime: Date;
  durationMinutes: number;
  timezone: string;

  locationOrLink?: string;
  notes?: string;

  status: InterviewStatus;
  candidateResponse: ICandidateResponse;
  feedback?: IInterviewFeedback;

  reminderSent24h: boolean;
  reminderSent1h: boolean;

  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInterviewInput {
  applicationId: string;
  roundNumber?: number;
  title?: string;
  type?: string;
  mode?: InterviewMode;
  scheduledStartTime: Date | string;
  durationMinutes?: number;
  timezone?: string;
  locationOrLink?: string;
  notes?: string;
}

export interface RescheduleInterviewInput {
  scheduledStartTime: Date | string;
  durationMinutes?: number;
  timezone?: string;
  locationOrLink?: string;
  notes?: string;
  reason?: string;
}

export interface CandidateRsvpInput {
  action: "accept" | "decline" | "request_reschedule";
  note?: string;
  suggestedTime?: string;
}

export interface SubmitFeedbackInput {
  rating: number;
  notes: string;
}

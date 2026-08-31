import { Schema, model, Document, Types } from "mongoose";
import { CallStatus } from "../types/call.types";

export interface ICall extends Document {
  callId: string;
  conversationId: Types.ObjectId;
  callerId: Types.ObjectId;
  receiverId: Types.ObjectId;
  status: CallStatus;
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSeconds: number;
  endReason?: string;
  isMissedCallRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const callSchema = new Schema<ICall>(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    callerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "ringing",
        "accepted",
        "ended",
        "cancelled",
        "declined",
        "busy",
        "missed",
        "failed",
      ],
      required: true,
      index: true,
    },

    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    answeredAt: {
      type: Date,
    },

    endedAt: {
      type: Date,
    },

    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    endReason: {
      type: String,
      trim: true,
    },

    isMissedCallRead: {
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

// Indexes for query performance and unread badges
callSchema.index({ conversationId: 1, createdAt: -1 });
callSchema.index({ callerId: 1, createdAt: -1 });
callSchema.index({ receiverId: 1, createdAt: -1 });
callSchema.index({ receiverId: 1, status: 1, isMissedCallRead: 1 });

const Call = model<ICall>("Call", callSchema);

export default Call;

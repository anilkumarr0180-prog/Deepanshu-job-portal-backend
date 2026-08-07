import { Schema, model, Document, Types } from "mongoose";

export interface IConversation extends Document {
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  recruiterId: Types.ObjectId;
  lastMessageId?: Types.ObjectId;
  lastMessageAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
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

// Enforce unique conversation per (job, candidate, recruiter) tuple
conversationSchema.index(
  {
    jobId: 1,
    candidateId: 1,
    recruiterId: 1,
  },
  {
    unique: true,
  }
);

conversationSchema.index({ candidateId: 1, isDeleted: 1, lastMessageAt: -1 });
conversationSchema.index({ recruiterId: 1, isDeleted: 1, lastMessageAt: -1 });

const Conversation = model<IConversation>("Conversation", conversationSchema);

export default Conversation;

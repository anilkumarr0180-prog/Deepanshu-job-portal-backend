import { Schema, model, Document, Types } from "mongoose";

export interface IPendingEmailNotification extends Document {
  recipientId: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  jobId: Types.ObjectId;
  sendAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pendingEmailNotificationSchema = new Schema<IPendingEmailNotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    sendAt: {
      type: Date,
      required: true,
      index: true, // For fast querying by the cron job
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find existing pending notifications for debounce logic
pendingEmailNotificationSchema.index({ recipientId: 1, conversationId: 1 }, { unique: true });

const PendingEmailNotification = model<IPendingEmailNotification>(
  "PendingEmailNotification",
  pendingEmailNotificationSchema
);

export default PendingEmailNotification;

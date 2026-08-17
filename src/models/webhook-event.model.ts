import { Schema, model, Document } from "mongoose";

export interface IWebhookEvent extends Document {
  provider: "razorpay" | "stripe";
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  status: "processed" | "failed";
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["processed", "failed"],
      default: "processed",
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

const WebhookEvent = model<IWebhookEvent>("WebhookEvent", webhookEventSchema);

export default WebhookEvent;

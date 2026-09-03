import { Schema, model, Document, Types } from "mongoose";
import { NOTIFICATION_TYPES, NotificationType } from "../constants/notification-type";

export interface INotification extends Document {
  recipientId: Types.ObjectId | string;
  senderId?: Types.ObjectId | string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },

    body: {
      type: String,
      required: true,
      trim: true,
    },

    link: {
      type: String,
      default: "",
      trim: true,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        // Alias for exact TL Postgres Schema alignment
        ret.id = ret._id;
        ret.recipient_id = ret.recipientId;
        ret.sender_id = ret.senderId;
        ret.is_read = ret.isRead;
        ret.created_at = ret.createdAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Composite indexes for optimal query speed matching feed and unread filter patterns
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, type: 1, "metadata.blogId": 1 }, { sparse: true });

const Notification = model<INotification>("Notification", notificationSchema);

export default Notification;

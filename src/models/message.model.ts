import { Schema, model, Document, Types } from "mongoose";

export type MessageType = "text" | "image" | "file" | "system";

export interface IMessageAttachment {
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  message: string;
  messageType: MessageType;
  attachments: IMessageAttachment[];
  isRead: boolean;
  readAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    messageType: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },

    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String },
        size: { type: Number },
        mimeType: { type: String },
      },
    ],

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
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

messageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, isRead: 1, senderId: 1 });

const Message = model<IMessage>("Message", messageSchema);

export default Message;

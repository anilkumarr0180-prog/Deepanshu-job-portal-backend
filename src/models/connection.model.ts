import { Schema, model, Document, Types } from "mongoose";

export type ConnectionStatus = "pending" | "accepted" | "rejected";

export interface IConnection extends Document {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: ConnectionStatus;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IConnection>(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      required: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique compound index: prevents duplicate connection documents between user pair in same direction
connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

// Compound indexes for optimal querying of incoming/outgoing connections with status
connectionSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
connectionSchema.index({ requesterId: 1, status: 1, createdAt: -1 });

// Combined relationship queries for status checks
connectionSchema.index({ requesterId: 1, recipientId: 1, status: 1 });

const Connection = model<IConnection>("Connection", connectionSchema);

export default Connection;

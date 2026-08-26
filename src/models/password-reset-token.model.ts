import { Schema, model, Document, Types } from "mongoose";

export interface IPasswordResetToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
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

// TTL index to automatically remove expired password reset token documents
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for querying active unexpired tokens by hash
passwordResetTokenSchema.index({ tokenHash: 1, usedAt: 1, expiresAt: 1 });

// Compound index for invalidating previous tokens by user
passwordResetTokenSchema.index({ userId: 1, usedAt: 1 });

const PasswordResetToken = model<IPasswordResetToken>(
  "PasswordResetToken",
  passwordResetTokenSchema
);

export default PasswordResetToken;

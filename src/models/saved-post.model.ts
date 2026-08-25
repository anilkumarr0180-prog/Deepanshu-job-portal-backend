import { Schema, model, Document, Types } from "mongoose";

export interface ISavedPost extends Document {
  userId: Types.ObjectId;
  postId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const savedPostSchema = new Schema<ISavedPost>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index to prevent duplicate saves per user
savedPostSchema.index({ userId: 1, postId: 1 }, { unique: true });

// Optimized index for user's paginated saved posts sorted by newest
savedPostSchema.index({ userId: 1, createdAt: -1 });

const SavedPost = model<ISavedPost>("SavedPost", savedPostSchema);

export default SavedPost;

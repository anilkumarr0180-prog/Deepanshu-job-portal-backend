import { Schema, model, Document, Types } from "mongoose";

export interface IPost extends Document {
  authorId: Types.ObjectId;
  content: string;
  mediaUrl?: string;
  mediaPublicId?: string;
  isPublished: boolean;
  isDeleted: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<IPost>(
  {
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    mediaUrl: {
      type: String,
      trim: true,
    },

    mediaPublicId: {
      type: String,
      trim: true,
    },

    isPublished: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Feed query: find all published, non-deleted posts sorted by newest
postSchema.index({ isPublished: 1, isDeleted: 1, createdAt: -1 });

// Author's own posts: used by GET /my-posts or profile page
postSchema.index({ authorId: 1, isDeleted: 1, createdAt: -1 });

const Post = model<IPost>("Post", postSchema);

export default Post;

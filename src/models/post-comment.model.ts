import { Schema, model, Document, Types } from "mongoose";

export interface IPostComment extends Document {
  postId: Types.ObjectId;
  parentCommentId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  content: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const postCommentSchema = new Schema<IPostComment>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },

    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: "PostComment",
      default: null,
      index: true,
    },

    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
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

// Chronological comment & reply listing per post: GET /posts/:id/comments
postCommentSchema.index({ postId: 1, parentCommentId: 1, isDeleted: 1, createdAt: 1 });
postCommentSchema.index({ postId: 1, isDeleted: 1, createdAt: 1 });

const PostComment = model<IPostComment>("PostComment", postCommentSchema);

export default PostComment;

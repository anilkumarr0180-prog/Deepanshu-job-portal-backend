import { Schema, model, Document, Types } from "mongoose";

export interface IPostReaction extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

const postReactionSchema = new Schema<IPostReaction>(
  {
    postId: {
  type: Schema.Types.ObjectId,
  ref: "Post",
  required: true,
},

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["like"],
      default: "like",
    },
  },
  {
    timestamps: true,
  }
);

// One reaction per user per post — database-level uniqueness guarantee
postReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

const PostReaction = model<IPostReaction>("PostReaction", postReactionSchema);

export default PostReaction;

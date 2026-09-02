import { Schema, model, Document } from "mongoose";

export interface IBlogCategory extends Document {
  name: string;
  slug: string;
  description?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const blogCategorySchema = new Schema<IBlogCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
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

// Compound & secondary indexes
blogCategorySchema.index({ isDeleted: 1, name: 1 });

const BlogCategory = model<IBlogCategory>("BlogCategory", blogCategorySchema);

export default BlogCategory;

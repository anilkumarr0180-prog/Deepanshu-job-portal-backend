import { Schema, model, Document, Types } from "mongoose";
import { BLOG_STATUS, BlogStatus } from "../constants/blog-status";

export interface IBlogSEO {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  canonicalUrl?: string;
}

export interface IBlog extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImageUrl?: string;
  coverImagePublicId?: string;
  coverImageAlt?: string;
  authorId: Types.ObjectId;
  categoryId: Types.ObjectId;
  tags: string[];
  readingTime: number; // Estimated reading time in minutes
  status: BlogStatus;
  isFeatured: boolean;
  isTrending: boolean;
  viewsCount: number;
  publishedAt?: Date;
  seo?: IBlogSEO;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const seoSchema = new Schema<IBlogSEO>(
  {
    metaTitle: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    metaDescription: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    keywords: [
      {
        type: String,
        trim: true,
      },
    ],
    canonicalUrl: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const blogSchema = new Schema<IBlog>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 300,
    },

    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600,
    },

    content: {
      type: String,
      required: true,
    },

    coverImageUrl: {
      type: String,
      trim: true,
    },

    coverImagePublicId: {
      type: String,
      trim: true,
    },

    coverImageAlt: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "BlogCategory",
      required: true,
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    readingTime: {
      type: Number,
      default: 1,
      min: 1,
    },

    status: {
      type: String,
      enum: Object.values(BLOG_STATUS),
      default: BLOG_STATUS.DRAFT,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    isTrending: {
      type: Boolean,
      default: false,
    },

    viewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    publishedAt: {
      type: Date,
    },

    seo: {
      type: seoSchema,
      default: () => ({}),
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound & specialized query indexes (slug unique index is declared on field definition)
blogSchema.index({ status: 1, isDeleted: 1, publishedAt: -1 });
blogSchema.index({ status: 1, categoryId: 1, isDeleted: 1, publishedAt: -1 });
blogSchema.index({ status: 1, isFeatured: 1, isDeleted: 1, publishedAt: -1 });
blogSchema.index({ status: 1, isTrending: 1, isDeleted: 1, publishedAt: -1 });
blogSchema.index({ authorId: 1, isDeleted: 1, createdAt: -1 });
blogSchema.index({ tags: 1, status: 1, isDeleted: 1 });
blogSchema.index({ title: "text", excerpt: "text", content: "text" });

const Blog = model<IBlog>("Blog", blogSchema);

export default Blog;

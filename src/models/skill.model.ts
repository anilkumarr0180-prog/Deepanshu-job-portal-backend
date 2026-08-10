import { Schema, model, Document } from "mongoose";

export interface ISkill extends Document {
  name: string;
  slug: string;
  category?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema<ISkill>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

skillSchema.index({ slug: 1 });
skillSchema.index({ category: 1 });

const Skill = model<ISkill>("Skill", skillSchema);

export default Skill;

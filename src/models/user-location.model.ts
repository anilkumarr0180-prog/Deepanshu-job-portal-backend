import { Schema, model, Document, Types } from "mongoose";

export interface IUserLocation extends Document {
  userId: Types.ObjectId;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  city?: string;
  area?: string;
  state?: string;
  country?: string;
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userLocationSchema = new Schema<IUserLocation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },

    accuracy: {
      type: Number,
      min: 0,
    },

    heading: {
      type: Number,
      min: 0,
      max: 360,
    },

    speed: {
      type: Number,
      min: 0,
    },

    city: {
      type: String,
      default: "",
      trim: true,
    },

    area: {
      type: String,
      default: "",
      trim: true,
    },

    state: {
      type: String,
      default: "",
      trim: true,
    },

    country: {
      type: String,
      default: "",
      trim: true,
    },

    capturedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userLocationSchema.index({ updatedAt: -1 });

const UserLocation = model<IUserLocation>("UserLocation", userLocationSchema);

export default UserLocation;

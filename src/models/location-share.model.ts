import { Schema, model, Document, Types } from "mongoose";
import {
  LOCATION_PRIVACY_LEVELS,
  LocationPrivacyLevel,
} from "../constants/location";

export interface ILocationShare extends Document {
  applicationId: Types.ObjectId;
  userId: Types.ObjectId;
  privacyLevel: LocationPrivacyLevel;
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const locationShareSchema = new Schema<ILocationShare>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    privacyLevel: {
      type: String,
      enum: Object.values(LOCATION_PRIVACY_LEVELS),
      default: LOCATION_PRIVACY_LEVELS.APPROXIMATE,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index per application & candidate user
locationShareSchema.index(
  { applicationId: 1, userId: 1 },
  { unique: true }
);

locationShareSchema.index({ applicationId: 1, isActive: 1 });

const LocationShare = model<ILocationShare>(
  "LocationShare",
  locationShareSchema
);

export default LocationShare;

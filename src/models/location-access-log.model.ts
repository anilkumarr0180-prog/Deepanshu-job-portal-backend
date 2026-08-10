import { Schema, model, Document, Types } from "mongoose";
import { LocationPrivacyLevel } from "../constants/location";

export interface ILocationAccessLog extends Document {
  accessorId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  privacyLevel: LocationPrivacyLevel;
  granted: boolean;
  reason?: string;
  createdAt: Date;
}

const locationAccessLogSchema = new Schema<ILocationAccessLog>(
  {
    accessorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      index: true,
    },

    privacyLevel: {
      type: String,
      required: true,
    },

    granted: {
      type: Boolean,
      default: true,
      required: true,
    },

    reason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

locationAccessLogSchema.index({ accessorId: 1, createdAt: -1 });
locationAccessLogSchema.index({ targetUserId: 1, createdAt: -1 });

const LocationAccessLog = model<ILocationAccessLog>(
  "LocationAccessLog",
  locationAccessLogSchema
);

export default LocationAccessLog;

import { Schema, model, Document } from "mongoose";
import { USER_ROLES, UserRole } from "../constants/roles";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  authProvider: 'local' | 'google';
  googleId?: string;
  isEmailVerified: boolean;
  /** @deprecated Retained for backward-compatible read fallback; primary owner is CandidateProfile/RecruiterProfile */
  phone?: string;
  /** @deprecated Retained for backward-compatible read fallback; primary owner is CandidateProfile/RecruiterProfile */
  profilePicture?: string;
  /** @deprecated Retained for backward-compatible read fallback; primary owner is CandidateProfile */
  resumeUrl?: string;
  isBlocked: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: function (this: IUser) {
        return this.authProvider === 'local';
      },
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.CANDIDATE,
    },

    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    /* Legacy Profile Fields - Retained for backward compatibility */
    phone: {
      type: String,
      trim: true,
    },

    profilePicture: {
      type: String,
      trim: true,
    },

    resumeUrl: {
      type: String,
      trim: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Optimal compound index covering role + status filtering
userSchema.index({ role: 1, isBlocked: 1, isDeleted: 1 });

const User = model<IUser>("User", userSchema);

export default User;
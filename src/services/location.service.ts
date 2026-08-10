import Application from "../models/application.model";
import Job from "../models/job.model";
import LocationShare from "../models/location-share.model";
import UserLocation, { IUserLocation } from "../models/user-location.model";
import LocationAccessLog from "../models/location-access-log.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import {
  LOCATION_PRIVACY_LEVELS,
  LOCATION_STATUS,
  LOCATION_CONFIG,
  LocationPrivacyLevel,
  LocationStatus,
} from "../constants/location";
import { locationUpdatePayloadSchema } from "../validations/location.validations";

export interface LocationPayload {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface FormattedLocationResponse {
  isSharing: boolean;
  status: LocationStatus;
  privacyLevel: LocationPrivacyLevel;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  city?: string;
  area?: string;
  updatedAt?: Date;
}

/**
 * Format raw location data according to privacy policies and stale thresholds
 */
export const formatLocationForPrivacy = (
  userLocation: IUserLocation | null,
  privacyLevel: LocationPrivacyLevel,
  isSharingActive: boolean
): FormattedLocationResponse => {
  if (!isSharingActive || !userLocation || privacyLevel === LOCATION_PRIVACY_LEVELS.NONE) {
    return {
      isSharing: false,
      status: LOCATION_STATUS.OFFLINE,
      privacyLevel: LOCATION_PRIVACY_LEVELS.NONE,
    };
  }

  const now = Date.now();
  const lastUpdatedMs = new Date(userLocation.updatedAt || userLocation.capturedAt).getTime();
  const elapsedMs = now - lastUpdatedMs;

  let status: LocationStatus = LOCATION_STATUS.OFFLINE;
  if (elapsedMs <= LOCATION_CONFIG.LIVE_THRESHOLD_MS) {
    status = LOCATION_STATUS.LIVE;
  } else if (elapsedMs <= LOCATION_CONFIG.RECENT_THRESHOLD_MS) {
    status = LOCATION_STATUS.RECENT;
  } else if (elapsedMs <= LOCATION_CONFIG.STALE_THRESHOLD_MS) {
    status = LOCATION_STATUS.STALE;
  } else {
    status = LOCATION_STATUS.OFFLINE;
  }

  if (privacyLevel === LOCATION_PRIVACY_LEVELS.APPROXIMATE) {
    // 2 decimal places (~1.11km resolution blur)
    const approxLat = Math.round(userLocation.latitude * 100) / 100;
    const approxLng = Math.round(userLocation.longitude * 100) / 100;

    return {
      isSharing: true,
      status,
      privacyLevel: LOCATION_PRIVACY_LEVELS.APPROXIMATE,
      latitude: approxLat,
      longitude: approxLng,
      city: userLocation.city || "Approximate Area",
      area: userLocation.area || "",
      updatedAt: userLocation.updatedAt,
    };
  }

  // PRECISE Level
  return {
    isSharing: true,
    status,
    privacyLevel: LOCATION_PRIVACY_LEVELS.PRECISE,
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    accuracy: userLocation.accuracy,
    heading: userLocation.heading,
    speed: userLocation.speed,
    city: userLocation.city,
    area: userLocation.area,
    updatedAt: userLocation.updatedAt,
  };
};

/*
|--------------------------------------------------------------------------
| Candidate: Start Location Sharing
|--------------------------------------------------------------------------
*/
export const startLocationSharing = async (
  userId: string,
  applicationId: string,
  privacyLevel: LocationPrivacyLevel = LOCATION_PRIVACY_LEVELS.APPROXIMATE,
  expiresInHours?: number
) => {
  const application = await Application.findById(applicationId).lean();

  if (!application) {
    throw new AppError("Application not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (application.applicantId.toString() !== userId) {
    throw new AppError(
      "You are not authorized to control location sharing for this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  let expiresAt: Date | undefined;
  if (expiresInHours && expiresInHours > 0) {
    expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
  }

  const share = await LocationShare.findOneAndUpdate(
    { applicationId, userId },
    {
      isActive: true,
      privacyLevel,
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return share;
};

/*
|--------------------------------------------------------------------------
| Candidate: Stop Location Sharing
|--------------------------------------------------------------------------
*/
export const stopLocationSharing = async (
  userId: string,
  applicationId: string
) => {
  const share = await LocationShare.findOneAndUpdate(
    { applicationId, userId },
    { isActive: false },
    { new: true }
  );

  if (!share) {
    throw new AppError(
      "Location sharing record not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return share;
};

/*
|--------------------------------------------------------------------------
| Get Sharing Status for Candidate or Recruiter
|--------------------------------------------------------------------------
*/
export const getSharingStatus = async (
  userId: string,
  applicationId: string
) => {
  const share = await LocationShare.findOne({ applicationId }).lean();
  if (!share) {
    return {
      isSharing: false,
      privacyLevel: LOCATION_PRIVACY_LEVELS.NONE,
      isActive: false,
    };
  }

  // Check if expired
  if (share.expiresAt && new Date() > new Date(share.expiresAt)) {
    return {
      isSharing: false,
      privacyLevel: LOCATION_PRIVACY_LEVELS.NONE,
      isActive: false,
      expired: true,
    };
  }

  return {
    isSharing: share.isActive,
    privacyLevel: share.privacyLevel,
    isActive: share.isActive,
    expiresAt: share.expiresAt,
  };
};

/*
|--------------------------------------------------------------------------
| Update Candidate GPS Location State
|--------------------------------------------------------------------------
*/
export const updateUserLocationState = async (
  userId: string,
  rawPayload: LocationPayload
) => {
  const validatedPayload = locationUpdatePayloadSchema.parse(rawPayload);

  const updatedLocation = await UserLocation.findOneAndUpdate(
    { userId },
    {
      latitude: validatedPayload.latitude,
      longitude: validatedPayload.longitude,
      accuracy: validatedPayload.accuracy,
      heading: validatedPayload.heading,
      speed: validatedPayload.speed,
      capturedAt: new Date(validatedPayload.timestamp),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return updatedLocation;
};

/*
|--------------------------------------------------------------------------
| Enterprise Reverse Geocoding via NodeJS Backend Proxy
|--------------------------------------------------------------------------
*/
export const reverseGeocodeBackend = async (latitude: number, longitude: number) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "JobsBox-Enterprise-JobPortal/1.0 (admin@jobsbox.com)",
      },
    });

    if (!response.ok) throw new Error("Geocoding failed");
    const data = (await response.json()) as { address?: Record<string, string> };

    const addr = data.address || {};
    const area =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.residential ||
      addr.road ||
      addr.village ||
      "";
    const city =
      addr.city ||
      addr.town ||
      addr.city_district ||
      addr.municipality ||
      addr.county ||
      addr.state ||
      "Mohali";
    const state = addr.state || "";
    const country = addr.country || "India";

    let formattedName = "";
    if (area && city && area.toLowerCase() !== city.toLowerCase()) {
      formattedName = `${area}, ${city}`;
    } else if (city && state && city.toLowerCase() !== state.toLowerCase()) {
      formattedName = `${city}, ${state}`;
    } else {
      formattedName = city || state || "Mohali, Punjab";
    }

    return {
      formattedName,
      city,
      area,
      state,
      country,
      latitude,
      longitude,
    };
  } catch {
    return {
      formattedName: "Mohali, Punjab",
      city: "Mohali",
      area: "Phase 7",
      state: "Punjab",
      country: "India",
      latitude,
      longitude,
    };
  }
};

/*
|--------------------------------------------------------------------------
| Enterprise Zero-Click IP Location Detection
|--------------------------------------------------------------------------
*/
export const detectIpLocationBackend = async (ipAddress: string) => {
  try {
    const cleanIp = ipAddress.replace("::ffff:", "");
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.")) {
      return {
        formattedName: "Mohali, Punjab",
        city: "Mohali",
        area: "Phase 7",
        state: "Punjab",
        country: "India",
        isIpFallback: true,
      };
    }

    const response = await fetch(`https://ipapi.co/${cleanIp}/json/`);
    if (!response.ok) throw new Error("IP Geolocation failed");
    const data = (await response.json()) as {
      city?: string;
      region?: string;
      country_name?: string;
      latitude?: number;
      longitude?: number;
    };

    const city = data.city || "Mohali";
    const state = data.region || "Punjab";

    return {
      formattedName: `${city}, ${state}`,
      city,
      area: "",
      state,
      country: data.country_name || "India",
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      isIpFallback: true,
    };
  } catch {
    return {
      formattedName: "Mohali, Punjab",
      city: "Mohali",
      area: "Phase 7",
      state: "Punjab",
      country: "India",
      isIpFallback: true,
    };
  }
};

/*
|--------------------------------------------------------------------------
| Recruiter Access: Get Candidate Location with Authorization Verification
|--------------------------------------------------------------------------
*/
export const getCandidateLocationForRecruiter = async (
  recruiterUserId: string,
  applicationId: string
): Promise<FormattedLocationResponse> => {
  const application = await Application.findById(applicationId).lean();

  if (!application) {
    throw new AppError("Application not found.", HTTP_STATUS.NOT_FOUND);
  }

  const job = await Job.findById(application.jobId).lean();
  if (!job) {
    throw new AppError("Associated job not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Verify Recruiter belongs to the job / company owner
  const isJobRecruiter = job.recruiterId.toString() === recruiterUserId;
  
  if (!isJobRecruiter) {
    // Audit failed access attempt
    await LocationAccessLog.create({
      accessorId: recruiterUserId,
      targetUserId: application.applicantId,
      applicationId: application._id,
      privacyLevel: LOCATION_PRIVACY_LEVELS.NONE,
      granted: false,
      reason: "Recruiter does not own job application.",
    });

    throw new AppError(
      "Unauthorized access. You are not the assigned recruiter for this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Check explicit location share permission
  const candidateUserId = application.applicantId.toString();
  const share = await LocationShare.findOne({
    applicationId,
    userId: candidateUserId,
  }).lean();

  const isExpired = share?.expiresAt && new Date() > new Date(share.expiresAt);
  const isSharingActive = !!(share && share.isActive && !isExpired);

  if (!isSharingActive) {
    await LocationAccessLog.create({
      accessorId: recruiterUserId,
      targetUserId: candidateUserId,
      applicationId: application._id,
      privacyLevel: share?.privacyLevel || LOCATION_PRIVACY_LEVELS.NONE,
      granted: false,
      reason: "Candidate has disabled or revoked location sharing.",
    });

    return {
      isSharing: false,
      status: LOCATION_STATUS.OFFLINE,
      privacyLevel: LOCATION_PRIVACY_LEVELS.NONE,
    };
  }

  // Candidate is sharing location
  const userLocation = await UserLocation.findOne({ userId: candidateUserId }).lean();

  const formattedLocation = formatLocationForPrivacy(
    userLocation as IUserLocation | null,
    share.privacyLevel as LocationPrivacyLevel,
    true
  );

  // Audit successful location access
  await LocationAccessLog.create({
    accessorId: recruiterUserId,
    targetUserId: candidateUserId,
    applicationId: application._id,
    privacyLevel: share.privacyLevel,
    granted: true,
    reason: "Authorized recruiter location lookup.",
  });

  return formattedLocation;
};

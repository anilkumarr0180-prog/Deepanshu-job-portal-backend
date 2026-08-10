import { z } from "zod";
import { LOCATION_PRIVACY_LEVELS } from "../constants/location";

const idRegex = /^[0-9a-fA-F-]{24,36}$/;

export const locationUpdatePayloadSchema = z.object({
  latitude: z
    .number()
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90")
    .refine((val) => !isNaN(val) && isFinite(val), "Latitude must be a valid number"),
  longitude: z
    .number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180")
    .refine((val) => !isNaN(val) && isFinite(val), "Longitude must be a valid number"),
  accuracy: z
    .number()
    .min(0, "Accuracy cannot be negative")
    .optional(),
  heading: z
    .number()
    .min(0, "Heading must be between 0 and 360")
    .max(360, "Heading must be between 0 and 360")
    .optional(),
  speed: z
    .number()
    .min(0, "Speed cannot be negative")
    .optional(),
  timestamp: z
    .number()
    .refine(
      (ts) => {
        const now = Date.now();
        // Disallow future timestamps beyond 10s tolerance, and reject timestamps older than 10 mins (600,000 ms)
        return ts <= now + 10000 && ts >= now - 600000;
      },
      { message: "Timestamp is out of acceptable bounds" }
    ),
});

export const startLocationShareSchema = z.object({
  body: z.object({
    applicationId: z
      .string()
      .regex(idRegex, "Invalid application ID format"),
    privacyLevel: z
      .enum([
        LOCATION_PRIVACY_LEVELS.NONE,
        LOCATION_PRIVACY_LEVELS.APPROXIMATE,
        LOCATION_PRIVACY_LEVELS.PRECISE,
      ])
      .default(LOCATION_PRIVACY_LEVELS.APPROXIMATE),
    expiresInHours: z
      .number()
      .min(1)
      .max(720)
      .optional(),
  }),
});

export const stopLocationShareSchema = z.object({
  body: z.object({
    applicationId: z
      .string()
      .regex(idRegex, "Invalid application ID format"),
  }),
});

export const getApplicationLocationSchema = z.object({
  params: z.object({
    applicationId: z
      .string()
      .regex(idRegex, "Invalid application ID format"),
  }),
});

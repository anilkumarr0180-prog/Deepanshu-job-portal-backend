import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import { asyncHandler } from "../middleware/async-handler";
import * as locationService from "../services/location.service";

/*
|--------------------------------------------------------------------------
| Candidate: Start Location Sharing
|--------------------------------------------------------------------------
*/
export const startLocationShare = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { applicationId, privacyLevel, expiresInHours } = req.body;

    const share = await locationService.startLocationSharing(
      userId,
      applicationId,
      privacyLevel,
      expiresInHours
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Location sharing started successfully.",
      data: share,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Candidate: Stop Location Sharing
|--------------------------------------------------------------------------
*/
export const stopLocationShare = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { applicationId } = req.body;

    const share = await locationService.stopLocationSharing(
      userId,
      applicationId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Location sharing stopped successfully.",
      data: share,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Location Sharing Status
|--------------------------------------------------------------------------
*/
export const getLocationShareStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const applicationId = req.params.applicationId as string;

    const status = await locationService.getSharingStatus(
      userId,
      applicationId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: status,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Recruiter: Get Candidate Location for Application
|--------------------------------------------------------------------------
*/
export const getCandidateLocation = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterUserId = req.user!.userId;
    const applicationId = req.params.applicationId as string;

    const locationData = await locationService.getCandidateLocationForRecruiter(
      recruiterUserId,
      applicationId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: locationData,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Reverse Geocode via Server Proxy
|--------------------------------------------------------------------------
*/
export const reverseGeocode = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { latitude, longitude } = req.body;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Latitude and Longitude numbers are required.",
      });
      return;
    }

    const data = await locationService.reverseGeocodeBackend(latitude, longitude);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Zero-Click IP Location Detection
|--------------------------------------------------------------------------
*/
export const detectIpLocation = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const ip = req.headers["x-forwarded-for"]?.toString() || req.ip || "127.0.0.1";
    const data = await locationService.detectIpLocationBackend(ip);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
    });
  }
);

import cloudinary from "../config/cloudnary";

import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

/*
|--------------------------------------------------------------------------
| Cloudinary Upload Types
|--------------------------------------------------------------------------
*/

export type CloudinaryUploadType =
  | "profile"
  | "company-logo"
  | "resume";

/*
|--------------------------------------------------------------------------
| Cloudinary Upload Presets
|--------------------------------------------------------------------------
*/

const UPLOAD_PRESETS: Record<
  CloudinaryUploadType,
  string
> = {
  profile: "jobportal_profile",
  "company-logo": "jobportal_company_logo",
  resume: "jobportal_resume",
};

/*
|--------------------------------------------------------------------------
| Cloudinary Service
|--------------------------------------------------------------------------
*/

class CloudinaryService {
  /*
  |--------------------------------------------------------------------------
  | Generate Signed Upload Signature
  |--------------------------------------------------------------------------
  |
  | The Cloudinary API secret stays on the backend.
  | It is NEVER returned to the frontend.
  |
  */

  generateUploadSignature(
    type: CloudinaryUploadType
  ) {
    const uploadPreset = UPLOAD_PRESETS[type];

    if (!uploadPreset) {
      throw new AppError(
        "Invalid Cloudinary upload type.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const timestamp = Math.round(
      Date.now() / 1000
    );

    const apiSecret =
      cloudinary.config().api_secret;

    if (!apiSecret) {
      throw new AppError(
        "Cloudinary API secret is not configured.",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    const signature =
      cloudinary.utils.api_sign_request(
        {
          timestamp,
          upload_preset: uploadPreset,
        },
        apiSecret
      );

    return {
      timestamp,
      signature,
      uploadPreset,
      cloudName:
        cloudinary.config().cloud_name,
      apiKey:
        cloudinary.config().api_key,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Generate Authenticated URL
  |--------------------------------------------------------------------------
  |
  | Used primarily for private resumes.
  |
  */

  generateAuthenticatedUrl(
    publicId: string
  ) {
    if (!publicId) {
      throw new AppError(
        "Cloudinary public ID is required.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return cloudinary.url(publicId, {
      secure: true,
      type: "authenticated",
      sign_url: true,
      resource_type: "raw",
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Delete Cloudinary Asset
  |--------------------------------------------------------------------------
  |
  | Used when replacing or removing assets.
  |
  */

  async deleteAsset(
    publicId: string,
    resourceType: "image" | "raw" = "image"
  ) {
    if (!publicId) {
      throw new AppError(
        "Cloudinary public ID is required.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: resourceType,
        invalidate: true,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Export Singleton Service
|--------------------------------------------------------------------------
*/

export default new CloudinaryService();
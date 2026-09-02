/*
|--------------------------------------------------------------------------
| Cloudinary Constants & Canonical Folder Mapping
|--------------------------------------------------------------------------
|
| Canonical root: "Job-portal"
| All JobBox media namespaces are centrally defined here.
|
*/

export const CLOUDINARY_ROOT_FOLDER = "Job-portal" as const;

export type CloudinaryUploadType =
  | "profile"
  | "company-logo"
  | "resume"
  | "post"
  | "chat-media"
  | "blog";

export const CLOUDINARY_FOLDERS: Record<CloudinaryUploadType, string> = {
  profile: `${CLOUDINARY_ROOT_FOLDER}/profiles`,
  "company-logo": `${CLOUDINARY_ROOT_FOLDER}/company-logos`,
  resume: `${CLOUDINARY_ROOT_FOLDER}/resumes`,
  post: `${CLOUDINARY_ROOT_FOLDER}/posts`,
  "chat-media": `${CLOUDINARY_ROOT_FOLDER}/chat-media`,
  blog: `${CLOUDINARY_ROOT_FOLDER}/blogs`,
} as const;

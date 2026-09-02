import { z } from "zod";

export const uploadSignatureSchema = z.object({
  body: z.object({
    type: z.enum([
      "profile",
      "company-logo",
      "resume",
      "post",
      "chat-media",
      "blog",
    ]),
  }),
});

export const authenticatedResumeUrlSchema = z.object({
  body: z
    .object({
      publicId: z.string().trim().optional(),
      applicationId: z.string().trim().optional(),
      candidateUserId: z.string().trim().optional(),
    })
    .refine((data) => Boolean(data.publicId || data.applicationId), {
      message: "Either publicId or applicationId must be provided.",
    }),
});

export type UploadSignatureInput = z.infer<
  typeof uploadSignatureSchema
>;
export type AuthenticatedResumeUrlInput = z.infer<
  typeof authenticatedResumeUrlSchema
>;

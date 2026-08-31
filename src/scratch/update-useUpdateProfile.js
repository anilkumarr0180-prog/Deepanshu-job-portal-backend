const fs = require("fs");
const path = require("path");

const clientDir = path.resolve(__dirname, "../../../client");
const hookPath = path.join(
  clientDir,
  "src/features/candidate/hooks/useUpdateProfile.ts"
);

if (fs.existsSync(hookPath)) {
  const content = `import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import axios from "axios";

import {
  updateProfile,
  type BackendProfile,
  type UpdateProfilePayload,
} from "../api/profile.api";
import { removeEmptyFields } from "@/shared/utils/removeEmptyFields";

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => {
      const { jobPreferences, ...rest } = payload;
      const cleanedPayload: UpdateProfilePayload = removeEmptyFields(rest);
      if (jobPreferences !== undefined) {
        cleanedPayload.jobPreferences = jobPreferences;
      }
      return updateProfile(cleanedPayload);
    },
    onSuccess: (data: BackendProfile) => {
      toast.success("Profile updated successfully.", {
        id: "profile-update-success",
      });
      queryClient.setQueryData(["profile"], data);
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: unknown) => {
      let message = "Failed to update profile. Please try again.";

      if (axios.isAxiosError(error)) {
        if (error.response?.data?.message) {
          message = error.response.data.message;
        } else if (error.response?.status === 401) {
          message = "Session expired. Please log in again.";
        } else if (error.response?.status === 403) {
          message = "Access denied. You do not have permission to update profile.";
        } else if (error.response?.status === 404) {
          message = "Profile not found.";
        } else if (error.response?.status === 500) {
          message = "Internal server error. Please try again later.";
        }
      }

      toast.error(message, {
        id: "profile-update-error",
      });
    },
  });
}
`;
  fs.writeFileSync(hookPath, content, "utf8");
  console.log("✔ Successfully updated useUpdateProfile.ts to preserve jobPreferences payload!");
} else {
  console.error("✖ useUpdateProfile.ts not found at:", hookPath);
}

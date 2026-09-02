import fs from "fs";
import path from "path";

const clientHookPath = path.resolve(__dirname, "../../../client/src/shared/hooks/useCloudinaryUpload.ts");

if (fs.existsSync(clientHookPath)) {
  let content = fs.readFileSync(clientHookPath, "utf-8");

  // Ensure type === "blog" uses ALLOWED_POST_IMAGE_TYPES
  content = content.replace(
    'if (type === "post") {',
    'if (type === "post" || type === "blog") {'
  );

  content = content.replace(
    '} else if (type === "profile" || type === "company-logo" || type === "blog") {',
    '} else if (type === "profile" || type === "company-logo") {'
  );

  fs.writeFileSync(clientHookPath, content, "utf-8");
  console.log("[UPDATED] client/src/shared/hooks/useCloudinaryUpload.ts for blog file validation");
} else {
  console.error("[ERROR] Could not find useCloudinaryUpload.ts");
}

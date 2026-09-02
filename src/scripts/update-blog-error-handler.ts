import fs from "fs";
import path from "path";

const clientHookPath = path.resolve(__dirname, "../../../client/src/features/admin/hooks/useAdminBlogs.ts");

if (fs.existsSync(clientHookPath)) {
  let content = fs.readFileSync(clientHookPath, "utf-8");

  content = content.replace(
    `function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) {
      return String(error.response.data.message);
    }
    if (error.message) {
      return error.message;
    }
  } else if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}`,
    `function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const errorData = error.response?.data;
    if (Array.isArray(errorData?.errors) && errorData.errors.length > 0) {
      return errorData.errors.map((e: any) => \`\${e.field ? \`\${e.field}: \` : ""}\${e.message}\`).join(", ");
    }
    if (errorData?.message) {
      return String(errorData.message);
    }
    if (error.message) {
      return error.message;
    }
  } else if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}`
  );

  fs.writeFileSync(clientHookPath, content, "utf-8");
  console.log("[UPDATED] client/src/features/admin/hooks/useAdminBlogs.ts with detailed error extraction.");
} else {
  console.error("[ERROR] useAdminBlogs.ts not found.");
}

import { PDFParse } from "pdf-parse";
import cloudinary from "../config/cloudnary";

export class ResumeParserService {
  /**
   * Helper to extract Cloudinary public_id from Cloudinary URLs
   */
  private static extractCloudinaryPublicId(urlOrPublicId: string): string | null {
    if (!urlOrPublicId) return null;
    if (!urlOrPublicId.startsWith("http://") && !urlOrPublicId.startsWith("https://")) {
      return urlOrPublicId;
    }
    if (!urlOrPublicId.includes("cloudinary.com")) {
      return null;
    }

    const match = urlOrPublicId.match(
      /\/(?:raw|image|video)\/(?:upload|authenticated)(?:\/s--[^/]+--)?(?:\/v\d+)?\/(.+)$/
    );
    if (match && match[1]) {
      return match[1].split("?")[0];
    }
    return null;
  }

  /**
   * Extract plain text from an in-memory PDF Buffer using pdf-parse v2
   */
  static async extractTextFromBuffer(buffer: Buffer): Promise<string> {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const text = result.text || "";
      // Clean up multiple newlines and excessive whitespace
      return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } catch (error: any) {
      console.error("[ResumeParserService] Failed to extract text from buffer:", error);
      throw new Error(`Failed to parse PDF resume: ${error.message}`);
    } finally {
      if (parser) {
        try {
          await parser.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  /**
   * Download and extract text from a remote PDF URL (e.g. Cloudinary or direct external URL)
   */
  static async extractTextFromUrl(fileUrl: string): Promise<string> {
    try {
      let urlToFetch = fileUrl;
      const cloudinaryPublicId = this.extractCloudinaryPublicId(fileUrl);

      if (cloudinaryPublicId) {
        urlToFetch = cloudinary.utils.private_download_url(cloudinaryPublicId, "", {
          resource_type: "raw",
          type: "upload",
        });
      }

      let response = await fetch(urlToFetch);

      // Fallback 1: If upload type failed on Cloudinary, try authenticated delivery type
      if (!response.ok && cloudinaryPublicId) {
        const fallbackAuthUrl = cloudinary.utils.private_download_url(
          cloudinaryPublicId,
          "",
          {
            resource_type: "raw",
            type: "authenticated",
          }
        );
        const fallbackRes = await fetch(fallbackAuthUrl);
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      }

      // Fallback 2: Try direct original URL
      if (!response.ok && urlToFetch !== fileUrl) {
        const directRes = await fetch(fileUrl);
        if (directRes.ok) {
          response = directRes;
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch resume file. HTTP status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return await this.extractTextFromBuffer(buffer);
    } catch (error: any) {
      console.error("[ResumeParserService] Failed to extract text from URL:", error);
      throw new Error(`Failed to download and parse resume from URL: ${error.message}`);
    }
  }
}


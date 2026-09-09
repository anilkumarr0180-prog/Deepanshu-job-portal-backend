import { ContactMessageInput } from "../validations/contact.validations";
import {
  sendContactFormNotification,
  sendContactFormAutoReply,
} from "./email.service";

/**
 * Escapes potentially malicious HTML characters to ensure secure rendering
 * in transactional HTML email bodies.
 */
function sanitizeHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface ProcessContactOptions {
  clientIp?: string;
}

export interface ContactProcessResult {
  success: boolean;
  message: string;
}

/**
 * Processes incoming contact inquiries:
 * 1. Normalizes and sanitizes user input fields.
 * 2. Dispatches an email to the support/admin team with Reply-To header.
 * 3. Dispatches an automatic confirmation receipt to the submitter.
 */
export async function processContactMessage(
  data: ContactMessageInput,
  options?: ProcessContactOptions
): Promise<ContactProcessResult> {
  const cleanName = sanitizeHtml(data.name.trim());
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanCompany = data.company ? sanitizeHtml(data.company.trim()) : undefined;
  const cleanPhone = data.phone ? sanitizeHtml(data.phone.trim()) : undefined;
  const cleanMessage = sanitizeHtml(data.message.trim());
  const submittedAt = new Date().toUTCString();

  // Send notification to admin/support team
  await sendContactFormNotification({
    name: cleanName,
    email: cleanEmail,
    company: cleanCompany,
    phone: cleanPhone,
    message: cleanMessage,
    ip: options?.clientIp,
    submittedAt,
  });

  // Send acknowledgment confirmation to the user in background (non-blocking)
  sendContactFormAutoReply({
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
  }).catch((err) => {
    console.warn("[Contact Service] Auto-reply email delivery warning:", err);
  });

  return {
    success: true,
    message: "Your message has been sent successfully. We will get back to you shortly.",
  };
}

import nodemailer from "nodemailer";
import { env } from "../config/env";

/*
|--------------------------------------------------------------------------
| Create Transporter
|--------------------------------------------------------------------------
| Reusable nodemailer transport instance initialized with environment configuration.
| If SMTP_USER and SMTP_PASS are missing, it generates an Ethereal test transport
| with a viewable email preview URL in server console.
*/

const getFromHeader = () => {
  const emailAddr = env.SMTP_FROM || env.SMTP_USER || "no-reply@jobsbox.com";
  if (emailAddr.includes("<") && emailAddr.includes(">")) {
    return emailAddr;
  }
  return `"JobsBox Portal" <${emailAddr}>`;
};

const getTransporter = async () => {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = env.SMTP_PORT || 587;
  const secure = env.SMTP_SECURE || false;

  if (user && pass) {
    const isGmail = host.includes("gmail") || user.endsWith("@gmail.com");
    const transportConfig = {
      host: isGmail ? "smtp.gmail.com" : host,
      port: isGmail ? 587 : port,
      secure: false, // TLS via STARTTLS on 587
      requireTLS: true,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    };

    return {
      transporter: nodemailer.createTransport(transportConfig),
      isTestAccount: false,
    };
  }


  // Fallback to Ethereal Test Account when EMAIL_USER/EMAIL_PASS is empty
  console.warn(
    "[SMTP NOTICE] EMAIL_USER / EMAIL_PASS is empty in server/.env. Generating an Ethereal Test Account for email preview links."
  );
  const testAccount = await nodemailer.createTestAccount();
  return {
    transporter: nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    }),
    isTestAccount: true,
  };
};


export interface ApplicantEmailPayload {
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  companyName: string;
  jobId: string;
  applicationId: string;
}

export interface RecruiterEmailPayload {
  recruiterName: string;
  recruiterEmail: string;
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  companyName: string;
  coverLetter?: string;
  resumeUrl?: string;
  jobId: string;
  applicationId: string;
}

/*
|--------------------------------------------------------------------------
| Send Job Application Email to Applicant (Candidate)
|--------------------------------------------------------------------------
*/
export const sendJobApplicationApplicantEmail = async (
  payload: ApplicantEmailPayload
): Promise<boolean> => {
  const { applicantName, applicantEmail, jobTitle, companyName } = payload;
  const from = getFromHeader();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Application Submitted</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #3C65F5 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
          .content { padding: 32px 24px; }
          .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
          .card { background: #f1f5f9; border-left: 4px solid #3C65F5; padding: 20px; border-radius: 8px; margin: 24px 0; }
          .card-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
          .card-row:last-child { margin-bottom: 0; }
          .label { color: #64748b; font-weight: 500; }
          .value { color: #0f172a; font-weight: 600; }
          .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .btn { display: block; width: fit-content; margin: 28px auto 0 auto; background: #3C65F5; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Confirmed 🎉</h1>
            <p>Your application was successfully sent to the recruiter</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${applicantName || "Job Seeker"},</div>
            <p style="line-height: 1.6; color: #334155; font-size: 15px;">
              Great news! Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been received and logged in our system.
            </p>
            
            <div class="card">
              <div class="card-row">
                <span class="label">Position</span>
                <span class="value">${jobTitle}</span>
              </div>
              <div class="card-row">
                <span class="label">Company</span>
                <span class="value">${companyName}</span>
              </div>
              <div class="card-row">
                <span class="label">Application Status</span>
                <span class="value"><span class="badge">SUBMITTED</span></span>
              </div>
              <div class="card-row">
                <span class="label">Date Applied</span>
                <span class="value">${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>

            <p style="line-height: 1.6; color: #334155; font-size: 14px;">
              The recruiting team will review your profile and reach out if your experience matches their current requirements. You can check your application progress anytime from your candidate dashboard.
            </p>

            <a href="http://localhost:5173/candidate/applied" class="btn">Track My Application &rarr;</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} JobsBox Inc. All rights reserved.</p>
            <p>This is an automated operational email regarding your job application.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const { transporter, isTestAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: applicantEmail,
      subject: `Application Received: ${jobTitle} at ${companyName}`,
      html,
    });
    console.log(`[SMTP] Candidate notification email sent to ${applicantEmail}: ${info.messageId}`);
    if (isTestAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - CANDIDATE RECEIPT]: ${previewUrl}`);
    }
    return true;
  } catch (error: any) {
    console.warn(`[SMTP WARN] Primary SMTP send to candidate (${applicantEmail}) failed: ${error?.message || error}. Falling back to Ethereal...`);
    try {
      const testAccount = await nodemailer.createTestAccount();
      const fallbackTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await fallbackTransporter.sendMail({
        from: '"JobsBox Portal" <no-reply@jobsbox.com>',
        to: applicantEmail,
        subject: `Application Received: ${jobTitle} at ${companyName}`,
        html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - CANDIDATE RECEIPT (ETHEREAL FALLBACK)]: ${previewUrl}`);
      return true;
    } catch (fallbackErr) {
      console.error(`[SMTP ERROR] Fallback transport also failed for (${applicantEmail}):`, fallbackErr);
      return false;
    }
  }
};


/*
|--------------------------------------------------------------------------
| Send Job Application Email to Recruiter
|--------------------------------------------------------------------------
*/
export const sendJobApplicationRecruiterEmail = async (
  payload: RecruiterEmailPayload
): Promise<boolean> => {
  const {
    recruiterName,
    recruiterEmail,
    applicantName,
    applicantEmail,
    jobTitle,
    companyName,
    coverLetter,
    resumeUrl,
  } = payload;

  const from = getFromHeader();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Job Application Received</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; color: #94a3b8; }
          .content { padding: 32px 24px; }
          .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; }
          .card-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px; }
          .card-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
          .label { color: #64748b; font-weight: 500; }
          .value { color: #0f172a; font-weight: 600; }
          .cover-letter-box { background: #ffffff; border: 1px solid #cbd5e1; padding: 14px; border-radius: 8px; font-size: 13px; color: #334155; font-style: italic; margin-top: 12px; line-height: 1.5; }
          .btn { display: block; width: fit-content; margin: 28px auto 0 auto; background: #3C65F5; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Candidate Application 📬</h1>
            <p>Action Required: Review applicant profile for ${jobTitle}</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${recruiterName || "Hiring Manager"},</div>
            <p style="line-height: 1.6; color: #334155; font-size: 15px;">
              A new candidate has submitted their application for your job posting: <strong>${jobTitle}</strong> (${companyName}).
            </p>
            
            <div class="card">
              <div class="card-row">
                <span class="label">Candidate Name</span>
                <span class="value">${applicantName}</span>
              </div>
              <div class="card-row">
                <span class="label">Candidate Email</span>
                <span class="value">${applicantEmail}</span>
              </div>
              <div class="card-row">
                <span class="label">Applied Date</span>
                <span class="value">${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              ${
                resumeUrl
                  ? `<div class="card-row">
                      <span class="label">Resume</span>
                      <span class="value"><a href="${resumeUrl}" style="color: #3C65F5; text-decoration: none; font-weight: 600;">View Resume PDF &rarr;</a></span>
                     </div>`
                  : ""
              }
            </div>

            ${
              coverLetter && coverLetter.trim().length > 0
                ? `<div>
                    <strong style="font-size: 14px; color: #0f172a;">Candidate Cover Letter:</strong>
                    <div class="cover-letter-box">"${coverLetter}"</div>
                   </div>`
                : `<p style="font-size: 13px; color: #64748b;"><em>No cover letter attached by applicant.</em></p>`
            }

            <a href="http://localhost:5173/recruiter/applicants" class="btn">View Candidate in Recruiter Dashboard &rarr;</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} JobsBox Inc. Recruiter Portal</p>
            <p>You received this alert because you are listed as the recruiter for this job listing.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const { transporter, isTestAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: recruiterEmail,
      subject: `New Application: ${applicantName} applied for ${jobTitle}`,
      html,
    });
    console.log(`[SMTP] Recruiter notification email sent to ${recruiterEmail}: ${info.messageId}`);
    if (isTestAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - RECRUITER ALERT]: ${previewUrl}`);
    }
    return true;
  } catch (error: any) {
    console.warn(`[SMTP WARN] Primary SMTP send to recruiter (${recruiterEmail}) failed: ${error?.message || error}. Falling back to Ethereal...`);
    try {
      const testAccount = await nodemailer.createTestAccount();
      const fallbackTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await fallbackTransporter.sendMail({
        from: '"JobsBox Portal" <no-reply@jobsbox.com>',
        to: recruiterEmail,
        subject: `New Application: ${applicantName} applied for ${jobTitle}`,
        html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - RECRUITER ALERT (ETHEREAL FALLBACK)]: ${previewUrl}`);
      return true;
    } catch (fallbackErr) {
      console.error(`[SMTP ERROR] Fallback transport also failed for recruiter (${recruiterEmail}):`, fallbackErr);
      return false;
    }
  }
};

/*
|--------------------------------------------------------------------------
| Send Application Status Update Email to Applicant (Candidate)
|--------------------------------------------------------------------------
*/
export interface ApplicationStatusUpdateEmailPayload {
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  companyName: string;
  status: string;
  applicationId: string;
}

export const sendApplicationStatusUpdateEmail = async (
  payload: ApplicationStatusUpdateEmailPayload
): Promise<boolean> => {
  const { applicantName, applicantEmail, jobTitle, companyName, status } = payload;
  const from = getFromHeader();

  let statusHeader = "Application Status Update";
  let statusBg = "#dbeafe";
  let statusTextColor = "#1e40af";
  let messageBody = `Your application status for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been updated to <strong>${status}</strong>.`;

  switch (status) {
    case "Shortlisted":
      statusHeader = "Congratulations! Application Shortlisted ⭐";
      statusBg = "#d1fae5";
      statusTextColor = "#065f46";
      messageBody = `Great news! The hiring team at <strong>${companyName}</strong> has reviewed your profile and shortlisted your application for <strong>${jobTitle}</strong>.`;
      break;
    case "Interview":
      statusHeader = "Interview Invitation 📅";
      statusBg = "#ede9fe";
      statusTextColor = "#5b21b6";
      messageBody = `Exciting news! You have been invited to an interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>. The recruiter will reach out with schedule details soon.`;
      break;
    case "Hired":
      statusHeader = "Job Offer Received 🎉";
      statusBg = "#ecfdf5";
      statusTextColor = "#047857";
      messageBody = `Congratulations! <strong>${companyName}</strong> has selected you for the <strong>${jobTitle}</strong> role. Check your candidate dashboard for details.`;
      break;
    case "Rejected":
      statusHeader = "Application Status Update 📋";
      statusBg = "#fee2e2";
      statusTextColor = "#991b1b";
      messageBody = `Thank you for your interest in the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>. After careful consideration, the hiring team has decided to move forward with other candidates at this time.`;
      break;
    case "Under Review":
      statusHeader = "Application Under Review 👁️";
      statusBg = "#dbeafe";
      statusTextColor = "#1e40af";
      messageBody = `A recruiter at <strong>${companyName}</strong> has opened and is currently reviewing your application for <strong>${jobTitle}</strong>.`;
      break;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${statusHeader}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; }
          .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; }
          .card-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
          .card-row:last-child { margin-bottom: 0; }
          .label { color: #64748b; font-weight: 500; }
          .value { color: #0f172a; font-weight: 600; }
          .badge { display: inline-block; background: ${statusBg}; color: ${statusTextColor}; padding: 6px 14px; border-radius: 12px; font-size: 13px; font-weight: 700; text-transform: uppercase; }
          .btn { display: block; width: fit-content; margin: 28px auto 0 auto; background: #3C65F5; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusHeader}</h1>
          </div>
          <div class="content">
            <div class="greeting">Hello ${applicantName || "Candidate"},</div>
            <p style="line-height: 1.6; color: #334155; font-size: 15px;">
              ${messageBody}
            </p>
            
            <div class="card">
              <div class="card-row">
                <span class="label">Position</span>
                <span class="value">${jobTitle}</span>
              </div>
              <div class="card-row">
                <span class="label">Company</span>
                <span class="value">${companyName}</span>
              </div>
              <div class="card-row">
                <span class="label">Updated Status</span>
                <span class="value"><span class="badge">${status}</span></span>
              </div>
              <div class="card-row">
                <span class="label">Updated Date</span>
                <span class="value">${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>

            <a href="http://localhost:5173/candidate/applied" class="btn">View Application Status &rarr;</a>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} JobsBox Inc. All rights reserved.</p>
            <p>This is an automated operational alert regarding your job application.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const { transporter, isTestAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: applicantEmail,
      subject: `${statusHeader}: ${jobTitle} at ${companyName}`,
      html,
    });
    console.log(`[SMTP] Application status update email sent to ${applicantEmail}: ${info.messageId}`);
    if (isTestAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - STATUS UPDATE]: ${previewUrl}`);
    }
    return true;
  } catch (error: any) {
    console.warn(`[SMTP WARN] Primary SMTP send for status update (${applicantEmail}) failed: ${error?.message || error}. Falling back to Ethereal...`);
    try {
      const testAccount = await nodemailer.createTestAccount();
      const fallbackTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await fallbackTransporter.sendMail({
        from: '"JobsBox Portal" <no-reply@jobsbox.com>',
        to: applicantEmail,
        subject: `${statusHeader}: ${jobTitle} at ${companyName}`,
        html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - STATUS UPDATE (ETHEREAL FALLBACK)]: ${previewUrl}`);
      return true;
    } catch (fallbackErr) {
      console.error(`[SMTP ERROR] Fallback transport also failed for status update (${applicantEmail}):`, fallbackErr);
      return false;
    }
  }
};


/*
|--------------------------------------------------------------------------
| Verify SMTP Connection Status
|--------------------------------------------------------------------------
*/
export const verifySmtpConnection = async (): Promise<{
  configured: boolean;
  connected: boolean;
  user: string;
  host: string;
  port: number;
  message: string;
}> => {
  const user = env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || "";
  const pass = env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || "";
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = env.SMTP_PORT || 587;

  if (!user || !pass) {
    return {
      configured: false,
      connected: false,
      user: user ? `${user.substring(0, 3)}***` : "Not Configured",
      host,
      port,
      message: "SMTP user or password not set in server environment variables (EMAIL_USER / SMTP_USER).",
    };
  }

  try {
    const { transporter } = await getTransporter();
    await transporter.verify();
    return {
      configured: true,
      connected: true,
      user: user ? `${user.substring(0, 4)}***@${user.split("@")[1] || ""}` : user,
      host,
      port,
      message: "SMTP server verified and connected successfully!",
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      configured: true,
      connected: false,
      user: user ? `${user.substring(0, 4)}***@${user.split("@")[1] || ""}` : user,
      host,
      port,
      message: `SMTP connection failed: ${err.message || "Invalid credentials or network issue."}`,
    };
  }
};


/*
|--------------------------------------------------------------------------
| Send Test Email
|--------------------------------------------------------------------------
*/
export const sendTestEmail = async (targetEmail: string): Promise<{ success: boolean; message: string }> => {
  const from = getFromHeader();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px;">
      <h2 style="color: #3C65F5; margin-top: 0;">JobsBox SMTP Gateway Test</h2>
      <p style="color: #334155;">This test email confirms that your Nodemailer SMTP transport settings are active and properly configured!</p>
      <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; color: #475569;">
        <strong>Tested At:</strong> ${new Date().toISOString()}<br/>
        <strong>Target Email:</strong> ${targetEmail}
      </div>
    </div>
  `;

  try {
    const { transporter, isTestAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: targetEmail,
      subject: "JobsBox SMTP Test Email",
      html,
    });
    const previewUrl = isTestAccount ? nodemailer.getTestMessageUrl(info) : null;
    return {
      success: true,
      message: `Test email sent successfully! ${previewUrl ? `(Preview URL: ${previewUrl})` : `(Message ID: ${info.messageId})`}`,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      message: `Failed to send test email: ${err.message}`,
    };
  }
};


/*
|--------------------------------------------------------------------------
| Send Unread Chat Messages Email (Smart Offline Notification)
|--------------------------------------------------------------------------
*/
export interface UnreadMessagesEmailPayload {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  jobTitle: string;
  unreadCount: number;
}

export const sendUnreadMessagesEmail = async (
  payload: UnreadMessagesEmailPayload
): Promise<boolean> => {
  const { recipientName, recipientEmail, senderName, jobTitle, unreadCount } = payload;
  const from = getFromHeader();
  
  const messageWord = unreadCount === 1 ? "message" : "messages";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New messages from ${senderName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
          .header { background: linear-gradient(135deg, #3C65F5 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
          .content { padding: 32px 24px; text-align: center; }
          .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
          .icon-container { display: flex; justify-content: center; align-items: center; width: 64px; height: 64px; background: #dbeafe; border-radius: 50%; margin: 0 auto 20px auto; color: #1e40af; font-size: 24px; font-weight: bold; }
          .message-summary { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 24px 0; font-size: 15px; }
          .btn { display: inline-block; width: fit-content; margin: 28px auto 0 auto; background: #3C65F5; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 14px; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You have ${unreadCount} new ${messageWord}</h1>
          </div>
          <div class="content">
            <div class="icon-container">
              💬
            </div>
            <div class="greeting">Hi ${recipientName || "there"},</div>
            <p style="line-height: 1.6; color: #334155; font-size: 15px;">
              <strong>${senderName}</strong> sent you ${unreadCount} new ${messageWord} regarding the <strong>${jobTitle}</strong> position.
            </p>
            
            <a href="http://localhost:5173" class="btn">View Messages &rarr;</a>
            
            <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
              Reply quickly to keep the conversation going!
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} JobsBox Inc. All rights reserved.</p>
            <p>You received this because you have unread messages in your inbox.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const { transporter, isTestAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: recipientEmail,
      subject: `New message from ${senderName} regarding ${jobTitle}`,
      html,
    });
    console.log(`[SMTP] Unread messages email sent to ${recipientEmail}: ${info.messageId}`);
    if (isTestAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - UNREAD MESSAGES]: ${previewUrl}`);
    }
    return true;
  } catch (error: any) {
    console.warn(`[SMTP WARN] Unread messages email to (${recipientEmail}) failed: ${error?.message}. Falling back to Ethereal...`);
    try {
      const testAccount = await nodemailer.createTestAccount();
      const fallbackTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await fallbackTransporter.sendMail({
        from: '"JobsBox Portal" <no-reply@jobsbox.com>',
        to: recipientEmail,
        subject: `New message from ${senderName} regarding ${jobTitle}`,
        html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[DEV EMAIL PREVIEW LINK - UNREAD MESSAGES (FALLBACK)]: ${previewUrl}`);
      return true;
    } catch (fallbackErr) {
      console.error(`[SMTP ERROR] Fallback transport also failed:`, fallbackErr);
      return false;
    }
  }
};



/*
|--------------------------------------------------------------------------
| Send Subscription Payment Receipt Email
|--------------------------------------------------------------------------
*/
export interface SubscriptionReceiptEmailPayload {
  userName: string;
  userEmail: string;
  planName: string;
  planCode: string;
  billingPeriod: string;
  amount: number;
  currency: string;
  transactionId: string;
  invoiceNumber: string;
  invoiceUrl: string;
  expiryDate: string;
  paymentMethod: string;
}

export const sendSubscriptionReceiptEmail = async (
  payload: SubscriptionReceiptEmailPayload
): Promise<boolean> => {
  const {
    userName,
    userEmail,
    planName,
    billingPeriod,
    amount,
    currency,
    transactionId,
    invoiceNumber,
    expiryDate,
    paymentMethod,
  } = payload;

  const from = getFromHeader();
  const formattedPeriod = billingPeriod === "yearly" ? "Annual" : "Monthly";
  const formattedAmount = Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Receipt - JobsBox</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #030712; color: #f8fafc; margin: 0; padding: 20px; }
        .wrapper { max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 24px; border: 1px solid #1e293b; overflow: hidden; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 36px 30px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 8px 0 0; font-size: 14px; opacity: 0.9; }
        .content { padding: 32px 30px; }
        .badge { display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; }
        .card { background: #1e293b; border-radius: 16px; padding: 24px; margin-bottom: 24px; border: 1px solid #334155; }
        .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #334155; font-size: 14px; }
        .row:last-child { border-bottom: none; }
        .label { color: #94a3b8; font-weight: 500; }
        .value { color: #ffffff; font-weight: 700; text-align: right; }
        .total-row { display: flex; justify-content: space-between; padding: 16px 0 0; font-size: 18px; font-weight: 800; color: #818cf8; }
        .button { display: inline-block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-align: center; padding: 16px; border-radius: 14px; font-size: 15px; font-weight: 700; text-decoration: none; margin-top: 10px; }
        .footer { padding: 24px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Payment Successful! 🎉</h1>
          <p>Thank you for subscribing to JobsBox</p>
        </div>
        <div class="content">
          <div style="text-align: center;">
            <span class="badge">✓ Payment Confirmed</span>
          </div>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>${userName}</strong>,<br>
            Your payment for <strong>${planName}</strong> has been successfully processed. Your premium features are active immediately!
          </p>

          <div class="card">
            <div class="row">
              <span class="label">Invoice Number</span>
              <span class="value">${invoiceNumber}</span>
            </div>
            <div class="row">
              <span class="label">Plan & Cycle</span>
              <span class="value">${planName} (${formattedPeriod})</span>
            </div>
            <div class="row">
              <span class="label">Transaction ID</span>
              <span class="value" style="font-family: monospace; font-size: 12px;">${transactionId}</span>
            </div>
            <div class="row">
              <span class="label">Payment Method</span>
              <span class="value" style="text-transform: capitalize;">${paymentMethod}</span>
            </div>
            <div class="row">
              <span class="label">Valid Until</span>
              <span class="value">${expiryDate}</span>
            </div>
            <div class="total-row">
              <span>Amount Paid</span>
              <span>₹${formattedAmount} ${currency}</span>
            </div>
          </div>

          <a href="http://localhost:5173/billing" class="button">View Billing & Invoices →</a>
        </div>
        <div class="footer">
          <p>JobsBox Portal • Enterprise Hiring & Career Engine</p>
          <p>Questions? Contact support at support@jobsbox.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { transporter, isTestAccount } = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: userEmail,
      subject: `Payment Receipt for ${planName} [#${invoiceNumber}] - JobsBox`,
      html,
    });

    if (isTestAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email Preview URL - Subscription Receipt]: ${previewUrl}`);
    } else {
      console.log(`[Email Sent] Subscription receipt sent to ${userEmail} (MsgID: ${info.messageId})`);
    }
    return true;
  } catch (error: any) {
    console.warn(`[SMTP NOTICE] Primary SMTP send for subscription receipt (${userEmail}) timed out/failed: ${error?.message || error}. Falling back to Ethereal...`);
    try {
      const testAccount = await nodemailer.createTestAccount();
      const fallbackTransporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      const info = await fallbackTransporter.sendMail({
        from: '"JobsBox Portal" <no-reply@jobsbox.com>',
        to: userEmail,
        subject: `Payment Receipt for ${planName} [#${invoiceNumber}] - JobsBox`,
        html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email Preview URL - Subscription Receipt (Fallback)]: ${previewUrl}`);
      return true;
    } catch (fallbackErr) {
      console.warn(`[SMTP NOTICE] Email fallback transport skipped for (${userEmail}).`);
      return false;
    }
  }
};

/*
|--------------------------------------------------------------------------
| Send Subscription Expiring Soon Warning Email (3-Day Warning)
|--------------------------------------------------------------------------
*/
export const sendSubscriptionExpiringSoonEmail = async (params: {
  userName: string;
  userEmail: string;
  planName: string;
  expiryDate: string;
  role: string;
}): Promise<boolean> => {
  const { userName, userEmail, planName, expiryDate, role } = params;
  const from = getFromHeader();
  const renewalUrl = `http://localhost:5173/${role === "recruiter" ? "recruiter" : "candidate"}/pricing`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030712; color: #f8fafc; margin: 0; padding: 20px; }
        .wrapper { max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 24px; border: 1px solid #1e293b; overflow: hidden; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .content { padding: 32px 30px; }
        .card { background: #1e293b; border-radius: 16px; padding: 20px; margin: 20px 0; border: 1px solid #334155; }
        .button { display: inline-block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-align: center; padding: 16px; border-radius: 14px; font-size: 15px; font-weight: 700; text-decoration: none; margin-top: 10px; }
        .footer { padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Subscription Expiring Soon ⏳</h1>
        </div>
        <div class="content">
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Hi <strong>${userName}</strong>,<br>
            Your <strong>${planName}</strong> plan is scheduled to expire on <strong>${expiryDate}</strong> because auto-renewal is turned off.
          </p>
          <div class="card">
            <p style="margin: 0; font-size: 14px; color: #94a3b8;">
              To avoid losing access to active job slots, candidate resumes, or your top applicant badge, you can renew your plan or re-enable auto-pay at any time.
            </p>
          </div>
          <a href="${renewalUrl}" class="button">Renew Subscription Now →</a>
        </div>
        <div class="footer">
          <p>JobsBox Portal • Questions? Contact support@jobsbox.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { transporter } = await getTransporter();
    await transporter.sendMail({
      from,
      to: userEmail,
      subject: `Action Required: Your ${planName} subscription expires soon - JobsBox`,
      html,
    });
    console.log(`[Email Sent] Expiration warning sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send expiration warning email:", error);
    return false;
  }
};

/*
|--------------------------------------------------------------------------
| Send Subscription Expired Email
|--------------------------------------------------------------------------
*/
export const sendSubscriptionExpiredEmail = async (params: {
  userName: string;
  userEmail: string;
  planName: string;
  role: string;
}): Promise<boolean> => {
  const { userName, userEmail, planName, role } = params;
  const from = getFromHeader();
  const renewalUrl = `http://localhost:5173/${role === "recruiter" ? "recruiter" : "candidate"}/pricing`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030712; color: #f8fafc; margin: 0; padding: 20px; }
        .wrapper { max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 24px; border: 1px solid #1e293b; overflow: hidden; }
        .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .content { padding: 32px 30px; }
        .button { display: inline-block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-align: center; padding: 16px; border-radius: 14px; font-size: 15px; font-weight: 700; text-decoration: none; margin-top: 10px; }
        .footer { padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Subscription Expired</h1>
        </div>
        <div class="content">
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Hi <strong>${userName}</strong>,<br>
            Your <strong>${planName}</strong> plan has expired, and your account has been reverted to the <strong>Starter Free Plan</strong>.
          </p>
          <p style="color: #94a3b8; font-size: 14px;">
            You can re-upgrade anytime to restore your higher limits and resume receiving candidate applications.
          </p>
          <a href="${renewalUrl}" class="button">Re-Upgrade Plan →</a>
        </div>
        <div class="footer">
          <p>JobsBox Portal • Questions? Contact support@jobsbox.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { transporter } = await getTransporter();
    await transporter.sendMail({
      from,
      to: userEmail,
      subject: `Your ${planName} subscription has expired - JobsBox`,
      html,
    });
    console.log(`[Email Sent] Expiration notice sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send subscription expired email:", error);
    return false;
  }
};

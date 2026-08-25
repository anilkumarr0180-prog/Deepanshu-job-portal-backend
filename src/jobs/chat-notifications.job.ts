import cron from "node-cron";
import PendingEmailNotification from "../models/pending-email.model";
import User from "../models/user.model";
import Job from "../models/job.model";
import Message from "../models/message.model";
import { sendUnreadMessagesEmail } from "../services/email.service";

/*
|--------------------------------------------------------------------------
| Chat Notifications Cron Job (Smart Offline Debouncing)
|--------------------------------------------------------------------------
| Runs every minute. Checks for pending notifications where the `sendAt`
| time has passed (meaning the 15-minute debounce window is over).
| If the conversation still has unread messages, it sends the email.
| Regardless of whether the email was sent or skipped, the pending 
| record is deleted to prevent duplicate processing.
*/

export const initChatNotificationsJob = () => {
  // Run every minute: * * * * *
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      
      // Find all pending notifications where debounce timer has expired
      const pendingNotifications = await PendingEmailNotification.find({
        sendAt: { $lte: now }
      }).lean();

      if (pendingNotifications.length === 0) return;

      console.log(`[Notification Job] Processing ${pendingNotifications.length} pending offline notifications...`);

      for (const notification of pendingNotifications) {
        try {
          // Check if there are still unread messages for this user in this conversation
          const unreadCount = await Message.countDocuments({
            conversationId: notification.conversationId,
            senderId: { $ne: notification.recipientId },
            isRead: false,
            isDeleted: false,
          });

          if (unreadCount > 0) {
            // Fetch necessary data for the email
            const [recipient, sender, job] = await Promise.all([
              User.findById(notification.recipientId).lean(),
              User.findById(notification.senderId).lean(),
              Job.findById(notification.jobId).lean()
            ]);

            if (recipient && sender) {
              await sendUnreadMessagesEmail({
                recipientName: recipient.name,
                recipientEmail: recipient.email,
                senderName: sender.name,
                jobTitle: job?.title || "Community Networking",
                unreadCount,
              });
            }
          } else {
            console.log(`[Notification Job] Skipped email for user ${notification.recipientId} (messages were read).`);
          }

          // Delete the processed record
          await PendingEmailNotification.findByIdAndDelete(notification._id);

        } catch (innerErr) {
          console.error(`[Notification Job] Error processing notification ${notification._id}:`, innerErr);
        }
      }
    } catch (err) {
      console.error("[Notification Job] CRITICAL ERROR in chat notifications cron job:", err);
    }
  });

  console.log("🕒 Cron Job Started: Smart Offline Chat Notifications (Running every minute)");
};

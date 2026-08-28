const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Require compiled models/services or register ts-node
require("ts-node").register({ transpileOnly: true });

const Message = require("../models/message.model").default;
const Conversation = require("../models/conversation.model").default;
const User = require("../models/user.model").default;
const chatService = require("../services/chat.service");
const { sendMessageSchema, ALLOWED_VOICE_MIME_TYPES, MAX_VOICE_FILE_SIZE } = require("../validations/chat.validations");
const cloudinaryService = require("../services/cloudinary.service").default;

async function runVoiceMessageTests() {
  console.log("==================================================");
  console.log("🎤 JOBBOX VOICE MESSAGE BACKEND TESTS");
  console.log("==================================================");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // 1. Validation test: Valid voice message payload
  const validVoicePayload = {
    params: { id: new mongoose.Types.ObjectId().toHexString() },
    body: {
      message: "🎤 Voice message (0:15)",
      messageType: "voice",
      attachments: [
        {
          url: "https://res.cloudinary.com/demo/video/upload/v1/voice_123.webm",
          name: "voice_recording.webm",
          size: 45000,
          mimeType: "audio/webm;codecs=opus",
        },
      ],
    },
  };
  const validResult = sendMessageSchema.safeParse(validVoicePayload);
  if (!validResult.success) {
    console.error("validResult error:", JSON.stringify(validResult.error.format(), null, 2));
  }
  assert(validResult.success, "Valid voice message payload accepted by schema");

  // 2. Validation test: Voice message without attachment -> REJECTED
  const missingAttPayload = {
    params: { id: new mongoose.Types.ObjectId().toHexString() },
    body: {
      message: "🎤 Voice message",
      messageType: "voice",
      attachments: [],
    },
  };
  const missingAttResult = sendMessageSchema.safeParse(missingAttPayload);
  assert(!missingAttResult.success, "Voice message missing attachments is rejected");

  // 3. Validation test: Invalid audio MIME type -> REJECTED
  const badMimePayload = {
    params: { id: new mongoose.Types.ObjectId().toHexString() },
    body: {
      message: "🎤 Voice message",
      messageType: "voice",
      attachments: [
        {
          url: "https://res.cloudinary.com/demo/video/upload/v1/bad.exe",
          name: "bad.exe",
          size: 45000,
          mimeType: "application/x-msdownload",
        },
      ],
    },
  };
  const badMimeResult = sendMessageSchema.safeParse(badMimePayload);
  assert(!badMimeResult.success, "Voice message with non-audio MIME type is rejected");

  // 4. Validation test: Oversized voice message (> 5MB) -> REJECTED
  const oversizedPayload = {
    params: { id: new mongoose.Types.ObjectId().toHexString() },
    body: {
      message: "🎤 Voice message",
      messageType: "voice",
      attachments: [
        {
          url: "https://res.cloudinary.com/demo/video/upload/v1/huge.webm",
          name: "huge.webm",
          size: 6 * 1024 * 1024, // 6 MB
          mimeType: "audio/webm",
        },
      ],
    },
  };
  const oversizedResult = sendMessageSchema.safeParse(oversizedPayload);
  assert(!oversizedResult.success, "Voice message exceeding 5MB is rejected");

  // 5. Cloudinary signature test for chat-media
  const sig = cloudinaryService.generateUploadSignature("chat-media");
  assert(
    Boolean(sig.signature && sig.folder === "Job-portal/chat-media"),
    "Cloudinary generates upload signature for chat-media folder",
    JSON.stringify(sig)
  );

  // Setup Test DB entities
  const candidate = await User.findOne({ role: "candidate" }).lean();
  const recruiter = await User.findOne({ role: "recruiter" }).lean();

  if (!candidate || !recruiter) {
    console.warn("⚠️ Candidate or recruiter user not found in DB, skipping live integration test");
  } else {
    const candidateId = candidate._id.toString();
    const recruiterId = recruiter._id.toString();

    // 6. Create test conversation
    const conv = await chatService.createOrGetConversation(undefined, recruiterId, candidateId);
    const convId = conv._id.toString();
    assert(Boolean(convId), "Conversation created/retrieved");

    // 7. Persist voice message via service
    const voiceMsg = await chatService.createMessage(
      convId,
      candidateId,
      "",
      "voice",
      [
        {
          url: "https://res.cloudinary.com/demo/video/upload/v1/voice_test.webm",
          name: "voice_message.webm",
          size: 32000,
          mimeType: "audio/webm;codecs=opus",
        },
      ]
    );

    assert(voiceMsg.messageType === "voice", "Voice message persisted with messageType='voice'");
    assert(voiceMsg.message === "🎤 Voice message", "Empty text defaulted to safe fallback");
    assert(voiceMsg.attachments.length === 1, "Attachment persisted correctly");

    // 8. Verify Conversation lastMessage updated
    const updatedConv = await Conversation.findById(convId).lean();
    assert(
      updatedConv?.lastMessageId?.toString() === voiceMsg._id.toString(),
      "Conversation lastMessageId updated to voice message"
    );

    // 9. Unauthorized sender rejected
    const randomUser = new mongoose.Types.ObjectId().toHexString();
    let unauthorizedFailed = false;
    try {
      await chatService.createMessage(convId, randomUser, "hack", "voice", [
        { url: "https://foo.com/audio.webm", mimeType: "audio/webm" },
      ]);
    } catch {
      unauthorizedFailed = true;
    }
    assert(unauthorizedFailed, "Unauthorized sender rejected from posting to conversation");

    // 10. Attempt to edit voice message -> REJECTED
    let editVoiceFailed = false;
    try {
      await chatService.editMessage(voiceMsg._id.toString(), candidateId, "new text");
    } catch {
      editVoiceFailed = true;
    }
    assert(editVoiceFailed, "Voice message text editing is strictly prohibited");

    // 11. Normal text message still works
    const textMsg = await chatService.createMessage(convId, candidateId, "Hello text message", "text");
    assert(textMsg.messageType === "text" && textMsg.message === "Hello text message", "Standard text message still functions normally");

    // 12. Normal file/image message still works
    const fileMsg = await chatService.createMessage(convId, candidateId, "Check this doc", "file", [
      { url: "https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf", name: "doc.pdf", mimeType: "application/pdf" },
    ]);
    assert(fileMsg.messageType === "file" && fileMsg.attachments.length === 1, "File message still functions normally");

    // 13. Mark as read works for voice messages
    const readResult = await chatService.markMessageAsRead(voiceMsg._id.toString(), recruiterId);
    assert(readResult.isRead === true, "Recipient successfully marked voice message as read");

    // 14. Delete voice message works
    const deletedVoice = await chatService.deleteMessage(voiceMsg._id.toString(), candidateId, true);
    assert(deletedVoice.isDeleted === true, "Voice message deleted for everyone successfully");

    // Cleanup test messages
    await Message.deleteMany({ conversationId: convId, _id: { $in: [voiceMsg._id, textMsg._id, fileMsg._id] } });
  }

  await mongoose.disconnect();
  console.log("==================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVoiceMessageTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

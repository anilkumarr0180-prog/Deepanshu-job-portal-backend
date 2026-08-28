const fs = require('fs');
const path = require('path');

const serverSrc = path.resolve(__dirname, '..');

// 1. Update message.model.ts
const messageModelPath = path.join(serverSrc, 'models/message.model.ts');
let messageModel = fs.readFileSync(messageModelPath, 'utf8');

messageModel = messageModel.replace(
  'export type MessageType = "text" | "image" | "file" | "system";',
  'export type MessageType = "text" | "image" | "file" | "system" | "voice";'
);
messageModel = messageModel.replace(
  'enum: ["text", "image", "file", "system"],',
  'enum: ["text", "image", "file", "system", "voice"],'
);

fs.writeFileSync(messageModelPath, messageModel);
console.log('✅ Updated models/message.model.ts');

// 2. Update chat.service.ts line 405
const chatServicePath = path.join(serverSrc, 'services/chat.service.ts');
let chatService = fs.readFileSync(chatServicePath, 'utf8');

chatService = chatService.replace(
  '    message: messageText.trim(),',
  '    message: content,'
);

fs.writeFileSync(chatServicePath, chatService);
console.log('✅ Updated services/chat.service.ts message: content');

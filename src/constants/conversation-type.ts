// Type of conversation (mirrors friend's conversation_type PostgreSQL enum)
export const CONVERSATION_TYPE = {
  DIRECT: "DIRECT",
  GROUP: "GROUP",
  SYSTEM: "SYSTEM",
} as const;

export type ConversationType =
  (typeof CONVERSATION_TYPE)[keyof typeof CONVERSATION_TYPE];

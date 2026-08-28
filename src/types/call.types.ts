export type CallStatus =
  | "ringing"
  | "accepted"
  | "ended"
  | "cancelled"
  | "declined"
  | "busy"
  | "missed";

export interface CallParticipant {
  userId: string;
  socketId: string;
  name?: string;
  profilePicture?: string;
  role?: string;
}

export interface CallSession {
  callId: string;
  conversationId: string;
  caller: CallParticipant;
  callee: CallParticipant;
  status: CallStatus;
  startedAt: Date;
  acceptedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  timeoutTimer?: NodeJS.Timeout;
  hasOffered?: boolean;
  hasAnswered?: boolean;
}

export interface CallInitiateData {
  conversationId: string;
}

export interface CallAcceptData {
  callId: string;
}

export interface CallRejectData {
  callId: string;
  reason?: "declined" | "busy";
}

export interface CallCancelData {
  callId: string;
}

export interface CallEndData {
  callId: string;
}

export interface CallOfferData {
  callId: string;
  sdp: any;
}

export interface CallAnswerData {
  callId: string;
  sdp: any;
}

export interface CallIceCandidateData {
  callId: string;
  candidate: any;
}

export interface CallFailedData {
  callId: string;
  reason?: string;
  message?: string;
}

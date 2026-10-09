export const MODULE_NAME = "dragme";
export const EXPIRE_TASK = "dragme:expire";
export const REQUEST_KEY = "request";

export type RequestStatus = "pending" | "accepted" | "declined" | "expired";

export interface DragRequestRecord {
  requestId: string;
  guildId: string;
  requesterId: string;
  targetUserId: string;
  channelId: string;
  cardChannelId: string;
  cardMessageId: string;
  status: RequestStatus;
  createdAt: number;
  expiresAt: number;
}

export interface ExpirePayload {
  requestId: string;
  guildId: string;
}

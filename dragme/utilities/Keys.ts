export const MODULE_NAME = "dragme";
export const EXPIRE_ONESHOT = "expire";
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

export interface ExpireOneshotData {
  requestId: string;
}

export function requestKvKey(requestId: string): string {
  return `${REQUEST_KEY}:${requestId}`;
}

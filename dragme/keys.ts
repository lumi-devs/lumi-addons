export const MODULE_NAME = "dragme";

export const DragmeKeys = {
  /** JSON `DragRequest`, TTL = request timeout. One live request per user. */
  request: (guildId: string, userId: string) =>
    `lumi:addon:dragme:req:${guildId}:${userId}`,
  /** Set of user ids with a live request, for `/dragme-admin active`. */
  activeSet: (guildId: string) => `lumi:addon:dragme:active:${guildId}`,
} as const;

export const dragmeExpireJobId = (guildId: string, userId: string) =>
  `dragme-expire:${guildId}:${userId}`;
export const dragmeRevokeJobId = (guildId: string, userId: string) =>
  `dragme-revoke:${guildId}:${userId}`;

export interface DragRequest {
  guildId: string;
  userId: string;
  targetChannelId: string;
  /** Channel + message of the request card, for later edits. */
  cardChannelId: string;
  cardMessageId: string;
  createdAt: number;
  expiresAt: number;
}

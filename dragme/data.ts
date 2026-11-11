import type { ModuleServices } from "@lumi/module-kit";

export const ModuleName = "dragme";
export const PendingKey = "pending";
export const SweepGraceMs = 10 * 60_000;

export interface DragRequest {
  requestId: string;
  guildId: string;
  requesterId: string;
  targetUserId: string;
  channelId: string;
  cardChannelId: string;
  cardMessageId: string;
  createdAt: number;
  expiresAt: number;
}

export function getPendingRequest(
  services: ModuleServices,
  guildId: string,
  requesterId: string,
): Promise<DragRequest | null> {
  return services.helpers.moduleData.get<DragRequest>(
    guildId,
    ModuleName,
    requesterId,
    PendingKey,
  );
}

export function savePendingRequest(
  services: ModuleServices,
  request: DragRequest,
  ttlMs: number,
): Promise<void> {
  return services.helpers.moduleData.set(
    request.guildId,
    ModuleName,
    request.requesterId,
    PendingKey,
    request,
    { ttlMs },
  );
}

export function deletePendingRequest(
  services: ModuleServices,
  guildId: string,
  requesterId: string,
): Promise<number> {
  return services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    requesterId,
    PendingKey,
  );
}

export async function claimPendingRequest(
  services: ModuleServices,
  guildId: string,
  requesterId: string,
  requestId: string,
): Promise<DragRequest | null> {
  const current = await getPendingRequest(services, guildId, requesterId);
  if (!current || current.requestId !== requestId) return null;

  const claimed = await services.helpers.moduleData.take<DragRequest>(
    guildId,
    ModuleName,
    requesterId,
    PendingKey,
  );
  if (!claimed) return null;
  if (claimed.requestId !== requestId) {
    await savePendingRequest(
      services,
      claimed,
      Math.max(60_000, claimed.expiresAt - Date.now() + SweepGraceMs),
    );
    return null;
  }
  return claimed;
}

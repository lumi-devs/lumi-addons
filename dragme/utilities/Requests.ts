import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME, REQUEST_KEY, type DragRequestRecord } from "./Keys.js";

export async function getRequest(
  services: Container,
  guildId: string,
  requestId: string,
): Promise<DragRequestRecord | null> {
  return services.db.guildKV.getModuleData<DragRequestRecord>(
    guildId,
    MODULE_NAME,
    requestId,
    REQUEST_KEY,
  );
}

export async function setRequest(
  services: Container,
  req: DragRequestRecord,
  opts?: { ttlMs?: number },
): Promise<void> {
  await services.db.guildKV.setModuleData(
    req.guildId,
    MODULE_NAME,
    req.requestId,
    REQUEST_KEY,
    req,
    opts,
  );
}

export async function deleteRequest(
  services: Container,
  guildId: string,
  requestId: string,
): Promise<void> {
  await services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    requestId,
    REQUEST_KEY,
  );
}

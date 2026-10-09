import { get, remove, set } from "lumi/kv";
import { REQUEST_KEY, type DragRequestRecord } from "../keys.js";

export async function getRequest(
  guildId: string,
  requestId: string,
): Promise<DragRequestRecord | null> {
  return get<DragRequestRecord>(guildId, requestId, REQUEST_KEY);
}

export async function setRequest(req: DragRequestRecord): Promise<void> {
  await set(req.guildId, req.requestId, REQUEST_KEY, req);
}

export async function deleteRequest(
  guildId: string,
  requestId: string,
): Promise<void> {
  await remove(guildId, requestId, REQUEST_KEY);
}

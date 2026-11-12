import type { ModuleServices } from "@lumi/module-kit";
import type { ModalSubmitInteraction } from "discord.js";

export interface UploadedImage {
  url: string;
  filename: string;
  contentType: string | null;
}

export function readUploadedImage(
  interaction: ModalSubmitInteraction,
  customId: string,
): UploadedImage | null {
  const files = interaction.fields.getUploadedFiles(customId, false);
  const file = files?.first();
  if (!file) return null;
  return {
    url: file.url,
    filename: file.name,
    contentType: file.contentType,
  };
}

export async function rehostUpload(
  services: ModuleServices,
  upload: UploadedImage,
  channelId: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(upload.url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    !/(^|\.)discord(app)?\.(com|net)$/i.test(parsed.hostname)
  ) {
    return null;
  }

  const response = await fetch(upload.url).catch(() => null);
  if (!response?.ok) return null;

  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0) return null;

  const channel = await services.client.channels
    .fetch(channelId)
    .catch(() => null);
  if (!channel?.isSendable()) return null;

  const message = await channel
    .send({
      files: [{ attachment: data, name: upload.filename.slice(0, 100) || "upload.png" }],
    })
    .catch(() => null);

  return message?.attachments.first()?.url ?? null;
}

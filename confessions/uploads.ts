import type { ModalSubmitInteraction } from "discord.js";

export interface UploadedImage {
  url: string;
  contentType: string | null;
}

function stableCdnUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (!/(^|\.)discordapp\.(com|net)$/i.test(parsed.hostname)) return raw;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

export function readUploadedImage(
  interaction: ModalSubmitInteraction,
  customId: string,
): UploadedImage | null {
  const files = interaction.fields.getUploadedFiles(customId, false);
  const file = files?.first();
  if (!file) return null;
  return {
    url: stableCdnUrl(file.url),
    contentType: file.contentType,
  };
}
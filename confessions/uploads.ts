import { AttachmentBuilder, type ModalSubmitInteraction } from "discord.js";

export interface UploadedImage {
  url: string;
  contentType: string | null;
  size: number;
}

const MaxImageBytes = 10 * 1024 * 1024;

export function stableCdnUrl(raw: string): string {
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
    url: file.url,
    contentType: file.contentType,
    size: file.size,
  };
}

function imageExtension(contentType: string | null): string {
  const subtype = contentType?.split("/")[1]?.toLowerCase();
  if (subtype === "jpeg") return "jpg";
  if (subtype === "png" || subtype === "gif" || subtype === "webp") {
    return subtype;
  }
  return "png";
}

export async function attachmentFromUpload(
  image: UploadedImage,
): Promise<AttachmentBuilder | null> {
  if (image.size > MaxImageBytes) return null;
  const response = await fetch(image.url, {
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MaxImageBytes) return null;
  return new AttachmentBuilder(bytes, {
    name: `image.${imageExtension(image.contentType)}`,
  });
}

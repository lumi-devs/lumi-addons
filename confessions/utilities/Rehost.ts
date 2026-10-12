import type { Container } from "@lumi-devs/lumi/lib/Services.js";

export async function rehostUpload(
  services: Container,
  url: string,
  filename: string,
  channelId: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    !/(^|\.)discord(app)?\.(com|net)$/i.test(parsed.hostname)
  ) {
    return null;
  }
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;

  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0) return null;

  const channel = await services.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) return null;

  const msg = await channel
    .send({
      files: [{ attachment: data, name: filename.slice(0, 100) || "upload.png" }],
    })
    .catch(() => null);

  const rehosted = msg?.attachments.first();
  return rehosted?.url ?? null;
}

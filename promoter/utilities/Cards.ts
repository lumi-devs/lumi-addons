import type { Container } from "@lumi-devs/lumi/services";
import { makeInfoCard } from "@lumi-devs/lumi/ui";
import type { PromoterConfig } from "./Engine.js";
import { cutText } from "./Engine.js";

async function sendLogCard(
  services: Container,
  logChannelId: string | null,
  heading: string,
  body: string,
  avatarUrl: string,
): Promise<void> {
  if (!logChannelId) return;
  try {
    const ch = await services.client.channels.fetch(logChannelId);
    if (!ch || !ch.isSendable()) return;
    const card = makeInfoCard(heading, body, { thumbnail: avatarUrl });
    await ch.send({ ...card, allowedMentions: { parse: ["users"] } });
  } catch {
    return;
  }
}

export function logGrant(
  services: Container,
  config: PromoterConfig,
  userId: string,
  avatarUrl: string,
  source: string,
): Promise<void> {
  const lines = [`<@${userId}> is promoting our server!!`];
  if (config.grantMessage.length > 0) lines.push(cutText(config.grantMessage, 200));
  lines.push(`> ${cutText(source, 100)}`);
  return sendLogCard(services, config.logChannelId, "# 🍥 THANK YOU!!!!", lines.join("\n"), avatarUrl);
}

export function logRevoke(
  services: Container,
  logChannelId: string | null,
  userId: string,
  avatarUrl: string,
  prevSource: string,
): Promise<void> {
  return sendLogCard(
    services,
    logChannelId,
    "# 🍥 GOODBYE :(",
    `<@${userId}> stopped promoting us\n\n> ${cutText(prevSource || "promotion", 100)}`,
    avatarUrl,
  );
}

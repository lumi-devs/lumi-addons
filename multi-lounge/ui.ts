import { type CardReply, makeInfoCard } from "@lumi/ui";
import type { Config, LoungeStats } from "./data.js";
import type { BaseOccupancy } from "./lounge.js";

function groupBlock(group: BaseOccupancy): string {
  const heading = group.baseExists
    ? `**<#${group.baseId}>** — ${group.baseCount} in base`
    : `**<#${group.baseId}>** — *base channel missing*`;
  const lines = [heading];
  for (const extra of group.extras) {
    lines.push(`> <#${extra.channelId}> · \`#${extra.number}\` — ${extra.count}`);
  }
  if (group.extras.length === 0) {
    lines.push("> *No managed extras.*");
  }
  return lines.join("\n");
}

export function statsCard(
  config: Config,
  groups: readonly BaseOccupancy[],
  stats: LoungeStats,
): CardReply {
  const body: string[] = [
    `Busy at **${config.busyThreshold}** users · up to **${config.maxExtras}** extras per base · **${config.creationCooldownSeconds}s** creation cooldown`,
  ];

  if (groups.length === 0) {
    body.push("*No base lounges configured.*");
  } else {
    for (const group of groups) {
      body.push(groupBlock(group));
    }
  }

  body.push(
    `-# Created **${stats.creations}** · Removed **${stats.deletions}** · Peak **${stats.peakUsers}** concurrent`,
  );

  return makeInfoCard("Multi Lounge", body);
}
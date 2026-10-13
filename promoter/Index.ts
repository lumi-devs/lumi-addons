import { defineModule } from "@lumi-devs/lumi/module";
import { cfg, toStringArray } from "@lumi-devs/lumi/config";
import type { Container } from "@lumi-devs/lumi/services";
import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { MODULE_NAME, PromoterData, type MemberState, type PromoterStats } from "./utilities/Keys.js";
import { statusMatches, wearsServerTag } from "./utilities/Matching.js";

export interface PromoterConfig {
  roleId: string | null;
  logChannelId: string | null;
  matchTerms: string[];
  detectServerTag: boolean;
  grantMessage: string;
}

export async function getPromoterConfig(
  services: Container,
  guildId: string,
): Promise<PromoterConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [role, log, matchTerms, tag, message] = await Promise.all([
    get("promoter_role_id"),
    get("log_channel_id"),
    get("match_terms"),
    get("detect_server_tag"),
    get("grant_message"),
  ]);
  return {
    roleId: typeof role === "string" && role.length > 0 ? role : null,
    logChannelId: typeof log === "string" && log.length > 0 ? log : null,
    matchTerms: toStringArray(matchTerms),
    detectServerTag: typeof tag === "boolean" ? tag : true,
    grantMessage: typeof message === "string" ? message : "",
  };
}

export async function getStats(
  services: Container,
  guildId: string,
): Promise<PromoterStats> {
  const [granted, revoked] = await Promise.all([
    services.db.guildKV.getModuleData<number>(guildId, MODULE_NAME, PromoterData.META, PromoterData.GRANTED),
    services.db.guildKV.getModuleData<number>(guildId, MODULE_NAME, PromoterData.META, PromoterData.REVOKED),
  ]);
  return {
    granted: typeof granted === "number" ? granted : 0,
    revoked: typeof revoked === "number" ? revoked : 0,
  };
}

export async function getMemberState(
  services: Container,
  guildId: string,
  userId: string,
): Promise<MemberState | null> {
  return services.db.guildKV.getModuleData<MemberState>(guildId, MODULE_NAME, userId, PromoterData.STATE);
}

function cutText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function describeSource(status: string, statusMatched: boolean, worn: boolean): string {
  const reasons: string[] = [];
  if (statusMatched) reasons.push(status || "custom status");
  if (worn) reasons.push("adopted the server tag");
  return reasons.join(" + ") || "promotion";
}

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
    const card = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading))
      .addSeparatorComponents(new SeparatorBuilder())
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: avatarUrl } })),
      );
    await ch.send({
      flags: MessageFlags.IsComponentsV2,
      components: [card],
      allowedMentions: { parse: ["users"] },
    });
  } catch {
    return;
  }
}

function logGrant(
  services: Container,
  config: PromoterConfig,
  userId: string,
  avatarUrl: string,
  source: string,
): Promise<void> {
  const lines = [`<@${userId}> is promoting our server!!`];
  if (config.grantMessage.length > 0) lines.push(`"${cutText(config.grantMessage, 200)}"`);
  lines.push(`> ${cutText(source, 100)}`);
  return sendLogCard(services, config.logChannelId, "# 🍥 THANK YOU!!!!", lines.join("\n"), avatarUrl);
}

function logRevoke(
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

export type EvaluateResult =
  | "granted"
  | "revoked"
  | "holding"
  | "not-holding"
  | "unconfigured";

export async function converge(
  services: Container,
  input: {
    guildId: string;
    userId: string;
    status?: string;
    worn?: boolean;
    roles?: string[];
  },
): Promise<EvaluateResult> {
  const config = await getPromoterConfig(services, input.guildId);
  if (!config.roleId || config.matchTerms.length === 0) return "unconfigured";
  const { guildId, userId } = input;

  const stored: MemberState = (await getMemberState(services, guildId, userId)) ?? {
    status: "",
    worn: false,
    has: false,
    source: "",
  };
  const facts: MemberState = {
    status: input.status ?? stored.status,
    worn: input.worn ?? stored.worn,
    has: stored.has,
    source: stored.source ?? "",
  };
  if (input.roles !== undefined) facts.has = input.roles.includes(config.roleId);

  const matched = statusMatches(facts.status, config.matchTerms);
  const want = matched || (config.detectServerTag && facts.worn);

  if (want === facts.has) {
    if (facts.status !== stored.status || facts.worn !== stored.worn || facts.has !== stored.has) {
      await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, PromoterData.STATE, facts);
    }
    return facts.has ? "holding" : "not-holding";
  }

  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return "unconfigured";
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return "unconfigured";

  if (member.roles.cache.has(config.roleId) === want) {
    const corrected: MemberState = { ...facts, has: want, source: want ? describeSource(facts.status, matched, facts.worn && config.detectServerTag) : facts.source };
    await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, PromoterData.STATE, corrected);
    return want ? "holding" : "not-holding";
  }

  if (want) await member.roles.add(config.roleId);
  else await member.roles.remove(config.roleId);

  const source = describeSource(facts.status, matched, facts.worn && config.detectServerTag);
  await services.db.guildKV.incrModuleData(guildId, MODULE_NAME, PromoterData.META, want ? PromoterData.GRANTED : PromoterData.REVOKED);
  const avatarUrl = member.displayAvatarURL({ size: 256 });
  if (want) await logGrant(services, config, userId, avatarUrl, source);
  else await logRevoke(services, config.logChannelId, userId, avatarUrl, facts.source);
  await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, PromoterData.STATE, { ...facts, has: want, source: want ? source : "" });
  return want ? "granted" : "revoked";
}

export async function sweep(services: Container, guildId: string): Promise<number> {
  const config = await getPromoterConfig(services, guildId);
  if (!config.roleId) return 0;
  const rows = await services.db.guildKV.listModuleData<MemberState>({
    module: MODULE_NAME,
    key: PromoterData.STATE,
    guildId,
  });
  const holding = rows.filter((r) => r.value?.has);
  if (holding.length === 0) return 0;

  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return 0;

  let revoked = 0;
  for (const row of holding) {
    const member = await guild.members.fetch(row.targetId).catch(() => null);
    if (!member) continue;
    const result = await converge(services, {
      guildId,
      userId: row.targetId,
      worn: wearsServerTag(member.user.primaryGuild, guildId),
      roles: [...member.roles.cache.keys()],
    });
    if (result === "revoked") revoked++;
  }
  return revoked;
}

export const promoterModule = defineModule({
  name: MODULE_NAME,
  displayName: "Promoter",
  emoji: "📣",
  description:
    "Rewards members who advertise the server in their custom status or server tag with a configurable role, removed automatically when the promotion stops. Includes thank-you and goodbye log cards.",
  short: "Auto-role for members advertising the server.",
  version: "1.0.0",
  endUserDataStatement:
    "Processes Discord user presence text in real-time to check for server promotions. Stores per-member cached state (status text, tag flag, role flag, promotion source) per guild; does not store personal profile data outside the bot instance.",
  category: "Community",
  configSchema: cfg.object({
    promoter_role_id: cfg.role({
      label: "Promoter Role",
      description: "Role granted to members advertising the server.",
      required: true,
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel for thank-you and goodbye log cards. Leave blank to disable.",
      required: false,
    }),
    match_terms: cfg.stringList({
      label: "Match Terms",
      description: "Phrases to look for in custom status (e.g. the server invite slug).",
      required: true,
    }),
    grant_message: cfg.string({
      label: "Grant Message",
      description: "Custom message quoted in the thank-you log card. Leave blank to skip.",
      required: false,
      default: "",
    }),
    detect_server_tag: cfg.boolean({
      label: "Detect Server Tag",
      description: "Also grant the role to members wearing the native server tag.",
      default: true,
    }),
  }),

  onLoad(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      void sweep(services, guild.id).catch(() => undefined);
    }
  },

  async reconcileScheduledJobs(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!(await services.db.modules.isModuleEnabled(guild.id, MODULE_NAME))) continue;
      await sweep(services, guild.id).catch(() => undefined);
    }
  },

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await services.db.guildKV.deleteModuleDataForTarget(MODULE_NAME, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleDataForTarget<MemberState>(MODULE_NAME, userId);
    if (rows.length === 0) return null;
    return { states: rows.map((r) => ({ guildId: r.guildId, ...r.value })) };
  },
});

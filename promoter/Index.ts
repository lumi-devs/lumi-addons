import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import type { Container } from "@lumi-devs/lumi/services";
import { toStringArray } from "@lumi-devs/lumi/config";
import { MODULE_NAME, PromoterData, type MemberState, type PromoterStats } from "./utilities/Keys.js";
import { statusMatches, wearsServerTag } from "./utilities/Matching.js";

export interface PromoterConfig {
  roleId: string | null;
  logChannelId: string | null;
  matchTerms: string[];
  detectServerTag: boolean;
}

export async function getPromoterConfig(
  services: Container,
  guildId: string,
): Promise<PromoterConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [role, log, matchTerms, tag] = await Promise.all([
    get("promoter_role_id"),
    get("log_channel_id"),
    get("match_terms"),
    get("detect_server_tag"),
  ]);
  return {
    roleId: typeof role === "string" && role.length > 0 ? role : null,
    logChannelId: typeof log === "string" && log.length > 0 ? log : null,
    matchTerms: toStringArray(matchTerms),
    detectServerTag: typeof tag === "boolean" ? tag : true,
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

async function bumpStats(
  services: Container,
  guildId: string,
  field: typeof PromoterData.GRANTED | typeof PromoterData.REVOKED,
): Promise<void> {
  await services.db.guildKV.incrModuleData(guildId, MODULE_NAME, PromoterData.META, field);
}

export async function getMemberState(
  services: Container,
  guildId: string,
  userId: string,
): Promise<MemberState | null> {
  return services.db.guildKV.getModuleData<MemberState>(guildId, MODULE_NAME, userId, PromoterData.STATE);
}

async function setMemberState(
  services: Container,
  guildId: string,
  userId: string,
  state: MemberState,
): Promise<void> {
  await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, PromoterData.STATE, state);
}

function cutText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}

async function logGrant(
  services: Container,
  logChannelId: string | null,
  userId: string,
  status: string,
): Promise<void> {
  if (!logChannelId) return;
  try {
    const ch = await services.client.channels.fetch(logChannelId);
    if (!ch || !ch.isSendable()) return;
    await ch.send({
      content: `<@${userId}> is advertising the server.\n> ${cutText(status, 100)}`,
      allowedMentions: { parse: [] },
    });
  } catch {
    return;
  }
}

async function logRevoke(
  services: Container,
  logChannelId: string | null,
  userId: string,
): Promise<void> {
  if (!logChannelId) return;
  try {
    const ch = await services.client.channels.fetch(logChannelId);
    if (!ch || !ch.isSendable()) return;
    await ch.send({
      content: `<@${userId}> stopped advertising the server.`,
      allowedMentions: { parse: [] },
    });
  } catch {
    return;
  }
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

  const stored = (await getMemberState(services, guildId, userId)) ?? {
    status: "",
    worn: false,
    has: false,
  };
  const facts: MemberState = {
    status: input.status ?? stored.status,
    worn: input.worn ?? stored.worn,
    has: stored.has,
  };
  if (input.roles !== undefined) facts.has = input.roles.includes(config.roleId);

  const want =
    statusMatches(facts.status, config.matchTerms) ||
    (config.detectServerTag && facts.worn);
  if (want === facts.has) {
    if (
      facts.status !== stored.status ||
      facts.worn !== stored.worn ||
      facts.has !== stored.has
    ) {
      await setMemberState(services, guildId, userId, facts);
    }
    return facts.has ? "holding" : "not-holding";
  }

  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return "unconfigured";
  try {
    const member = await guild.members.fetch(userId);
    if (want) await member.roles.add(config.roleId);
    else await member.roles.remove(config.roleId);
  } catch {
    return "unconfigured";
  }
  await bumpStats(services, guildId, want ? PromoterData.GRANTED : PromoterData.REVOKED);
  if (want) await logGrant(services, config.logChannelId, userId, facts.status || "server tag");
  else await logRevoke(services, config.logChannelId, userId);
  await setMemberState(services, guildId, userId, { ...facts, has: want });
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

  const rolesCache = await guild.roles.fetch();
  let revoked = 0;
  for (const row of holding) {
    const member = await guild.members.fetch(row.targetId).catch(() => null);
    if (!member) continue;
    const roles = [...rolesCache.values()].filter((r) => member.roles.cache.has(r.id)).map((r) => r.id);
    const result = await converge(services, {
      guildId,
      userId: row.targetId,
      worn: wearsServerTag(member.user.primaryGuild, guildId),
      roles,
    });
    if (result === "revoked") revoked++;
  }
  return revoked;
}

export const promoterModule = defineModule({
  name: MODULE_NAME,
  displayName: "Promoter",
  emoji: "\u{1F4E3}",
  description:
    "Rewards members who advertise the server in their custom status (invite link or server tag) with a configurable role, removed automatically when the status changes. Includes log cards and a persistent check-me panel.",
  short: "Auto-role for members advertising the server.",
  version: "1.0.0",
  endUserDataStatement:
    "Processes Discord user presence text in real-time to check for server promotions. Stores per-member cached state (status text, tag flag, role flag) per guild; does not store personal profile data outside the bot instance.",
  category: "Community",
  configSchema: cfg.object({
    promoter_role_id: cfg.role({
      label: "Promoter Role",
      description: "Role granted to members advertising the server.",
      required: true,
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel for grant/revoke log cards. Leave blank to disable.",
      required: false,
    }),
    match_terms: cfg.stringList({
      label: "Match Terms",
      description: "Phrases to look for in custom status (e.g. the server invite slug).",
      required: true,
    }),
    detect_server_tag: cfg.boolean({
      label: "Detect Server Tag",
      description: "Also grant the role to members wearing the native server tag.",
      default: true,
    }),
  }),

  onLoad(services: Container) {
    void services.client.guilds.cache.forEach((guild) => {
      void sweep(services, guild.id).catch(() => undefined);
    });
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

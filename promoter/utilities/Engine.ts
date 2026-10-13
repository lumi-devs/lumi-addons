import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME, PromoterData, type MemberState, type PromoterStats } from "./Keys.js";
import { statusMatches, wearsServerTag } from "./Matching.js";
import { logGrant, logRevoke } from "./Cards.js";
import { toStringArray } from "@lumi-devs/lumi/config";

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

export function cutText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function describeSource(status: string, statusMatched: boolean, worn: boolean): string {
  const reasons: string[] = [];
  if (statusMatched) reasons.push(status || "custom status");
  if (worn) reasons.push("adopted the server tag");
  return reasons.join(" + ") || "promotion";
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

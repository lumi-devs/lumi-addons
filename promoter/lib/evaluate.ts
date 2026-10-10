import { getModuleConfig } from "lumi/config";
import { toStringArray } from "lumi";
import { get, incr, list, set } from "lumi/kv";
import { channels, guilds, members } from "lumi/discord";
import { makeSuccessCard, makeWarningCard, noPingCard } from "lumi/ui";
import { PromoterData, type PromoterStats } from "../keys.js";
import { statusMatches, wearsServerTag } from "./matching.js";

export interface PromoterConfig {
  roleId: string | null;
  logChannelId: string | null;
  matchTerms: string[];
  detectServerTag: boolean;
  sweepIntervalMinutes: number;
}

export interface MemberState {
  status: string;
  worn: boolean;
  has: boolean;
}

export async function getPromoterConfig(
  guildId: string,
): Promise<PromoterConfig> {
  const [role, log, matchTerms, tag, sweep] = await Promise.all([
    getModuleConfig("promoter_role_id", guildId),
    getModuleConfig("log_channel_id", guildId),
    getModuleConfig("match_terms", guildId),
    getModuleConfig("detect_server_tag", guildId),
    getModuleConfig("sweep_interval_minutes", guildId),
  ]);
  return {
    roleId:
      typeof role === "string" && role.length > 0 ? role : null,
    logChannelId:
      typeof log === "string" && log.length > 0 ? log : null,
    matchTerms: toStringArray(matchTerms),
    detectServerTag: typeof tag === "boolean" ? tag : true,
    sweepIntervalMinutes:
      typeof sweep === "number" && sweep >= 5 ? sweep : 30,
  };
}

export async function getStats(guildId: string): Promise<PromoterStats> {
  const [granted, revoked] = await Promise.all([
    get<number>(guildId, PromoterData.META, PromoterData.GRANTED),
    get<number>(guildId, PromoterData.META, PromoterData.REVOKED),
  ]);
  return {
    granted: typeof granted === "number" ? granted : 0,
    revoked: typeof revoked === "number" ? revoked : 0,
  };
}

export async function bumpStats(
  guildId: string,
  field: typeof PromoterData.GRANTED | typeof PromoterData.REVOKED,
): Promise<void> {
  await incr(guildId, PromoterData.META, field);
}

export async function getState(
  guildId: string,
  userId: string,
): Promise<MemberState | null> {
  return get<MemberState>(guildId, userId, PromoterData.STATE);
}

export async function listStates(
  guildId: string,
): Promise<{ targetId: string; value: MemberState }[]> {
  const rows = await list<MemberState>(PromoterData.STATE, guildId);
  return rows.filter((row) => typeof row.value === "object" && row.value !== null);
}

/** Discord activity type for a custom status. */
const CUSTOM_STATUS_TYPE = 4;

export function statusTextOf(
  activities: { type: number; state: string | null }[],
): string {
  return activities.find((a) => a.type === CUSTOM_STATUS_TYPE)?.state ?? "";
}

function cutText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function logGrant(
  logChannelId: string | null,
  userId: string,
  status: string,
): Promise<void> {
  if (!logChannelId) return;
  try {
    await channels.send(
      logChannelId,
      noPingCard(
        makeSuccessCard(
          "Promoter Role Granted",
          `<@${userId}> is advertising the server.\n> ${cutText(status, 100)}`,
        ),
      ),
    );
  } catch {
    return;
  }
}

async function logRevoke(
  logChannelId: string | null,
  userId: string,
): Promise<void> {
  if (!logChannelId) return;
  try {
    await channels.send(
      logChannelId,
      noPingCard(
        makeWarningCard(
          "Promoter Role Removed",
          `<@${userId}> stopped advertising the server.`,
        ),
      ),
    );
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

export async function converge(input: {
  guildId: string;
  userId: string;
  status?: string;
  worn?: boolean;
  roles?: string[];
}): Promise<EvaluateResult> {
  const cfg = await getPromoterConfig(input.guildId);
  if (!cfg.roleId || cfg.matchTerms.length === 0) return "unconfigured";
  const { guildId, userId } = input;

  const stored = (await getState(guildId, userId)) ?? {
    status: "",
    worn: false,
    has: false,
  };
  const facts = {
    status: input.status ?? stored.status,
    worn: input.worn ?? stored.worn,
    has: stored.has,
  };
  if (input.roles) facts.has = input.roles.includes(cfg.roleId);

  const want =
    statusMatches(facts.status, cfg.matchTerms) ||
    (cfg.detectServerTag && facts.worn);
  if (want === facts.has) {
    if (
      facts.status !== stored.status ||
      facts.worn !== stored.worn ||
      facts.has !== stored.has
    ) {
      await set(guildId, userId, PromoterData.STATE, facts);
    }
    return facts.has ? "holding" : "not-holding";
  }

  try {
    if (want) await members.addRole(guildId, userId, cfg.roleId);
    else await members.removeRole(guildId, userId, cfg.roleId);
  } catch {
    return "unconfigured";
  }
  await bumpStats(
    guildId,
    want ? PromoterData.GRANTED : PromoterData.REVOKED,
  );
  if (want) await logGrant(cfg.logChannelId, userId, facts.status || "server tag");
  else await logRevoke(cfg.logChannelId, userId);
  await set(guildId, userId, PromoterData.STATE, { ...facts, has: want });
  return want ? "granted" : "revoked";
}

export async function sweep(guildId: string): Promise<number> {
  const cfg = await getPromoterConfig(guildId);
  if (!cfg.roleId) return 0;
  let revoked = 0;
  for (const row of await listStates(guildId)) {
    if (!row.value.has) continue;
    const member = await guilds.fetchMember(guildId, row.targetId).catch(() => null);
    if (!member) continue;
    const result = await converge({
      guildId,
      userId: row.targetId,
      worn: wearsServerTag(member.primaryGuild, guildId),
      roles: member.roles,
    });
    if (result === "revoked") revoked++;
  }
  return revoked;
}

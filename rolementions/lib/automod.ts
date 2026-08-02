import { container } from "@sapphire/framework";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  type AutoModerationRule,
  type Guild,
} from "discord.js";
import { swallow } from "#utilities/errors.js";
import { getBlocks, getRuleId, setRuleId, clearRuleId } from "./store.js";

export const RULE_NAME = "🛡️ Role Mention Protection";

/** AutoMod keyword filters cannot be empty — used when no roles are actively blocked. */
const PLACEHOLDER_KEYWORD = "__rolementions_no_active_blocks__";

function canManage(guild: Guild): boolean {
  return (
    guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false
  );
}

function keywordFor(roleId: string): string {
  return `<@&${roleId}>`;
}

function blockMessageFor(count: number): string {
  return count === 1
    ? "This role is temporarily protected from mention spam."
    : `${count} roles are temporarily protected from mention spam.`;
}

/**
 * Resolve the guild's managed AutoMod rule, reusing a cached id, an existing
 * rule by name, or creating a fresh one. Returns null if the bot lacks
 * permission or the API call fails.
 */
async function ensureRule(guild: Guild): Promise<AutoModerationRule | null> {
  if (!canManage(guild)) {
    container.logger.warn(
      `[rolementions] Missing Manage Server permission in ${guild.id}; cannot manage AutoMod rule.`,
    );
    return null;
  }

  const cachedId = await getRuleId(guild.id);
  if (cachedId) {
    const existing = await guild.autoModerationRules
      .fetch(cachedId)
      .catch(() => null);
    if (existing) return existing;
    await clearRuleId(guild.id);
  }

  const all = await guild.autoModerationRules.fetch().catch(() => null);
  const byName = all?.find((r) => r.name === RULE_NAME) ?? null;
  if (byName) {
    await setRuleId(guild.id, byName.id);
    return byName;
  }

  const created = await guild.autoModerationRules
    .create({
      name: RULE_NAME,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: [PLACEHOLDER_KEYWORD] },
      actions: [
        {
          type: AutoModerationActionType.BlockMessage,
          metadata: { customMessage: blockMessageFor(1) },
        },
      ],
      enabled: true,
      reason: "Role mention protection",
    })
    .catch((err: unknown) => {
      container.logger.error(
        `[rolementions] Failed to create AutoMod rule in ${guild.id}:`,
        err,
      );
      return null;
    });

  if (created) await setRuleId(guild.id, created.id);
  return created;
}

/**
 * Rebuild the rule's keyword filter from the guild's currently active blocks.
 * Only the raw mention form `<@&id>` is used as a keyword — role *names* are
 * intentionally excluded so plain text containing a name is never blocked.
 */
export async function syncRule(guild: Guild): Promise<void> {
  const rule = await ensureRule(guild);
  if (!rule) return;

  const blocks = await getBlocks(guild.id);
  const keywords =
    blocks.size > 0
      ? [...blocks.keys()].map(keywordFor)
      : [PLACEHOLDER_KEYWORD];

  await rule
    .edit({
      triggerMetadata: { keywordFilter: keywords },
      actions: [
        {
          type: AutoModerationActionType.BlockMessage,
          metadata: { customMessage: blockMessageFor(blocks.size || 1) },
        },
      ],
      reason: "Role mention protection — block list changed",
    })
    .catch(swallow("rolementions: sync AutoMod rule"));
}

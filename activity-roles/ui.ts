import {
  type CardReply,
  createPaginationRow,
  formatPageFooter,
  makeListCard,
} from "@lumi/ui";
import { ModuleName } from "./data.js";
import type { ActivityRule } from "./logic.js";

const RulesPerPage = 10;

export const RulesListPrefix = `${ModuleName}:rules:`;

export function formatRule(rule: ActivityRule): string {
  return `**${rule.type}** \`${rule.match}\` → <@&${rule.roleId}>`;
}

export function rulesPageCard(
  rules: readonly ActivityRule[],
  page: number,
  invokerId: string,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(rules.length / RulesPerPage));
  const current = Math.min(
    Math.max(1, Math.trunc(page) || 1),
    totalPages,
  );
  const start = (current - 1) * RulesPerPage;
  const items = rules.slice(start, start + RulesPerPage).map(formatRule);
  const actionRows =
    totalPages > 1
      ? [
          createPaginationRow({
            customIdPrefix: `${RulesListPrefix}${invokerId}`,
            currentPage: current - 1,
            totalPages,
          }),
        ]
      : undefined;
  return makeListCard("🎮 Activity Roles", items, {
    footer: formatPageFooter(current - 1, totalPages, rules.length),
    ...(actionRows ? { actionRows } : {}),
  });
}

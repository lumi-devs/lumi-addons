export function statusMatches(statusText: string, terms: string[]): boolean {
  if (!statusText) return false;
  const haystack = statusText.toLowerCase();
  return terms.some((t) => {
    const needle = t.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

export function wearsServerTag(
  primaryGuild: { identityGuildId: string | null; identityEnabled: boolean | null } | null | undefined,
  guildId: string,
): boolean {
  return Boolean(
    primaryGuild?.identityEnabled && primaryGuild.identityGuildId === guildId,
  );
}

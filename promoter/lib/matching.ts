/**
 * Implicit match terms derived from the guild's own vanity invite, if it has
 * one. Lets vanity-URL detection work out of the box without an admin having
 * to copy their own invite code into `match_terms`.
 */
export function vanityMatchTerms(vanityURLCode: string | null): string[] {
  if (!vanityURLCode) return [];
  return [vanityURLCode, `discord.gg/${vanityURLCode}`];
}

/** Case-insensitive substring match of any configured term in a status text. */
export function statusMatches(statusText: string, terms: string[]): boolean {
  if (!statusText) return false;
  const haystack = statusText.toLowerCase();
  return terms.some((t) => {
    const needle = t.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/** The subset of `User#primaryGuild` we need to detect a worn server tag. */
export interface PrimaryGuildLike {
  identityEnabled: boolean | null;
  identityGuildId: string | null;
}

/**
 * Whether the user is displaying *this* server's native tag (the "server tag"
 * shown next to their name). True only when they've enabled the identity and it
 * points at `guildId`.
 */
export function wearsServerTag(
  primaryGuild: PrimaryGuildLike | null | undefined,
  guildId: string,
): boolean {
  return Boolean(
    primaryGuild?.identityEnabled && primaryGuild.identityGuildId === guildId,
  );
}

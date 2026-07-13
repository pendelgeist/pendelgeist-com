/**
 * Normalizes a title for loose comparison: lowercase, strip punctuation, and
 * collapse whitespace, so "Attack on Titan: Final Season" and "attack on
 * titan final season" compare equal.
 * @param {string} title
 */
export function normalizeTitle(title) {
  return (title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether a local title plausibly refers to the same show as one of
 * an AniList media's titles (romaji/english/native), allowing for the loose
 * punctuation/casing differences that are common between sources.
 * @param {string} localTitle
 * @param {string[]} anilistTitles
 */
export function titlesLikelyMatch(localTitle, anilistTitles) {
  const normalizedLocal = normalizeTitle(localTitle);
  if (!normalizedLocal) return false;
  return anilistTitles.some((t) => {
    const normalized = normalizeTitle(t);
    return normalized === normalizedLocal
      || (normalized.length > 3 && normalizedLocal.includes(normalized))
      || (normalizedLocal.length > 3 && normalized.includes(normalizedLocal));
  });
}

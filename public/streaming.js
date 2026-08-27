/**
 * Streaming service metadata, shared by every page that renders "where can I
 * watch this" badges (/vqar, /fsar) and by scripts/validateSeason.js, which
 * checks a review's `streaming` keys against this same list.
 *
 * Badge colors are the services' own brand colors, deliberately fixed rather
 * than theme custom properties - the point is at-a-glance recognition of the
 * actual service regardless of which site theme is active. They live in
 * /styles.css as .entry-streaming-<key>, so a key added here needs a matching
 * rule there.
 */

/**
 * Maps a `streaming` key to a short badge label + accessible name. Order here
 * is also the display order of the badges.
 * @type {Record<string, { label: string, name: string }>}
 */
export const STREAMING_SERVICES = {
  crunchyroll: { label: 'CR', name: 'Crunchyroll' },
  hidive: { label: 'HD', name: 'HIDIVE' },
  youtube: { label: 'YT', name: 'YouTube' },
  netflix: { label: 'NF', name: 'Netflix' },
  hulu: { label: 'HU', name: 'Hulu' },
  prime: { label: 'PV', name: 'Prime Video' },
};

/**
 * Maps a service key to the field holding its direct per-show URL, for the
 * services where that link is hand-curated. Services absent here (youtube,
 * hulu, prime) render as non-clickable badges.
 * @type {Record<string, string>}
 */
export const STREAMING_URL_FIELDS = {
  crunchyroll: 'crunchyrollUrl',
  hidive: 'hidiveUrl',
  netflix: 'netflixUrl',
};

/**
 * Builds the badge elements for one entry's `streaming` list, in
 * STREAMING_SERVICES order. A key with a matching *Url field on the entry
 * renders as a link; everything else renders as a plain span.
 * @param {{ streaming?: string[] } & Record<string, unknown>} entry
 * @returns {HTMLElement[]}
 */
export function createStreamingBadges(entry) {
  if (!Array.isArray(entry.streaming)) return [];

  const badges = [];
  for (const [key, service] of Object.entries(STREAMING_SERVICES)) {
    if (!entry.streaming.includes(key)) continue;
    const url = STREAMING_URL_FIELDS[key] && entry[STREAMING_URL_FIELDS[key]];
    const badge = document.createElement(url ? 'a' : 'span');
    badge.className = `entry-streaming-badge entry-streaming-${key}`;
    badge.title = service.name;
    badge.textContent = service.label;
    if (url) {
      /** @type {HTMLAnchorElement} */ (badge).href = String(url);
      /** @type {HTMLAnchorElement} */ (badge).target = '_blank';
      /** @type {HTMLAnchorElement} */ (badge).rel = 'noopener noreferrer';
    }
    badges.push(badge);
  }
  return badges;
}

/**
 * The badges wrapped in the `.entry-streaming` row every page puts them in, or
 * null when the entry names no services - so a caller can append the row
 * unconditionally without leaving an empty element behind on entries with no
 * streaming info.
 * @param {{ streaming?: string[] } & Record<string, unknown>} entry
 * @returns {HTMLElement|null}
 */
export function createStreamingRow(entry) {
  const badges = createStreamingBadges(entry);
  if (badges.length === 0) return null;
  const row = document.createElement('span');
  row.className = 'entry-streaming';
  row.append(...badges);
  return row;
}

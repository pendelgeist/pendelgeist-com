/**
 * What a season file's id means.
 *
 * A **lineup** is a season you watched as it aired: its id is
 * `<season>-<year>` ("spring-2026"), which is also how the generated index
 * orders lineups, newest first - a directory listing would put spring before
 * winter. Any other id is a **shelf** - a season file for shows watched outside a
 * lineup (none exist at the moment) - which says where it sorts with an explicit numeric `sortKey`.
 *
 * Per-season stats only make sense for lineups, so they ask `isLineup` rather
 * than a flag on the file. Shared by /vqar-stats, src/schema.js and the
 * scripts, so the rule can't drift between them.
 */

const SEASON_ORDER = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };

/**
 * @param {string} id
 * @returns {number|null} a comparable rank (higher = more recent), or null if
 *   the id doesn't parse as `<season>-<year>`
 */
export function parseSeasonId(id) {
  const match = /^([a-z]+)-(\d{4})$/.exec(String(id));
  if (!match) return null;
  const [, season, year] = match;
  const order = SEASON_ORDER[season];
  return order === undefined ? null : Number(year) * 10 + order;
}

/**
 * Where a season sorts, newest first. Prefers an explicit `sortKey` so a shelf,
 * whose id doesn't parse, still has a home.
 * @param {{ id?: string, sortKey?: number }} season
 * @returns {number|null}
 */
export function seasonSortKey(season) {
  return typeof season.sortKey === 'number' ? season.sortKey : parseSeasonId(season.id);
}

/**
 * Whether a season is a lineup (watched as it aired) rather than a shelf.
 * @param {{ id?: string }|string} season - a season, or just its id
 */
export function isLineup(season) {
  return parseSeasonId(typeof season === 'string' ? season : season?.id) !== null;
}

import { STREAMING_SERVICES } from '../public/streaming.js';

const STREAMING_KEYS = new Set(Object.keys(STREAMING_SERVICES));

// Season ids are `<season>-<year>` ("spring-2026"), which is what
// scripts/build-vqar-index.js sorts the generated index by - a directory
// listing would put spring before winter. A season whose id doesn't follow the
// pattern has to say where it goes with an explicit numeric `sortKey`.
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
 * Where a season sorts, newest first. Prefers an explicit `sortKey` so a season
 * whose id doesn't parse still has a home.
 * @param {object} season
 */
export function seasonSortKey(season) {
  return typeof season.sortKey === 'number' ? season.sortKey : parseSeasonId(season.id);
}

/** @param {string[]} list */
function findDuplicates(list) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of list) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates];
}

/**
 * Checks a single season's data for internal consistency: a show shouldn't be
 * reviewed and still sitting in pending/skipped, shouldn't be in both pending
 * and skipped, and shouldn't be listed twice in the same list. Also flags
 * reviews missing required fields or with an unparseable date, and that the
 * season can identify and order itself in the generated index.
 * @param {object} season - a SeasonData object ({ id, name, reviewed, pending, skipped })
 * @param {{ filename?: string }} [options] - `filename` cross-checks `id` against the file it came from
 * @returns {string[]} human-readable issues found; empty if the data is clean
 */
export function validateSeason(season, { filename } = {}) {
  const issues = [];

  if (typeof season.id !== 'string' || season.id === '') {
    issues.push('season is missing an id (expected a non-empty string like "spring-2026")');
  } else {
    if (filename && filename !== `${season.id}.json`) {
      issues.push(`season id "${season.id}" doesn't match its filename "${filename}"`);
    }
    if (seasonSortKey(season) === null) {
      issues.push(`season id "${season.id}" isn't a "<season>-<year>" id, so it needs an explicit numeric sortKey to order the index`);
    }
  }
  if (typeof season.name !== 'string' || season.name === '') {
    issues.push('season is missing a name (expected a non-empty string like "Spring 2026")');
  }
  if (season.current !== undefined && typeof season.current !== 'boolean') {
    issues.push('season has a malformed current (expected a boolean)');
  }
  if (season.sortKey !== undefined && typeof season.sortKey !== 'number') {
    issues.push('season has a malformed sortKey (expected a number)');
  }
  const reviewed = Array.isArray(season.reviewed) ? season.reviewed : [];
  const pending = Array.isArray(season.pending) ? season.pending : [];
  const skipped = Array.isArray(season.skipped) ? season.skipped : [];

  const reviewedTitles = reviewed.map(r => r.titleEN);
  const reviewedSet = new Set(reviewedTitles);
  const pendingSet = new Set(pending);
  const skippedSet = new Set(skipped);

  for (const title of reviewedSet) {
    if (pendingSet.has(title)) issues.push(`"${title}" is reviewed but still listed in pending`);
    if (skippedSet.has(title)) issues.push(`"${title}" is reviewed but also listed in skipped`);
  }
  for (const title of pendingSet) {
    if (skippedSet.has(title)) issues.push(`"${title}" is in both pending and skipped`);
  }

  for (const dupe of findDuplicates(reviewedTitles)) issues.push(`"${dupe}" appears more than once in reviewed`);
  for (const dupe of findDuplicates(pending)) issues.push(`"${dupe}" appears more than once in pending`);
  for (const dupe of findDuplicates(skipped)) issues.push(`"${dupe}" appears more than once in skipped`);

  reviewed.forEach((r, i) => {
    const label = r.titleEN || `reviewed[${i}]`;
    if (!r.titleEN) issues.push(`reviewed[${i}] is missing titleEN`);
    if (!r.ratingText) issues.push(`"${label}" is missing ratingText`);
    if (!r.dateReviewed || Number.isNaN(Date.parse(r.dateReviewed))) {
      issues.push(`"${label}" has a missing or unparseable dateReviewed`);
    }
    if (r.anilistId !== undefined && !Number.isInteger(r.anilistId)) {
      issues.push(`"${label}" has a malformed anilistId (expected an integer)`);
    }
    if (r.annId !== undefined && !Number.isInteger(r.annId)) {
      issues.push(`"${label}" has a malformed annId (expected an integer)`);
    }
    if (r.streaming !== undefined) {
      if (!Array.isArray(r.streaming)) {
        issues.push(`"${label}" has a malformed streaming (expected an array)`);
      } else {
        for (const service of r.streaming) {
          if (!STREAMING_KEYS.has(service)) {
            issues.push(`"${label}" has an unknown streaming service "${service}" (expected one of ${[...STREAMING_KEYS].join(', ')})`);
          }
        }
      }
    }
    for (const key of ['crunchyrollUrl', 'hidiveUrl', 'netflixUrl', 'wikipediaUrl', 'wikipediaJaUrl']) {
      if (r[key] !== undefined && typeof r[key] !== 'string') {
        issues.push(`"${label}" has a malformed ${key} (expected a string)`);
      }
    }
    if (r.watchProgress !== undefined && typeof r.watchProgress !== 'string') {
      issues.push(`"${label}" has a malformed watchProgress (expected a string)`);
    }
    for (const key of ['fullReview', 'op', 'ed']) {
      if (r[key] !== undefined && (typeof r[key] !== 'object' || r[key] === null || Array.isArray(r[key]))) {
        issues.push(`"${label}" has a malformed ${key} (expected an object)`);
      }
    }
  });

  return issues;
}

/**
 * Checks the seasons as a set, the way build-vqar-index.js sees them: ids have
 * to be unique, and exactly one season carries `current: true` - that flag is
 * what the generated index's `currentSeason` comes from, so zero or two of them
 * is a broken index rather than a cosmetic slip.
 * @param {object[]} seasons
 * @returns {string[]}
 */
export function validateSeasonCollection(seasons) {
  const issues = [];

  for (const dupe of findDuplicates(seasons.map(s => s.id).filter(Boolean))) {
    issues.push(`more than one season has the id "${dupe}"`);
  }

  const current = seasons.filter(s => s.current === true);
  if (current.length === 0) {
    issues.push('no season is marked "current": true - exactly one has to be');
  } else if (current.length > 1) {
    issues.push(`${current.length} seasons are marked "current": true (${current.map(s => s.id).join(', ')}) - only one can be`);
  }

  return issues;
}

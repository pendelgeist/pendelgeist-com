import { STREAMING_SERVICES, STREAMING_URL_FIELDS } from '../public/streaming.js';
import { LIST_ENTRY_KEYS, entryTitle } from '../public/vqar/list-entries.js';
import { normalizeTitle } from './anilistMatch.js';

/**
 * Every key a season file may carry. Like the other key lists below, it exists
 * so a typo (`curent`, `fullReveiw`) is rejected rather than quietly doing
 * nothing on the page, in the stats and in the API.
 */
export const SEASON_KEYS = ['id', 'name', 'number', 'current', 'archive', 'sortKey', 'reviewed', 'pending', 'skipped'];

const URL_FIELDS = [...Object.values(STREAMING_URL_FIELDS), 'wikipediaUrl', 'wikipediaJaUrl'];

/**
 * Every key a review may carry. test/graphql.test.js checks the GraphQL `Review`
 * type against this list (plus the `season`/`seasonName` the API adds), so the
 * schema can't drift from what validation lets through.
 */
export const REVIEW_KEYS = [
  'titleEN', 'titleJP', 'airedLabel', 'ratingNumber', 'ratingText', 'review', 'dateReviewed',
  'fullReview', 'op', 'ed', 'finishedSeason', 'finishedDate', 'watchProgress',
  'anilistId', 'anilist', 'annId', 'streaming', ...URL_FIELDS,
];

/** Every key a `fullReview` (a revisit) may carry; checked against the GraphQL `SubReview` too. */
export const FULL_REVIEW_KEYS = ['ratingNumber', 'ratingText', 'review', 'dateReviewed'];

/** `dateReviewed` is a full ISO 8601 timestamp (UTC `Z` or a `±hh:mm` offset) so same-day reviews order by time. */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const EASTERN_OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' });

/**
 * The reviewer's UTC offset at a moment: `-04:00` in daylight time, `-05:00` otherwise.
 * @param {number} instant - epoch milliseconds
 */
function easternOffset(instant) {
  const zone = EASTERN_OFFSET_FORMAT.formatToParts(instant).find(part => part.type === 'timeZoneName')?.value ?? '';
  return zone.replace('GMT', '');
}

/**
 * Problems with one review timestamp: not stamped in the reviewer's Eastern
 * offset (the page shows the date exactly as written, so a UTC stamp can put an
 * evening review on tomorrow's date), or in the future.
 * @param {string} label - how to name the owner in a message
 * @param {string} field - `dateReviewed`, or `fullReview.dateReviewed`
 * @param {string} value - already known to match TIMESTAMP_PATTERN and parse
 * @param {number} now - epoch milliseconds
 * @returns {string[]}
 */
function timestampIssues(label, field, value, now) {
  const instant = Date.parse(value);
  const issues = [];
  const offset = value.endsWith('Z') ? 'Z' : value.slice(-6);
  const expected = easternOffset(instant);
  if (offset !== expected) {
    issues.push(`"${label}" has a ${field} in ${offset === 'Z' ? 'UTC' : offset}, not Eastern time (${expected} on that date) - stamp it with TZ=America/New_York date +%Y-%m-%dT%H:%M:%S%:z`);
  }
  if (instant > now) issues.push(`"${label}" has a ${field} in the future`);
  return issues;
}

const STREAMING_KEYS = new Set(Object.keys(STREAMING_SERVICES));

/** `firstEpisode` on a pending entry is a plain calendar date, shown exactly as written. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {string} value */
function isCalendarDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

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
 * Checks the entries of one `pending` or `skipped` list: each is a non-empty
 * title string or an object with a title, only the keys that list allows, and
 * well-formed optional notes. Titles are checked here too, since the duplicate
 * and cross-list checks rely on them being strings.
 * @param {unknown[]} list
 * @param {'pending'|'skipped'} listName
 * @returns {string[]}
 */
function validateListEntries(list, listName) {
  const issues = [];
  list.forEach((entry, i) => {
    const title = entryTitle(entry);
    const where = typeof title === 'string' && title !== '' ? `"${title}"` : `${listName}[${i}]`;
    if (typeof title !== 'string' || title === '') {
      issues.push(`${listName}[${i}] needs a title (a non-empty string, or an object with a "title")`);
    }
    if (typeof entry === 'string') return;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return; // already flagged above

    const allowed = LIST_ENTRY_KEYS[listName];
    for (const key of Object.keys(entry)) {
      if (!allowed.includes(key)) {
        issues.push(`${where} in ${listName} has an unknown field "${key}" (expected one of ${allowed.join(', ')})`);
      }
    }
    if (entry.streaming !== undefined) {
      if (!Array.isArray(entry.streaming)) {
        issues.push(`${where} in ${listName} has a malformed streaming (expected an array)`);
      } else {
        for (const service of entry.streaming) {
          if (!STREAMING_KEYS.has(service)) {
            issues.push(`${where} in ${listName} has an unknown streaming service "${service}" (expected one of ${[...STREAMING_KEYS].join(', ')})`);
          }
        }
      }
    }
    if (entry.firstEpisode !== undefined && (typeof entry.firstEpisode !== 'string' || !isCalendarDate(entry.firstEpisode))) {
      issues.push(`${where} in ${listName} has a malformed firstEpisode (expected a date like 2026-10-08)`);
    }
    if (entry.availableNow !== undefined && typeof entry.availableNow !== 'boolean') {
      issues.push(`${where} in ${listName} has a malformed availableNow (expected a boolean)`);
    }
    if (entry.availableNow === true && entry.firstEpisode !== undefined) {
      issues.push(`${where} in ${listName} is marked availableNow but also has a firstEpisode (use one or the other)`);
    }
    if (entry.reason !== undefined && (typeof entry.reason !== 'string' || entry.reason.trim() === '')) {
      issues.push(`${where} in ${listName} has a malformed reason (expected a non-empty string)`);
    }
    for (const key of Object.values(STREAMING_URL_FIELDS)) {
      if (entry[key] !== undefined && (typeof entry[key] !== 'string' || entry[key].trim() === '')) {
        issues.push(`${where} in ${listName} has a malformed ${key} (expected a URL string)`);
      }
    }
  });
  return issues;
}

/**
 * A revisit's date is optional, and can be a plain calendar date or a full
 * timestamp (a revisit is often logged by the day). Either way it has to be
 * real, not in the future, and not before the episode-1 review it follows.
 * @param {string} label
 * @param {any} review
 * @param {number} now
 * @returns {string[]}
 */
function revisitDateIssues(label, review, now) {
  const value = review.fullReview.dateReviewed;
  if (value === undefined) return [];
  if (typeof value !== 'string' || !(isCalendarDate(value) || (TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value))))) {
    return [`"${label}" has a fullReview.dateReviewed that is neither a date like 2026-10-08 nor a timestamp`];
  }
  const issues = TIMESTAMP_PATTERN.test(value) ? timestampIssues(label, 'fullReview.dateReviewed', value, now) : [];
  if (!TIMESTAMP_PATTERN.test(value) && Date.parse(value) > now) {
    issues.push(`"${label}" has a fullReview.dateReviewed in the future`);
  }
  if (typeof review.dateReviewed === 'string' && value.slice(0, 10) < review.dateReviewed.slice(0, 10)) {
    issues.push(`"${label}" has a fullReview.dateReviewed (${value.slice(0, 10)}) before its episode-1 review (${review.dateReviewed.slice(0, 10)})`);
  }
  return issues;
}

/**
 * A review's `anilist` object is generated by scripts/fetch-anilist-tags.js,
 * so this mostly guards against a hand edit gone wrong: the shape the page's
 * filters read, an `anilistId` it could have come from, and no commas in a
 * value, since the filter URLs separate values with them.
 * @param {string} label
 * @param {any} review
 * @returns {string[]}
 */
function anilistIssues(label, review) {
  const { anilist } = review;
  if (typeof anilist !== 'object' || anilist === null || Array.isArray(anilist)) {
    return [`"${label}" has a malformed anilist (expected an object)`];
  }
  const issues = [];
  if (!review.anilistId) {
    issues.push(`"${label}" has anilist data but no anilistId - it's generated from the id by npm run fetch-anilist-tags`);
  }
  if (anilist.format !== undefined && typeof anilist.format !== 'string') {
    issues.push(`"${label}" has a malformed anilist.format (expected a string)`);
  }
  for (const key of ['genres', 'tags', 'studios']) {
    const values = anilist[key];
    if (!Array.isArray(values) || values.some(v => typeof v !== 'string' || v === '')) {
      issues.push(`"${label}" has a malformed anilist.${key} (expected an array of strings)`);
    } else if (values.some(v => v.includes(','))) {
      issues.push(`"${label}" has a comma in an anilist.${key} value, which the filter URLs can't carry`);
    }
  }
  return issues;
}

/**
 * Checks a single season's data for internal consistency: a show shouldn't be
 * reviewed and still sitting in pending/skipped, shouldn't be in both pending
 * and skipped, and shouldn't be listed twice in the same list. Also flags
 * reviews missing required fields or with an unparseable date, and that the
 * season can identify and order itself in the generated index.
 * @param {object} season - a SeasonData object ({ id, name, reviewed, pending, skipped })
 * @param {{ filename?: string, now?: number }} [options] - `filename` cross-checks `id` against the file it came from;
 *   `now` (epoch ms, default the current time) is what a review's date is checked against for being in the future
 * @returns {string[]} human-readable issues found; empty if the data is clean
 */
export function validateSeason(season, { filename, now = Date.now() } = {}) {
  const issues = [];

  for (const key of Object.keys(season)) {
    if (!SEASON_KEYS.includes(key)) {
      issues.push(`season has an unknown field "${key}" (expected one of ${SEASON_KEYS.join(', ')})`);
    }
  }
  if (season.number !== undefined && !Number.isInteger(season.number)) {
    issues.push('season has a malformed number (expected an integer)');
  }
  for (const key of ['reviewed', 'pending', 'skipped']) {
    if (season[key] !== undefined && !Array.isArray(season[key])) {
      issues.push(`season has a malformed ${key} (expected an array)`);
    }
  }

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
  // An archive season (older shows, reviewed out of their airing season) is a
  // bare marking like op/ed. It is never the current season, whose pending and
  // skipped lists the page always shows.
  if (season.archive !== undefined && season.archive !== true) {
    issues.push('season has a malformed archive (expected true - mark an older-shows season with "archive": true, or leave it out)');
  }
  if (season.archive === true && season.current === true) {
    issues.push('season is marked both archive and current - the current season has to be a real airing season');
  }
  const reviewed = Array.isArray(season.reviewed) ? season.reviewed : [];
  const pendingEntries = Array.isArray(season.pending) ? season.pending : [];
  const skippedEntries = Array.isArray(season.skipped) ? season.skipped : [];
  issues.push(...validateListEntries(pendingEntries, 'pending'), ...validateListEntries(skippedEntries, 'skipped'));
  // Entries may be strings or objects; everything below compares titles.
  const pending = pendingEntries.map(entryTitle).filter(t => typeof t === 'string' && t !== '');
  const skipped = skippedEntries.map(entryTitle).filter(t => typeof t === 'string' && t !== '');

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

  // The exact-title checks above miss a show that differs only in case or
  // punctuation ("Show!" vs "show"), so compare the loosely normalized titles too.
  const byLooseTitle = new Map();
  for (const title of [...reviewedSet, ...pendingSet, ...skippedSet]) {
    const key = normalizeTitle(title);
    if (key !== '') byLooseTitle.set(key, new Set([...(byLooseTitle.get(key) ?? []), title]));
  }
  for (const titles of byLooseTitle.values()) {
    if (titles.size > 1) {
      issues.push(`${[...titles].map(t => `"${t}"`).join(' and ')} differ only in case or punctuation - is that one show listed twice?`);
    }
  }

  reviewed.forEach((r, i) => {
    const label = r.titleEN || `reviewed[${i}]`;
    if (!r.titleEN) issues.push(`reviewed[${i}] is missing titleEN`);
    for (const key of Object.keys(r)) {
      if (!REVIEW_KEYS.includes(key)) {
        issues.push(`"${label}" has an unknown field "${key}" (a typo? expected one of ${REVIEW_KEYS.join(', ')})`);
      }
    }
    if (!r.ratingText) issues.push(`"${label}" is missing ratingText`);
    // Sorting, the rating chips and every /vqar-stats number read this one, so a
    // string, a decimal or a 7 would quietly drop the show out of them.
    if (!Number.isInteger(r.ratingNumber) || r.ratingNumber < 0 || r.ratingNumber > 5) {
      issues.push(`"${label}" needs a ratingNumber from 0 to 5 (a whole number)`);
    }
    if (!r.dateReviewed || Number.isNaN(Date.parse(r.dateReviewed))) {
      issues.push(`"${label}" has a missing or unparseable dateReviewed`);
    } else if (!TIMESTAMP_PATTERN.test(r.dateReviewed)) {
      issues.push(`"${label}" has a dateReviewed without a time (expected a timestamp like 2026-04-01T18:30:00-04:00)`);
    } else {
      issues.push(...timestampIssues(label, 'dateReviewed', r.dateReviewed, now));
    }
    if (r.airedLabel !== undefined && (typeof r.airedLabel !== 'string' || r.airedLabel.trim() === '')) {
      issues.push(`"${label}" has a malformed airedLabel (expected a non-empty string like "Winter 2004")`);
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
        for (const dupe of findDuplicates(r.streaming)) {
          issues.push(`"${label}" lists the streaming service "${dupe}" more than once`);
        }
      }
    }
    for (const key of URL_FIELDS) {
      if (r[key] !== undefined && (typeof r[key] !== 'string' || r[key].trim() === '')) {
        issues.push(`"${label}" has a malformed ${key} (expected a URL string)`);
      }
    }
    if (r.anilist !== undefined) issues.push(...anilistIssues(label, r));
    if (r.watchProgress !== undefined && typeof r.watchProgress !== 'string') {
      issues.push(`"${label}" has a malformed watchProgress (expected a string)`);
    }
    if (r.fullReview !== undefined && (typeof r.fullReview !== 'object' || r.fullReview === null || Array.isArray(r.fullReview))) {
      issues.push(`"${label}" has a malformed fullReview (expected an object)`);
    }
    // A liked OP/ED is a bare marking - no rating, no note - so it's either
    // `true` or left out entirely.
    for (const key of ['op', 'ed']) {
      if (r[key] !== undefined && r[key] !== true) {
        issues.push(`"${label}" has a malformed ${key} (expected true - mark a liked ${key.toUpperCase()} with "${key}": true, or leave it out)`);
      }
    }
    // Same for having watched the whole season - independent of a revisit
    // or a rating, since a season of trash can get finished too.
    if (r.finishedSeason !== undefined && r.finishedSeason !== true) {
      issues.push(`"${label}" has a malformed finishedSeason (expected true - mark a finished season with "finishedSeason": true, or leave it out)`);
    }
    // The day the season got finished is a note for the reviewer's own records:
    // a plain calendar date, only alongside the marking it belongs to.
    if (r.finishedDate !== undefined) {
      if (typeof r.finishedDate !== 'string' || !isCalendarDate(r.finishedDate)) {
        issues.push(`"${label}" has a malformed finishedDate (expected a date like 2026-10-26)`);
      } else if (r.finishedSeason !== true) {
        issues.push(`"${label}" has a finishedDate without "finishedSeason": true`);
      } else if (Date.parse(r.finishedDate) > now) {
        issues.push(`"${label}" has a finishedDate in the future`);
      } else if (typeof r.dateReviewed === 'string' && r.finishedDate < r.dateReviewed.slice(0, 10)) {
        issues.push(`"${label}" has a finishedDate (${r.finishedDate}) before its episode-1 review (${r.dateReviewed.slice(0, 10)})`);
      }
    }
    // A revisit's rating replaces the episode-1 one everywhere ratings are
    // sorted, filtered or counted (see effectiveRatingNumber in
    // public/vqar/rating.js), so one saved without a rating would silently
    // leave the old rating standing.
    const revisit = r.fullReview;
    if (revisit && typeof revisit === 'object' && !Array.isArray(revisit)) {
      for (const key of Object.keys(revisit)) {
        if (!FULL_REVIEW_KEYS.includes(key)) {
          issues.push(`"${label}" has a fullReview with an unknown field "${key}" (expected one of ${FULL_REVIEW_KEYS.join(', ')})`);
        }
      }
      issues.push(...revisitDateIssues(label, r, now));
      if (!Number.isInteger(revisit.ratingNumber) || revisit.ratingNumber < 0 || revisit.ratingNumber > 5) {
        issues.push(`"${label}" has a fullReview without a ratingNumber from 0 to 5 - ask for the revisit rating, since it replaces the episode-1 rating in sorting and on /vqar-stats`);
      }
      if (!revisit.ratingText) {
        issues.push(`"${label}" has a fullReview without a ratingText`);
      }
    }
  });

  return issues;
}

/**
 * Checks the seasons as a set, the way build-vqar-index.js sees them: ids have
 * to be unique, no AniList id is reviewed twice, and exactly one season carries `current: true` - that flag is
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

  // The same AniList id reviewed twice (a split-cour show, or a repeat) is
  // counted twice in every /vqar-stats number, and no title check would see it.
  const byAnilistId = new Map();
  for (const season of seasons) {
    for (const review of Array.isArray(season.reviewed) ? season.reviewed : []) {
      if (!Number.isInteger(review.anilistId)) continue;
      const where = `"${review.titleEN}" (${season.id})`;
      byAnilistId.set(review.anilistId, [...(byAnilistId.get(review.anilistId) ?? []), where]);
    }
  }
  for (const [id, where] of byAnilistId) {
    if (where.length > 1) issues.push(`anilistId ${id} is reviewed more than once: ${where.join(' and ')}`);
  }

  const current = seasons.filter(s => s.current === true);
  if (current.length === 0) {
    issues.push('no season is marked "current": true - exactly one has to be');
  } else if (current.length > 1) {
    issues.push(`${current.length} seasons are marked "current": true (${current.map(s => s.id).join(', ')}) - only one can be`);
  }

  return issues;
}

import { STREAMING_SERVICES, STREAMING_URL_FIELDS } from '../public/streaming.js';
import { LIST_ENTRY_KEYS, entryTitle } from '../public/vqar/list-entries.js';
import { opEdProblem } from '../public/vqar/oped.js';
import { isDay, isMoment, easternOffset, dayOf } from '../public/dates.js';
import { seasonSortKey, isLineup } from '../public/vqar/seasons.js';
import { normalizeTitle } from './anilistMatch.js';

/**
 * Every key a season file may carry. Like the other key lists below, it exists
 * so a typo (`curent`, `fullReveiw`) is rejected rather than quietly doing
 * nothing on the page, in the stats and in the API.
 */
export const SEASON_KEYS = ['id', 'name', 'current', 'sortKey', 'shows', 'toReview', 'notReviewing'];

const URL_FIELDS = [...Object.values(STREAMING_URL_FIELDS), 'wikipediaUrl', 'wikipediaJaUrl'];

/**
 * Every key a review may carry. test/graphql.test.js checks the GraphQL `Review`
 * type against this list (plus the `season`/`seasonName` the API adds), so the
 * schema can't drift from what validation lets through.
 */
export const REVIEW_KEYS = [
  'titleEN', 'titleJP', 'airedLabel', 'ratingNumber', 'ratingText', 'review', 'dateReviewed',
  'fullReview', 'op', 'ed', 'finishedSeason', 'finishedDate', 'watched', 'watchProgress', 'part',
  'anilistId', 'anilist', 'annId', 'streaming', ...URL_FIELDS,
];

/** Every key a `fullReview` (a revisit) may carry; checked against the GraphQL `SubReview` too. */
export const FULL_REVIEW_KEYS = ['ratingNumber', 'ratingText', 'review', 'dateReviewed'];

/** Every key a show's `watched` object may carry; checked against the GraphQL `Watched` type too. */
export const WATCHED_KEYS = ['from', 'to', 'season', 'episode'];

/**
 * Problems with one review timestamp: not stamped in the reviewer's Eastern
 * offset (the page shows the date exactly as written, so a UTC stamp can put an
 * evening review on tomorrow's date), or in the future.
 * @param {string} label - how to name the owner in a message
 * @param {string} field - `dateReviewed`, or `fullReview.dateReviewed`
 * @param {string} value - already known to be a moment (see isMoment in public/dates.js)
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
 * Checks the entries of one `toReview` or `notReviewing` list: each is a non-empty
 * title string or an object with a title, only the keys that list allows, and
 * well-formed optional notes. Titles are checked here too, since the duplicate
 * and cross-list checks rely on them being strings.
 * @param {unknown[]} list
 * @param {'toReview'|'notReviewing'} listName
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
    if (entry.premieres !== undefined && !isDay(entry.premieres)) {
      issues.push(`${where} in ${listName} has a malformed premieres (expected a day like 2026-10-08)`);
    }
    if (entry.availableNow !== undefined && typeof entry.availableNow !== 'boolean') {
      issues.push(`${where} in ${listName} has a malformed availableNow (expected a boolean)`);
    }
    if (entry.availableNow === true && entry.premieres !== undefined) {
      issues.push(`${where} in ${listName} is marked availableNow but also has a premieres (use one or the other)`);
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
 * A revisit's date is optional, and like every review date it's a moment - a
 * timestamp in the reviewer's Eastern offset - not in the future, and not
 * before the episode-1 review it follows.
 * @param {string} label
 * @param {any} review
 * @param {number} now
 * @returns {string[]}
 */
function revisitDateIssues(label, review, now) {
  const value = review.fullReview.dateReviewed;
  if (value === undefined) return [];
  if (!isMoment(value)) {
    return [`"${label}" has a fullReview.dateReviewed that isn't a timestamp like 2026-10-08T12:00:00-04:00`];
  }
  const issues = timestampIssues(label, 'fullReview.dateReviewed', value, now);
  if (typeof review.dateReviewed === 'string' && dayOf(value) < dayOf(review.dateReviewed)) {
    issues.push(`"${label}" has a fullReview.dateReviewed (${dayOf(value)}) before its episode-1 review (${dayOf(review.dateReviewed)})`);
  }
  return issues;
}

/**
 * Problems with a show's `watched` record: the day the reviewer watched the
 * first episode (`from`), the day of the last (`to`), and - for a show they
 * didn't finish - the episode they reached, with its `season` when the show
 * ran across several. Both dates are days, shown exactly as written.
 * @param {string} label
 * @param {any} watched
 * @param {number} now
 * @returns {string[]}
 */
function watchedIssues(label, watched, now) {
  if (typeof watched !== 'object' || watched === null || Array.isArray(watched)) {
    return [`"${label}" has a malformed watched (expected an object like { "from": "2026-04-01", "to": "2026-06-10" })`];
  }
  const issues = [];
  for (const key of Object.keys(watched)) {
    if (!WATCHED_KEYS.includes(key)) {
      issues.push(`"${label}" has a watched with an unknown field "${key}" (expected one of ${WATCHED_KEYS.join(', ')})`);
    }
  }
  if (watched.from === undefined) issues.push(`"${label}" has a watched without a from day`);

  const dayOk = {};
  for (const key of ['from', 'to']) {
    const value = watched[key];
    if (value === undefined) continue;
    if (!isDay(value)) {
      issues.push(`"${label}" has a watched.${key} that isn't a day like 2026-04-01`);
      continue;
    }
    dayOk[key] = true;
    if (Date.parse(value) > now) issues.push(`"${label}" has a watched.${key} in the future`);
  }
  if (dayOk.from && dayOk.to && watched.to < watched.from) {
    issues.push(`"${label}" has a watched.to (${watched.to}) before its watched.from (${watched.from})`);
  }

  // The last episode reached: a number (12.5 for a special is fine), with the
  // season it's in for a show that ran across several - both numbers, never
  // text, so they can be compared and counted.
  const { season, episode } = watched;
  if (episode !== undefined && !(typeof episode === 'number' && Number.isFinite(episode) && episode > 0)) {
    issues.push(`"${label}" has a malformed watched.episode (expected a positive number like 24)`);
  }
  if (season !== undefined) {
    if (!(Number.isInteger(season) && season >= 1)) {
      issues.push(`"${label}" has a malformed watched.season (expected a whole number from 1)`);
    } else if (episode === undefined) {
      issues.push(`"${label}" has a watched.season without a watched.episode - the season says which run the episode is in`);
    }
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
 * reviewed and still sitting in toReview/notReviewing, shouldn't be in both
 * lists, and shouldn't be listed twice in the same list. Also flags
 * reviews missing required fields or with an unparseable date, and that the
 * season can identify and order itself in the generated index.
 * @param {object} season - a SeasonData object ({ id, name, shows, toReview, notReviewing })
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
  for (const key of ['shows', 'toReview', 'notReviewing']) {
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
      issues.push(`season id "${season.id}" isn't a "<season>-<year>" lineup id, so it needs an explicit numeric sortKey to order the index`);
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
  // The current season is the one being reviewed live, so it has to be a
  // lineup - never a shelf like the Backlog.
  if (season.current === true && typeof season.id === 'string' && !isLineup(season)) {
    issues.push(`season "${season.id}" is marked current, but only a lineup (an id like "spring-2026") can be the current season`);
  }
  const shows = Array.isArray(season.shows) ? season.shows : [];
  const toReviewEntries = Array.isArray(season.toReview) ? season.toReview : [];
  const notReviewingEntries = Array.isArray(season.notReviewing) ? season.notReviewing : [];
  issues.push(...validateListEntries(toReviewEntries, 'toReview'), ...validateListEntries(notReviewingEntries, 'notReviewing'));
  // Entries may be strings or objects; everything below compares titles.
  const toReview = toReviewEntries.map(entryTitle).filter(t => typeof t === 'string' && t !== '');
  const notReviewing = notReviewingEntries.map(entryTitle).filter(t => typeof t === 'string' && t !== '');

  const showTitles = shows.map(r => r.titleEN);
  const showSet = new Set(showTitles);
  const toReviewSet = new Set(toReview);
  const notReviewingSet = new Set(notReviewing);

  for (const title of showSet) {
    if (toReviewSet.has(title)) issues.push(`"${title}" is reviewed but still listed in toReview`);
    if (notReviewingSet.has(title)) issues.push(`"${title}" is reviewed but also listed in notReviewing`);
  }
  for (const title of toReviewSet) {
    if (notReviewingSet.has(title)) issues.push(`"${title}" is in both toReview and notReviewing`);
  }

  for (const dupe of findDuplicates(showTitles)) issues.push(`"${dupe}" appears more than once in shows`);
  for (const dupe of findDuplicates(toReview)) issues.push(`"${dupe}" appears more than once in toReview`);
  for (const dupe of findDuplicates(notReviewing)) issues.push(`"${dupe}" appears more than once in notReviewing`);

  // The exact-title checks above miss a show that differs only in case or
  // punctuation ("Show!" vs "show"), so compare the loosely normalized titles too.
  const byLooseTitle = new Map();
  for (const title of [...showSet, ...toReviewSet, ...notReviewingSet]) {
    const key = normalizeTitle(title);
    if (key !== '') byLooseTitle.set(key, new Set([...(byLooseTitle.get(key) ?? []), title]));
  }
  for (const titles of byLooseTitle.values()) {
    if (titles.size > 1) {
      issues.push(`${[...titles].map(t => `"${t}"`).join(' and ')} differ only in case or punctuation - is that one show listed twice?`);
    }
  }

  shows.forEach((r, i) => {
    const label = r.titleEN || `shows[${i}]`;
    if (!r.titleEN) issues.push(`shows[${i}] is missing titleEN`);
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
    } else if (!isMoment(r.dateReviewed)) {
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
    if (r.part !== undefined && !(Number.isInteger(r.part) && r.part >= 1)) {
      issues.push(`"${label}" has a malformed part (expected a whole number from 1, like "part": 2)`);
    }
    if (r.fullReview !== undefined && (typeof r.fullReview !== 'object' || r.fullReview === null || Array.isArray(r.fullReview))) {
      issues.push(`"${label}" has a malformed fullReview (expected an object)`);
    }
    // A liked OP/ED is a bare marking - no rating, no note - and always names
    // the OP/ED number(s) liked, since a season can have several. Left out
    // entirely when nothing was liked.
    for (const key of ['op', 'ed']) {
      const problem = r[key] === undefined ? null : opEdProblem(r[key]);
      if (problem) {
        issues.push(`"${label}" has a malformed ${key} (${problem}) - mark a liked ${key.toUpperCase()} with "${key}": [1] (or [1, 2]), or leave it out`);
      }
    }
    if (r.watched !== undefined) issues.push(...watchedIssues(label, r.watched, now));
    // Same for having watched the whole season - independent of a revisit
    // or a rating, since a season of trash can get finished too.
    if (r.finishedSeason !== undefined && r.finishedSeason !== true) {
      issues.push(`"${label}" has a malformed finishedSeason (expected true - mark a finished season with "finishedSeason": true, or leave it out)`);
    }
    // The day the season got finished is a note for the reviewer's own records:
    // a plain calendar date, only alongside the marking it belongs to.
    if (r.finishedDate !== undefined) {
      if (!isDay(r.finishedDate)) {
        issues.push(`"${label}" has a malformed finishedDate (expected a date like 2026-10-26)`);
      } else if (r.finishedSeason !== true) {
        issues.push(`"${label}" has a finishedDate without "finishedSeason": true`);
      } else if (Date.parse(r.finishedDate) > now) {
        issues.push(`"${label}" has a finishedDate in the future`);
      } else if (typeof r.dateReviewed === 'string' && r.finishedDate < dayOf(r.dateReviewed)) {
        issues.push(`"${label}" has a finishedDate (${r.finishedDate}) before its episode-1 review (${dayOf(r.dateReviewed)})`);
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
 * to be unique, no AniList id is reviewed twice (unless it's numbered parts in
 * different seasons), and exactly one season carries `current: true` - that flag is
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
  // A show deliberately split across seasons (one AniList entry, but a new
  // OP/ED and a mid-season finale) opts in by numbering every entry with
  // `part`: then each part is its own review, in its own season.
  const byAnilistId = new Map();
  for (const season of seasons) {
    for (const review of Array.isArray(season.shows) ? season.shows : []) {
      if (!Number.isInteger(review.anilistId)) continue;
      const entry = { where: `"${review.titleEN}" (${season.id})`, seasonId: season.id, part: review.part };
      byAnilistId.set(review.anilistId, [...(byAnilistId.get(review.anilistId) ?? []), entry]);
    }
  }
  for (const [id, entries] of byAnilistId) {
    if (entries.length < 2) continue;
    const where = entries.map(e => e.where).join(' and ');
    const parts = entries.map(e => e.part);
    if (!parts.every(part => Number.isInteger(part))) {
      issues.push(`anilistId ${id} is reviewed more than once: ${where} - if it's one show split across seasons on purpose, number every entry with "part"`);
    } else if (findDuplicates(parts).length > 0) {
      issues.push(`anilistId ${id} has the same part more than once: ${where}`);
    } else if (findDuplicates(entries.map(e => e.seasonId)).length > 0) {
      issues.push(`anilistId ${id} has more than one part in the same season: ${where}`);
    }
  }

  const current = seasons.filter(s => s.current === true);
  if (current.length === 0) {
    issues.push('no season is marked "current": true - exactly one has to be');
  } else if (current.length > 1) {
    issues.push(`${current.length} seasons are marked "current": true (${current.map(s => s.id).join(', ')}) - only one can be`);
  }

  return issues;
}

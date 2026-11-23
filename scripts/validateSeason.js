import { STREAMING_SERVICES, STREAMING_URL_FIELDS } from '../public/streaming.js';
import { LIST_ENTRY_KEYS, entryTitle } from '../public/vqar/list-entries.js';
import { opEdProblem } from '../public/vqar/oped.js';
import { isDay, isMoment, easternOffset } from '../public/dates.js';
import { AIRED_SEASONS } from '../public/vqar/aired.js';
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
 * Every key a show may carry. test/graphql.test.js checks the GraphQL `Show`
 * type against this list (plus the `season`/`seasonName` the API adds), so the
 * schema can't drift from what validation lets through.
 */
export const SHOW_KEYS = [
  'titleEN', 'titleJP', 'aired', 'reviews', 'watched', 'op', 'ed',
  'anilistId', 'anilist', 'annId', 'streaming', ...URL_FIELDS,
];

/** Every key one of a show's `reviews` may carry; checked against the GraphQL `Review` type too. */
export const REVIEW_KEYS = ['episodes', 'final', 'ratingNumber', 'ratingText', 'text', 'dateReviewed'];

/** Every key a show's `watched` object may carry; checked against the GraphQL `Watched` type too. */
export const WATCHED_KEYS = ['from', 'to', 'season', 'episode', 'finished'];

/** Every key a show's `aired` object may carry; checked against the GraphQL `Aired` type too. */
export const AIRED_KEYS = ['season', 'year'];

/**
 * Problems with one review timestamp: not stamped in the reviewer's Eastern
 * offset (the page shows the date exactly as written, so a UTC stamp can put an
 * evening review on tomorrow's date), or in the future.
 * @param {string} label - how to name the owner in a message
 * @param {string} field - e.g. `reviews[1].dateReviewed`
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
 * Problems with a show's `reviews`: each one well-formed, and the list telling
 * a story that makes sense - oldest first, at most one first impression and
 * only at the start, never fewer episodes than the review before it, and a
 * final verdict only last and only once the show is marked finished. The
 * stages these rules protect are derived, not stored (see
 * public/vqar/reviews.js), so a list that broke them would be labeled wrong.
 * @param {string} label
 * @param {any} show
 * @param {number} now
 * @returns {string[]}
 */
function reviewsIssues(label, show, now) {
  const { reviews } = show;
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return [`"${label}" needs a reviews list with at least one review`];
  }
  const issues = [];
  let previous = null;
  reviews.forEach((review, i) => {
    const where = `reviews[${i}]`;
    if (typeof review !== 'object' || review === null || Array.isArray(review)) {
      issues.push(`"${label}" has a malformed ${where} (expected an object)`);
      previous = null;
      return;
    }
    for (const key of Object.keys(review)) {
      if (!REVIEW_KEYS.includes(key)) {
        issues.push(`"${label}" has a ${where} with an unknown field "${key}" (a typo? expected one of ${REVIEW_KEYS.join(', ')})`);
      }
    }
    // Sorting, the rating chips and every /anime-stat-sheet number read this, so a
    // string, a decimal or a 7 would quietly drop the show out of them.
    if (!Number.isInteger(review.ratingNumber) || review.ratingNumber < 0 || review.ratingNumber > 5) {
      issues.push(`"${label}" has a ${where} without a ratingNumber from 0 to 5 (a whole number) - ask for the rating, since the latest review's is the show's rating everywhere`);
    }
    if (review.ratingText !== undefined && (typeof review.ratingText !== 'string' || review.ratingText.trim() === '')) {
      issues.push(`"${label}" has a malformed ${where}.ratingText (expected a non-empty string, or leave it out for the tier's own label)`);
    }
    if (review.text !== undefined && typeof review.text !== 'string') {
      issues.push(`"${label}" has a malformed ${where}.text (expected a string)`);
    }
    if (review.dateReviewed === undefined) {
      issues.push(`"${label}" has a ${where} without a dateReviewed`);
    } else if (!isMoment(review.dateReviewed)) {
      issues.push(`"${label}" has a ${where}.dateReviewed that isn't a timestamp like 2026-04-01T18:30:00-04:00`);
    } else {
      issues.push(...timestampIssues(label, `${where}.dateReviewed`, review.dateReviewed, now));
      if (previous && isMoment(previous.dateReviewed) && Date.parse(review.dateReviewed) < Date.parse(previous.dateReviewed)) {
        issues.push(`"${label}" has a ${where} dated before the review ahead of it - reviews are listed oldest first`);
      }
    }
    if (review.episodes !== undefined) {
      if (!(Number.isInteger(review.episodes) && review.episodes >= 1)) {
        issues.push(`"${label}" has a malformed ${where}.episodes (expected a whole number from 1)`);
      } else {
        if (review.episodes === 1 && i > 0) {
          issues.push(`"${label}" has a first impression (episodes: 1) at ${where} - there's at most one, and it comes first`);
        }
        if (Number.isInteger(previous?.episodes) && review.episodes < previous.episodes) {
          issues.push(`"${label}" has a ${where} based on fewer episodes (${review.episodes}) than the review before it (${previous.episodes})`);
        }
        const { watched } = show;
        if (typeof watched?.episode === 'number' && watched.season === undefined && review.episodes > watched.episode) {
          issues.push(`"${label}" has a ${where} based on ${review.episodes} episodes, past the watched.episode reached (${watched.episode})`);
        }
      }
    }
    if (review.final !== undefined) {
      if (review.final !== true) {
        issues.push(`"${label}" has a malformed ${where}.final (expected true, or leave it out)`);
      } else {
        if (i !== reviews.length - 1) issues.push(`"${label}" has a final review at ${where} that isn't the last one`);
        if (show.watched?.finished !== true) {
          issues.push(`"${label}" has a final review but isn't marked finished - set "watched": { ..., "finished": true }`);
        }
      }
    }
    previous = review;
  });
  return issues;
}

/**
 * Problems with a show's `aired`: when it first aired, from AniList - a
 * season and year, or just a year when AniList has no season for it.
 * @param {string} label
 * @param {any} aired
 * @returns {string[]}
 */
function airedIssues(label, aired) {
  if (typeof aired !== 'object' || aired === null || Array.isArray(aired)) {
    return [`"${label}" has a malformed aired (expected an object like { "season": "spring", "year": 2010 })`];
  }
  const issues = [];
  for (const key of Object.keys(aired)) {
    if (!AIRED_KEYS.includes(key)) issues.push(`"${label}" has an aired with an unknown field "${key}" (expected one of ${AIRED_KEYS.join(', ')})`);
  }
  if (!(Number.isInteger(aired.year) && aired.year >= 1900 && aired.year <= 2100)) {
    issues.push(`"${label}" has a malformed aired.year (expected a year like 2010)`);
  }
  if (aired.season !== undefined && !AIRED_SEASONS.includes(aired.season)) {
    issues.push(`"${label}" has a malformed aired.season (expected one of ${AIRED_SEASONS.join(', ')}, or leave it out)`);
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
  // Having watched the whole thing is a bare marking, independent of any
  // review or rating, since a season of trash can get finished too.
  if (watched.finished !== undefined && watched.finished !== true) {
    issues.push(`"${label}" has a malformed watched.finished (expected true, or leave it out)`);
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
      if (!SHOW_KEYS.includes(key)) {
        issues.push(`"${label}" has an unknown field "${key}" (a typo? expected one of ${SHOW_KEYS.join(', ')})`);
      }
    }
    issues.push(...reviewsIssues(label, r, now));
    if (r.aired !== undefined) issues.push(...airedIssues(label, r.aired));
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
  });

  return issues;
}

/**
 * Checks the seasons as a set, the way build-vqar-index.js sees them: ids have
 * to be unique, no AniList id is listed twice, and exactly one season carries `current: true` - that flag is
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

  // The same AniList id in two places (a second cour, or a repeat) is counted
  // twice in every /anime-stat-sheet number, and no title check would see it. A show
  // stays where it was first reviewed, and later reviews join its `reviews`.
  const byAnilistId = new Map();
  for (const season of seasons) {
    for (const show of Array.isArray(season.shows) ? season.shows : []) {
      if (!Number.isInteger(show.anilistId)) continue;
      byAnilistId.set(show.anilistId, [...(byAnilistId.get(show.anilistId) ?? []), `"${show.titleEN}" (${season.id})`]);
    }
  }
  for (const [id, where] of byAnilistId) {
    if (where.length > 1) {
      issues.push(`anilistId ${id} is listed more than once: ${where.join(' and ')} - a show stays where it was first reviewed, so add the later review to that one's reviews`);
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

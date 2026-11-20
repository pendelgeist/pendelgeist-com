import { RATING_NUMBER_LABELS, GAME_KEYS, GAME_REVIEW_KEYS, PLAYED_KEYS } from '../public/games/schema.js';
import { isMoment, isEasternMoment } from '../public/dates.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** @param {unknown} v */
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * One of a game's reviews: the writeup, its rating and when it was written. A
 * rating is required on every one, since the latest review's rating is the
 * game's - one without would quietly leave the old verdict standing.
 *
 * @param {object} review
 * @param {(msg: string) => void} push
 * @param {number} now
 */
function validateReview(review, push, now) {
  for (const key of Object.keys(review)) {
    if (!GAME_REVIEW_KEYS.includes(key)) push(`unknown field "${key}" (expected one of ${GAME_REVIEW_KEYS.join(', ')})`);
  }
  if (!isText(review.text)) push('missing text');
  if (!(String(review.ratingNumber) in RATING_NUMBER_LABELS) || !Number.isInteger(review.ratingNumber)) {
    push(`ratingNumber must be an integer 0-5 (got ${JSON.stringify(review.ratingNumber)})`);
  }
  if (review.ratingText !== undefined && !isText(review.ratingText)) {
    push('malformed ratingText (expected a non-empty string, or leave it out for the tier\'s own label)');
  }
  if (!isMoment(review.dateReviewed)) {
    push('dateReviewed must be a full timestamp with an offset, like 2026-10-24T20:15:00-04:00');
  } else {
    if (!isEasternMoment(review.dateReviewed)) push('dateReviewed is not in Eastern time - stamp it with TZ=America/New_York date +%Y-%m-%dT%H:%M:%S%:z');
    if (Date.parse(review.dateReviewed) > now) push('dateReviewed is in the future');
  }
  if (review.hoursPlayed !== undefined
      && (typeof review.hoursPlayed !== 'number' || !(review.hoursPlayed > 0))) {
    push('malformed hoursPlayed (expected a positive number)');
  }
  if (review.final !== undefined && review.final !== true) push('final is a bare marking - set it to true or leave it out');
}

/**
 * Checks the whole of public/games/data.json.
 * @param {unknown} data
 * @param {{ now?: number }} [options] - `now` (epoch ms) is what a date is checked against for being in the future
 * @returns {string[]} human-readable issues found; empty if the data is clean
 */
export function validateGameReviews(data, { now = Date.now() } = {}) {
  if (!isPlainObject(data) || !Array.isArray(data.games)) {
    return ['expected an object with a "games" array'];
  }

  const issues = [];
  const seen = new Set();

  data.games.forEach((game, i) => {
    const label = game?.id || `games[${i}]`;
    const push = (msg) => issues.push(`"${label}": ${msg}`);

    if (!isPlainObject(game)) {
      push('expected an object');
      return;
    }
    for (const key of Object.keys(game)) {
      if (!GAME_KEYS.includes(key)) push(`unknown field "${key}" (expected one of ${GAME_KEYS.join(', ')})`);
    }
    if (typeof game.id !== 'string' || !ID_PATTERN.test(game.id)) {
      push('id must be a lowercase slug (letters, digits, hyphens)');
    } else if (seen.has(game.id)) {
      push('duplicate id');
    } else {
      seen.add(game.id);
    }
    if (!isText(game.title)) push('missing title');
    if (game.platform !== undefined && !isText(game.platform)) {
      push('malformed platform (expected a string)');
    }
    if (game.played !== undefined) {
      if (!isPlainObject(game.played)) {
        push('malformed played (expected an object like { "finished": true })');
      } else {
        for (const key of Object.keys(game.played)) {
          if (!PLAYED_KEYS.includes(key)) push(`played has an unknown field "${key}" (expected one of ${PLAYED_KEYS.join(', ')})`);
        }
        if (game.played.finished !== undefined && game.played.finished !== true) {
          push('played.finished is a bare marking - set it to true or leave it out');
        }
      }
    }

    if (!Array.isArray(game.reviews) || game.reviews.length === 0) {
      push('needs a reviews list with at least one review');
      return;
    }
    let previous = -Infinity;
    game.reviews.forEach((review, j) => {
      const pushReview = (msg) => push(`reviews[${j}]: ${msg}`);
      if (!isPlainObject(review)) {
        pushReview('expected an object');
        return;
      }
      validateReview(review, pushReview, now);
      // Oldest first, so the last one is the current verdict.
      const time = Date.parse(review.dateReviewed);
      if (time < previous) pushReview('reviews must be in date order, oldest first');
      if (!Number.isNaN(time)) previous = time;
      if (review.final === true) {
        if (j !== game.reviews.length - 1) pushReview('a final review has to be the last one');
        if (game.played?.finished !== true) pushReview('a final review needs the game marked finished - set "played": { "finished": true }');
      }
    });
  });

  return issues;
}

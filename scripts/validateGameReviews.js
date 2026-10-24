import { RATING_NUMBER_LABELS } from '../public/games/schema.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** A full timestamp with an explicit offset, the same rule VQAR's dateReviewed follows. */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

/** @param {unknown} v */
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * The fields a first impression and each update share: the writeup, its
 * rating and when it was written. A rating is required on every one, since the
 * latest update's rating replaces the earlier one - an update without one
 * would quietly leave the old verdict standing.
 *
 * @param {object} impression
 * @param {(msg: string) => void} push
 */
function validateImpression(impression, push) {
  if (!isText(impression.review)) push('missing review text');
  if (!(String(impression.ratingNumber) in RATING_NUMBER_LABELS) || !Number.isInteger(impression.ratingNumber)) {
    push(`ratingNumber must be an integer 0-5 (got ${JSON.stringify(impression.ratingNumber)})`);
  }
  if (!isText(impression.ratingText)) push('missing ratingText');
  if (typeof impression.dateReviewed !== 'string' || !TIMESTAMP_PATTERN.test(impression.dateReviewed)
      || Number.isNaN(Date.parse(impression.dateReviewed))) {
    push('dateReviewed must be a full timestamp with an offset, like 2026-10-24T20:15:00-04:00');
  }
  if (impression.hoursPlayed !== undefined
      && (typeof impression.hoursPlayed !== 'number' || !(impression.hoursPlayed > 0))) {
    push('malformed hoursPlayed (expected a positive number)');
  }
}

/**
 * Checks the whole of public/games/data.json.
 * @param {unknown} data
 * @returns {string[]} human-readable issues found; empty if the data is clean
 */
export function validateGameReviews(data) {
  if (!isPlainObject(data) || !Array.isArray(data.reviews)) {
    return ['expected an object with a "reviews" array'];
  }

  const issues = [];
  const seen = new Set();

  data.reviews.forEach((review, i) => {
    const label = review?.id || `reviews[${i}]`;
    const push = (msg) => issues.push(`"${label}": ${msg}`);

    if (!isPlainObject(review)) {
      push('expected an object');
      return;
    }
    if (typeof review.id !== 'string' || !ID_PATTERN.test(review.id)) {
      push('id must be a lowercase slug (letters, digits, hyphens)');
    } else if (seen.has(review.id)) {
      push('duplicate id');
    } else {
      seen.add(review.id);
    }
    if (!isText(review.title)) push('missing title');
    if (review.platform !== undefined && !isText(review.platform)) {
      push('malformed platform (expected a string)');
    }
    if (review.finished !== undefined && review.finished !== true) {
      push('finished is a bare marking - set it to true or leave it out');
    }

    validateImpression(review, push);

    if (review.updates !== undefined) {
      if (!Array.isArray(review.updates)) {
        push('updates must be an array');
      } else {
        let previous = Date.parse(review.dateReviewed);
        review.updates.forEach((update, j) => {
          const pushUpdate = (msg) => push(`updates[${j}]: ${msg}`);
          if (!isPlainObject(update)) {
            pushUpdate('expected an object');
            return;
          }
          validateImpression(update, pushUpdate);
          // Oldest first, so the last one is the current verdict.
          const time = Date.parse(update.dateReviewed);
          if (time < previous) pushUpdate('updates must be in date order, oldest first');
          previous = time;
        });
      }
    }
  });

  return issues;
}

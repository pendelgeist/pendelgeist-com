/**
 * The rules /vqar and /vqar-stats have to agree on about a show's rating,
 * kept in one place the way the index path is (see data-paths.js).
 */

import { currentReview, firstImpression, reviewsOf } from './reviews.js';

/**
 * A show's rating wherever ratings get sorted, aggregated or ranked: its
 * latest review's, since that's the most informed verdict.
 *
 * `computeSecondImpressions` in ../vqar-stats/stats.js is the one deliberate
 * exception - it exists specifically to compare the first impression with
 * what came after, so it reads both directly rather than going through this.
 *
 * @param {{ reviews?: { ratingNumber?: number }[] }} show
 * @returns {number|undefined}
 */
export function effectiveRatingNumber(show) {
  return currentReview(show)?.ratingNumber;
}

/**
 * Default flavor text for each `ratingNumber`, taken from the "Suggested
 * Ratings" list in /vqar's guidelines. A review stores `ratingText` only when
 * it says something else (e.g. "I'd rather watch El-Hazard again") while
 * still sharing the same underlying tier, so anything that groups by tier -
 * /vqar-stats' distribution chart, /vqar's rating filter - labels it with this
 * canonical text rather than whatever a given review wrote.
 */
export const RATING_NUMBER_LABELS = {
  0: 'Dead, El-Hazard 2 Over This',
  1: 'Never, Please No More Like This Ever',
  2: 'Trash, for Second Screen Only',
  3: 'Meh, Finishing the Ep',
  4: "Yeah, Here's Hoping",
  5: 'Peak, Nice Ep Broh',
};

/**
 * A review's rating label: its own `ratingText` when it wrote one, otherwise
 * its tier's default.
 * @param {{ ratingNumber?: number, ratingText?: string }} review
 * @returns {string}
 */
export function ratingText(review) {
  return review?.ratingText ?? RATING_NUMBER_LABELS[/** @type {number} */ (review?.ratingNumber)] ?? '';
}

/**
 * A show's current rating label (see effectiveRatingNumber).
 * @param {{ reviews?: object[] }} show
 */
export function currentRatingText(show) {
  return ratingText(currentReview(show));
}

/**
 * The episode-1 tier that means "worth watching more" - "Yeah, Here's
 * Hoping" - and so the one revisits come from. A 5 is already a verdict and
 * a 3 or below rarely gets a second look.
 */
export const HOPING_RATING = 4;

/**
 * Whether a show is still waiting on its revisit: a first impression rated
 * HOPING_RATING with nothing after it. /vqar's "To revisit" filter and
 * /vqar-stats' Revisit Candidates and Hope Check all count by this. A show
 * reviewed only after watching a stretch of it (a backfill) has no first
 * impression, so it's never waiting.
 * @param {{ reviews?: object[] }} show
 */
export function awaitingRevisit(show) {
  return firstImpression(show)?.ratingNumber === HOPING_RATING && reviewsOf(show).length === 1;
}

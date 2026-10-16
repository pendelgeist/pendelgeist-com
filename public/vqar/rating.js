/**
 * The one rule /vqar and /vqar-stats have to agree on about a review's rating,
 * kept in one place the way the index path is (see data-paths.js).
 */

/**
 * A review's rating wherever ratings get sorted, aggregated or ranked: once a
 * full-series `fullReview` exists its rating supersedes the original
 * episode-1 `ratingNumber`, since it reflects the more informed verdict.
 *
 * `computeSecondImpressions` in ../vqar-stats/stats.js is the one deliberate
 * exception - it exists specifically to compare the two, so it reads both
 * fields directly rather than going through this.
 *
 * @param {{ ratingNumber?: number, fullReview?: { ratingNumber?: number } }} review
 * @returns {number|undefined}
 */
export function effectiveRatingNumber(review) {
  return typeof review.fullReview?.ratingNumber === 'number'
    ? review.fullReview.ratingNumber
    : review.ratingNumber;
}

/**
 * Default flavor text for each `ratingNumber`, taken from the "Suggested
 * Ratings" list in /vqar's guidelines. Individual reviews often customize
 * `ratingText` per-show (e.g. "I'd rather watch El-Hazard again") while
 * still sharing the same underlying `ratingNumber` tier, so anything that
 * groups by tier - /vqar-stats' distribution chart, /vqar's rating filter -
 * labels it with this canonical text rather than whatever a given review
 * actually wrote.
 */
export const RATING_NUMBER_LABELS = {
  0: 'Dead, El-Hazard 2 Over This',
  1: 'Never, Please No More Like This Ever',
  2: 'Trash, for Second Screen Only',
  3: 'Meh, Finishing the Ep',
  4: "Yeah, Here's Hoping",
  5: 'Peak, Nice Ep Broh',
};

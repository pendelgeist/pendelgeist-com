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

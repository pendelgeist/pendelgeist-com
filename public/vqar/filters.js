/**
 * The chip filters on /vqar - Rating, Streaming, Extras - kept pure and
 * DOM-free the way /vqar-stats keeps its crunching in stats.js, so the
 * matching and counting rules are testable without a page.
 *
 * One rule throughout: within a row, any selected chip matches (HIDIVE *or*
 * Netflix); across rows, every row with a selection has to match (a 5 *and*
 * on HIDIVE). A row with nothing selected doesn't filter at all.
 */

import { effectiveRatingNumber, RATING_NUMBER_LABELS } from './rating.js';
import { STREAMING_SERVICES } from '../streaming.js';

/** @typedef {'rating'|'on'|'has'} ChipDimension */
/** @typedef {Record<ChipDimension, Set<string>>} ChipFilters */

/** Highest first, matching "Highest Rating" being the more common sort. */
export const RATING_VALUES = ['5', '4', '3', '2', '1', '0'];

/** The Extras row, in display order. */
export const HAS_OPTIONS = {
  revisit: 'Revisited',
  up: 'Rated up on revisit',
  down: 'Rated down on revisit',
  oped: 'Liked OP/ED',
  finished: 'Finished season',
};

/** @type {ChipDimension[]} */
export const CHIP_DIMENSIONS = ['rating', 'on', 'has'];

/** Every value each row can hold, in the order chips render and URLs serialize. */
const KNOWN_VALUES = {
  rating: RATING_VALUES,
  on: Object.keys(STREAMING_SERVICES),
  has: Object.keys(HAS_OPTIONS),
};

/** @returns {ChipFilters} */
export function emptyChipFilters() {
  return { rating: new Set(), on: new Set(), has: new Set() };
}

/**
 * A rating chip's label: the tier's number and the first word of its default
 * text ("5 Peak", "2 Trash"), short enough for a row of six.
 * @param {string} value
 */
export function ratingChipLabel(value) {
  const text = RATING_NUMBER_LABELS[value] ?? '';
  return `${value} ${text.split(',')[0]}`.trim();
}

/**
 * The values a review has for one row. Rating goes through
 * effectiveRatingNumber, so a revisit's rating wins - the same number
 * "Highest Rating" sorts on.
 * @param {ChipDimension} dimension
 * @param {import('./app.js').Review} review
 * @returns {string[]}
 */
export function reviewValues(dimension, review) {
  if (dimension === 'rating') {
    const rating = effectiveRatingNumber(review);
    return typeof rating === 'number' ? [String(rating)] : [];
  }
  if (dimension === 'on') {
    return Array.isArray(review.streaming) ? review.streaming : [];
  }
  const values = [];
  if (review.fullReview) values.push('revisit');
  const before = review.ratingNumber;
  const after = review.fullReview?.ratingNumber;
  if (typeof before === 'number' && typeof after === 'number') {
    if (after > before) values.push('up');
    if (after < before) values.push('down');
  }
  if (review.op || review.ed) values.push('oped');
  if (review.finishedSeason === true) values.push('finished');
  return values;
}

/**
 * Whether a review passes every row's selection, optionally ignoring one row -
 * which is how a row's own chip counts are taken (see chipCounts).
 * @param {import('./app.js').Review} review
 * @param {ChipFilters} filters
 * @param {ChipDimension} [except]
 */
export function matchesChipFilters(review, filters, except) {
  return CHIP_DIMENSIONS.every(dimension => {
    const selected = filters[dimension];
    if (dimension === except || selected.size === 0) return true;
    return reviewValues(dimension, review).some(value => selected.has(value));
  });
}

/**
 * How many reviews each chip in a row would show: counted against every
 * *other* row's selection but not this row's own, so the numbers on a row
 * stay put as chips in it are toggled, and each one says what adding it
 * would bring in.
 * @param {import('./app.js').Review[]} reviews
 * @param {ChipFilters} filters
 * @param {ChipDimension} dimension
 * @returns {Map<string, number>}
 */
export function chipCounts(reviews, filters, dimension) {
  const counts = new Map();
  for (const review of reviews) {
    if (!matchesChipFilters(review, filters, dimension)) continue;
    for (const value of reviewValues(dimension, review)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** @param {ChipFilters} filters */
export function activeChipCount(filters) {
  return CHIP_DIMENSIONS.reduce((total, dimension) => total + filters[dimension].size, 0);
}

/**
 * Reads the chip rows out of a query string (`?rating=4,5&on=hidive`).
 * Values that aren't a known chip are dropped rather than kept as a filter
 * nothing could match.
 * @param {URLSearchParams} params
 * @returns {ChipFilters}
 */
export function chipFiltersFromParams(params) {
  const filters = emptyChipFilters();
  for (const dimension of CHIP_DIMENSIONS) {
    for (const value of (params.get(dimension) ?? '').split(',')) {
      if (KNOWN_VALUES[dimension].includes(value)) filters[dimension].add(value);
    }
  }
  return filters;
}

/**
 * Writes the chip rows into `params`, in a fixed order so the same filters
 * always give the same URL; an empty row is removed.
 * @param {URLSearchParams} params
 * @param {ChipFilters} filters
 */
export function writeChipFiltersToParams(params, filters) {
  for (const dimension of CHIP_DIMENSIONS) {
    const values = KNOWN_VALUES[dimension].filter(value => filters[dimension].has(value));
    if (values.length > 0) params.set(dimension, values.join(','));
    else params.delete(dimension);
  }
}

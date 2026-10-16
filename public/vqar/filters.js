/**
 * The filters on /vqar - Rating, Streaming, Extras, plus Format, Genre, Tag
 * and Studio from a review's generated `anilist` object - kept pure and
 * DOM-free the way /vqar-stats keeps its crunching in stats.js, so the
 * matching and counting rules are testable without a page.
 *
 * One rule throughout: within a row, any selected value matches (HIDIVE *or*
 * Netflix); across rows, every row with a selection has to match (a 5 *and*
 * on HIDIVE). A row with nothing selected doesn't filter at all. Tag and
 * Studio are dropdowns rather than chips - there are hundreds of them - but
 * they're rows like any other here.
 */

import { effectiveRatingNumber, RATING_NUMBER_LABELS } from './rating.js';
import { STREAMING_SERVICES } from '../streaming.js';

/** @typedef {'rating'|'on'|'has'|'format'|'genre'|'tag'|'studio'} ChipDimension */
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

/** AniList's format enum, as the Format row labels it, in display order. */
export const FORMAT_LABELS = {
  TV: 'TV',
  TV_SHORT: 'TV Short',
  ONA: 'ONA',
  OVA: 'OVA',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  MUSIC: 'Music',
};

/** @type {ChipDimension[]} */
export const CHIP_DIMENSIONS = ['rating', 'on', 'has', 'format', 'genre', 'tag', 'studio'];

/**
 * Every value each fixed row can hold, in the order chips render and URLs
 * serialize. Genre, Tag and Studio are open-ended - whatever AniList calls
 * them - so they take any value and serialize alphabetically.
 * @type {Partial<Record<ChipDimension, string[]>>}
 */
const KNOWN_VALUES = {
  rating: RATING_VALUES,
  on: Object.keys(STREAMING_SERVICES),
  has: Object.keys(HAS_OPTIONS),
  format: Object.keys(FORMAT_LABELS),
};

/** @returns {ChipFilters} */
export function emptyChipFilters() {
  return Object.fromEntries(CHIP_DIMENSIONS.map(dimension => [dimension, new Set()]));
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
  if (dimension === 'format') return review.anilist?.format ? [review.anilist.format] : [];
  if (dimension === 'genre') return review.anilist?.genres ?? [];
  if (dimension === 'tag') return review.anilist?.tags ?? [];
  if (dimension === 'studio') return review.anilist?.studios ?? [];
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
 * Reads the rows out of a query string (`?rating=4,5&on=hidive&tag=Isekai`).
 * A value that isn't a known chip on a fixed row is dropped rather than kept
 * as a filter nothing could match; an open row takes any non-empty value.
 * @param {URLSearchParams} params
 * @returns {ChipFilters}
 */
export function chipFiltersFromParams(params) {
  const filters = emptyChipFilters();
  for (const dimension of CHIP_DIMENSIONS) {
    for (const value of (params.get(dimension) ?? '').split(',')) {
      const known = KNOWN_VALUES[dimension];
      if (known ? known.includes(value) : value !== '') filters[dimension].add(value);
    }
  }
  return filters;
}

/**
 * Writes the rows into `params`, in a fixed order so the same filters always
 * give the same URL; an empty row is removed.
 * @param {URLSearchParams} params
 * @param {ChipFilters} filters
 */
export function writeChipFiltersToParams(params, filters) {
  // Cleared first and re-added in CHIP_DIMENSIONS order, so the URL doesn't
  // depend on which order the filters were picked in.
  for (const dimension of CHIP_DIMENSIONS) params.delete(dimension);
  for (const dimension of CHIP_DIMENSIONS) {
    const known = KNOWN_VALUES[dimension];
    const values = known
      ? known.filter(value => filters[dimension].has(value))
      : [...filters[dimension]].sort((a, b) => a.localeCompare(b));
    if (values.length > 0) params.set(dimension, values.join(','));
  }
}

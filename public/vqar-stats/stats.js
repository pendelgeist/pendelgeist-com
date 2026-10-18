/**
 * Pure data-crunching over VQAR season data - no DOM, no fetch, so it's
 * testable directly and reusable if the rendering ever changes. app.js
 * fetches the index + every season (mirroring /vqar's own fetch logic)
 * and hands the resulting season array to these functions.
 */

import { effectiveRatingNumber, awaitingRevisit, HOPING_RATING, RATING_NUMBER_LABELS } from '../vqar/rating.js';
import { entryTitle } from '../vqar/list-entries.js';
import { reviewValues } from '../vqar/filters.js';

/** @typedef {import('../vqar/app.js').SeasonData} SeasonData */

/**
 * Flattens every season's `reviewed` list into one array, tagging each
 * review with its season id/name and a parsed timestamp - the same shape
 * /vqar/app.js builds client-side for its "All Seasons" view.
 * @param {SeasonData[]} seasons
 */
export function flattenReviews(seasons) {
  return seasons.flatMap(season => (season.reviewed ?? []).map(r => ({
    ...r,
    season: String(season.id),
    seasonName: season.name,
    _timestamp: Date.parse(r.dateReviewed) || 0,
    // An archive season (older shows) is a shelf, not a point in time, so the
    // per-season trends below leave its reviews out.
    _archive: season.archive === true,
  })));
}

/** @param {number[]} nums */
function mean(nums) {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
}

function numericRatings(reviews) {
  return reviews.map(effectiveRatingNumber).filter(n => typeof n === 'number' && !Number.isNaN(n));
}

/**
 * The top-of-page stat-grid tiles.
 * @param {SeasonData[]} seasons
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeGlanceStats(seasons, reviews) {
  const avgRating = mean(numericRatings(reviews));

  const bySeason = new Map();
  for (const r of reviews) if (!r._archive) bySeason.set(r.season, (bySeason.get(r.season) ?? 0) + 1);
  let busiest = null;
  for (const [seasonId, count] of bySeason) {
    if (!busiest || count > busiest.count) {
      busiest = { seasonName: seasons.find(s => String(s.id) === seasonId)?.name ?? seasonId, count };
    }
  }

  const withAnilist = reviews.filter(r => r.anilistId != null).length;

  return {
    totalReviews: reviews.length,
    seasonsCovered: seasons.filter(s => s.archive !== true && (s.reviewed ?? []).length > 0).length,
    avgRating,
    fullReReviews: reviews.filter(r => r.fullReview).length,
    likedOps: reviews.filter(r => r.op === true).length,
    likedEds: reviews.filter(r => r.ed === true).length,
    finishedSeasons: reviews.filter(r => r.finishedSeason === true).length,
    anilistCoveragePct: reviews.length ? Math.round((withAnilist / reviews.length) * 100) : null,
    busiestSeasonName: busiest?.seasonName ?? null,
    busiestSeasonCount: busiest?.count ?? null,
  };
}

/**
 * How much of the season's reviewable lineup has been reviewed: `total` is
 * `reviewed` + `pending`. `skipped` shows are deliberately left out.
 * @param {SeasonData[]} seasons
 */
export function computeSeasonCoverage(seasons) {
  const airing = seasons.filter(s => s.archive !== true);
  const reviewed = airing.reduce((sum, s) => sum + (s.reviewed ?? []).length, 0);
  const pending = airing.reduce((sum, s) => sum + (s.pending ?? []).length, 0);
  const total = reviewed + pending;
  return { reviewed, pending, total, pct: total ? Math.round((reviewed / total) * 100) : null };
}

// Re-exported so existing importers of stats.js keep working; the labels live
// in rating.js now that /vqar's rating filter needs them too.
export { RATING_NUMBER_LABELS };

/**
 * Counts reviews per `ratingNumber`, ordered ascending (low to high) and
 * labeled with that number's default rating text (see RATING_NUMBER_LABELS)
 * rather than each review's own possibly-customized `ratingText`. Reviews
 * without a numeric `ratingNumber` are excluded - there's no tier to bucket
 * them into.
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeRatingDistribution(reviews) {
  const byNumber = new Map();
  for (const r of reviews) {
    const rating = effectiveRatingNumber(r);
    if (typeof rating !== 'number' || Number.isNaN(rating)) continue;
    const entry = byNumber.get(rating) ?? { ratingNumber: rating, count: 0 };
    entry.count += 1;
    byNumber.set(rating, entry);
  }
  return [...byNumber.values()]
    .sort((a, b) => a.ratingNumber - b.ratingNumber)
    .map(entry => ({ ...entry, ratingText: RATING_NUMBER_LABELS[entry.ratingNumber] ?? String(entry.ratingNumber) }));
}

/**
 * Average rating per season, ordered chronologically by each season's
 * earliest review date (the flattened review list carries no season order).
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeRatingsOverTime(reviews) {
  const bySeason = new Map();
  for (const r of reviews) {
    if (r._archive) continue;
    const entry = bySeason.get(r.season) ?? { season: r.season, seasonName: r.seasonName, ratings: [], earliest: Infinity };
    const rating = effectiveRatingNumber(r);
    if (typeof rating === 'number') entry.ratings.push(rating);
    if (r._timestamp && r._timestamp < entry.earliest) entry.earliest = r._timestamp;
    bySeason.set(r.season, entry);
  }
  return [...bySeason.values()]
    .map(({ season, seasonName, ratings, earliest }) => ({ season, seasonName, avgRating: mean(ratings), count: ratings.length, earliest }))
    .sort((a, b) => a.earliest - b.earliest);
}

/**
 * Top/bottom N numerically-rated shows, title as tiebreaker.
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {number} n
 */
export function computeHallOfFame(reviews, n = 5) {
  const rated = reviews
    .map(r => ({ ...r, ratingNumber: effectiveRatingNumber(r) }))
    .filter(r => typeof r.ratingNumber === 'number');
  const sorted = [...rated].sort((a, b) => b.ratingNumber - a.ratingNumber || (a.titleEN ?? '').localeCompare(b.titleEN ?? ''));
  return { best: sorted.slice(0, n), worst: sorted.slice(-n).reverse() };
}

/**
 * How ratings shift between an episode-1 impression and the eventual
 * full-series re-review, for shows that got one.
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeSecondImpressions(reviews) {
  const withDelta = reviews
    .filter(r => typeof r.ratingNumber === 'number' && typeof r.fullReview?.ratingNumber === 'number')
    .map(r => ({ ...r, delta: r.fullReview.ratingNumber - r.ratingNumber }));

  const deltas = withDelta.map(r => r.delta);
  const swings = [...withDelta].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);

  return {
    total: withDelta.length,
    avgDelta: mean(deltas),
    upgrades: deltas.filter(d => d > 0).length,
    downgrades: deltas.filter(d => d < 0).length,
    unchanged: deltas.filter(d => d === 0).length,
    swings,
  };
}

/**
 * A season's 4/5s ("Yeah") that haven't been given a `fullReview` yet - the
 * "I liked episode 1, I should go back and actually finish/revisit this"
 * pile (see awaitingRevisit). Excludes 5/5s (nothing to reconsider there)
 * and anything already re-reviewed (already revisited).
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {string|number} seasonId
 */
export function computeRevisitCandidates(reviews, seasonId) {
  return reviews
    .filter(r => r.season === String(seasonId) && awaitingRevisit(r))
    .sort((a, b) => b._timestamp - a._timestamp || (a.titleEN ?? '').localeCompare(b.titleEN ?? ''));
}

/** Earliest parseable `dateReviewed` across a season's reviewed list, or Infinity if none. */
function seasonEarliestTimestamp(season) {
  let earliest = Infinity;
  for (const r of season.reviewed ?? []) {
    const ts = Date.parse(r.dateReviewed);
    if (!Number.isNaN(ts) && ts < earliest) earliest = ts;
  }
  return earliest;
}

/**
 * Strips common "this is a continuing/returning season" markers (2nd Season,
 * Season 2, Part 2, Cour 2, roman numerals) so e.g. "Show Name Season 2" and
 * "Show Name" reduce to the same base title. Best-effort text heuristic only
 * - there's no structured season-relation data (like AniList's) to match on
 * instead, so an unconventionally-named sequel can still slip through.
 * @param {string} [title]
 */
function normalizeBaseTitle(title) {
  let base = (title ?? '').toLowerCase();
  const markers = [
    /\b(?:\d+(?:st|nd|rd|th)|second|third|fourth|fifth|sixth|final|last)\s+season\b/g,
    /\bseason\s*\d+\b/g,
    /\bs\d+\b/g,
    /\bpart\s*\d+\b/g,
    /\bcour\s*\d+\b/g,
    /\b(?:ii|iii|iv|vi|vii|viii)\b/g,
  ];
  for (const marker of markers) base = base.replace(marker, ' ');
  base = base.replace(/\b\d+$/, ' '); // a bare trailing number, e.g. "Show Name 2"
  base = base.replace(/[^\p{L}\p{N} ]+/gu, ' ');
  return base.replace(/\s+/g, ' ').trim();
}

/**
 * Shows in the given season's lineup (pending, skipped, or already reviewed)
 * that look like a continuing/returning season of something rated highly in
 * an *earlier* season - worth bumping up the queue even though VQAR's usual
 * guidance is to skip returning seasons. "Earlier" is judged by each
 * season's earliest `dateReviewed` (the flattened review list carries no
 * chronological), so picking an older season only checks it against
 * seasons that came before it, not ones that came after. Matches by
 * `normalizeBaseTitle`, so it's necessarily heuristic rather than exact.
 * @param {SeasonData[]} seasons
 * @param {string|number} seasonId
 * @param {{minRating?: number}} [options]
 */
export function computeContinuationWatch(seasons, seasonId, { minRating = 4 } = {}) {
  const targetSeason = seasons.find(s => String(s.id) === String(seasonId));
  if (!targetSeason) return [];

  const targetEarliest = seasonEarliestTimestamp(targetSeason);

  /** @type {Map<string, {title: string, seasonName: string, rating: number}>} */
  const bestPastByBase = new Map();
  for (const season of seasons) {
    if (String(season.id) === String(seasonId)) continue;
    if (seasonEarliestTimestamp(season) >= targetEarliest) continue; // only seasons that actually came before this one count as "the past"
    for (const r of season.reviewed ?? []) {
      const rating = effectiveRatingNumber(r);
      if (typeof rating !== 'number' || rating < minRating) continue;
      const base = normalizeBaseTitle(r.titleEN);
      if (!base) continue;
      const existing = bestPastByBase.get(base);
      if (!existing || rating > existing.rating) {
        bestPastByBase.set(base, { title: r.titleEN, seasonName: season.name, rating });
      }
    }
  }
  if (bestPastByBase.size === 0) return [];

  const candidates = [
    ...(targetSeason.pending ?? []).map(entry => ({ title: entryTitle(entry), status: 'pending' })),
    ...(targetSeason.skipped ?? []).map(entry => ({ title: entryTitle(entry), status: 'skipped' })),
    ...(targetSeason.reviewed ?? []).map(r => ({ title: r.titleEN, status: 'reviewed' })),
  ];

  const seen = new Set();
  const results = [];
  for (const { title, status } of candidates) {
    if (!title) continue;
    const base = normalizeBaseTitle(title);
    if (!base) continue;
    const match = bestPastByBase.get(base);
    if (!match) continue;
    const key = `${status}::${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ title, status, matchedTitle: match.title, seasonName: match.seasonName, rating: match.rating });
  }

  return results.sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
}

/**
 * Every liked OP and ED. A liking is a bare `"op": true` / `"ed": true`
 * marking with no rating to rank by, so it's every one of them, uncapped,
 * by title.
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeOpEdHighlights(reviews) {
  const liked = (key) => reviews
    .filter(r => r[key] === true)
    .map(r => ({ titleEN: r.titleEN, seasonName: r.seasonName }))
    .sort((a, b) => (a.titleEN ?? '').localeCompare(b.titleEN ?? ''));

  const likedOps = liked('op');
  const likedEds = liked('ed');
  return { opCount: likedOps.length, edCount: likedEds.length, likedOps, likedEds };
}

/**
 * How many shows a category needs before it's ranked. Below this, one lucky
 * or unlucky show decides its average - a studio with a single 5 isn't
 * really your favourite studio.
 */
export const MIN_CATEGORY_SHOWS = 3;

/**
 * The dimensions the category cross-references slice by. Each is one of
 * /vqar's filter rows (see filters.js) - the same `reviewValues` decides what
 * a show counts under on both pages, so a row here always matches the
 * filtered view it links to.
 * @type {('genre'|'studio'|'tag'|'format'|'on')[]}
 */
export const CATEGORY_DIMENSIONS = ['genre', 'studio', 'tag', 'format', 'on'];

/**
 * @typedef {Object} CategoryRow
 * @property {string} value - the genre/studio/tag/format/service
 * @property {number} shows - rated shows under it
 * @property {number} avgRating - by effectiveRatingNumber, so a revisit's rating wins
 * @property {number} highShare - fraction rated 4-5
 * @property {number} lowShare - fraction rated 0-1
 * @property {number|null} revisitShift - average revisit-minus-episode-1 change, over the revisits that have both; null with none
 * @property {number} revisits - how many shows that shift is over
 * @property {number} finished - shows marked finishedSeason
 * @property {number} likedOpEd - shows with a liked OP or ED
 */

/**
 * Your ratings cross-referenced by one category: per genre (or studio, tag,
 * format, streaming service), how many shows, how they rated on average, how
 * many were loved or hated, which way revisits moved them, and how often you
 * finished them or liked their OP/ED. Best average first; ties by more shows,
 * then name. Only numerically rated shows count. Categories under `minShows`
 * are left out, and the returned array's `hidden` says how many were.
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {typeof CATEGORY_DIMENSIONS[number]} dimension
 * @param {{ minShows?: number }} [options]
 * @returns {CategoryRow[] & { hidden: number }}
 */
export function computeCategoryRatings(reviews, dimension, { minShows = MIN_CATEGORY_SHOWS } = {}) {
  /** @type {Map<string, ReturnType<typeof flattenReviews>>} */
  const byValue = new Map();
  for (const review of reviews) {
    if (typeof effectiveRatingNumber(review) !== 'number') continue;
    for (const value of reviewValues(dimension, review)) {
      byValue.set(value, [...(byValue.get(value) ?? []), review]);
    }
  }

  const all = [...byValue].map(([value, shows]) => {
    const ratings = shows.map(effectiveRatingNumber);
    const shifts = shows
      .filter(r => typeof r.ratingNumber === 'number' && typeof r.fullReview?.ratingNumber === 'number')
      .map(r => r.fullReview.ratingNumber - r.ratingNumber);
    return {
      value,
      shows: shows.length,
      avgRating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      highShare: ratings.filter(n => n >= 4).length / ratings.length,
      lowShare: ratings.filter(n => n <= 1).length / ratings.length,
      revisitShift: shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : null,
      revisits: shifts.length,
      finished: shows.filter(r => r.finishedSeason === true).length,
      likedOpEd: shows.filter(r => r.op === true || r.ed === true).length,
    };
  });

  const kept = all
    .filter(row => row.shows >= minShows)
    .sort((a, b) => b.avgRating - a.avgRating || b.shows - a.shows || a.value.localeCompare(b.value));
  return Object.assign(kept, { hidden: all.length - kept.length });
}

/**
 * Your best- and worst-rated categories on one dimension, among those that
 * clear `minShows`. With fewer than 2n ranked, the list is split down the
 * middle instead, so nothing shows up as both a love and a hate.
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {typeof CATEGORY_DIMENSIONS[number]} dimension
 * @param {{ n?: number, minShows?: number }} [options]
 */
export function computeLovesAndHates(reviews, dimension, { n = 3, minShows = MIN_CATEGORY_SHOWS } = {}) {
  const ranked = computeCategoryRatings(reviews, dimension, { minShows });
  const half = Math.min(n, Math.ceil(ranked.length / 2));
  const loves = ranked.slice(0, half);
  const hates = ranked.slice(half).reverse().slice(0, Math.min(n, ranked.length - half));
  return { loves, hates };
}

/**
 * The seasons a set of reviews comes from, in airing order (by each one's
 * earliest review). Archive seasons (older shows) have no airing order, so
 * they aren't listed.
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @returns {{ id: string, name: string }[]}
 */
function seasonsInAiringOrder(reviews) {
  /** @type {Map<string, { id: string, name: string, first: number }>} */
  const seasonsById = new Map();
  for (const r of reviews) {
    if (r._archive) continue;
    const seen = seasonsById.get(r.season);
    if (!seen || r._timestamp < seen.first) seasonsById.set(r.season, { id: r.season, name: r.seasonName, first: r._timestamp });
  }
  return [...seasonsById.values()].sort((a, b) => a.first - b.first).map(({ id, name }) => ({ id, name }));
}

/**
 * Each genre's average rating per season - did romance have a good spring? -
 * with seasons in airing order (by their earliest review). Genres with fewer
 * than `minShows` across every season are left out; a season with no shows
 * in a genre simply has no cell for it.
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {{ minShows?: number }} [options]
 */
export function computeGenreBySeason(reviews, { minShows = MIN_CATEGORY_SHOWS } = {}) {
  const rated = reviews.filter(r => typeof effectiveRatingNumber(r) === 'number');
  const seasons = seasonsInAiringOrder(rated);

  const rows = computeCategoryRatings(rated, 'genre', { minShows }).map(({ value }) => {
    /** @type {Record<string, { avgRating: number, shows: number }>} */
    const cells = {};
    for (const { id } of seasons) {
      const ratings = rated
        .filter(r => r.season === id && reviewValues('genre', r).includes(value))
        .map(effectiveRatingNumber);
      if (ratings.length) cells[id] = { avgRating: ratings.reduce((a, b) => a + b, 0) / ratings.length, shows: ratings.length };
    }
    return { value, cells };
  });
  return { seasons, rows };
}

/**
 * @typedef {Object} HopeCheckCounts
 * @property {number} hoping - shows rated HOPING_RATING on episode 1
 * @property {number} revisited - of those, how many have a rated revisit
 * @property {number} rose - revisit rated above HOPING_RATING
 * @property {number} held - revisit rated HOPING_RATING again
 * @property {number} fell - revisit rated below HOPING_RATING
 * @property {number} waiting - no revisit yet (awaitingRevisit)
 * @property {number|null} heldShare - (rose + held) / revisited; null with no revisits
 */

/**
 * How the "Yeah, Here's Hoping" 4s turn out: an episode-1 4 is a "watch
 * more" rather than a verdict, so this counts how many got their revisit,
 * how many of those held up (rose or stayed at 4) or fell, and how many are
 * still waiting - overall and per season, seasons in airing order.
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @returns {HopeCheckCounts & { bySeason: (HopeCheckCounts & { id: string, name: string })[] }}
 */
export function computeHopeCheck(reviews) {
  const hoping = reviews.filter(r => r.ratingNumber === HOPING_RATING);
  /** @param {typeof hoping} shows @returns {HopeCheckCounts} */
  const count = (shows) => {
    const after = shows.map(r => r.fullReview?.ratingNumber).filter(n => typeof n === 'number');
    const rose = after.filter(n => n > HOPING_RATING).length;
    const held = after.filter(n => n === HOPING_RATING).length;
    return {
      hoping: shows.length,
      revisited: after.length,
      rose,
      held,
      fell: after.filter(n => n < HOPING_RATING).length,
      waiting: shows.filter(awaitingRevisit).length,
      heldShare: after.length ? (rose + held) / after.length : null,
    };
  };
  return {
    ...count(hoping),
    bySeason: seasonsInAiringOrder(hoping).map(({ id, name }) => ({ id, name, ...count(hoping.filter(r => r.season === id)) })),
  };
}

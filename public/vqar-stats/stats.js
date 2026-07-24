/**
 * Pure data-crunching over VQAR season data - no DOM, no fetch, so it's
 * testable directly and reusable if the rendering ever changes. app.js
 * fetches the manifest + every season (mirroring /vqar's own fetch logic)
 * and hands the resulting season array to these functions.
 */

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
  })));
}

/** @param {number[]} nums */
function mean(nums) {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
}

function numericRatings(reviews) {
  return reviews.map(r => r.ratingNumber).filter(n => typeof n === 'number' && !Number.isNaN(n));
}

/**
 * The top-of-page stat-grid tiles.
 * @param {SeasonData[]} seasons
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeGlanceStats(seasons, reviews) {
  const avgRating = mean(numericRatings(reviews));

  const bySeason = new Map();
  for (const r of reviews) bySeason.set(r.season, (bySeason.get(r.season) ?? 0) + 1);
  let busiest = null;
  for (const [seasonId, count] of bySeason) {
    if (!busiest || count > busiest.count) {
      busiest = { seasonName: seasons.find(s => String(s.id) === seasonId)?.name ?? seasonId, count };
    }
  }

  const withAnilist = reviews.filter(r => r.anilistId != null).length;

  return {
    totalReviews: reviews.length,
    seasonsCovered: seasons.filter(s => (s.reviewed ?? []).length > 0).length,
    avgRating,
    fullReReviews: reviews.filter(r => r.fullReview).length,
    opCallouts: reviews.filter(r => r.op).length,
    edCallouts: reviews.filter(r => r.ed).length,
    anilistCoveragePct: reviews.length ? Math.round((withAnilist / reviews.length) * 100) : null,
    busiestSeasonName: busiest?.seasonName ?? null,
    busiestSeasonCount: busiest?.count ?? null,
  };
}

/**
 * Counts reviews per `ratingText`, ordered by the highest `ratingNumber`
 * seen for that text (ascending, low to high) so e.g. "Trash" sorts below
 * "Peak" even though the underlying numbers aren't part of the label.
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeRatingDistribution(reviews) {
  const byText = new Map();
  for (const r of reviews) {
    if (!r.ratingText) continue;
    const entry = byText.get(r.ratingText) ?? { ratingText: r.ratingText, count: 0, maxNumber: -Infinity };
    entry.count += 1;
    if (typeof r.ratingNumber === 'number' && r.ratingNumber > entry.maxNumber) entry.maxNumber = r.ratingNumber;
    byText.set(r.ratingText, entry);
  }
  return [...byText.values()].sort((a, b) => a.maxNumber - b.maxNumber || b.count - a.count);
}

/**
 * Average rating per season, ordered chronologically by each season's
 * earliest review date (manifest order isn't guaranteed to be chronological).
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeRatingsOverTime(reviews) {
  const bySeason = new Map();
  for (const r of reviews) {
    const entry = bySeason.get(r.season) ?? { season: r.season, seasonName: r.seasonName, ratings: [], earliest: Infinity };
    if (typeof r.ratingNumber === 'number') entry.ratings.push(r.ratingNumber);
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
  const rated = reviews.filter(r => typeof r.ratingNumber === 'number');
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
 * Best-rated OP and ED callouts (those that carry their own `ratingNumber`).
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeOpEdHighlights(reviews) {
  const rank = (key) => reviews
    .filter(r => typeof r[key]?.ratingNumber === 'number')
    .map(r => ({ titleEN: r.titleEN, seasonName: r.seasonName, ratingNumber: r[key].ratingNumber, ratingText: r[key].ratingText }))
    .sort((a, b) => b.ratingNumber - a.ratingNumber)
    .slice(0, 5);

  return {
    opCount: reviews.filter(r => r.op).length,
    edCount: reviews.filter(r => r.ed).length,
    topOps: rank('op'),
    topEds: rank('ed'),
  };
}

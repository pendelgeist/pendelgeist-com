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

/**
 * A review's rating for calculation purposes: once a full-series `fullReview`
 * exists, its rating supersedes the original episode-1 `ratingNumber`
 * everywhere ratings get aggregated/ranked, since it reflects the more
 * informed verdict. `computeSecondImpressions` is the one exception - it
 * exists specifically to compare the two, so it reads both fields directly
 * instead of going through this.
 * @param {{ratingNumber?: number, fullReview?: {ratingNumber?: number}}} review
 */
function effectiveRatingNumber(review) {
  return typeof review.fullReview?.ratingNumber === 'number' ? review.fullReview.ratingNumber : review.ratingNumber;
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
 * Default flavor text for each `ratingNumber`, taken from the "Suggested
 * Ratings" list in /vqar's guidelines. Individual reviews often customize
 * `ratingText` per-show (e.g. "I'd rather watch El-Hazard again") while
 * still sharing the same underlying `ratingNumber` tier, so the distribution
 * chart labels bars with this canonical text rather than whatever a given
 * review actually wrote.
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
 * earliest review date (manifest order isn't guaranteed to be chronological).
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeRatingsOverTime(reviews) {
  const bySeason = new Map();
  for (const r of reviews) {
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
 * How your rating compares to MyAnimeList's community score, for shows with
 * a hand-entered `malScore`. `ratingNumber` (0-5, using the fullReview rating
 * once a show has one - see `effectiveRatingNumber`) is scaled onto MAL's
 * 0-10 scale so the two are comparable; `delta` is your scaled rating minus
 * MAL's score, so positive means you rated it higher than MAL did.
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
export function computeMalComparison(reviews) {
  const withMal = reviews
    .map(r => ({ ...r, vqarScore: effectiveRatingNumber(r) }))
    .filter(r => typeof r.vqarScore === 'number' && typeof r.malScore === 'number')
    .map(r => ({ ...r, vqarScaled: r.vqarScore * 2, delta: r.vqarScore * 2 - r.malScore }));

  const deltas = withMal.map(r => r.delta);
  const disagreements = [...withMal].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);

  return {
    total: withMal.length,
    avgDelta: mean(deltas),
    higherThanMal: deltas.filter(d => d > 0).length,
    lowerThanMal: deltas.filter(d => d < 0).length,
    matched: deltas.filter(d => d === 0).length,
    disagreements,
  };
}

/**
 * A season's 4/5s ("Yeah") that haven't been given a `fullReview` yet - the
 * "I liked episode 1, I should go back and actually finish/revisit this"
 * pile. Excludes 5/5s (nothing to reconsider there) and anything already
 * re-reviewed (already revisited).
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {string|number} seasonId
 */
export function computeRevisitCandidates(reviews, seasonId) {
  return reviews
    .filter(r => r.season === String(seasonId) && r.ratingNumber === 4 && !r.fullReview)
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
 * season's earliest `dateReviewed` (manifest order isn't guaranteed to be
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
    ...(targetSeason.pending ?? []).map(title => ({ title, status: 'pending' })),
    ...(targetSeason.skipped ?? []).map(title => ({ title, status: 'skipped' })),
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

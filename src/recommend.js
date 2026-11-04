/**
 * The `recommend` query: someone hands over shows they liked, and gets back
 * picks from *these* reviews, not AniList's own recommendations. AniList is
 * only used to read the liked shows' genres and tags (the same vocabulary the
 * reviews' generated `anilist` objects use) and how popular each candidate is.
 *
 * Everything here but `fetchAniListData` is pure, so the scoring is testable
 * without a network:
 *   1. A taste profile: each genre/tag weighted by the share of liked shows
 *      carrying it.
 *   2. Candidates: reviews rated 4+ (by the revisit rating when there is one)
 *      with AniList data, minus anything the person already named and its
 *      AniList relations (sequels, prequels, spin-offs).
 *   3. Picks: the best matches, chosen one at a time with a penalty for
 *      overlapping an earlier pick, so they aren't all the same kind of show.
 *   4. A hidden gem: among the remaining 5s, the least popular on AniList that
 *      still shares something with the profile.
 */

import { anilistFields } from '../scripts/anilistTags.js';
import { effectiveRatingNumber } from '../public/vqar/rating.js';

/** The lowest rating that's a recommendation at all. */
export const MIN_PICK_RATING = 4;
/** The rating a hidden gem has to have; falls back to MIN_PICK_RATING when no 5 is left. */
export const GEM_RATING = 5;
/** How many liked shows one query may name; each is a search in the same AniList request. */
export const MAX_LIKED = 25;
/** How many picks one query may ask for. */
export const MAX_PICKS = 10;
/** How much a pick's overlap with earlier picks counts against it (0 = none, 1 = only diversity matters). */
export const DIVERSITY_WEIGHT = 0.35;

/** AniList's `Page` caps perPage at 50. */
const PAGE_SIZE = 50;

const LIKED_FIELDS = `id
    title { romaji english }
    genres
    tags { name rank isGeneralSpoiler isMediaSpoiler isAdult }
    relations { nodes { id } }`;

/**
 * One AniList request covering everything the query needs: a search per liked
 * title, a lookup for liked ids given directly, and the popularity of every
 * candidate. Each piece gets an alias so the response can be split back up.
 * @param {{ titles: string[], ids: number[], candidateIds: number[] }} input
 * @returns {{ query: string, variables: object }}
 */
export function buildAniListQuery({ titles, ids, candidateIds }) {
  const params = [];
  const fields = [];
  const variables = {};
  titles.forEach((title, i) => {
    params.push(`$t${i}: String`);
    variables[`t${i}`] = title;
    fields.push(`liked${i}: Media(search: $t${i}, type: ANIME, sort: SEARCH_MATCH) { ${LIKED_FIELDS} }`);
  });
  if (ids.length > 0) {
    params.push('$likedIds: [Int]');
    variables.likedIds = ids;
    fields.push(`likedById: Page(perPage: ${PAGE_SIZE}) { media(id_in: $likedIds, type: ANIME) { ${LIKED_FIELDS} } }`);
  }
  for (let i = 0; i * PAGE_SIZE < candidateIds.length; i++) {
    params.push(`$c${i}: [Int]`);
    variables[`c${i}`] = candidateIds.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
    fields.push(`popularity${i}: Page(perPage: ${PAGE_SIZE}) { media(id_in: $c${i}, type: ANIME) { id popularity } }`);
  }
  const signature = params.length > 0 ? `(${params.join(', ')})` : '';
  return { query: `query${signature} {\n  ${fields.join('\n  ')}\n}`, variables };
}

/**
 * Splits a response to buildAniListQuery back into the liked shows (in the
 * order they were asked for, null where a search found nothing) and the
 * candidates' popularity.
 * @param {any} data - the response's `data`
 * @param {{ titles: string[], ids: number[] }} input
 */
export function parseAniListData(data, { titles, ids }) {
  const searched = titles.map((input, i) => ({ input, media: data?.[`liked${i}`] ?? null }));
  const byId = new Map((data?.likedById?.media ?? []).map((m) => [m.id, m]));
  const direct = ids.map((id) => ({ input: String(id), media: byId.get(id) ?? null }));

  const popularity = new Map();
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!key.startsWith('popularity')) continue;
    for (const m of value?.media ?? []) {
      if (typeof m.popularity === 'number') popularity.set(m.id, m.popularity);
    }
  }
  return { liked: [...searched, ...direct], popularity };
}

/**
 * @param {(query: string, variables: object) => Promise<any>} request
 * @param {{ titles: string[], ids: number[], candidateIds: number[] }} input
 */
export async function fetchAniListData(request, input) {
  const { query, variables } = buildAniListQuery(input);
  return parseAniListData(await request(query, variables), input);
}

/** A genre and a tag can share a name, so features are kept apart by kind. */
const featureKey = (kind, name) => `${kind}:${name}`;

/**
 * Genres and filtered tags, as feature keys. Takes either a raw AniList media
 * or a review's stored `anilist` object, which already went through the same
 * filter.
 * @param {{ genres?: string[], tags?: (string|object)[] }} info
 */
function featuresOf(info) {
  const tags = (info.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name));
  return new Set([
    ...(info.genres ?? []).map((g) => featureKey('genre', g)),
    ...tags.map((t) => featureKey('tag', t)),
  ]);
}

/**
 * Each genre and tag the liked shows carry, weighted by the share of them that
 * carry it, strongest first.
 * @param {any[]} likedMedia - AniList media, as returned by the liked searches
 * @returns {{ name: string, kind: 'genre'|'tag', weight: number }[]}
 */
export function buildProfile(likedMedia) {
  if (likedMedia.length === 0) return [];
  const counts = new Map();
  for (const media of likedMedia) {
    for (const key of featuresOf(anilistFields(media))) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => {
      const [kind, ...rest] = key.split(':');
      return { name: rest.join(':'), kind: /** @type {'genre'|'tag'} */ (kind), weight: count / likedMedia.length };
    })
    .sort((a, b) => b.weight - a.weight || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/** Jaccard overlap between two feature sets: 0 for nothing shared, 1 for identical. */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const key of a) if (b.has(key)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Picks and a hidden gem from the reviews, for the given liked shows.
 * @param {object} options
 * @param {any[]} options.reviews - flattened reviews, each with `season`/`seasonName`
 * @param {any[]} options.likedMedia - AniList media for the liked shows that were found
 * @param {Map<number, number>} [options.popularity] - AniList popularity by id
 * @param {number} [options.count] - how many picks
 */
export function recommend({ reviews, likedMedia, popularity = new Map(), count = 2 }) {
  const profile = buildProfile(likedMedia);
  const weights = new Map(profile.map((p) => [featureKey(p.kind, p.name), p.weight]));
  const profileNorm = Math.sqrt(profile.reduce((sum, p) => sum + p.weight ** 2, 0));

  // Anything named, or related to something named (a sequel, a prequel, a
  // spin-off), is a show they already know about.
  const known = new Set();
  for (const media of likedMedia) {
    known.add(media.id);
    for (const node of media.relations?.nodes ?? []) known.add(node.id);
  }

  const candidates = [];
  for (const review of reviews) {
    const rating = effectiveRatingNumber(review);
    if (typeof rating !== 'number' || rating < MIN_PICK_RATING) continue;
    if (!review.anilist || !Number.isInteger(review.anilistId) || known.has(review.anilistId)) continue;
    const features = featuresOf(review.anilist);
    if (features.size === 0 || profileNorm === 0) continue;

    let overlap = 0;
    for (const key of features) overlap += weights.get(key) ?? 0;
    if (overlap === 0) continue; // nothing in common is a random pick, not a recommendation
    // Cosine similarity between the review's features and the profile, scaled
    // by the rating so a 5 beats an equally close 4.
    const match = overlap / (Math.sqrt(features.size) * profileNorm);
    candidates.push({ review, rating, features, match, score: match * (rating / 5) });
  }

  // One entry per AniList id: a show split into parts competes once, as its best-rated part.
  const byId = new Map();
  for (const c of candidates) {
    const existing = byId.get(c.review.anilistId);
    if (!existing || c.score > existing.score) byId.set(c.review.anilistId, c);
  }
  const pool = [...byId.values()];

  const picks = [];
  const wanted = Math.max(0, Math.min(count, MAX_PICKS));
  while (picks.length < wanted && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      const similarity = Math.max(0, ...picks.map((p) => jaccard(c.features, p.features)));
      const value = (1 - DIVERSITY_WEIGHT) * c.score - DIVERSITY_WEIGHT * similarity;
      if (value > bestValue || (value === bestValue && c.review.titleEN < pool[bestIndex].review.titleEN)) {
        bestValue = value;
        bestIndex = i;
      }
    });
    picks.push(...pool.splice(bestIndex, 1));
  }

  const gemFrom = (minRating) => pool
    .filter((c) => c.rating >= minRating)
    .sort((a, b) => (popularity.get(a.review.anilistId) ?? Infinity) - (popularity.get(b.review.anilistId) ?? Infinity)
      || b.score - a.score)[0] ?? null;
  const gem = gemFrom(GEM_RATING) ?? gemFrom(MIN_PICK_RATING);

  const describe = (c) => {
    const shared = profile.filter((p) => c.features.has(featureKey(p.kind, p.name)));
    return {
      review: c.review,
      score: Math.round(c.score * 1000) / 1000,
      popularity: popularity.get(c.review.anilistId) ?? null,
      sharedGenres: shared.filter((p) => p.kind === 'genre').map((p) => p.name),
      sharedTags: shared.filter((p) => p.kind === 'tag').map((p) => p.name),
    };
  };

  return {
    profile: profile.map((p) => ({ ...p, weight: Math.round(p.weight * 1000) / 1000 })),
    picks: picks.map(describe),
    hiddenGem: gem ? describe(gem) : null,
  };
}

/**
 * The candidates worth asking AniList about, before the liked shows are
 * known: every review that could be a pick at all.
 * @param {any[]} reviews
 */
export function candidateIds(reviews) {
  return [...new Set(reviews
    .filter((r) => Number.isInteger(r.anilistId) && r.anilist && (effectiveRatingNumber(r) ?? -1) >= MIN_PICK_RATING)
    .map((r) => r.anilistId))];
}

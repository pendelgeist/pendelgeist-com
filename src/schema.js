/**
 * GraphQL schema and resolvers for the seasonal anime data. This mirrors the
 * index + per-season file shapes documented in the README and consumed by
 * public/vqar/app.js, but reads and reshapes them server-side instead.
 *
 * The data is committed to this repo and served as a static asset, so the
 * resolvers read it through the Worker's ASSETS binding rather than fetching it
 * over the network - no round trip, and no cache to lag behind a deploy.
 */

import { VQAR_INDEX_PATH } from '../public/vqar/data-paths.js';

export const typeDefs = `#graphql
"""A follow-up note attached to a review: a full-series re-review once a
"Finish Ep"-rated show is actually finished, or an opening/ending callout."""
type SubReview {
  ratingNumber: Float
  ratingText: String
  review: String
  dateReviewed: String
}

"""A single-episode review of a show, plus optional follow-up notes."""
type Review {
  titleEN: String!
  titleJP: String
  ratingNumber: Float
  ratingText: String
  review: String
  dateReviewed: String
  fullReview: SubReview
  op: SubReview
  ed: SubReview
  "The id of the season this review belongs to."
  season: ID!
  "The display name of the season this review belongs to."
  seasonName: String!
  "Optional AniList media id, for linking out to the show's AniList page."
  anilistId: Int
  "Optional Anime News Network encyclopedia id, for linking out to the show's ANN page."
  annId: Int
  "Optional English Wikipedia article URL. Stored as a URL rather than an id, since Wikipedia keys on the article title."
  wikipediaUrl: String
  "Optional Japanese Wikipedia article URL, usually the more detailed of the two on staff and broadcast history."
  wikipediaJaUrl: String
  "Optional list of streaming service keys the show is available on (e.g. crunchyroll, netflix)."
  streaming: [String!]
  "Optional direct link to the show's Crunchyroll page; makes the CR streaming badge clickable."
  crunchyrollUrl: String
  "Optional direct link to the show's HIDIVE page; makes the HD streaming badge clickable."
  hidiveUrl: String
  "Optional direct link to the show's Netflix page; makes the NF streaming badge clickable."
  netflixUrl: String
  "Optional, free-text note on how far a revisit actually got (e.g. Ep 3)."
  watchProgress: String
}

"""One anime season: its reviewed shows, plus titles still pending or skipped."""
type Season {
  id: ID!
  name: String!
  "Optional MAL season id, purely informational."
  number: Int
  reviewed: [Review!]!
  pending: [String!]!
  skipped: [String!]!
}

"""A season as listed in the index, without its full review data."""
type SeasonSummary {
  id: ID!
  name: String!
}

type Query {
  "Every season in the index (id + name only); use season(id:) or currentSeason for full data."
  seasons: [SeasonSummary!]!
  "The season currently marked as in-progress in the index."
  currentSeason: Season
  "A specific season's full data, by id (e.g. \\"spring-2026\\")."
  season(id: ID!): Season
}
`;

/**
 * Root value whose fields graphql-js uses as the Query type's default resolvers.
 * @param {{ assets: { fetch: (url: URL) => Promise<Response> }, origin: string }} env
 *   `assets` is the Worker's ASSETS binding; `origin` is what the relative data
 *   paths get resolved against, since the binding needs an absolute URL.
 */
export function makeRootValue({ assets, origin }) {
  /**
   * @param {string} path
   * @param {string} label - what to name in the error if the read fails
   */
  async function loadJson(path, label) {
    const response = await assets.fetch(new URL(path, origin));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} loading ${label}`);
    }
    return response.json();
  }

  const loadIndex = () => loadJson(VQAR_INDEX_PATH, 'the season index');

  /** @param {{ id: string|number, name: string, file: string }} meta */
  async function loadSeason(meta) {
    const data = await loadJson(meta.file, `season "${meta.name}"`);
    const id = String(data.id ?? meta.id);
    const name = data.name ?? meta.name;
    return {
      id,
      name,
      number: data.number ?? null,
      reviewed: (data.reviewed ?? []).map((r) => ({ ...r, season: id, seasonName: name })),
      pending: data.pending ?? [],
      skipped: data.skipped ?? [],
    };
  }

  return {
    async seasons() {
      const index = await loadIndex();
      return index.seasons.map((s) => ({ id: String(s.id), name: s.name }));
    },
    async currentSeason() {
      const index = await loadIndex();
      const meta = index.seasons.find((s) => String(s.id) === String(index.currentSeason));
      return meta ? loadSeason(meta) : null;
    },
    async season({ id }) {
      const index = await loadIndex();
      const meta = index.seasons.find((s) => String(s.id) === String(id));
      return meta ? loadSeason(meta) : null;
    },
  };
}

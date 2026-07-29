/**
 * GraphQL schema and resolvers for the seasonal anime data. This mirrors the
 * manifest + per-season gist shapes documented in the README and consumed by
 * public/vqar/app.js, but fetches and reshapes them server-side instead.
 */

import { cachedFetch } from './cache.js';
import { MANIFEST_URL } from '../public/manifest-url.js';

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
  "Optional list of streaming service keys the show is available on (e.g. crunchyroll, netflix)."
  streaming: [String!]
  "Optional direct link to the show's Crunchyroll page; makes the CR streaming badge clickable."
  crunchyrollUrl: String
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

"""A season as listed in the manifest, without its full review data."""
type SeasonSummary {
  id: ID!
  name: String!
}

type Query {
  "Every season in the manifest (id + name only); use season(id:) or currentSeason for full data."
  seasons: [SeasonSummary!]!
  "The season currently marked as in-progress in the manifest."
  currentSeason: Season
  "A specific season's full data, by id (e.g. \\"spring-2026\\")."
  season(id: ID!): Season
}
`;

async function fetchManifest() {
  const response = await cachedFetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading manifest`);
  }
  return response.json();
}

/** @param {{ id: string|number, name: string, file: string }} meta */
async function fetchSeason(meta) {
  const response = await cachedFetch(meta.file);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading season "${meta.name}"`);
  }
  const data = await response.json();
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

/** Root value whose fields graphql-js uses as the Query type's default resolvers. */
export function makeRootValue() {
  return {
    async seasons() {
      const manifest = await fetchManifest();
      return manifest.seasons.map((s) => ({ id: String(s.id), name: s.name }));
    },
    async currentSeason() {
      const manifest = await fetchManifest();
      const meta = manifest.seasons.find((s) => String(s.id) === String(manifest.currentSeason));
      return meta ? fetchSeason(meta) : null;
    },
    async season({ id }) {
      const manifest = await fetchManifest();
      const meta = manifest.seasons.find((s) => String(s.id) === String(id));
      return meta ? fetchSeason(meta) : null;
    },
  };
}

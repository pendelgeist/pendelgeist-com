#!/usr/bin/env node
/**
 * Regenerates public/vqar/data/index.json from the individual season files in
 * public/vqar/data/seasons/.
 *
 * The index is what /vqar and /vqar-stats load first: it lists every season and
 * where to find it, and names the one currently being reviewed. It's generated
 * rather than hand-maintained for the same reason /fsar's index is - keeping a
 * hand-written list in sync with the files beside it is a bug waiting to happen.
 * test/vqar-data.test.js fails if the committed index doesn't match a fresh build.
 *
 *   node scripts/build-vqar-index.js            # writes index.json
 *   node scripts/build-vqar-index.js --check    # exits 1 if it's stale, writes nothing
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFiles, serializeIndex, syncIndexFile } from './indexFile.js';
import { validateSeason, validateSeasonCollection, seasonSortKey } from './validateSeason.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '../public/vqar/data');
export const SEASONS_DIR = path.join(DATA_DIR, 'seasons');
export const INDEX_PATH = path.join(DATA_DIR, 'index.json');

export { serializeIndex };

/** The public path a season file is served from, which is what the index stores. */
export function seasonPath(id) {
  return `/vqar/data/seasons/${id}.json`;
}

/** @returns {{ filename: string, season: object }[]} */
export function readSeasons(dir = SEASONS_DIR) {
  return readJsonFiles(dir).map(({ filename, data }) => ({ filename, season: data }));
}

/**
 * Builds the index: which season is current, plus an id/name/file entry for
 * each, newest first. Ordering comes from the season id rather than the
 * directory listing, since alphabetical order would put spring before winter.
 * @param {object[]} seasons
 */
export function buildIndex(seasons) {
  // A season with no sort key would make the comparator return NaN, which
  // leaves the order up to the sort implementation. validateSeason catches this
  // first in normal use; throwing keeps a direct caller from getting a quietly
  // mis-ordered index instead of an error.
  for (const season of seasons) {
    if (seasonSortKey(season) === null) {
      throw new Error(`Cannot order season "${season.id}": its id isn't "<season>-<year>" and it has no numeric sortKey`);
    }
  }

  const ordered = [...seasons].sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
  return {
    currentSeason: ordered.find((s) => s.current === true)?.id ?? null,
    seasons: ordered.map((s) => ({ id: s.id, name: s.name, file: seasonPath(s.id) })),
  };
}

function main() {
  const entries = readSeasons();
  const seasons = entries.map((e) => e.season);

  const issues = [
    ...entries.flatMap(({ filename, season }) => validateSeason(season, { filename })),
    ...validateSeasonCollection(seasons),
  ];

  process.exitCode = syncIndexFile({
    issues,
    indexPath: INDEX_PATH,
    // A thunk: buildIndex throws on a season it can't order, so it must not
    // run unless validation passed.
    next: () => serializeIndex(buildIndex(seasons)),
    count: entries.length,
    noun: 'season',
    rebuildCommand: 'npm run build-vqar-index',
    check: process.argv.includes('--check'),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

#!/usr/bin/env node
/**
 * Regenerates public/vqar/data/index.json from the individual season files in
 * public/vqar/data/seasons/.
 *
 * The index is what /vqar and /vqar-stats load first: it lists every season and
 * where to find it, and names the one currently being reviewed. It replaces the
 * manifest gist the season data used to live behind, and it's generated rather
 * than hand-maintained for the same reason /fsar's index is - keeping a
 * hand-written list in sync with the files beside it is a bug waiting to happen.
 * test/vqar-data.test.js fails if the committed index doesn't match a fresh build.
 *
 *   node scripts/build-vqar-index.js            # writes index.json
 *   node scripts/build-vqar-index.js --check    # exits 1 if it's stale, writes nothing
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSeason, validateSeasonCollection, seasonSortKey } from './validateSeason.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '../public/vqar/data');
export const SEASONS_DIR = path.join(DATA_DIR, 'seasons');
export const INDEX_PATH = path.join(DATA_DIR, 'index.json');

/** The public path a season file is served from, which is what the index stores. */
export function seasonPath(id) {
  return `/vqar/data/seasons/${id}.json`;
}

/** Reads every season file, sorted by filename so the output is deterministic. */
export function readSeasons(dir = SEASONS_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((filename) => ({
      filename,
      season: JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf-8')),
    }));
}

/**
 * Builds the index: which season is current, plus an id/name/file entry for
 * each, newest first. Ordering comes from the season id rather than the
 * directory listing, since alphabetical order would put spring before winter.
 * @param {object[]} seasons
 */
export function buildIndex(seasons) {
  const ordered = [...seasons].sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
  return {
    currentSeason: ordered.find((s) => s.current === true)?.id ?? null,
    seasons: ordered.map((s) => ({ id: s.id, name: s.name, file: seasonPath(s.id) })),
  };
}

export function serializeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const entries = readSeasons();

  const issues = [
    ...entries.flatMap(({ filename, season }) => validateSeason(season, { filename })),
    ...validateSeasonCollection(entries.map((e) => e.season)),
  ];
  if (issues.length > 0) {
    console.error(`${issues.length} issue(s) found; index not written:\n`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  const next = serializeIndex(buildIndex(entries.map((e) => e.season)));
  const current = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf-8') : '';

  if (check) {
    if (next !== current) {
      console.error('index.json is out of date - run: npm run build-vqar-index');
      process.exit(1);
    }
    console.log(`index.json is up to date (${entries.length} season(s)).`);
    return;
  }

  fs.writeFileSync(INDEX_PATH, next);
  console.log(
    current === next
      ? `index.json unchanged (${entries.length} season(s)).`
      : `Wrote index.json (${entries.length} season(s)).`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

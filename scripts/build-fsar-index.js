#!/usr/bin/env node
/**
 * Regenerates public/fsar/data/index.json from the individual review files in
 * public/fsar/data/reviews/.
 *
 * The index is what /fsar's list view loads: every card-level field, but not
 * the review bodies, so browsing the list doesn't download every writeup. It's
 * generated rather than hand-maintained because keeping a hand-written index
 * in sync with the review files is a bug waiting to happen - test/fsar-data.test.js
 * fails if the committed index doesn't match a fresh build.
 *
 *   node scripts/build-fsar-index.js            # writes index.json
 *   node scripts/build-fsar-index.js --check    # exits 1 if it's stale, writes nothing
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFiles, serializeIndex, syncIndexFile } from './indexFile.js';
import { BODY_KEYS } from '../public/fsar/schema.js';
import { validateFsarReview, validateFsarCollection } from './validateFsarReview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '../public/fsar/data');
export const REVIEWS_DIR = path.join(DATA_DIR, 'reviews');
export const INDEX_PATH = path.join(DATA_DIR, 'index.json');

export { serializeIndex };

/** @returns {{ filename: string, review: object }[]} */
export function readReviews(dir = REVIEWS_DIR) {
  return readJsonFiles(dir).map(({ filename, data }) => ({ filename, review: data }));
}

/**
 * Strips the review bodies, leaving the card-level metadata the list view
 * needs. Sorted by id so a regen produces a stable diff.
 * @param {object[]} reviews
 */
export function buildIndex(reviews) {
  const cards = reviews
    .map((review) => Object.fromEntries(
      Object.entries(review).filter(([key]) => !BODY_KEYS.includes(key))
    ))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { reviews: cards };
}

function main() {
  const entries = readReviews();
  const reviews = entries.map((e) => e.review);

  const issues = [
    ...entries.flatMap(({ filename, review }) => validateFsarReview(review, { filename })),
    ...validateFsarCollection(reviews),
  ];

  process.exitCode = syncIndexFile({
    issues,
    indexPath: INDEX_PATH,
    next: () => serializeIndex(buildIndex(reviews)),
    count: entries.length,
    noun: 'review',
    rebuildCommand: 'npm run build-fsar-index',
    check: process.argv.includes('--check'),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

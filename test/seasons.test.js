import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeasonId, seasonSortKey, isLineup } from '../public/vqar/seasons.js';

test('a lineup is a season with a <season>-<year> id; anything else is a shelf', () => {
  assert.equal(isLineup('spring-2026'), true);
  assert.equal(isLineup({ id: 'fall-2025' }), true);
  assert.equal(isLineup('backlog'), false);
  assert.equal(isLineup({ id: 'backlog', sortKey: 0 }), false);
  assert.equal(isLineup(undefined), false);
});

test('parseSeasonId rejects ids it cannot order', () => {
  assert.equal(typeof parseSeasonId('winter-2026'), 'number');
  assert.equal(parseSeasonId('midsummer-2026'), null, 'unknown season name');
  assert.equal(parseSeasonId('summer-26'), null, 'two-digit year');
  assert.equal(parseSeasonId('summer2026'), null, 'no separator');
});

test('seasonSortKey prefers an explicit sortKey, else parses the id', () => {
  assert.equal(seasonSortKey({ id: 'backlog', sortKey: 0 }), 0);
  assert.equal(seasonSortKey({ id: 'fall-2026' }), 20263);
  assert.ok(seasonSortKey({ id: 'winter-2027' }) > seasonSortKey({ id: 'fall-2026' }));
  assert.equal(seasonSortKey({ id: 'backlog' }), null);
});

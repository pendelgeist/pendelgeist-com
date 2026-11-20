import { test } from 'node:test';
import assert from 'node:assert/strict';

import { airedLabel, airedSeasonId, airedDiffers, airedKey, airedKeyRank, airedKeyLabel, AIRED_SEASONS } from '../public/vqar/aired.js';

test('airedLabel reads a season and year, or a year alone', () => {
  assert.equal(airedLabel({ season: 'spring', year: 2010 }), 'Spring 2010');
  assert.equal(airedLabel({ year: 2026 }), '2026');
  assert.equal(airedLabel(undefined), '');
});

test('airedSeasonId is the lineup id an aired season would have', () => {
  assert.equal(airedSeasonId({ season: 'fall', year: 2026 }), 'fall-2026');
  assert.equal(airedSeasonId({ year: 2026 }), null);
  for (const season of AIRED_SEASONS) assert.match(airedSeasonId({ season, year: 2000 }), /^[a-z]+-2000$/);
});

test('airing is worth pointing out only where it is not the lineup the show sits in', () => {
  assert.equal(airedDiffers({ aired: { season: 'fall', year: 2026 } }, 'fall-2026'), false);
  assert.equal(airedDiffers({ aired: { season: 'winter', year: 2004 } }, 'spring-2026'), true);
  assert.equal(airedDiffers({ aired: { year: 2026 } }, 'fall-2026'), true);
  assert.equal(airedDiffers({ aired: { season: 'fall', year: 2026 } }, 'backlog'), true);
  assert.equal(airedDiffers({}, 'backlog'), false);
});

test('airedKey is what the Aired view browses by: the season id, or the year alone', () => {
  assert.equal(airedKey({ season: 'spring', year: 2010 }), 'spring-2010');
  assert.equal(airedKey({ year: 2026 }), '2026');
  assert.equal(airedKey(undefined), null);
  assert.equal(airedKeyLabel('spring-2010'), 'Spring 2010');
  assert.equal(airedKeyLabel('2026'), '2026');
});

test('aired keys sort by year, then season, with a year alone after that year\'s seasons', () => {
  const keys = ['2026', 'winter-2026', 'fall-2025', 'fall-2026', 'spring-1978'];
  assert.deepEqual([...keys].sort((a, b) => airedKeyRank(b) - airedKeyRank(a)), ['fall-2026', 'winter-2026', '2026', 'fall-2025', 'spring-1978']);
});

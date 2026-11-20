import { test } from 'node:test';
import assert from 'node:assert/strict';

import { airedLabel, airedSeasonId, airedDiffers, AIRED_SEASONS } from '../public/vqar/aired.js';

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

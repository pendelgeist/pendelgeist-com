import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGameReviews } from '../scripts/validateGameReviews.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../public/games/data.json');

// --- The committed data ---

test('the committed game reviews are well-formed', () => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  assert.deepEqual(validateGameReviews(data), []);
});

// --- The validator itself ---

const NOW = Date.parse('2026-11-20T12:00:00-05:00');

/** A minimal game that passes, for the negative cases to break one field at a time. */
function validGame(overrides = {}) {
  return {
    id: 'a-game',
    title: 'A Game',
    reviews: [{ ratingNumber: 4, text: 'It is a game.', dateReviewed: '2026-10-24T20:00:00-04:00' }],
    ...overrides,
  };
}

/** A game whose one review has `overrides` applied. */
const withReview = (overrides) => validGame({ reviews: [{ ...validGame().reviews[0], ...overrides }] });

const issuesFor = (...games) => validateGameReviews({ games }, { now: NOW });

test('the baseline fixture is actually valid, with or without optional fields', () => {
  assert.deepEqual(issuesFor(validGame()), []);
  assert.deepEqual(issuesFor(validGame({
    platform: 'PC',
    played: { finished: true },
    reviews: [
      { hoursPlayed: 3.5, ratingNumber: 4, ratingText: 'Custom', text: 'Fun.', dateReviewed: '2026-10-24T20:00:00-04:00' },
      { hoursPlayed: 30, final: true, ratingNumber: 5, text: 'Still good.', dateReviewed: '2026-11-01T21:00:00-05:00' },
    ],
  })), []);
});

test('rejects a file without a games array', () => {
  assert.equal(validateGameReviews([]).length, 1);
  assert.equal(validateGameReviews({}).length, 1);
  assert.equal(validateGameReviews({ reviews: [] }).length, 1);
});

test('rejects a missing or malformed id, duplicate ids, and unknown fields', () => {
  assert.match(issuesFor(validGame({ id: 'Not A Slug' }))[0], /lowercase slug/);
  assert.match(issuesFor(validGame(), validGame())[0], /duplicate id/);
  assert.match(issuesFor(validGame({ finished: true }))[0], /unknown field "finished"/);
  assert.match(issuesFor(withReview({ review: 'old name' }))[0], /unknown field "review"/);
});

test('rejects a game missing its title or reviews, and a review missing its text, rating or date', () => {
  const noTitle = validGame();
  delete noTitle.title;
  assert.match(issuesFor(noTitle).join('\n'), /missing title/);
  assert.match(issuesFor(validGame({ reviews: [] })).join('\n'), /at least one review/);
  for (const [key, pattern] of [
    ['text', /missing text/],
    ['ratingNumber', /ratingNumber/],
    ['dateReviewed', /dateReviewed/],
  ]) {
    const game = validGame();
    delete game.reviews[0][key];
    assert.match(issuesFor(game).join('\n'), pattern, `expected an issue for a missing ${key}`);
  }
});

test('ratingText is optional, but not blank', () => {
  assert.deepEqual(issuesFor(withReview({ ratingText: undefined })), []);
  assert.match(issuesFor(withReview({ ratingText: ' ' }))[0], /ratingText/);
});

test('rejects a rating outside the 0-5 tiers', () => {
  for (const ratingNumber of [6, -1, 3.5, '4']) {
    assert.match(issuesFor(withReview({ ratingNumber })).join('\n'), /ratingNumber/, `${ratingNumber}`);
  }
});

// A UTC or date-only stamp shows the wrong day for an evening review, same as on /vqar.
test('rejects a date with no time or offset, not in Eastern time, or in the future', () => {
  assert.match(issuesFor(withReview({ dateReviewed: '2026-10-24' }))[0], /offset/);
  assert.match(issuesFor(withReview({ dateReviewed: '2026-10-24T20:00:00' }))[0], /offset/);
  assert.match(issuesFor(withReview({ dateReviewed: '2026-10-24T20:00:00Z' }))[0], /Eastern/);
  assert.match(issuesFor(withReview({ dateReviewed: '2026-12-24T20:00:00-05:00' }))[0], /future/);
});

test('rejects a bad hoursPlayed, and markings that are not true', () => {
  assert.match(issuesFor(withReview({ hoursPlayed: 0 }))[0], /hoursPlayed/);
  assert.match(issuesFor(withReview({ hoursPlayed: 'a few' }))[0], /hoursPlayed/);
  assert.match(issuesFor(validGame({ played: { finished: 'yes' } }))[0], /played\.finished/);
  assert.match(issuesFor(validGame({ played: { done: true } }))[0], /unknown field "done"/);
  assert.match(issuesFor(withReview({ final: 'yes' })).join('\n'), /final is a bare marking/);
});

// The latest review's rating is the verdict that counts, so one without a rating
// would leave the old one standing.
test('every review needs its own rating, and they run oldest first', () => {
  const base = validGame().reviews[0];
  const unrated = validGame({ reviews: [base, { text: 'More.', dateReviewed: '2026-11-01T21:00:00-05:00' }] });
  assert.match(issuesFor(unrated).join('\n'), /reviews\[1\]: ratingNumber/);

  const later = (dateReviewed) => ({ text: 'More.', ratingNumber: 3, dateReviewed });
  const outOfOrder = validGame({ reviews: [base, later('2026-11-05T21:00:00-05:00'), later('2026-11-01T21:00:00-05:00')] });
  assert.match(issuesFor(outOfOrder).join('\n'), /reviews\[2\]: .*date order/);
});

test('a final review comes last, and only once the game is marked finished', () => {
  const base = validGame().reviews[0];
  const final = { ...base, final: true, dateReviewed: '2026-11-01T21:00:00-05:00' };
  assert.match(issuesFor(validGame({ reviews: [base, final] })).join('\n'), /marked finished/);
  const notLast = validGame({ played: { finished: true }, reviews: [{ ...base, final: true }, final] });
  assert.match(issuesFor(notLast).join('\n'), /reviews\[0\]: a final review has to be the last one/);
});

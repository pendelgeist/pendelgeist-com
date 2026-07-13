import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, titlesLikelyMatch } from '../scripts/anilistMatch.js';

test('normalizeTitle lowercases, strips punctuation, and collapses whitespace', () => {
  assert.equal(normalizeTitle('Attack on Titan: Final Season'), 'attack on titan final season');
  assert.equal(normalizeTitle('  Frieren  '), 'frieren');
});

test('titlesLikelyMatch matches an exact title after normalization', () => {
  assert.ok(titlesLikelyMatch('Attack on Titan', ['Shingeki no Kyojin', 'Attack on Titan']));
});

test('titlesLikelyMatch matches when one title is a substring of the other', () => {
  assert.ok(titlesLikelyMatch(
    'Frieren: Beyond Journey\'s End',
    ['Sousou no Frieren', 'Frieren: Beyond Journey\'s End']
  ));
});

test('titlesLikelyMatch is false for unrelated titles', () => {
  assert.equal(titlesLikelyMatch('Cool Show', ['Totally Different Anime']), false);
});

test('titlesLikelyMatch is false for an empty local title', () => {
  assert.equal(titlesLikelyMatch('', ['Some Show']), false);
});

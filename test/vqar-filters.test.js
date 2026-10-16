import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyChipFilters, ratingChipLabel, reviewValues, matchesChipFilters, chipCounts,
  activeChipCount, chipFiltersFromParams, writeChipFiltersToParams,
} from '../public/vqar/filters.js';

const ep1Only = { titleEN: 'A', ratingNumber: 4, streaming: ['crunchyroll'] };
const ratedUp = { titleEN: 'B', ratingNumber: 3, fullReview: { ratingNumber: 5 }, streaming: ['hidive', 'crunchyroll'] };
const ratedDown = { titleEN: 'C', ratingNumber: 4, fullReview: { ratingNumber: 2 }, op: true };
const revisitNoRating = { titleEN: 'D', ratingNumber: 1, fullReview: { review: 'still bad' }, streaming: ['netflix'] };
const reviews = [ep1Only, ratedUp, ratedDown, revisitNoRating];

/** @param {Partial<Record<'rating'|'on'|'has', string[]>>} selection */
function filters(selection) {
  const f = emptyChipFilters();
  for (const [dimension, values] of Object.entries(selection)) {
    for (const value of values) f[dimension].add(value);
  }
  return f;
}

const titles = (list) => list.map((r) => r.titleEN);

test('rating chips are labeled with the tier number and the first word of its default text', () => {
  assert.equal(ratingChipLabel('5'), '5 Peak');
  assert.equal(ratingChipLabel('0'), '0 Dead');
});

test('a review is filed under its revisit rating once it has one, like Highest Rating sorts it', () => {
  assert.deepEqual(reviewValues('rating', ep1Only), ['4']);
  assert.deepEqual(reviewValues('rating', ratedUp), ['5']);
  assert.deepEqual(reviewValues('rating', revisitNoRating), ['1']);
});

test('Extras: a revisit, which way it moved the rating, and OP/ED notes', () => {
  assert.deepEqual(reviewValues('has', ep1Only), []);
  assert.deepEqual(reviewValues('has', ratedUp), ['revisit', 'up']);
  assert.deepEqual(reviewValues('has', ratedDown), ['revisit', 'down', 'oped']);
  assert.deepEqual(reviewValues('has', revisitNoRating), ['revisit']);
});

test('nothing selected filters nothing', () => {
  assert.deepEqual(titles(reviews.filter((r) => matchesChipFilters(r, emptyChipFilters()))), ['A', 'B', 'C', 'D']);
});

test('chips in one row are any-of', () => {
  const f = filters({ on: ['hidive', 'netflix'] });
  assert.deepEqual(titles(reviews.filter((r) => matchesChipFilters(r, f))), ['B', 'D']);
});

test('rows combine as all-of', () => {
  const f = filters({ on: ['crunchyroll'], rating: ['4'] });
  assert.deepEqual(titles(reviews.filter((r) => matchesChipFilters(r, f))), ['A']);
});

test('a row\'s counts ignore its own selection but respect the other rows', () => {
  const f = filters({ rating: ['5'], on: ['crunchyroll'] });
  // Rating counts: everything on Crunchyroll, whatever its rating.
  assert.deepEqual(Object.fromEntries(chipCounts(reviews, f, 'rating')), { 4: 1, 5: 1 });
  // Streaming counts: everything rated 5, whatever it's on.
  assert.deepEqual(Object.fromEntries(chipCounts(reviews, f, 'on')), { hidive: 1, crunchyroll: 1 });
});

test('the query string round-trips, in a fixed order, dropping values that are not chips', () => {
  const parsed = chipFiltersFromParams(new URLSearchParams('rating=5,9,4&on=netflix,hidive,bogus&has=up'));
  assert.deepEqual([...parsed.rating], ['5', '4']);
  assert.deepEqual([...parsed.on], ['netflix', 'hidive']);
  assert.equal(activeChipCount(parsed), 5);

  const params = new URLSearchParams('season=all&has=oped');
  parsed.has.clear();
  writeChipFiltersToParams(params, parsed);
  assert.equal(params.toString(), 'season=all&rating=5%2C4&on=hidive%2Cnetflix');
});

test('Extras: finishing the season is its own chip, independent of having a revisit', () => {
  assert.deepEqual(reviewValues('has', { titleEN: 'E', ratingNumber: 3, finishedSeason: true }), ['finished']);
  assert.deepEqual(reviewValues('has', { ...ratedUp, finishedSeason: true }), ['revisit', 'up', 'finished']);
  assert.deepEqual([...chipFiltersFromParams(new URLSearchParams('has=finished')).has], ['finished']);
});

const tagged = {
  titleEN: 'T', ratingNumber: 1,
  anilist: { format: 'TV', genres: ['Action', 'Fantasy'], tags: ['Isekai', 'Male Protagonist'], studios: ['GoHands'] },
};
const untagged = { titleEN: 'U', ratingNumber: 1 };

test('Format, Genre, Tag and Studio come from the generated anilist object', () => {
  assert.deepEqual(reviewValues('format', tagged), ['TV']);
  assert.deepEqual(reviewValues('genre', tagged), ['Action', 'Fantasy']);
  assert.deepEqual(reviewValues('tag', tagged), ['Isekai', 'Male Protagonist']);
  assert.deepEqual(reviewValues('studio', tagged), ['GoHands']);
  for (const dimension of ['format', 'genre', 'tag', 'studio']) assert.deepEqual(reviewValues(dimension, untagged), []);
});

test('"all the isekai I hated": a tag and a rating combine like any two rows', () => {
  const f = filters({ tag: ['Isekai'], rating: ['0', '1'] });
  assert.deepEqual(titles([tagged, untagged, ep1Only].filter((r) => matchesChipFilters(r, f))), ['T']);
});

test('open-ended rows take any value from the URL and serialize alphabetically; Format stays fixed', () => {
  const parsed = chipFiltersFromParams(new URLSearchParams('tag=Isekai&genre=Slice+of+Life,Action&format=TV,BOGUS'));
  assert.deepEqual([...parsed.tag], ['Isekai']);
  assert.deepEqual([...parsed.format], ['TV']);
  const params = new URLSearchParams();
  writeChipFiltersToParams(params, parsed);
  assert.equal(params.get('genre'), 'Action,Slice of Life');
});

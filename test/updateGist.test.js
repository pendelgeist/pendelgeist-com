import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGistRawUrl, resolveTargetUrl, isSeasonData, summarizeDiff } from '../scripts/updateGist.js';
import { MANIFEST_URL } from '../public/manifest-url.js';

const SEASON_URL = 'https://gist.githubusercontent.com/pendelgeist/abc123/raw/vqar-season-spring-2026.json';
const SEASON_URL_WITH_COMMIT = 'https://gist.githubusercontent.com/pendelgeist/abc123/raw/deadbeef/vqar-season-spring-2026.json';

test('parseGistRawUrl extracts the gist id and filename', () => {
  assert.deepEqual(parseGistRawUrl(SEASON_URL), { gistId: 'abc123', filename: 'vqar-season-spring-2026.json' });
});

test('parseGistRawUrl handles URLs pinned to a specific commit', () => {
  assert.deepEqual(parseGistRawUrl(SEASON_URL_WITH_COMMIT), { gistId: 'abc123', filename: 'vqar-season-spring-2026.json' });
});

test('parseGistRawUrl rejects a non-gist URL', () => {
  assert.throws(() => parseGistRawUrl('https://example.com/foo.json'), /Not a gist raw URL/);
});

test('resolveTargetUrl passes a raw gist URL through unchanged', async () => {
  assert.equal(await resolveTargetUrl(SEASON_URL), SEASON_URL);
});

test('resolveTargetUrl resolves "manifest" to MANIFEST_URL', async () => {
  assert.equal(await resolveTargetUrl('manifest'), MANIFEST_URL);
});

test('resolveTargetUrl looks up a season id in the live manifest', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ seasons: [{ id: 'spring-2026', file: SEASON_URL }] }),
  }));
  assert.equal(await resolveTargetUrl('spring-2026'), SEASON_URL);
});

test('resolveTargetUrl throws with the known season ids when not found', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ seasons: [{ id: 'spring-2026' }, { id: 'summer-2026' }] }),
  }));
  await assert.rejects(resolveTargetUrl('winter-2026'), /spring-2026, summer-2026/);
});

test('isSeasonData recognizes a season shape', () => {
  assert.equal(isSeasonData({ reviewed: [] }), true);
  assert.equal(isSeasonData({ pending: [] }), true);
  assert.equal(isSeasonData({ skipped: [] }), true);
  assert.equal(isSeasonData({ currentSeason: 'spring-2026', seasons: [] }), false);
  assert.equal(isSeasonData(null), false);
});

test('summarizeDiff reports no change for identical seasons', () => {
  const season = { reviewed: [{ titleEN: 'Cool Show', ratingText: 'Meh' }], pending: [], skipped: [] };
  assert.deepEqual(summarizeDiff(season, structuredClone(season)), ['(no change)']);
});

test('summarizeDiff reports added/removed/edited reviewed entries and pending/skipped moves', () => {
  const before = {
    reviewed: [{ titleEN: 'Cool Show', ratingText: 'Meh' }],
    pending: ['New Show'],
    skipped: [],
  };
  const after = {
    reviewed: [
      { titleEN: 'Cool Show', ratingText: 'Peak, Nice Ep Broh' },
      { titleEN: 'New Show', ratingText: 'Trash' },
    ],
    pending: [],
    skipped: ['Dropped Show'],
  };

  const diff = summarizeDiff(before, after);
  assert.ok(diff.includes('+ reviewed: "New Show"'));
  assert.ok(diff.includes('~ reviewed: "Cool Show" edited'));
  assert.ok(diff.includes('- pending: "New Show"'));
  assert.ok(diff.includes('+ skipped: "Dropped Show"'));
});

test('summarizeDiff falls back to a generic message for non-season content', () => {
  assert.deepEqual(summarizeDiff({ foo: 1 }, { foo: 2 }), ['content differs (not a recognized season shape, showing no further detail)']);
  assert.deepEqual(summarizeDiff({ foo: 1 }, { foo: 1 }), ['(no change)']);
});

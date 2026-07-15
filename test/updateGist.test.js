import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGistRawUrl, fetchGistFile, resolveTarget, isSeasonData, summarizeDiff } from '../scripts/updateGist.js';
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

test('fetchGistFile reads a file\'s content via the GitHub API', async (t) => {
  t.mock.method(global, 'fetch', async (url) => {
    assert.equal(url, 'https://api.github.com/gists/abc123');
    return { ok: true, json: async () => ({ files: { 'season.json': { content: '{"reviewed":[]}' } } }) };
  });
  assert.equal(await fetchGistFile('abc123', 'season.json'), '{"reviewed":[]}');
});

test('fetchGistFile falls back to raw_url for a truncated file', async (t) => {
  t.mock.method(global, 'fetch', async (url) => {
    if (url === 'https://api.github.com/gists/abc123') {
      return { ok: true, json: async () => ({ files: { 'season.json': { truncated: true, raw_url: 'https://gist.githubusercontent.com/x/abc123/raw/season.json' } } }) };
    }
    return { ok: true, text: async () => '{"reviewed":[]}' };
  });
  assert.equal(await fetchGistFile('abc123', 'season.json'), '{"reviewed":[]}');
});

test('fetchGistFile throws when the gist has no such file', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ files: {} }) }));
  await assert.rejects(fetchGistFile('abc123', 'season.json'), /no file named "season\.json"/);
});

test('resolveTarget passes a raw gist URL through unchanged', async () => {
  assert.deepEqual(await resolveTarget(SEASON_URL), { gistId: 'abc123', filename: 'vqar-season-spring-2026.json' });
});

test('resolveTarget resolves "manifest" to MANIFEST_URL\'s gist/file', async () => {
  assert.deepEqual(await resolveTarget('manifest'), parseGistRawUrl(MANIFEST_URL));
});

test('resolveTarget looks up a season id via the live manifest', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ files: { [parseGistRawUrl(MANIFEST_URL).filename]: { content: JSON.stringify({ seasons: [{ id: 'spring-2026', file: SEASON_URL }] }) } } }),
  }));
  assert.deepEqual(await resolveTarget('spring-2026'), { gistId: 'abc123', filename: 'vqar-season-spring-2026.json' });
});

test('resolveTarget throws with the known season ids when not found', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ files: { [parseGistRawUrl(MANIFEST_URL).filename]: { content: JSON.stringify({ seasons: [{ id: 'spring-2026' }, { id: 'summer-2026' }] }) } } }),
  }));
  await assert.rejects(resolveTarget('winter-2026'), /spring-2026, summer-2026/);
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

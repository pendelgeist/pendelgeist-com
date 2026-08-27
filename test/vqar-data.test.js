import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateSeason, validateSeasonCollection, parseSeasonId, seasonSortKey } from '../scripts/validateSeason.js';
import { readSeasons, buildIndex, serializeIndex, seasonPath, INDEX_PATH } from '../scripts/build-vqar-index.js';
import { resolveTargets } from '../scripts/loadTargets.js';
import { readJsonFiles } from '../scripts/indexFile.js';

// --- The committed data ---

test('every committed season is well-formed', () => {
  for (const { filename, season } of readSeasons()) {
    assert.deepEqual(validateSeason(season, { filename }), [], `issues in ${filename}`);
  }
});

test('the seasons agree as a set: unique ids, exactly one current', () => {
  assert.deepEqual(validateSeasonCollection(readSeasons().map((e) => e.season)), []);
});

test('the committed index.json matches a fresh build', () => {
  const expected = serializeIndex(buildIndex(readSeasons().map((e) => e.season)));
  assert.equal(
    fs.readFileSync(INDEX_PATH, 'utf-8'),
    expected,
    'index.json is stale - run: npm run build-vqar-index'
  );
});

test('every season the index points at is actually on disk', () => {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));

  assert.ok(index.seasons.length > 0, 'expected at least one season');
  for (const meta of index.seasons) {
    assert.equal(meta.file, seasonPath(meta.id));
    assert.ok(
      fs.existsSync(new URL(`../public${meta.file}`, import.meta.url)),
      `${meta.id} is in the index but its file is missing`
    );
  }
});

test('the index names a current season that it also lists', () => {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  assert.ok(index.seasons.some((s) => s.id === index.currentSeason), 'currentSeason is not in seasons');
});

// --- Ordering ---

test('seasons run newest first, across the year boundary', () => {
  const ordered = buildIndex([
    { id: 'spring-2026', name: 'Spring 2026' },
    { id: 'winter-2026', name: 'Winter 2026' },
    { id: 'fall-2025', name: 'Fall 2025' },
    { id: 'summer-2026', name: 'Summer 2026' },
  ]).seasons.map((s) => s.id);

  assert.deepEqual(ordered, ['summer-2026', 'spring-2026', 'winter-2026', 'fall-2025']);
});

test('alphabetical order would be wrong, which is why the id is parsed', () => {
  const ids = ['spring-2026', 'summer-2026', 'winter-2026'];
  assert.notDeepEqual(buildIndex(ids.map((id) => ({ id, name: id }))).seasons.map((s) => s.id), [...ids].sort());
});

test('an explicit sortKey places a season whose id does not parse', () => {
  const ordered = buildIndex([
    { id: 'summer-2026', name: 'Summer 2026' },
    { id: 'the-lost-year', name: 'The Lost Year', sortKey: 20255 },
  ]).seasons.map((s) => s.id);

  assert.deepEqual(ordered, ['summer-2026', 'the-lost-year']);
  assert.equal(seasonSortKey({ id: 'the-lost-year', sortKey: 20255 }), 20255);
});

test('buildIndex refuses to order a season it has no key for, rather than guessing', () => {
  // A null sort key would make the comparator return NaN and leave the order to
  // the sort implementation, which is a quietly wrong index rather than an error.
  assert.throws(
    () => buildIndex([{ id: 'summer-2026', name: 'Summer 2026' }, { id: 'the-lost-year', name: 'Lost' }]),
    /Cannot order season "the-lost-year"/
  );
});

test('parseSeasonId rejects ids it cannot order', () => {
  assert.equal(typeof parseSeasonId('winter-2026'), 'number');
  assert.equal(parseSeasonId('midsummer-2026'), null, 'unknown season name');
  assert.equal(parseSeasonId('summer-26'), null, 'two-digit year');
  assert.equal(parseSeasonId('summer2026'), null, 'no separator');
});

// --- The validator itself ---

/** A minimal season that passes, for the negative cases to break one field at a time. */
function validSeason(overrides = {}) {
  return {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [{ titleEN: 'Cool Show', ratingText: 'Finish Ep', dateReviewed: '2026-04-01' }],
    pending: [],
    skipped: [],
    ...overrides,
  };
}

test('flags a season whose id does not match its filename', () => {
  const issues = validateSeason(validSeason(), { filename: 'summer-2026.json' });
  assert.match(issues.join('\n'), /doesn't match its filename/);
});

test('flags a season id that cannot be ordered and has no sortKey', () => {
  assert.match(validateSeason(validSeason({ id: 'the-lost-year' })).join('\n'), /needs an explicit numeric sortKey/);
  assert.deepEqual(validateSeason(validSeason({ id: 'the-lost-year', sortKey: 20255 }), { filename: 'the-lost-year.json' }), []);
});

test('flags a season missing an id or a name', () => {
  assert.match(validateSeason(validSeason({ id: '' })).join('\n'), /missing an id/);
  assert.match(validateSeason(validSeason({ name: undefined })).join('\n'), /missing a name/);
});

test('flags a malformed current or sortKey', () => {
  assert.match(validateSeason(validSeason({ current: 'yes' })).join('\n'), /malformed current/);
  assert.match(validateSeason(validSeason({ sortKey: '2026' })).join('\n'), /malformed sortKey/);
});

test('the current-season flag has to be on exactly one season', () => {
  const a = validSeason({ id: 'spring-2026' });
  const b = validSeason({ id: 'summer-2026' });

  assert.match(validateSeasonCollection([a, b]).join('\n'), /no season is marked/);
  assert.match(validateSeasonCollection([{ ...a, current: true }, { ...b, current: true }]).join('\n'), /only one can be/);
  assert.deepEqual(validateSeasonCollection([{ ...a, current: true }, b]), []);
});

test('flags two seasons sharing an id', () => {
  const issues = validateSeasonCollection([validSeason({ current: true }), validSeason()]);
  assert.match(issues.join('\n'), /more than one season has the id "spring-2026"/);
});

// --- What the validation script is pointed at ---

test('the committed set is resolved with filenames, so the id/filename check applies', async () => {
  const { targets, committed } = await resolveTargets([]);

  assert.equal(committed, true);
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.equal(target.filename, `${target.season.id}.json`);
  }
});

test('a draft passed on the CLI carries no filename, so it can be called anything', async () => {
  // `npm run validate-vqar -- ./draft.json` is a documented workflow: a draft
  // is not yet named after its season id, and must not be failed for that.
  const path = 'public/vqar/data/seasons/winter-2026.json';
  const { targets, committed } = await resolveTargets([path]);

  assert.equal(committed, false, 'a hand-picked file is not the committed set');
  assert.equal(targets[0].filename, undefined);
  assert.deepEqual(validateSeason(targets[0].season, { filename: targets[0].filename }), []);
});

test('a draft is not failed for missing the current-season flag', () => {
  // The flag belongs to exactly one season across the whole set; a lone draft
  // has no way to satisfy that, which is why the collection check is scoped to
  // the committed set in validate-vqar.js.
  const draft = { id: 'fall-2026', name: 'Fall 2026', reviewed: [], pending: [], skipped: [] };

  assert.deepEqual(validateSeason(draft), []);
  assert.match(validateSeasonCollection([draft]).join('\n'), /no season is marked/);
});

test('a malformed season file says which file it is', () => {
  // These are hand-edited, so a stray comma is a routine outcome; a bare
  // "Unexpected token" with no filename means hunting through every season.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vqar-'));
  fs.writeFileSync(path.join(dir, 'fall-2026.json'), '{ "id": "fall-2026", }');

  assert.throws(() => readJsonFiles(dir), /fall-2026\.json is not valid JSON/);
});

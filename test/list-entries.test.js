import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryTitle, normalizeEntry, LIST_ENTRY_KEYS } from '../public/vqar/list-entries.js';

test('entryTitle reads a plain string or an object entry', () => {
  assert.equal(entryTitle('Plain Show'), 'Plain Show');
  assert.equal(entryTitle({ title: 'Detailed Show', firstEpisode: '2026-10-08' }), 'Detailed Show');
  assert.equal(entryTitle(undefined), undefined);
  assert.equal(entryTitle({}), undefined);
});

test('normalizeEntry always returns the object shape, without mutating the original', () => {
  assert.deepEqual(normalizeEntry('Plain Show'), { title: 'Plain Show' });
  const original = { title: 'Detailed Show', streaming: ['crunchyroll'] };
  const copy = normalizeEntry(original);
  assert.deepEqual(copy, original);
  copy.title = 'Changed';
  assert.equal(original.title, 'Detailed Show');
});

test('pending and skipped each allow their own optional fields', () => {
  assert.ok(LIST_ENTRY_KEYS.pending.includes('firstEpisode'));
  assert.ok(!LIST_ENTRY_KEYS.pending.includes('reason'));
  assert.ok(LIST_ENTRY_KEYS.skipped.includes('reason'));
  assert.ok(!LIST_ENTRY_KEYS.skipped.includes('firstEpisode'));
});

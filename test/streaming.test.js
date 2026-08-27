import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  STREAMING_SERVICES, STREAMING_URL_FIELDS, createStreamingBadges, createStreamingRow,
} from '../public/streaming.js';

beforeEach(() => {
  global.document = new JSDOM('<!doctype html><body></body>').window.document;
});

test('badges render in STREAMING_SERVICES order, not the order the entry lists them', () => {
  const badges = createStreamingBadges({ streaming: ['hulu', 'crunchyroll', 'netflix'] });
  assert.deepEqual(badges.map(b => b.textContent), ['CR', 'NF', 'HU']);
});

test('a service with a direct URL on the entry becomes a link; the rest stay plain spans', () => {
  const [cr, yt] = createStreamingBadges({
    streaming: ['crunchyroll', 'youtube'],
    crunchyrollUrl: 'https://www.crunchyroll.com/series/abc',
  });

  assert.equal(cr.tagName, 'A');
  assert.equal(cr.href, 'https://www.crunchyroll.com/series/abc');
  assert.equal(cr.rel, 'noopener noreferrer');
  assert.equal(yt.tagName, 'SPAN');
});

test('every URL field names a service that exists, and every badge is titled with its full name', () => {
  for (const key of Object.keys(STREAMING_URL_FIELDS)) {
    assert.ok(key in STREAMING_SERVICES, `${key} has a URL field but no service entry`);
  }
  const [badge] = createStreamingBadges({ streaming: ['hidive'] });
  assert.equal(badge.title, 'HIDIVE');
  assert.equal(badge.className, 'entry-streaming-badge entry-streaming-hidive');
});

test('an entry with no streaming list produces no badges', () => {
  assert.deepEqual(createStreamingBadges({ titleEN: 'Some Show' }), []);
});

test('createStreamingRow wraps the badges, and returns null rather than an empty row', () => {
  const row = createStreamingRow({ streaming: ['crunchyroll'] });
  assert.equal(row.className, 'entry-streaming');
  assert.equal(row.childElementCount, 1);

  assert.equal(createStreamingRow({ streaming: [] }), null);
  assert.equal(createStreamingRow({ titleEN: 'Some Show' }), null);
});

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createExternalLinks } from '../public/external-links.js';

beforeEach(() => {
  global.document = new JSDOM('<!doctype html><body></body>').window.document;
});

const labelled = (links) => links.map(a => [a.textContent, a.href]);

test('expands AniList and ANN ids into their site URLs', () => {
  assert.deepEqual(labelled(createExternalLinks({ anilistId: 154587, annId: 22622 })), [
    ['AniList', 'https://anilist.co/anime/154587'],
    ['ANN', 'https://www.animenewsnetwork.com/encyclopedia/anime.php?id=22622'],
  ]);
});

test('takes Wikipedia articles as URLs, since the two editions disagree on the title', () => {
  assert.deepEqual(
    labelled(createExternalLinks({
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Gunbuster',
      wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/%E3%83%88%E3%83%83%E3%83%97%E3%82%92%E3%81%AD%E3%82%89%E3%81%88',
    })),
    [
      ['Wikipedia', 'https://en.wikipedia.org/wiki/Gunbuster'],
      ['Wikipedia (JP)', 'https://ja.wikipedia.org/wiki/%E3%83%88%E3%83%83%E3%83%97%E3%82%92%E3%81%AD%E3%82%89%E3%81%88'],
    ]
  );
});

test('renders in a fixed order regardless of the order of the fields on the entry', () => {
  const links = createExternalLinks({
    wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/X',
    annId: 1,
    wikipediaUrl: 'https://en.wikipedia.org/wiki/X',
    anilistId: 2,
  });
  assert.deepEqual(links.map(a => a.textContent), ['AniList', 'ANN', 'Wikipedia', 'Wikipedia (JP)']);
});

test('every link opens out of the site safely', () => {
  for (const a of createExternalLinks({ anilistId: 1, annId: 2, wikipediaUrl: 'https://example.com' })) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }
});

test('an entry with no references produces no links', () => {
  assert.deepEqual(createExternalLinks({ titleEN: 'Some Show' }), []);
});

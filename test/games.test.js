import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createPathFetchStub } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, '../public/games/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/games/app.js');

const sampleData = {
  reviews: [
    {
      id: 'older-game',
      title: 'Older Game',
      platform: 'PC',
      review: 'First paragraph.\n\nSecond <b>paragraph</b>.',
      ratingNumber: 3,
      ratingText: 'Meh, Might Load the Save Again',
      dateReviewed: '2026-09-01T21:30:00-04:00',
      hoursPlayed: 2,
      updates: [
        { review: 'It got better.', ratingNumber: 5, ratingText: 'Peak, Nice Game Broh', dateReviewed: '2026-10-20T22:00:00-04:00', hoursPlayed: 30 },
      ],
      finished: true,
    },
    {
      id: 'newer-game',
      title: 'Newer Game',
      review: 'Just started.',
      ratingNumber: 4,
      ratingText: "Yeah, Here's Hoping",
      dateReviewed: '2026-10-10T23:45:00-04:00',
    },
  ],
};

let importCounter = 0;

async function loadApp({ data = sampleData, search = '' } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: `http://localhost/games${search}`, runScripts: 'outside-only' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.fetch = createPathFetchStub(data ? { '/games/data.json': data } : {});
  // app.js awaits its first render at top level, so the import resolves once it's on the page.
  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document };
}

const titles = (document) => [...document.querySelectorAll('.entry-title')].map((el) => el.textContent);

test('lists every review, the most recently updated first', async () => {
  const { document } = await loadApp();
  // Older Game's update (Oct 20) is newer than Newer Game's first impression (Oct 10).
  assert.deepEqual(titles(document), ['Older Game', 'Newer Game']);
});

test('each title is a shareable link to that review alone', async () => {
  const { document } = await loadApp();
  const link = document.querySelector('#newer-game .entry-permalink');
  assert.equal(link.getAttribute('href'), '/games?game=newer-game');
  assert.equal(document.getElementById('backLink').hidden, true);
});

test('?game= shows just that review, with a way back to the list', async () => {
  const { document } = await loadApp({ search: '?game=newer-game' });
  assert.deepEqual(titles(document), ['Newer Game']);
  assert.equal(document.getElementById('backLink').hidden, false);
  assert.equal(document.title, 'Newer Game — Very Quick Game Reviews');
});

test('an unknown ?game= says so', async () => {
  const { document } = await loadApp({ search: '?game=nope' });
  assert.match(document.getElementById('gameReviews').textContent, /NO REVIEW CALLED "nope"/);
});

test('a review renders its paragraphs as text, its meta, and its updates', async () => {
  const { document } = await loadApp({ search: '?game=older-game' });
  const article = document.getElementById('older-game');

  const paragraphs = [...article.querySelectorAll('.entry-body > .entry-description p')].map((p) => p.textContent);
  assert.deepEqual(paragraphs, ['First paragraph.', 'Second <b>paragraph</b>.']);
  assert.equal(article.querySelector('b'), null, 'review text must stay text');

  assert.equal(article.querySelector('.entry-facts').textContent, 'Played on PC');
  assert.equal(article.querySelector('.entry-rating').textContent, 'Meh, Might Load the Save Again');
  assert.equal(article.querySelector('.entry-published').textContent, 'Reviewed: 2026-09-01');
  assert.equal(article.querySelector('.entry-progress').textContent, '~2 hrs in');
  assert.ok(article.querySelector('.entry-mark-finished'));

  const update = article.querySelector('.entry-addendum');
  assert.equal(update.querySelector('.entry-addendum-label').textContent, 'Update');
  assert.equal(update.querySelector('.entry-rating').textContent, 'Peak, Nice Game Broh');
  assert.equal(update.querySelector('.entry-progress').textContent, '~30 hrs in');
  assert.equal(update.querySelector('.entry-description').textContent, 'It got better.');
});

test('the latest update sets the rating themes key off', async () => {
  const { document } = await loadApp();
  assert.equal(document.getElementById('older-game').dataset.rating, '5');
  assert.equal(document.getElementById('newer-game').dataset.rating, '4');
});

test('a review without a platform or hours leaves those out', async () => {
  const { document } = await loadApp({ search: '?game=newer-game' });
  assert.equal(document.querySelector('.entry-facts'), null);
  assert.equal(document.querySelector('.entry-progress'), null);
});

test('an empty list and a failed fetch each get a message', async () => {
  const empty = await loadApp({ data: { reviews: [] } });
  assert.equal(empty.document.getElementById('gameReviews').textContent, 'NO REVIEWS YET');

  const failed = await loadApp({ data: null });
  assert.match(failed.document.getElementById('gameReviews').textContent, /ERROR: HTTP 404/);
});

test('fetches the data revalidating, with no cache-busting query', async () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/games', runScripts: 'outside-only' });
  global.window = dom.window;
  global.document = dom.window.document;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => sampleData };
  };
  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  assert.deepEqual(calls, [{ url: '/games/data.json', options: { cache: 'no-cache' } }]);
});

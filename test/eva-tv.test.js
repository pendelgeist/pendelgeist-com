import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createLocalStorageStub } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, '../public/eva-tv/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/eva-tv/app.js');

const sampleData = {
  sources: {
    'ja-wiki-nge': { lang: 'ja', title: '新世紀エヴァンゲリオン — Wikipedia (Japanese)', url: 'https://ja.wikipedia.org/wiki/新世紀エヴァンゲリオン' },
    'en-wiki-nge': { lang: 'en', title: 'Neon Genesis Evangelion — Wikipedia', url: 'https://en.wikipedia.org/wiki/Neon_Genesis_Evangelion' },
  },
  episodes: [
    { number: 1, title: 'Angel Attack' },
    { number: 19, title: 'Introjection' },
    { number: 'eoe', title: 'The End of Evangelion' },
  ],
  entries: [
    { id: 'shinji-ikari', episode: 1, type: 'character', title: 'Shinji Ikari', body: 'Pilots Unit-01.', links: [], sourceRefs: ['en-wiki-nge'] },
    {
      id: 'eva-01-berserk',
      episode: 19,
      scene: 'Power cable severed',
      type: 'fact',
      title: "Unit-01's berserk state",
      body: 'Keeps fighting unpowered.',
      links: [{ id: 'yuis-soul-in-unit-01', label: 'One reading of why' }],
      sourceRefs: ['ja-wiki-nge', 'en-wiki-nge'],
      quote: { lang: 'ja', original: 'テスト原文', translation: 'Test original text (translated).' },
    },
    {
      id: 'yuis-soul-in-unit-01',
      episode: 19,
      type: 'theory',
      title: "Yui's soul inside Unit-01",
      body: 'A popular but unconfirmed reading.',
      links: [{ id: 'post-eoe-world', label: 'Where the ambiguity ends up' }],
    },
    {
      id: 'post-eoe-world',
      episode: 'eoe',
      type: 'unknowable',
      title: 'What state is the world in?',
      body: 'Never fully explained.',
      links: [],
    },
    {
      id: 'multi-paragraph-entry',
      episode: 1,
      type: 'theory',
      title: 'An entry with several readings',
      body: 'First reading.\n\nSecond reading.\n\nThird reading.',
      links: [],
    },
  ],
};

let importCounter = 0;

async function loadApp({ data = sampleData, ok = true, status = 200, localStorage = createLocalStorageStub() } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/eva-tv/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = async () => ({ ok, status, json: async () => data });
  global.localStorage = localStorage;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document, localStorage };
}

function nodeIds(document) {
  return [...document.querySelectorAll('.entry-node')].map((el) => el.dataset.id);
}

function clickNode(document, id) {
  document.querySelector(`.entry-node[data-id="${id}"]`).dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
}

test('renders one episode column per episode, each with its entries', async () => {
  const { document } = await loadApp();

  const columns = [...document.querySelectorAll('.episode-column')];
  assert.deepEqual(columns.map((c) => c.dataset.episode), ['1', '19', 'eoe']);
  assert.deepEqual(nodeIds(document), [
    'shinji-ikari',
    'multi-paragraph-entry',
    'eva-01-berserk',
    'yuis-soul-in-unit-01',
    'post-eoe-world',
  ]);
});

test('clicking an entry opens the detail panel with its title, meta, and body', async () => {
  const { document } = await loadApp();

  clickNode(document, 'eva-01-berserk');

  assert.equal(document.getElementById('detailPanel').hidden, false);
  assert.equal(document.querySelector('.detail-title').textContent, "Unit-01's berserk state");
  assert.match(document.querySelector('.detail-episode').textContent, /Episode 19: Introjection — Power cable severed/);
  assert.equal(document.querySelector('.detail-body').textContent, 'Keeps fighting unpowered.');
  assert.ok(document.querySelector('.entry-node[data-id="eva-01-berserk"]').classList.contains('active'));
});

test('a "jump to" link opens the linked entry\'s detail', async () => {
  const { document } = await loadApp();

  clickNode(document, 'eva-01-berserk');
  document.querySelector('.jump-link').dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));

  assert.equal(document.querySelector('.detail-title').textContent, "Yui's soul inside Unit-01");
  assert.ok(document.querySelector('.entry-node[data-id="yuis-soul-in-unit-01"]').classList.contains('active'));
});

test('the close button hides the panel and clears the active node', async () => {
  const { document } = await loadApp();

  clickNode(document, 'shinji-ikari');
  document.getElementById('detailClose').dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));

  assert.equal(document.getElementById('detailPanel').hidden, true);
  assert.equal(document.querySelectorAll('.entry-node.active').length, 0);
});

test('the detail panel shows the original-language quote and its translation', async () => {
  const { document } = await loadApp();

  clickNode(document, 'eva-01-berserk');

  assert.equal(document.querySelector('.detail-quote-original').textContent, 'テスト原文');
  assert.equal(document.querySelector('.detail-quote-original').lang, 'ja');
  assert.equal(document.querySelector('.detail-quote-translation').textContent, 'Test original text (translated).');
});

test('the detail panel links out to each of the entry\'s sources', async () => {
  const { document } = await loadApp();

  clickNode(document, 'eva-01-berserk');

  const links = [...document.querySelectorAll('.source-link')];
  assert.deepEqual(links.map((a) => a.href), [
    'https://ja.wikipedia.org/wiki/%E6%96%B0%E4%B8%96%E7%B4%80%E3%82%A8%E3%83%B4%E3%82%A1%E3%83%B3%E3%82%B2%E3%83%AA%E3%82%AA%E3%83%B3',
    'https://en.wikipedia.org/wiki/Neon_Genesis_Evangelion',
  ]);
  assert.ok(links.every((a) => a.target === '_blank'));
});

test('an entry with no quote renders no quote block, only its sources', async () => {
  const { document } = await loadApp();

  clickNode(document, 'shinji-ikari');

  assert.equal(document.querySelector('.detail-quote'), null);
  assert.equal(document.querySelectorAll('.source-link').length, 1);
});

test('a blank-line-separated body renders as one <p> per paragraph', async () => {
  const { document } = await loadApp();

  clickNode(document, 'multi-paragraph-entry');

  const paragraphs = [...document.querySelectorAll('.detail-body p')];
  assert.deepEqual(paragraphs.map((p) => p.textContent), ['First reading.', 'Second reading.', 'Third reading.']);
});

test('a single-paragraph body still renders inside a <p>, unchanged', async () => {
  const { document } = await loadApp();

  clickNode(document, 'shinji-ikari');

  const paragraphs = [...document.querySelectorAll('.detail-body p')];
  assert.deepEqual(paragraphs.map((p) => p.textContent), ['Pilots Unit-01.']);
});

test('a previously-saved detail panel width is restored on load', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:eva-tv:detail-width', '42rem');

  const { document } = await loadApp({ localStorage });

  assert.equal(document.getElementById('detailPanel').style.width, '42rem');
});

test('a failed fetch shows an error in the timeline track', async () => {
  const { document } = await loadApp({ ok: false, status: 500 });

  assert.match(document.getElementById('timelineTrack').textContent, /ERROR: HTTP 500/);
});

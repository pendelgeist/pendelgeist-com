import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, '../public/eva-tv/sources/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/eva-tv/sources/app.js');

const sampleData = {
  sources: {
    'en-wiki-nge': { lang: 'en', title: 'Neon Genesis Evangelion — Wikipedia', url: 'https://en.wikipedia.org/wiki/Neon_Genesis_Evangelion' },
    'ja-wiki-nge': { lang: 'ja', title: '新世紀エヴァンゲリオン — Wikipedia (Japanese)', url: 'https://ja.wikipedia.org/wiki/新世紀エヴァンゲリオン' },
    'ann-staff': { lang: 'en', title: 'Anime News Network — Staff', url: 'https://www.animenewsnetwork.com/encyclopedia/anime.php?id=45' },
  },
};

let importCounter = 0;

async function loadApp({ data = sampleData, ok = true, status = 200 } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/eva-tv/sources/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = async () => ({ ok, status, json: async () => data });

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document };
}

test('renders one link per source, sorted alphabetically by title', async () => {
  const { document } = await loadApp();

  const links = [...document.querySelectorAll('#sourcesList .source-link')];
  assert.deepEqual(links.map((a) => a.textContent), [
    'Anime News Network — Staff',
    'Neon Genesis Evangelion — Wikipedia',
    '新世紀エヴァンゲリオン — Wikipedia (Japanese)',
  ]);
});

test('each link opens in a new tab, points at the source URL, and is tagged with its language', async () => {
  const { document } = await loadApp();

  const link = [...document.querySelectorAll('#sourcesList .source-link')]
    .find((a) => a.textContent === 'Neon Genesis Evangelion — Wikipedia');
  assert.equal(link.href, 'https://en.wikipedia.org/wiki/Neon_Genesis_Evangelion');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.lang, 'en');
});

test('a failed fetch shows an error instead of the list', async () => {
  const { document } = await loadApp({ ok: false, status: 500 });

  assert.match(document.getElementById('sourcesList').textContent, /ERROR: HTTP 500/);
  assert.equal(document.querySelectorAll('#sourcesList .source-link').length, 0);
});

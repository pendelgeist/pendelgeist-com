import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, '../public/eva/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/eva/app.js');

const sampleData = {
  episodes: [
    { number: 1, title: 'Angel Attack' },
    { number: 19, title: 'Introjection' },
    { number: 'eoe', title: 'The End of Evangelion' },
  ],
  entries: [
    { id: 'shinji-ikari', episode: 1, type: 'character', title: 'Shinji Ikari', body: 'Pilots Unit-01.', links: [] },
    {
      id: 'eva-01-berserk',
      episode: 19,
      scene: 'Power cable severed',
      type: 'fact',
      title: "Unit-01's berserk state",
      body: 'Keeps fighting unpowered.',
      links: [{ id: 'yuis-soul-in-unit-01', label: 'One reading of why' }],
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
  ],
};

let importCounter = 0;

async function loadApp({ data = sampleData, ok = true, status = 200 } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/eva/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = async () => ({ ok, status, json: async () => data });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document };
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
  assert.deepEqual(nodeIds(document), ['shinji-ikari', 'eva-01-berserk', 'yuis-soul-in-unit-01', 'post-eoe-world']);
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

test('type filter hides non-matching entries', async () => {
  const { document } = await loadApp();

  const select = document.getElementById('typeFilter');
  select.value = 'theory';
  select.dispatchEvent(new document.defaultView.Event('change'));

  const hidden = new Set(
    [...document.querySelectorAll('.entry-node.node-hidden')].map((el) => el.dataset.id)
  );
  assert.deepEqual(hidden, new Set(['shinji-ikari', 'eva-01-berserk', 'post-eoe-world']));
});

test('search filters across title/body/scene text', async () => {
  const { document } = await loadApp();

  const input = document.getElementById('searchInput');
  input.value = 'power cable';
  input.dispatchEvent(new document.defaultView.Event('input'));

  const visible = [...document.querySelectorAll('.entry-node:not(.node-hidden)')].map((el) => el.dataset.id);
  assert.deepEqual(visible, ['eva-01-berserk']);
});

test('filtering out the open entry closes the detail panel', async () => {
  const { document } = await loadApp();

  clickNode(document, 'shinji-ikari');
  assert.equal(document.getElementById('detailPanel').hidden, false);

  const select = document.getElementById('typeFilter');
  select.value = 'fact';
  select.dispatchEvent(new document.defaultView.Event('change'));

  assert.equal(document.getElementById('detailPanel').hidden, true);
});

test('a failed fetch shows an error in the timeline track', async () => {
  const { document } = await loadApp({ ok: false, status: 500 });

  assert.match(document.getElementById('timelineTrack').textContent, /ERROR: HTTP 500/);
});

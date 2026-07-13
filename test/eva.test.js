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
  characters: [{ id: 'shinji-ikari', name: 'Shinji Ikari', aka: 'Third Child', summary: 'Pilots Unit-01.' }],
  facts: [{ id: 'second-impact', category: 'Timeline', title: 'Second Impact', body: 'A global cataclysm in 2000.' }],
  theories: [{ id: 'accept-vs-reject', title: 'Acceptance vs. rejection', topic: 'The ending(s)', body: 'A popular reading of the finale.' }],
  unknowables: [{ id: 'angels-true-nature', question: 'What are the Angels?', body: 'Never fully explained.' }],
};

let importCounter = 0;

async function loadApp({ data = sampleData, ok = true, status = 200 } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/eva/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = async () => ({ ok, status, json: async () => data });

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document };
}

function titles(document, containerId) {
  return [...document.querySelectorAll(`#${containerId} .entry-title`)].map((el) => el.textContent);
}

test('loads and renders one entry per section', async () => {
  const { document } = await loadApp();

  assert.deepEqual(titles(document, 'characterEntries'), ['Shinji Ikari']);
  assert.deepEqual(titles(document, 'factEntries'), ['Second Impact']);
  assert.deepEqual(titles(document, 'theoryEntries'), ['Acceptance vs. rejection']);
  assert.deepEqual(titles(document, 'unknowableEntries'), ['What are the Angels?']);
});

test('type filter shows only the selected section', async () => {
  const { document } = await loadApp();

  const select = document.getElementById('typeFilter');
  select.value = 'facts';
  select.dispatchEvent(new document.defaultView.Event('change'));

  assert.equal(document.getElementById('characterEntries').closest('.section').style.display, 'none');
  assert.equal(document.getElementById('factEntries').closest('.section').style.display, '');
  assert.equal(document.getElementById('theoryEntries').closest('.section').style.display, 'none');
});

test('search filters by matching text across all visible sections', async () => {
  const { document } = await loadApp();

  const input = document.getElementById('searchInput');
  input.value = 'angels';
  input.dispatchEvent(new document.defaultView.Event('input'));

  assert.deepEqual(titles(document, 'unknowableEntries'), ['What are the Angels?']);
  assert.deepEqual(titles(document, 'characterEntries'), []);
  assert.equal(document.querySelector('#characterEntries .loading')?.textContent, 'NO MATCHES FOUND');
});

test('a failed fetch shows an error in every section', async () => {
  const { document } = await loadApp({ ok: false, status: 500 });

  for (const id of ['characterEntries', 'factEntries', 'theoryEntries', 'unknowableEntries']) {
    assert.match(document.getElementById(id).textContent, /ERROR: HTTP 500/);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/nasubi/data');
const INDEX_HTML_PATH = path.join(__dirname, '../public/nasubi/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/nasubi/app.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
}

// --- Data files: sanity-check the transcribed/parsed source data ---

test('entries-japan.json has one row per contest and parses postcard counts', () => {
  const entries = readJson('entries-japan.json');
  assert.equal(entries.length, 1891);
  for (const e of entries) {
    assert.equal(typeof e.jp, 'string');
    assert.equal(typeof e.en, 'string');
    assert.ok(e.postcards === null || typeof e.postcards === 'number');
  }
});

test('entries-japan.json postcard counts sum to the declared 60,911 total', () => {
  // Regression test: one source row has an internal-whitespace count cell
  // ("5 0" instead of "50") that an earlier version of the generator failed
  // to strip before parseInt, silently undercounting the total by 45.
  const entries = readJson('entries-japan.json');
  const total = entries.reduce((sum, e) => sum + (e.postcards ?? 0), 0);
  assert.equal(total, 60911);
});

test('winnings-japan.json has 103 items summing to the declared 991,164 JPY total', () => {
  const winnings = readJson('winnings-japan.json');
  assert.equal(winnings.length, 103);
  const total = winnings.reduce((sum, w) => sum + w.jpy, 0);
  assert.equal(total, 991164);
});

test('entries-korea.json has 358 rows', () => {
  const entries = readJson('entries-korea.json');
  assert.equal(entries.length, 358);
});

test('content.json has the curated Japan and Korea sections app.js expects', () => {
  const content = readJson('content.json');
  assert.equal(typeof content.meta.title, 'string');
  assert.ok(Array.isArray(content.meta.intro));
  assert.ok(Array.isArray(content.japan.statsGlance) && content.japan.statsGlance.length > 0);
  assert.ok(Array.isArray(content.japan.keyTakeaways) && content.japan.keyTakeaways.length > 0);
  assert.ok(Array.isArray(content.korea.stats) && content.korea.stats.length > 0);
  assert.ok(Array.isArray(content.korea.keyDifferences) && content.korea.keyDifferences.length > 0);
  // Every table-bearing section needs matching column/row widths.
  for (const group of [content.japan, content.korea]) {
    for (const section of Object.values(group)) {
      if (section?.columns && section?.rows) {
        for (const row of section.rows) {
          assert.equal(row.length, section.columns.length, `row/column mismatch near "${section.heading}"`);
        }
      }
    }
  }
});

// --- Rendered page ---

const sampleContent = {
  meta: { title: "Nasubi's Sweepstakes Survival", subtitle: 'A data analysis', intro: ['Intro paragraph with a [link](https://example.com).'] },
  japan: {
    statsGlance: [{ label: 'Total items won', value: '103' }],
    statsBlurb: ['Blurb.'],
    economics: { heading: 'The Economics', body: ['He lost money.'] },
    monthlyEntries: { heading: 'Entries Sent', body: ['Body.'], columns: ['Month', 'Postcards'], rows: [['Jan', '100'], ['Feb', '50']], chart: { labelKey: 'Month', valueKey: 'Postcards' } },
    keyTakeaways: ['Volume does not win.'],
  },
  korea: {
    heading: 'Nasubi In Korea',
    intro: ['Korea intro.'],
    stats: [{ label: 'Total contests', value: '358' }],
    statsBlurb: ['Korea blurb.'],
    categoryBreakdown: { heading: 'Category Breakdown', body: ['Meat won.'], columns: ['Category', 'Items'], rows: [['Meat', '40']] },
    oddities: { heading: 'The Korean Oddities', body: ['Bewilderment.'], items: [{ jp: 'たぶん牛肉', en: 'Probably beef' }] },
    keyDifferences: ['Language barrier changed everything.'],
  },
};

const sampleEntries = [
  { jp: 'エプロン', en: 'Apron', postcards: 12, entryMonth: '01-02', prizeMonth: null, jpy: null },
  { jp: 'コクヨの机とイス', en: 'Kokuyo desk and chair', postcards: 20, entryMonth: '01', prizeMonth: '06', jpy: 99800 },
];

function routesFor(overrides = {}) {
  return { 'content.json': sampleContent, 'entries-japan.json': sampleEntries, ...overrides };
}

let importCounter = 0;

async function loadApp({ routes = routesFor() } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/nasubi/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = async (url) => {
    // app.js fetches same-origin paths like "/nasubi/data/content.json"; unlike
    // browser fetch, node's URL() needs an explicit base to parse those.
    const file = new URL(url, 'http://localhost/').pathname.split('/').pop();
    if (!(file in routes)) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => routes[file] };
  };

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document };
}

test('renders the hero, stat tiles, and curated Japan/Korea sections from content.json', async () => {
  const { document } = await loadApp();

  assert.equal(document.getElementById('pageTitle').textContent, "Nasubi's Sweepstakes Survival");
  assert.equal(document.querySelectorAll('.stat-tile').length, 2); // 1 Japan + 1 Korea
  assert.equal(document.querySelector('#introText a').getAttribute('href'), 'https://example.com');

  const headings = [...document.querySelectorAll('.nasubi-subsection h3')].map((h) => h.textContent);
  assert.deepEqual(headings, ['The Economics', 'Entries Sent', 'Key Takeaways', 'Category Breakdown', 'The Korean Oddities', 'Key Differences from Japan']);
});

test('renders a bar chart for sections with a chart hint, alongside its data table', async () => {
  const { document } = await loadApp();

  const bars = [...document.querySelectorAll('.bar-fill')];
  assert.equal(bars.length, 2);
  // The larger value (100) should render a taller bar than the smaller one (50).
  assert.ok(parseFloat(bars[0].style.height) > parseFloat(bars[1].style.height));

  const table = document.querySelector('.nasubi-subsection .data-table');
  assert.ok(table, 'expected a table alongside the chart');
});

test('renders Korea oddities as a Japanese/English list, not a table', async () => {
  const { document } = await loadApp();

  const items = [...document.querySelectorAll('.oddity-list li')];
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector('.oddity-jp').textContent, 'たぶん牛肉');
  assert.match(items[0].querySelector('.oddity-en').textContent, /Probably beef/);
});

test('Browse Data loads the default dataset and search filters it by Japanese or English text', async () => {
  const { document } = await loadApp();

  const rowsText = () => [...document.querySelectorAll('#dataTableWrap tbody tr')].map((tr) => tr.children[1].textContent);
  assert.deepEqual(rowsText(), ['Apron', 'Kokuyo desk and chair']);

  const search = document.getElementById('dataSearch');
  search.value = 'kokuyo';
  search.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.deepEqual(rowsText(), ['Kokuyo desk and chair']);

  const search2 = document.getElementById('dataSearch');
  search2.value = '机とイス'; // matches the Japanese name, not the English one
  search2.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.deepEqual(rowsText(), ['Kokuyo desk and chair']);
});

test('Browse Data shows "—" for a missing prize (never won), not "?"', async () => {
  const { document } = await loadApp();

  const firstRow = document.querySelector('#dataTableWrap tbody tr');
  const cells = [...firstRow.children].map((td) => td.textContent);
  assert.deepEqual(cells, ['エプロン', 'Apron', '12', '01-02', '—', '—']);
});

test('switching datasets fetches and renders the newly selected dataset', async () => {
  const koreaEntries = [{ jp: '骨付きカルビ肉', en: 'Bone-in short rib', month: '01' }];
  const { document } = await loadApp({ routes: routesFor({ 'entries-korea.json': koreaEntries }) });

  const select = /** @type {any} */ (document.getElementById('datasetSelect'));
  select.value = 'entries-korea';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));

  // The dataset fetch is async; give the microtask queue a turn.
  await new Promise((resolve) => setTimeout(resolve, 10));

  const rows = [...document.querySelectorAll('#dataTableWrap tbody tr')];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children[1].textContent, 'Bone-in short rib');
});

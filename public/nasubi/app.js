/**
 * Renders the Nasubi analysis page from static JSON in /nasubi/data/.
 *
 * content.json holds the curated narrative (headings, prose, hand-transcribed
 * tables); entries-japan.json / winnings-japan.json / entries-korea.json hold
 * the full raw datasets behind it, for the "Browse the Raw Data" section.
 *
 * Adding more later: extend content.json's japan/korea sections (each is
 * {heading, body, columns?, rows?} or, for the two "list of strings" sections,
 * a plain array - see JAPAN_SECTION_ORDER / KOREA_SECTION_ORDER below for the
 * render order), or add a new dataset JSON file and a <option> + entry in
 * DATASETS.
 */

import { parseInline, createParagraph, renderProse } from '../inline-markdown.js';
import { createDataTable, createBarChart, renderStatGrid, parseNumeric } from '../data-table.js';

const DATA_BASE = '/nasubi/data';

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  introText: document.getElementById('introText'),
  statsGlance: document.getElementById('statsGlance'),
  statsBlurb: document.getElementById('statsBlurb'),
  japanSections: document.getElementById('japanSections'),
  koreaHeading: document.getElementById('koreaHeading'),
  koreaIntro: document.getElementById('koreaIntro'),
  koreaStats: document.getElementById('koreaStats'),
  koreaStatsBlurb: document.getElementById('koreaStatsBlurb'),
  koreaSubsections: document.getElementById('koreaSubsections'),
  datasetSelect: /** @type {HTMLSelectElement} */ (document.getElementById('datasetSelect')),
  dataSearch: /** @type {HTMLInputElement} */ (document.getElementById('dataSearch')),
  dataTableWrap: document.getElementById('dataTableWrap'),
};

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

/** Order the curated Japan sections render in; each key is looked up in content.json's `japan` object. */
const JAPAN_SECTION_ORDER = [
  'economics', 'monthlyEntries', 'monthlyWinnings', 'biggestWins', 'zeroValueWins',
  'bestROI', 'worstROI', 'mostPostcards', 'categoryBreakdown', 'persistenceIndex',
  'hirosue', 'panties', 'foodDeepDive', 'foodSubcategory', 'survivalTimeline',
  'edibleBreakdown', 'sustainingWins', 'foodNeverCame',
];

const KOREA_SECTION_ORDER = [
  'categoryBreakdown', 'comparison', 'highValueTargets', 'oddities', 'meatObsession', 'appliances',
];

const DATASETS = {
  'entries-japan': { file: 'entries-japan.json', columns: [
    { key: 'jp', label: 'Japanese' }, { key: 'en', label: 'English' },
    { key: 'postcards', label: 'Postcards', numeric: true }, { key: 'entryMonth', label: 'Entry Month' },
    { key: 'prizeMonth', label: 'Prize Month' }, { key: 'jpy', label: 'JPY Won', numeric: true },
  ] },
  'winnings-japan': { file: 'winnings-japan.json', columns: [
    { key: 'jp', label: 'Japanese' }, { key: 'en', label: 'English' },
    { key: 'jpy', label: 'JPY', numeric: true }, { key: 'month', label: 'Month' },
  ] },
  'entries-korea': { file: 'entries-korea.json', columns: [
    { key: 'jp', label: 'Japanese' }, { key: 'en', label: 'English' }, { key: 'month', label: 'Month' },
  ] },
};

const MAX_ROWS_SHOWN = 300;

/** @type {Record<string, unknown[]>} */
const datasetCache = {};

/**
 * Plots one numeric column of a curated section's table, keyed by the section's
 * `chart` hint ({ labelKey, valueKey }, both naming columns). Renders nothing
 * if either name doesn't match a column - a typo in the content file shouldn't
 * take the section down with it.
 * @param {HTMLElement} container
 * @param {string[]} columns
 * @param {string[][]} rows
 * @param {{labelKey: string, valueKey: string}} chartSpec
 */
function renderSectionChart(container, columns, rows, chartSpec) {
  const labelIdx = columns.indexOf(chartSpec.labelKey);
  const valueIdx = columns.indexOf(chartSpec.valueKey);
  if (labelIdx === -1 || valueIdx === -1) return;

  const chart = createBarChart(
    rows.map(row => ({
      label: row[labelIdx],
      value: parseNumeric(row[valueIdx]),
      display: row[valueIdx],
    })),
    { ariaLabel: `Bar chart of ${chartSpec.valueKey} by ${chartSpec.labelKey}; see the table below for exact values.` }
  );
  if (chart) container.appendChild(chart);
}

/** @param {{jp: string, en: string}[]} items */
function renderOddityList(container, items) {
  const list = document.createElement('ul');
  list.className = 'oddity-list';
  list.append(...items.map(({ jp, en }) => {
    const li = document.createElement('li');
    const jpSpan = document.createElement('span');
    jpSpan.className = 'oddity-jp';
    jpSpan.textContent = jp;
    const enSpan = document.createElement('span');
    enSpan.className = 'oddity-en';
    enSpan.append(...parseInline(en));
    li.append(jpSpan, enSpan);
    return li;
  }));
  container.appendChild(list);
}

/**
 * Renders one curated content section ({heading, body, columns?, rows?,
 * chart?, items?}) as a <section>, appended to `parent`.
 */
function renderSection(parent, section) {
  if (!section) return;
  const el = document.createElement('section');
  el.className = 'section nasubi-subsection';

  if (section.heading) {
    const h3 = document.createElement('h3');
    h3.textContent = section.heading;
    el.appendChild(h3);
  }

  if (section.body?.length) {
    const prose = document.createElement('div');
    prose.className = 'nasubi-prose';
    prose.append(...section.body.map(createParagraph));
    el.appendChild(prose);
  }

  if (section.columns && section.rows) {
    if (section.chart) {
      renderSectionChart(el, section.columns, section.rows, section.chart);
    }
    el.appendChild(createDataTable(section.columns, section.rows));
  }

  if (section.items) {
    renderOddityList(el, section.items);
  }

  parent.appendChild(el);
}

/** @param {string[]} items */
function renderTakeaways(parent, heading, items) {
  const el = document.createElement('section');
  el.className = 'section nasubi-subsection';
  const h3 = document.createElement('h3');
  h3.textContent = heading;
  const ol = document.createElement('ol');
  ol.className = 'takeaway-list';
  ol.append(...items.map(text => {
    const li = document.createElement('li');
    li.append(...parseInline(text));
    return li;
  }));
  el.append(h3, ol);
  parent.appendChild(el);
}

/**
 * `no-cache` revalidates rather than refetching, so unchanged content comes
 * back as a 304 - same as every other page here. No cache-busting query
 * string: a unique URL per load would force a full download every time.
 */
async function loadContent() {
  const response = await fetch(`${DATA_BASE}/content.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading content.json`);
  return response.json();
}

async function loadDataset(id) {
  if (datasetCache[id]) return datasetCache[id];
  const { file } = DATASETS[id];
  const response = await fetch(`${DATA_BASE}/${file}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${file}`);
  const data = await response.json();
  datasetCache[id] = data;
  return data;
}

function renderDataset() {
  const id = dom.datasetSelect.value;
  const term = dom.dataSearch.value.trim().toLowerCase();
  const data = /** @type {any[]} */ (datasetCache[id] ?? []);
  const { columns } = DATASETS[id];

  const filtered = term
    ? data.filter(row => (row.jp ?? '').toLowerCase().includes(term) || (row.en ?? '').toLowerCase().includes(term))
    : data;

  dom.dataTableWrap.replaceChildren();

  const note = document.createElement('p');
  note.className = 'data-note';
  note.textContent = filtered.length > MAX_ROWS_SHOWN
    ? `Showing first ${MAX_ROWS_SHOWN} of ${filtered.length} matching rows. Refine your search to narrow it down.`
    : `${filtered.length} row${filtered.length === 1 ? '' : 's'}.`;
  dom.dataTableWrap.appendChild(note);

  const shown = filtered.slice(0, MAX_ROWS_SHOWN);
  const cols = columns.map(c => c.label);
  const rows = shown.map(row => columns.map(c => {
    const v = row[c.key];
    if (v === null || v === undefined || v === '') return '—';
    return c.numeric ? Number(v).toLocaleString() : String(v);
  }));

  dom.dataTableWrap.appendChild(createDataTable(cols, rows));
}

async function initBrowseData() {
  await loadDataset(dom.datasetSelect.value);
  renderDataset();

  dom.datasetSelect.addEventListener('change', async () => {
    dom.dataTableWrap.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'LOADING…';
    dom.dataTableWrap.appendChild(loading);
    await loadDataset(dom.datasetSelect.value);
    renderDataset();
  });
  dom.dataSearch.addEventListener('input', renderDataset);
}

async function init() {
  try {
    const content = await loadContent();

    dom.pageTitle.textContent = content.meta.title;
    dom.pageSubtitle.textContent = content.meta.subtitle;
    renderProse(dom.introText, content.meta.intro);

    renderStatGrid(dom.statsGlance, content.japan.statsGlance);
    renderProse(dom.statsBlurb, content.japan.statsBlurb);

    for (const key of JAPAN_SECTION_ORDER) {
      renderSection(dom.japanSections, content.japan[key]);
    }
    if (content.japan.keyTakeaways) {
      renderTakeaways(dom.japanSections, 'Key Takeaways', content.japan.keyTakeaways);
    }

    dom.koreaHeading.textContent = content.korea.heading;
    renderProse(dom.koreaIntro, content.korea.intro);
    renderStatGrid(dom.koreaStats, content.korea.stats);
    renderProse(dom.koreaStatsBlurb, content.korea.statsBlurb);

    for (const key of KOREA_SECTION_ORDER) {
      renderSection(dom.koreaSubsections, content.korea[key]);
    }
    if (content.korea.keyDifferences) {
      renderTakeaways(dom.koreaSubsections, 'Key Differences from Japan', content.korea.keyDifferences);
    }

    await initBrowseData();
  } catch (error) {
    console.error('Error loading Nasubi data:', error);
    dom.pageTitle.textContent = 'Nasubi’s Sweepstakes Survival';
    const err = document.createElement('div');
    err.className = 'loading';
    err.style.color = 'red';
    err.textContent = `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
    dom.japanSections.replaceChildren(err);
  }
}

await init();

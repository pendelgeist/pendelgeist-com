/**
 * Renders the Nasubi analysis page from static JSON in /nasubi/data/.
 *
 * content.json holds the curated narrative (headings, prose, hand-transcribed
 * tables); entries-japan.json / winnings-japan.json / entries-korea.json hold
 * the full raw datasets behind it, for the "Browse the Raw Data" section.
 *
 * Adding more later: extend content.json's japan/korea sections (each is
 * {heading, body, columns?, rows?} or, for the two "list of strings" sections,
 * a plain array - see SECTION_ORDER below for the render order), or add a new
 * dataset JSON file and a <option> + entry in DATASETS.
 */

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
 * Tiny inline-markdown parser: supports **bold**, *italic*, and [text](url)
 * links. Returns DOM nodes rather than using innerHTML.
 * @param {string} text
 * @returns {(Node)[]}
 */
function parseInline(text) {
  const nodes = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
      const strong = document.createElement('strong');
      strong.textContent = match[1];
      nodes.push(strong);
    } else if (match[2] !== undefined) {
      const em = document.createElement('em');
      em.textContent = match[2];
      nodes.push(em);
    } else {
      const a = document.createElement('a');
      a.href = match[4];
      a.textContent = match[3];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      nodes.push(a);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(document.createTextNode(text.slice(lastIndex)));
  }
  return nodes;
}

/** @param {string} text */
function createParagraph(text) {
  const p = document.createElement('p');
  p.append(...parseInline(text));
  return p;
}

/** @param {string[]} paragraphs */
function renderProse(container, paragraphs) {
  container.replaceChildren(...(paragraphs ?? []).map(createParagraph));
}

/** @param {{label: string, value: string}[]} stats */
function renderStatGrid(container, stats) {
  container.replaceChildren(...stats.map(({ label, value }) => {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    const val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = value;
    const lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = label;
    tile.append(val, lbl);
    return tile;
  }));
}

/** Parses "84,000" / "13.3%" / "991,164" into a comparable number, or NaN. */
function parseNumeric(cell) {
  const cleaned = String(cell).replace(/,/g, '').replace(/%$/, '');
  return Number(cleaned);
}

/**
 * Renders a sortable table from {columns, rows}. Clicking a header toggles
 * ascending/descending sort for that column (numeric-aware).
 * @param {HTMLElement} container
 * @param {string[]} columns
 * @param {string[][]} rows
 */
function renderDataTable(container, columns, rows) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  let sortState = { col: -1, dir: 1 };

  columns.forEach((col, i) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.tabIndex = 0;
    th.addEventListener('click', () => {
      sortState = { col: i, dir: sortState.col === i ? -sortState.dir : 1 };
      applySort();
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  function renderRows(data) {
    tbody.replaceChildren(...data.map(row => {
      const tr = document.createElement('tr');
      tr.append(...row.map(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        return td;
      }));
      return tr;
    }));
  }

  function applySort() {
    const sorted = [...rows];
    if (sortState.col >= 0) {
      const { col, dir } = sortState;
      const allNumeric = rows.every(r => !Number.isNaN(parseNumeric(r[col])));
      sorted.sort((a, b) => {
        if (allNumeric) return (parseNumeric(a[col]) - parseNumeric(b[col])) * dir;
        return a[col].localeCompare(b[col]) * dir;
      });
    }
    renderRows(sorted);
    [...headRow.children].forEach((th, i) => {
      th.classList.toggle('sorted-asc', sortState.col === i && sortState.dir === 1);
      th.classList.toggle('sorted-desc', sortState.col === i && sortState.dir === -1);
    });
  }

  renderRows(rows);
  const wrap = document.createElement('div');
  wrap.className = 'table-scroll';
  wrap.appendChild(table);
  container.appendChild(wrap);
}

/**
 * A single-series magnitude bar chart (one hue, direct-labeled) for a table's
 * numeric column - e.g. postcards sent or cumulative JPY by month.
 * @param {HTMLElement} container
 * @param {string[]} columns
 * @param {string[][]} rows
 * @param {{labelKey: string, valueKey: string}} chartSpec
 */
function renderBarChart(container, columns, rows, chartSpec) {
  const labelIdx = columns.indexOf(chartSpec.labelKey);
  const valueIdx = columns.indexOf(chartSpec.valueKey);
  if (labelIdx === -1 || valueIdx === -1) return;

  const values = rows.map(r => parseNumeric(r[valueIdx]));
  const max = Math.max(...values, 1);

  const chart = document.createElement('div');
  chart.className = 'bar-chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', `Bar chart of ${chartSpec.valueKey} by ${chartSpec.labelKey}; see the table below for exact values.`);

  rows.forEach((row, i) => {
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.title = `${row[labelIdx]}: ${row[valueIdx]}`;

    const value = document.createElement('div');
    value.className = 'bar-value';
    value.textContent = row[valueIdx];

    const bar = document.createElement('div');
    bar.className = 'bar-fill';
    bar.style.height = `${Math.max((values[i] / max) * 100, 2)}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = row[labelIdx];

    col.append(value, bar, label);
    chart.appendChild(col);
  });

  container.appendChild(chart);
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
      renderBarChart(el, section.columns, section.rows, section.chart);
    }
    renderDataTable(el, section.columns, section.rows);
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

async function loadContent() {
  const response = await fetch(`${DATA_BASE}/content.json?t=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading content.json`);
  return response.json();
}

async function loadDataset(id) {
  if (datasetCache[id]) return datasetCache[id];
  const { file } = DATASETS[id];
  const response = await fetch(`${DATA_BASE}/${file}?t=${Date.now()}`, { cache: 'no-cache' });
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

  renderDataTable(dom.dataTableWrap, cols, rows);
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

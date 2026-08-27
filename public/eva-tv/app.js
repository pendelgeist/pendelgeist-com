/**
 * @typedef {Object} Episode
 * @property {number|string} number
 * @property {string} title
 * @property {string} [subtitle]
 */

/**
 * @typedef {Object} EntryLink
 * @property {string} id - id of another entry
 * @property {string} label - short description of why it's linked
 */

/**
 * @typedef {Object} Source
 * @property {'en'|'ja'} lang
 * @property {string} title
 * @property {string} url
 */

/**
 * @typedef {Object} Quote
 * @property {'en'|'ja'} lang - the language the entry's fact was originally sourced in
 * @property {string} original - the original-language excerpt
 * @property {string} translation - a translation into the other language
 */

/**
 * @typedef {Object} Entry
 * @property {string} id
 * @property {number|string} episode - matches an Episode's `number`
 * @property {string} [scene] - optional free-text scene/timing marker within the episode
 * @property {'character'|'fact'|'theory'|'unknowable'} type
 * @property {string} title
 * @property {string} body
 * @property {EntryLink[]} links
 * @property {string[]} [sourceRefs] - keys into EvaData.sources
 * @property {Quote} [quote] - original-language excerpt + translation backing this entry
 */

/**
 * @typedef {Object} EvaData
 * @property {Record<string, Source>} sources
 * @property {Episode[]} episodes
 * @property {Entry[]} entries
 */

const TYPE_LABELS = {
  character: 'Character',
  fact: 'Fact',
  theory: 'Theory',
  unknowable: 'Unknowable',
};

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  timelineTrack: document.getElementById('timelineTrack'),
  timelineScroll: document.getElementById('timelineScroll'),
  detailPanel: document.getElementById('detailPanel'),
  detailContent: document.getElementById('detailContent'),
  detailClose: document.getElementById('detailClose'),
  detailBackdrop: document.getElementById('detailBackdrop'),
};

/** @type {EvaData|null} */
let data = null;
/** @type {Map<string, Entry>} */
let entriesById = new Map();
/** @type {string|null} */
let activeEntryId = null;

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

// On wide screens the detail panel is always visible (see .detail-panel[hidden]
// in eva-tv/styles.css), so it needs something to show before anything's been
// picked yet - this is also what it resets to on close.
function showDetailPlaceholder() {
  if (!dom.detailContent) return;
  const p = document.createElement('p');
  p.className = 'detail-placeholder';
  p.textContent = 'Select an entry from the timeline to see its details here.';
  dom.detailContent.replaceChildren(p);
}

function showError(message) {
  if (!dom.timelineTrack) return;
  const div = document.createElement('div');
  div.className = 'loading';
  div.style.color = 'red';
  div.textContent = `ERROR: ${message}`;
  dom.timelineTrack.replaceChildren(div);
}

/** @param {Entry} entry */
function createEntryNode(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `entry-node entry-type-${entry.type}`;
  button.dataset.id = entry.id;

  const badge = document.createElement('span');
  badge.className = 'entry-node-badge';
  badge.textContent = TYPE_LABELS[entry.type]?.[0] ?? '?';

  const label = document.createElement('span');
  label.className = 'entry-node-label';
  label.textContent = entry.title;

  button.append(badge, label);
  button.addEventListener('click', () => openDetail(entry.id, { scroll: false }));
  return button;
}

/** @param {Episode} episode */
function createEpisodeColumn(episode) {
  const column = document.createElement('div');
  column.className = 'episode-column';
  column.dataset.episode = String(episode.number);

  const header = document.createElement('div');
  header.className = 'episode-header';

  const number = document.createElement('span');
  number.className = 'episode-number';
  number.textContent = typeof episode.number === 'number'
    ? `EP ${String(episode.number).padStart(2, '0')}`
    : String(episode.number).toUpperCase();

  const title = document.createElement('span');
  title.className = 'episode-title';
  title.textContent = episode.title;

  header.append(number, title);
  column.appendChild(header);

  if (episode.subtitle) {
    const subtitle = document.createElement('div');
    subtitle.className = 'episode-subtitle';
    subtitle.textContent = episode.subtitle;
    column.appendChild(subtitle);
  }

  const entriesContainer = document.createElement('div');
  entriesContainer.className = 'episode-entries';
  column.appendChild(entriesContainer);

  return column;
}

function render() {
  if (!data || !dom.timelineTrack) return;

  const fragment = document.createDocumentFragment();
  const pendingColumns = [];
  for (const episode of data.episodes) {
    const column = createEpisodeColumn(episode);
    const entriesContainer = column.querySelector('.episode-entries');
    const entries = data.entries.filter((e) => String(e.episode) === String(episode.number));
    fragment.appendChild(column);
    pendingColumns.push({ entriesContainer, nodes: entries.map(createEntryNode) });
  }
  dom.timelineTrack.replaceChildren(fragment);

  // Now that the columns are attached (and .episode-entries has its real,
  // viewport-derived height from the CSS flex layout), measure each entry's
  // actual rendered height and pack them into side-by-side sub-columns that
  // fit it - see the comment on .episode-entries in styles.css for why.
  for (const { entriesContainer, nodes } of pendingColumns) {
    packEntriesIntoSubcolumns(entriesContainer, nodes);
  }

  if (activeEntryId) {
    dom.timelineTrack.querySelector(`.entry-node[data-id="${activeEntryId}"]`)?.classList.add('active');
  }
}

// Matches .entry-subcolumn's `gap: 0.5rem` in styles.css, converted to px at
// the default 16px root font size - used only to decide where to break a
// column, so a mismatch (e.g. from browser text-zoom) just shifts that
// slightly rather than causing any visible error.
const SUBCOLUMN_GAP_PX = 8;

/**
 * @param {HTMLElement} container
 * @param {HTMLElement[]} nodes
 */
function packEntriesIntoSubcolumns(container, nodes) {
  if (!nodes.length) return;
  const available = container.clientHeight;
  const subcolumns = [];
  let current = null;
  let used = 0;
  for (const node of nodes) {
    container.appendChild(node);
    const height = node.getBoundingClientRect().height;
    if (current && used + SUBCOLUMN_GAP_PX + height <= available) {
      used += SUBCOLUMN_GAP_PX + height;
    } else {
      current = document.createElement('div');
      current.className = 'entry-subcolumn';
      subcolumns.push(current);
      used = height;
    }
    current.appendChild(node);
  }
  container.replaceChildren(...subcolumns);
}

/** @param {EntryLink} link */
function createJumpButton(link) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'jump-link';
  button.textContent = `${link.label} →`;
  button.addEventListener('click', () => openDetail(link.id, { scroll: true }));
  return button;
}

/** @param {string} body - entry.body; blank-line-separated paragraphs become separate <p>s */
function createBodyElement(body) {
  const container = document.createElement('div');
  container.className = 'detail-body';
  for (const paragraph of body.split(/\n{2,}/)) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    container.appendChild(p);
  }
  return container;
}

/** @param {Quote} quote */
function createQuoteBlock(quote) {
  const block = document.createElement('blockquote');
  block.className = 'detail-quote';

  const original = document.createElement('p');
  original.className = `detail-quote-original detail-quote-${quote.lang}`;
  original.lang = quote.lang;
  original.textContent = quote.original;

  const translation = document.createElement('p');
  translation.className = 'detail-quote-translation';
  translation.textContent = quote.translation;

  block.append(original, translation);
  return block;
}

/**
 * @param {string[]} sourceRefs
 * @param {Record<string, Source>} sources
 */
function createSourcesSection(sourceRefs, sources) {
  const section = document.createElement('div');
  section.className = 'detail-sources';

  const label = document.createElement('span');
  label.className = 'detail-sources-label';
  label.textContent = 'Sources:';
  section.appendChild(label);

  for (const ref of sourceRefs) {
    const source = sources[ref];
    if (!source) continue;
    const link = document.createElement('a');
    link.className = 'source-link';
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.title;
    link.lang = source.lang;
    section.appendChild(link);
  }

  return section;
}

/**
 * @param {string} id
 * @param {{ scroll: boolean }} options
 */
function openDetail(id, { scroll }) {
  const entry = entriesById.get(id);
  if (!entry || !dom.detailPanel || !dom.detailContent) return;

  for (const node of dom.timelineTrack.querySelectorAll('.entry-node.active')) {
    node.classList.remove('active');
  }
  const node = [...dom.timelineTrack.querySelectorAll('.entry-node')].find((n) => n.dataset.id === id);
  node?.classList.add('active');
  activeEntryId = id;

  const episode = data?.episodes.find((e) => String(e.number) === String(entry.episode));
  const episodeLabel = episode
    ? (typeof episode.number === 'number' ? `Episode ${episode.number}: ${episode.title}` : episode.title)
    : String(entry.episode);

  const title = document.createElement('div');
  title.className = 'detail-title';
  title.textContent = entry.title;

  const meta = document.createElement('div');
  meta.className = 'detail-meta';
  const typeTag = document.createElement('span');
  typeTag.className = `entry-tag entry-tag-${entry.type}`;
  typeTag.textContent = TYPE_LABELS[entry.type] ?? entry.type;
  meta.appendChild(typeTag);
  const episodeTag = document.createElement('span');
  episodeTag.className = 'detail-episode';
  episodeTag.textContent = entry.scene ? `${episodeLabel} — ${entry.scene}` : episodeLabel;
  meta.appendChild(episodeTag);

  const body = createBodyElement(entry.body);

  const nodes = [title, meta, body];

  if (entry.quote) {
    nodes.push(createQuoteBlock(entry.quote));
  }

  if (entry.links?.length) {
    const linksSection = document.createElement('div');
    linksSection.className = 'detail-links';
    for (const link of entry.links) {
      if (entriesById.has(link.id)) {
        linksSection.appendChild(createJumpButton(link));
      }
    }
    if (linksSection.children.length) nodes.push(linksSection);
  }

  if (entry.sourceRefs?.length && data?.sources) {
    nodes.push(createSourcesSection(entry.sourceRefs, data.sources));
  }

  dom.detailContent.replaceChildren(...nodes);
  dom.detailPanel.hidden = false;
  if (dom.detailBackdrop) dom.detailBackdrop.hidden = false;

  if (scroll && node) {
    node.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}

function closeDetail() {
  if (!dom.detailPanel) return;
  dom.detailPanel.hidden = true;
  if (dom.detailBackdrop) dom.detailBackdrop.hidden = true;
  showDetailPlaceholder();
  activeEntryId = null;
  for (const node of dom.timelineTrack.querySelectorAll('.entry-node.active')) {
    node.classList.remove('active');
  }
}

// The detail panel is only user-resizable (via the CSS `resize` handle on
// .detail-panel) at the >=701px side-panel breakpoint - see styles.css. Below
// that it's a fixed-width bottom sheet, so there's nothing to persist.
const DETAIL_WIDTH_KEY = 'pendelgeist:eva-tv:detail-width';
const sidePanelQuery = document.defaultView?.matchMedia?.('(min-width: 701px)');

function restoreDetailWidth() {
  const saved = localStorage.getItem(DETAIL_WIDTH_KEY);
  if (saved && dom.detailPanel) {
    dom.detailPanel.style.width = saved;
  }
}

function watchDetailWidth() {
  if (!dom.detailPanel || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => {
    if (sidePanelQuery?.matches) {
      localStorage.setItem(DETAIL_WIDTH_KEY, `${dom.detailPanel.offsetWidth}px`);
    }
  }).observe(dom.detailPanel);
}

async function loadData() {
  try {
    const response = await fetch('/eva-tv/data.json', { cache: 'no-cache' });
    if (!response.ok) {
      showError(`HTTP ${response.status}`);
      return;
    }
    data = /** @type {EvaData} */ (await response.json());
    entriesById = new Map(data.entries.map((e) => [e.id, e]));
    render();
  } catch (error) {
    console.error('Error loading data:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

showDetailPlaceholder();
restoreDetailWidth();
watchDetailWidth();

dom.detailClose?.addEventListener('click', closeDetail);
dom.detailBackdrop?.addEventListener('click', closeDetail);

// Re-pack the sub-columns on resize/orientation change (e.g. rotating a
// tablet) rather than leaving them sized for whatever the viewport was at
// load - debounced since resize fires continuously while dragging/rotating.
let resizeTimeout;
document.defaultView?.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(render, 150);
});

await loadData();

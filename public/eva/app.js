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
 * @typedef {Object} Entry
 * @property {string} id
 * @property {number|string} episode - matches an Episode's `number`
 * @property {string} [scene] - optional free-text scene/timing marker within the episode
 * @property {'character'|'fact'|'theory'|'unknowable'} type
 * @property {string} title
 * @property {string} body
 * @property {EntryLink[]} links
 */

/**
 * @typedef {Object} EvaData
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
  typeFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('typeFilter')),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  timelineTrack: document.getElementById('timelineTrack'),
  timelineScroll: document.getElementById('timelineScroll'),
  detailPanel: document.getElementById('detailPanel'),
  detailContent: document.getElementById('detailContent'),
  detailClose: document.getElementById('detailClose'),
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
  button.dataset.searchText = [entry.title, entry.body, entry.scene, TYPE_LABELS[entry.type]]
    .filter(Boolean).join(' ').toLowerCase();

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
  for (const episode of data.episodes) {
    const column = createEpisodeColumn(episode);
    const entriesContainer = column.querySelector('.episode-entries');
    const entries = data.entries.filter((e) => String(e.episode) === String(episode.number));
    for (const entry of entries) {
      entriesContainer.appendChild(createEntryNode(entry));
    }
    fragment.appendChild(column);
  }
  dom.timelineTrack.replaceChildren(fragment);
  applyFilters();
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

  const body = document.createElement('div');
  body.className = 'detail-body';
  body.textContent = entry.body;

  const nodes = [title, meta, body];

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

  dom.detailContent.replaceChildren(...nodes);
  dom.detailPanel.hidden = false;

  if (scroll && node) {
    node.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}

function closeDetail() {
  if (!dom.detailPanel) return;
  dom.detailPanel.hidden = true;
  activeEntryId = null;
  for (const node of dom.timelineTrack.querySelectorAll('.entry-node.active')) {
    node.classList.remove('active');
  }
}

function applyFilters() {
  if (!dom.timelineTrack || !dom.typeFilter || !dom.searchInput) return;

  const typeValue = dom.typeFilter.value;
  const searchTerm = dom.searchInput.value.trim().toLowerCase();

  let activeStillVisible = false;
  for (const node of dom.timelineTrack.querySelectorAll('.entry-node')) {
    const matchesType = typeValue === 'all' || node.classList.contains(`entry-type-${typeValue}`);
    const matchesSearch = !searchTerm || (node.dataset.searchText ?? '').includes(searchTerm);
    const visible = matchesType && matchesSearch;
    node.classList.toggle('node-hidden', !visible);
    if (visible && node.dataset.id === activeEntryId) activeStillVisible = true;
  }

  if (activeEntryId && !activeStillVisible) closeDetail();
}

async function loadData() {
  try {
    const response = await fetch('/eva/data.json');
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

dom.searchInput?.addEventListener('input', applyFilters);
dom.typeFilter?.addEventListener('change', applyFilters);
dom.detailClose?.addEventListener('click', closeDetail);

await loadData();

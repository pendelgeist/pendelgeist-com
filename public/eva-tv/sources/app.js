/**
 * @typedef {Object} Source
 * @property {'en'|'ja'} lang
 * @property {string} title
 * @property {string} url
 */

// Keyed by hostname (leading "www." stripped). Anything not listed here
// falls back to a title-cased version of the hostname's first label - see
// siteLabel() - so new sources render sensibly without needing an update
// here first.
const SITE_LABELS = {
  'animenewsnetwork.com': 'Anime News Network',
  'cbr.com': 'CBR',
  'en.wikipedia.org': 'Wikipedia (English)',
  'ja.wikipedia.org': 'Wikipedia (Japanese)',
  'evangelion.fandom.com': 'Evangelion Wiki (Fandom)',
  'villains.fandom.com': 'Villains Wiki (Fandom)',
  'forum.evageeks.org': 'EvaGeeks Forum',
  'wiki.evageeks.org': 'EvaWiki (EvaGeeks.org)',
  'looper.com': 'Looper',
  'opiniojuris.org': 'Opinio Juris',
  'sparknotes.com': 'SparkNotes',
  'tvtropes.org': 'TV Tropes',
  'mihaigolanul.neocities.org': 'mihaigolanul (blog)',
  'skapbadoa.com': 'skapbadoa (blog)',
  'youtube.com': 'YouTube',
  'x.com': 'X (Twitter)',
};

const listEl = document.getElementById('sourcesList');

function showError(message) {
  if (!listEl) return;
  const p = document.createElement('p');
  p.className = 'loading';
  p.style.color = 'red';
  p.textContent = `ERROR: ${message}`;
  listEl.replaceChildren(p);
}

/** @param {string} url */
function siteLabel(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return url;
  }
  hostname = hostname.replace(/^www\./, '');
  if (SITE_LABELS[hostname]) return SITE_LABELS[hostname];
  const firstLabel = hostname.split('.')[0];
  return firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
}

/** @param {Record<string, Source>} sources */
function render(sources) {
  if (!listEl) return;

  /** @type {Map<string, Source[]>} */
  const groups = new Map();
  for (const source of Object.values(sources)) {
    const label = siteLabel(source.url);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(source);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.title.localeCompare(b.title));
  }
  const sortedLabels = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  const sections = sortedLabels.map((label) => {
    const section = document.createElement('div');
    section.className = 'source-group';

    const heading = document.createElement('h3');
    heading.className = 'source-group-heading';
    heading.textContent = label;
    section.appendChild(heading);

    const ul = document.createElement('ul');
    ul.className = 'show-list';
    for (const source of groups.get(label)) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'source-link';
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.lang = source.lang;
      link.textContent = source.title;
      li.appendChild(link);
      ul.appendChild(li);
    }
    section.appendChild(ul);

    return section;
  });

  listEl.replaceChildren(...sections);
}

async function loadData() {
  try {
    const response = await fetch('/eva-tv/data.json', { cache: 'no-cache' });
    if (!response.ok) {
      showError(`HTTP ${response.status}`);
      return;
    }
    const data = await response.json();
    render(data.sources ?? {});
  } catch (error) {
    console.error('Error loading sources:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

await loadData();

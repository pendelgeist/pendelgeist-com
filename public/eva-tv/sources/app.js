/**
 * @typedef {Object} Source
 * @property {'en'|'ja'} lang
 * @property {string} title
 * @property {string} url
 */

const listEl = document.getElementById('sourcesList');

function showError(message) {
  if (!listEl) return;
  const li = document.createElement('li');
  li.className = 'loading';
  li.style.color = 'red';
  li.textContent = `ERROR: ${message}`;
  listEl.replaceChildren(li);
}

/** @param {Record<string, Source>} sources */
function render(sources) {
  if (!listEl) return;

  const entries = Object.values(sources).sort((a, b) => a.title.localeCompare(b.title));
  const items = entries.map((source) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'source-link';
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.lang = source.lang;
    link.textContent = source.title;
    li.appendChild(link);
    return li;
  });

  listEl.replaceChildren(...items);
}

async function loadData() {
  try {
    const response = await fetch('/eva-tv/data.json');
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

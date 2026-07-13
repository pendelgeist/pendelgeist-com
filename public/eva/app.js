/**
 * @typedef {Object} Character
 * @property {string} id
 * @property {string} name
 * @property {string} aka
 * @property {string} summary
 */

/**
 * @typedef {Object} Fact
 * @property {string} id
 * @property {string} category
 * @property {string} title
 * @property {string} body
 */

/**
 * @typedef {Object} Theory
 * @property {string} id
 * @property {string} title
 * @property {string} topic
 * @property {string} body
 */

/**
 * @typedef {Object} Unknowable
 * @property {string} id
 * @property {string} question
 * @property {string} body
 */

/**
 * @typedef {Object} EvaData
 * @property {Character[]} characters
 * @property {Fact[]} facts
 * @property {Theory[]} theories
 * @property {Unknowable[]} unknowables
 */

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  typeFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('typeFilter')),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  characterEntries: document.getElementById('characterEntries'),
  factEntries: document.getElementById('factEntries'),
  theoryEntries: document.getElementById('theoryEntries'),
  unknowableEntries: document.getElementById('unknowableEntries'),
};

const SECTIONS = [
  { type: 'characters', container: () => dom.characterEntries, wrapper: (el) => el.closest('.section') },
  { type: 'facts', container: () => dom.factEntries, wrapper: (el) => el.closest('.section') },
  { type: 'theories', container: () => dom.theoryEntries, wrapper: (el) => el.closest('.section') },
  { type: 'unknowables', container: () => dom.unknowableEntries, wrapper: (el) => el.closest('.section') },
];

/** @type {EvaData|null} */
let data = null;

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

function showError(message) {
  for (const container of [dom.characterEntries, dom.factEntries, dom.theoryEntries, dom.unknowableEntries]) {
    if (!container) continue;
    const div = document.createElement('div');
    div.className = 'loading';
    div.style.color = 'red';
    div.textContent = `ERROR: ${message}`;
    container.replaceChildren(div);
  }
}

/** @param {string} label */
function createTag(label) {
  const span = document.createElement('span');
  span.className = 'entry-tag';
  span.textContent = label;
  return span;
}

/** @param {Character} c */
function createCharacterArticle(c) {
  const article = document.createElement('article');
  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = c.name;

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  if (c.aka) meta.appendChild(createTag(c.aka));

  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.textContent = c.summary ?? '';

  body.append(title, meta, desc);
  article.appendChild(body);
  return article;
}

/** @param {Fact} f */
function createFactArticle(f) {
  const article = document.createElement('article');
  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = f.title;

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  if (f.category) meta.appendChild(createTag(f.category));

  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.textContent = f.body ?? '';

  body.append(title, meta, desc);
  article.appendChild(body);
  return article;
}

/** @param {Theory} t */
function createTheoryArticle(t) {
  const article = document.createElement('article');
  article.className = 'theory-article';
  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = t.title;

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  if (t.topic) meta.appendChild(createTag(t.topic));

  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.textContent = t.body ?? '';

  body.append(title, meta, desc);
  article.appendChild(body);
  return article;
}

/** @param {Unknowable} u */
function createUnknowableArticle(u) {
  const article = document.createElement('article');
  article.className = 'unknowable-article';
  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = u.question;

  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.textContent = u.body ?? '';

  body.append(title, desc);
  article.appendChild(body);
  return article;
}

/** @param {unknown} entry */
function searchableText(entry) {
  return Object.values(entry).filter((v) => typeof v === 'string').join(' ').toLowerCase();
}

function renderEmpty(container) {
  const div = document.createElement('div');
  div.className = 'loading';
  div.textContent = 'NO MATCHES FOUND';
  container.replaceChildren(div);
}

function render() {
  if (!data || !dom.typeFilter || !dom.searchInput) return;

  const typeValue = dom.typeFilter.value;
  const searchTerm = dom.searchInput.value.trim().toLowerCase();

  const renderers = {
    characters: createCharacterArticle,
    facts: createFactArticle,
    theories: createTheoryArticle,
    unknowables: createUnknowableArticle,
  };
  const containers = {
    characters: dom.characterEntries,
    facts: dom.factEntries,
    theories: dom.theoryEntries,
    unknowables: dom.unknowableEntries,
  };

  for (const type of Object.keys(renderers)) {
    const container = containers[type];
    if (!container) continue;

    const section = container.closest('.section');
    const showSection = typeValue === 'all' || typeValue === type;
    if (section) section.style.display = showSection ? '' : 'none';
    if (!showSection) continue;

    const entries = (data[type] ?? []).filter(
      (entry) => !searchTerm || searchableText(entry).includes(searchTerm)
    );

    if (entries.length === 0) {
      renderEmpty(container);
    } else {
      container.replaceChildren(...entries.map(renderers[type]));
    }
  }
}

async function loadData() {
  try {
    const response = await fetch('/eva/data.json');
    if (!response.ok) {
      showError(`HTTP ${response.status}`);
      return;
    }
    data = /** @type {EvaData} */ (await response.json());
    render();
  } catch (error) {
    console.error('Error loading data:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

dom.searchInput?.addEventListener('input', render);
dom.typeFilter?.addEventListener('change', render);

await loadData();

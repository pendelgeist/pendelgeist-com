import { rollPalette, PALETTE_PROPERTIES } from './theme-palette.js';

const STORAGE_KEY = 'pendelgeist:theme';
const PALETTE_KEY_PREFIX = 'pendelgeist:theme:palette:';

// Extend this list (and add a matching CSS rule in styles.css) to add more
// themes later. "system" means no override - color-scheme: light dark
// follows the OS/browser preference. `group` is the <optgroup> the picker
// files a theme under, in the order the groups first appear here.
const THEMES = [
  { id: 'system', label: 'Auto', group: 'Standard' },
  { id: 'light', label: 'AMO - L', group: 'Standard' },
  { id: 'dark', label: 'AMO - Kira', group: 'Standard' },
  { id: 'ffvii', label: 'FFVII Menu', group: 'Anime & Games' },
  { id: 'eva-01', label: 'Eva-01', group: 'Anime & Games' },
  { id: 'manga', label: 'Manga', group: 'Anime & Games' },
  { id: 'gameboy', label: 'Game Boy', group: 'Anime & Games' },
  { id: 'vaporwave', label: 'Vaporwave', group: 'Novelty' },
  { id: 'random', label: 'Random', group: 'Novelty' },
];

const RANDOM_THEMES = new Set(['random']);

/** Ids from the old Random (Light)/Random (Dark) pair, merged into "random". */
const LEGACY_RANDOM_MODES = { 'random-light': 'light', 'random-dark': 'dark' };

function paletteKeyFor(themeId) {
  return `${PALETTE_KEY_PREFIX}${themeId}`;
}

/** Each roll of the Random theme picks light or dark as well as its colors. */
function rollMode() {
  return Math.random() < 0.5 ? 'light' : 'dark';
}

function readSavedPalette(themeId) {
  try {
    const raw = localStorage.getItem(paletteKeyFor(themeId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePalette(themeId, palette) {
  try {
    localStorage.setItem(paletteKeyFor(themeId), JSON.stringify(palette));
  } catch {
    // Best-effort only; a random theme just re-rolls next load instead of persisting.
  }
}

function applyPalette(palette) {
  for (const [prop, value] of Object.entries(palette)) {
    document.documentElement.style.setProperty(prop, value);
  }
}

/** Removes any inline overrides from a previously-applied random palette, so
 * switching to a non-random theme isn't stuck under a stale inline value
 * (which would otherwise outrank that theme's plain CSS rule). */
function clearPalette() {
  for (const prop of PALETTE_PROPERTIES) {
    document.documentElement.style.removeProperty(prop);
  }
}

function applyTheme(themeId) {
  clearPalette();

  if (themeId === 'system') {
    document.documentElement.removeAttribute('data-theme');
    return;
  }

  document.documentElement.setAttribute('data-theme', themeId);

  if (RANDOM_THEMES.has(themeId)) {
    const palette = readSavedPalette(themeId) ?? rollPalette(rollMode());
    savePalette(themeId, palette);
    applyPalette(palette);
  }
}

/** Rolls a fresh palette for the given random theme, applying and saving it over whatever was there before. */
function rerollTheme(themeId) {
  const palette = rollPalette(rollMode());
  savePalette(themeId, palette);
  applyPalette(palette);
}

function readSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The saved theme as an id the picker still offers. A saved Random (Light)
 * or Random (Dark) becomes "random", keeping its palette (now tagged with its
 * mode, which the merged theme stores in the palette itself); a theme that's
 * been removed (Rainbow) falls back to Auto.
 * @param {string|null} saved
 */
function migrateSavedTheme(saved) {
  if (saved && saved in LEGACY_RANDOM_MODES) {
    const palette = readSavedPalette(saved);
    if (palette) savePalette('random', { ...palette, 'color-scheme': LEGACY_RANDOM_MODES[saved] });
    try {
      for (const legacy of Object.keys(LEGACY_RANDOM_MODES)) localStorage.removeItem(paletteKeyFor(legacy));
    } catch {
      // Best-effort cleanup; a stale key is harmless.
    }
    saveTheme('random');
    return 'random';
  }
  if (saved && !THEMES.some(theme => theme.id === saved)) {
    saveTheme('system');
    return 'system';
  }
  return saved ?? 'system';
}

function saveTheme(themeId) {
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // Best-effort only (private browsing / quota); the choice just won't persist.
  }
}

function buildPicker() {
  const nav = document.querySelector('nav');
  if (!nav) return;

  const select = document.createElement('select');
  select.id = 'themePicker';
  select.className = 'theme-picker';
  select.setAttribute('aria-label', 'Theme');

  const groups = new Map();
  for (const theme of THEMES) {
    let group = groups.get(theme.group);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = theme.group;
      groups.set(theme.group, group);
      select.appendChild(group);
    }
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    group.appendChild(option);
  }

  const reroll = document.createElement('button');
  reroll.type = 'button';
  reroll.id = 'themeReroll';
  reroll.className = 'theme-reroll';
  reroll.textContent = '\u{1F3B2}';
  reroll.title = 'Reroll random theme colors';
  reroll.setAttribute('aria-label', 'Reroll random theme colors');

  function updateRerollVisibility(themeId) {
    reroll.hidden = !RANDOM_THEMES.has(themeId);
  }

  const savedTheme = migrateSavedTheme(readSavedTheme());
  select.value = savedTheme;
  applyTheme(savedTheme); // in case the inline pre-paint script (see index.html) wasn't there
  updateRerollVisibility(savedTheme);

  select.addEventListener('change', () => {
    applyTheme(select.value);
    saveTheme(select.value);
    updateRerollVisibility(select.value);
  });

  reroll.addEventListener('click', () => {
    rerollTheme(select.value);
  });

  // Grouped in one wrapper so nav's `justify-content: space-between` always
  // sees exactly two children (the Home link and this group) - otherwise the
  // reroll button becoming a third child would space all three apart evenly,
  // stranding the picker in the middle of the bar instead of at the end.
  const controls = document.createElement('div');
  controls.className = 'theme-controls';
  controls.appendChild(select);
  controls.appendChild(reroll);
  nav.appendChild(controls);
}

buildPicker();

import { rollPalette, PALETTE_PROPERTIES } from './theme-palette.js';

const STORAGE_KEY = 'pendelgeist:theme';
const PALETTE_KEY_PREFIX = 'pendelgeist:theme:palette:';

// Extend this list (and add a matching CSS rule in styles.css) to add more
// themes later. "system" means no override - color-scheme: light dark
// follows the OS/browser preference.
const THEMES = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'AMO - L' },
  { id: 'dark', label: 'AMO - Kira' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'vaporwave', label: 'Vaporwave' },
  { id: 'ffvii', label: 'FFVII Menu' },
  { id: 'ffxiv', label: 'FFXIV Eorzea' },
  { id: 'geocities', label: "GeoCities '99" },
  { id: 'eva-00', label: 'Eva-00' },
  { id: 'eva-01', label: 'Eva-01' },
  { id: 'eva-02', label: 'Eva-02' },
  { id: 'random-light', label: 'Random (Light)' },
  { id: 'random-dark', label: 'Random (Dark)' },
];

const RANDOM_THEMES = new Set(['random-light', 'random-dark']);

function paletteKeyFor(themeId) {
  return `${PALETTE_KEY_PREFIX}${themeId}`;
}

function modeFor(themeId) {
  return themeId === 'random-dark' ? 'dark' : 'light';
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
    const palette = readSavedPalette(themeId) ?? rollPalette(modeFor(themeId));
    savePalette(themeId, palette);
    applyPalette(palette);
  }
}

/** Rolls a fresh palette for the given random theme, applying and saving it over whatever was there before. */
function rerollTheme(themeId) {
  const palette = rollPalette(modeFor(themeId));
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

  for (const theme of THEMES) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    select.appendChild(option);
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

  const savedTheme = readSavedTheme() ?? 'system';
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

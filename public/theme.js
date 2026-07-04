const STORAGE_KEY = 'pendelgeist:theme';

// Extend this list (and add a matching CSS rule in styles.css) to add more
// themes later. "system" means no override - color-scheme: light dark
// follows the OS/browser preference.
const THEMES = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function applyTheme(themeId) {
  if (themeId === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeId);
  }
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

  const savedTheme = readSavedTheme() ?? 'system';
  select.value = savedTheme;
  applyTheme(savedTheme); // in case the inline pre-paint script (see index.html) wasn't there

  select.addEventListener('change', () => {
    applyTheme(select.value);
    saveTheme(select.value);
  });

  nav.appendChild(select);
}

buildPicker();

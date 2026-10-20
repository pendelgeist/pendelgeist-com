import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createLocalStorageStub } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEME_JS_PATH = path.join(__dirname, '../public/theme.js');

let importCounter = 0;

async function loadThemeScript({ localStorage = createLocalStorageStub() } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><nav><a href="/">Home</a></nav></body></html>');

  global.document = dom.window.document;
  global.localStorage = localStorage;

  await import(`${pathToFileURL(THEME_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document, localStorage };
}

test('renders a theme picker into the nav with every theme option', async () => {
  const { document } = await loadThemeScript();

  const select = document.getElementById('themePicker');
  assert.ok(select, 'expected a #themePicker select in the nav');
  assert.deepEqual(
    [...select.options].map(o => o.value),
    ['system', 'light', 'dark', 'ffvii', 'eva-01', 'manga-shoujo', 'manga-seinen-ink', 'manga-seinen-gekiga', 'manga-seinen-cinema', 'manga-seinen-cyber', 'gameboy', 'vaporwave', 'random']
  );
  assert.deepEqual(
    [...select.options].map(o => o.textContent),
    ['Auto', 'AMO - L', 'AMO - Kira', 'FFVII Menu', 'Eva-01', 'Manga (Shoujo)', 'Seinen (Ink Wash)', 'Seinen (Gekiga)', 'Seinen (Cinematic)', 'Seinen (Cyberpunk)', 'Game Boy', 'Vaporwave', 'Random']
  );
});

test('files the themes under labelled groups in the picker', async () => {
  const { document } = await loadThemeScript();

  const groups = [...document.querySelectorAll('#themePicker optgroup')];
  assert.deepEqual(groups.map(g => g.label), ['Standard', 'Anime & Games', 'Novelty']);
  assert.deepEqual([...groups[1].querySelectorAll('option')].map(o => o.value), ['ffvii', 'eva-01', 'manga-shoujo', 'manga-seinen-ink', 'manga-seinen-gekiga', 'manga-seinen-cinema', 'manga-seinen-cyber', 'gameboy']);
});

test('renders a reroll button in the nav, hidden by default', async () => {
  const { document } = await loadThemeScript();

  const reroll = document.getElementById('themeReroll');
  assert.ok(reroll, 'expected a #themeReroll button in the nav');
  assert.equal(reroll.hidden, true);
});

test('groups the picker and reroll button in one wrapper, so nav always has exactly two flex children', async () => {
  // Regression test: nav uses `justify-content: space-between`, so a third
  // direct child (the reroll button) would space all three apart evenly and
  // strand the picker in the middle of the bar instead of at the end.
  const { document } = await loadThemeScript();

  const nav = document.querySelector('nav');
  assert.equal(nav.children.length, 2, 'expected exactly two direct children of <nav>');

  const controls = nav.querySelector(':scope > .theme-controls');
  assert.ok(controls, 'expected a .theme-controls wrapper as the second child of <nav>');
  assert.equal(controls.contains(document.getElementById('themePicker')), true);
  assert.equal(controls.contains(document.getElementById('themeReroll')), true);
});

test('defaults to "Auto" (no data-theme override) when nothing is saved', async () => {
  const { document } = await loadThemeScript();

  assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  assert.equal(document.getElementById('themePicker').value, 'system');
});

test('applies and reflects a previously saved theme on load', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:theme', 'dark');

  const { document } = await loadThemeScript({ localStorage });

  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(document.getElementById('themePicker').value, 'dark');
});

test('picking a theme applies it to the page and saves it', async () => {
  const localStorage = createLocalStorageStub();
  const { document } = await loadThemeScript({ localStorage });

  const select = document.getElementById('themePicker');
  select.value = 'light';
  select.dispatchEvent(new document.defaultView.Event('change'));

  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(localStorage.getItem('pendelgeist:theme'), 'light');
});

test('picking "Auto" clears any theme override', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:theme', 'dark');
  const { document } = await loadThemeScript({ localStorage });

  const select = document.getElementById('themePicker');
  select.value = 'system';
  select.dispatchEvent(new document.defaultView.Event('change'));

  assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  assert.equal(localStorage.getItem('pendelgeist:theme'), 'system');
});

test('picking "Random" rolls a palette, applies it inline, saves it, and shows the reroll button', async () => {
  const localStorage = createLocalStorageStub();
  const { document } = await loadThemeScript({ localStorage });

  const select = document.getElementById('themePicker');
  select.value = 'random';
  select.dispatchEvent(new document.defaultView.Event('change'));

  assert.equal(document.documentElement.getAttribute('data-theme'), 'random');
  const bg = document.documentElement.style.getPropertyValue('--color-bg');
  assert.ok(bg, 'expected --color-bg to be set inline');

  const saved = JSON.parse(localStorage.getItem('pendelgeist:theme:palette:random'));
  assert.equal(saved['--color-bg'], bg);
  assert.equal(document.getElementById('themeReroll').hidden, false);
});

test('reloading with a saved random theme reuses its saved palette instead of rolling a new one', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:theme', 'random');
  localStorage.setItem('pendelgeist:theme:palette:random', JSON.stringify({ '--color-bg': 'hsl(1, 2%, 99%)' }));

  const { document } = await loadThemeScript({ localStorage });

  assert.equal(document.documentElement.style.getPropertyValue('--color-bg'), 'hsl(1, 2%, 99%)');
  assert.equal(
    localStorage.getItem('pendelgeist:theme:palette:random'),
    JSON.stringify({ '--color-bg': 'hsl(1, 2%, 99%)' })
  );
});

test('the reroll button replaces the saved palette for the active random theme', async () => {
  const localStorage = createLocalStorageStub();
  const { document } = await loadThemeScript({ localStorage });

  const select = document.getElementById('themePicker');
  select.value = 'random';
  select.dispatchEvent(new document.defaultView.Event('change'));
  const first = localStorage.getItem('pendelgeist:theme:palette:random');

  let rerolled = localStorage.getItem('pendelgeist:theme:palette:random');
  for (let attempt = 0; attempt < 20 && rerolled === first; attempt++) {
    document.getElementById('themeReroll').dispatchEvent(new document.defaultView.Event('click'));
    rerolled = localStorage.getItem('pendelgeist:theme:palette:random');
  }

  assert.notEqual(rerolled, first, 'expected the reroll button to replace the saved palette');
});

test('switching away from a random theme clears its inline color overrides', async () => {
  const localStorage = createLocalStorageStub();
  const { document } = await loadThemeScript({ localStorage });

  const select = document.getElementById('themePicker');
  select.value = 'random';
  select.dispatchEvent(new document.defaultView.Event('change'));
  assert.ok(document.documentElement.style.getPropertyValue('--color-bg'));

  select.value = 'vaporwave';
  select.dispatchEvent(new document.defaultView.Event('change'));

  assert.equal(document.documentElement.style.getPropertyValue('--color-bg'), '');
  assert.equal(document.getElementById('themeReroll').hidden, true);
});

test('a Random roll sets its own color-scheme, light or dark, and clears it on switching away', async () => {
  const localStorage = createLocalStorageStub();
  const { document } = await loadThemeScript({ localStorage });

  const select = document.getElementById('themePicker');
  select.value = 'random';
  select.dispatchEvent(new document.defaultView.Event('change'));
  assert.ok(['light', 'dark'].includes(document.documentElement.style.getPropertyValue('color-scheme')));

  select.value = 'manga-shoujo';
  select.dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(document.documentElement.style.getPropertyValue('color-scheme'), '');
});

test('a saved Random (Dark) becomes Random, keeping its colors and coming back dark', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:theme', 'random-dark');
  localStorage.setItem('pendelgeist:theme:palette:random-dark', JSON.stringify({ '--color-bg': 'hsl(1, 2%, 9%)' }));

  const { document } = await loadThemeScript({ localStorage });

  assert.equal(document.getElementById('themePicker').value, 'random');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'random');
  assert.equal(document.documentElement.style.getPropertyValue('--color-bg'), 'hsl(1, 2%, 9%)');
  assert.equal(document.documentElement.style.getPropertyValue('color-scheme'), 'dark');
  assert.equal(localStorage.getItem('pendelgeist:theme'), 'random');
  assert.equal(localStorage.getItem('pendelgeist:theme:palette:random-dark'), null);
});

test('a saved theme that no longer exists (Rainbow) falls back to Auto', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:theme', 'rainbow');

  const { document } = await loadThemeScript({ localStorage });

  assert.equal(document.getElementById('themePicker').value, 'system');
  assert.equal(document.documentElement.hasAttribute('data-theme'), false);
  assert.equal(localStorage.getItem('pendelgeist:theme'), 'system');
});

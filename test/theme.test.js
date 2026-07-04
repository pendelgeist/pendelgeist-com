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

test('renders a theme picker into the nav with Auto/Light/Dark options', async () => {
  const { document } = await loadThemeScript();

  const select = document.getElementById('themePicker');
  assert.ok(select, 'expected a #themePicker select in the nav');
  assert.deepEqual([...select.options].map(o => o.value), ['system', 'light', 'dark']);
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

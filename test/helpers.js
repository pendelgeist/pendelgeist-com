import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, '../public/vqar/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/vqar/app.js');

let importCounter = 0;

export function createLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
  };
}

/**
 * Builds a fetch mock over a table of { filename: jsonBody }. Requests for
 * unlisted filenames resolve as a 404, matching real gist behavior for a
 * missing file.
 */
export function createFetchStub(routes) {
  const calls = [];
  const fetchStub = async (url) => {
    const file = new URL(url).pathname.split('/').pop();
    calls.push(file);
    if (!(file in routes)) {
      return { ok: false, status: 404 };
    }
    return { ok: true, status: 200, json: async () => routes[file] };
  };
  fetchStub.calls = calls;
  return fetchStub;
}

/**
 * Loads the VQAR page DOM and (re-)imports app.js against it. Each call gets
 * a fresh module instance (via a cache-busting query string) so module-level
 * state like `seasonDataById` never leaks between tests.
 */
export async function loadApp({ fetch, localStorage = createLocalStorageStub() } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/vqar/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.localStorage = localStorage;
  global.fetch = fetch;

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { window: dom.window, document: dom.window.document, localStorage };
}

export async function waitFor(conditionFn, { timeout = 2000, interval = 5 } = {}) {
  const start = Date.now();
  while (!conditionFn()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor: condition not met before timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

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
 * Loads the VQAR page DOM and (re-)imports app.js against it. Each call gets
 * a fresh module instance (via a cache-busting query string) so module-level
 * state like `seasonDataById` never leaks between tests. No `localStorage`
 * stub: the page keeps nothing of its own, so a season is loaded once per page
 * load and held in memory for that page's lifetime.
 */
export async function loadApp({ fetch } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/vqar/index.html', runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = fetch;

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { window: dom.window, document: dom.window.document };
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

const FSAR_INDEX_HTML_PATH = path.join(__dirname, '../public/fsar/index.html');
const FSAR_APP_JS_PATH = path.join(__dirname, '../public/fsar/app.js');

/**
 * Builds a fetch mock over a table of { pathname: jsonBody }. Requests for
 * unlisted paths resolve as a 404. Keyed on the full pathname rather than the
 * filename, since the pages fetch same-origin paths where a bare filename
 * isn't enough to tell an index request from a data request (compare
 * '/fsar/data/index.json' with '/fsar/data/reviews/<id>.json').
 *
 * It stands in for the Worker's ASSETS binding in test/graphql.test.js too -
 * same route table, and the binding takes a URL where fetch takes a string.
 */
export function createPathFetchStub(routes, { base = 'http://localhost' } = {}) {
  const calls = [];
  const fetchStub = async (url) => {
    const { pathname } = new URL(url, base);
    calls.push(pathname);
    if (!(pathname in routes)) {
      return { ok: false, status: 404 };
    }
    return { ok: true, status: 200, json: async () => routes[pathname] };
  };
  fetchStub.calls = calls;
  return fetchStub;
}

/**
 * Loads the FSAR page DOM and (re-)imports its app.js against it. `search`
 * seeds the query string, which is how the page routes between the list view
 * and a single review.
 */
export async function loadFsarApp({ fetch, localStorage = createLocalStorageStub(), search = '' } = {}) {
  const html = fs.readFileSync(FSAR_INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url: `http://localhost/fsar/${search}`, runScripts: 'outside-only' });

  // jsdom reports window.scrollTo as "not implemented" on the virtual console;
  // the page calls it after rendering a review, so stub it out to keep the
  // test output clean.
  dom.window.scrollTo = () => {};

  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = localStorage;
  global.fetch = fetch;

  await import(`${pathToFileURL(FSAR_APP_JS_PATH)}?t=${importCounter++}`);
  return { window: dom.window, document: dom.window.document, localStorage };
}

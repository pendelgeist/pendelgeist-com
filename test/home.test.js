import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');

test('homepage links to VQAR, the GraphQL API, and the AMO Kenzoku Podcast', () => {
  const { document } = new JSDOM(html).window;

  const links = [...document.querySelectorAll('.show-list a')].map((a) => a.getAttribute('href'));
  assert.ok(links.includes('/vqar'), 'expected a link to /vqar');
  assert.ok(links.includes('/eva-tv'), 'expected a link to /eva-tv');
  assert.ok(links.includes('/nasubi'), 'expected a link to /nasubi');
  assert.ok(links.includes('/graphql'), 'expected a link to /graphql');
  assert.ok(
    links.includes('https://amokenzoku.com/podcast/'),
    'expected a link to the AMO Kenzoku podcast page'
  );
});

test('homepage uses the shared site stylesheet', () => {
  const { document } = new JSDOM(html).window;
  const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
  assert.ok(hrefs.includes('/styles.css'));
});

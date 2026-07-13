import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');

test('homepage links to VQAR, the GraphQL API, and amokenzoku.com', () => {
  const { document } = new JSDOM(html).window;

  const links = [...document.querySelectorAll('.show-list a')].map((a) => a.getAttribute('href'));
  assert.ok(links.includes('/vqar'), 'expected a link to /vqar');
  assert.ok(links.includes('/eva'), 'expected a link to /eva');
  assert.ok(links.includes('/graphql'), 'expected a link to /graphql');
  assert.ok(
    links.some((href) => href === 'https://www.amokenzoku.com' || href === 'https://www.amokenzoku.com/'),
    'expected a link to amokenzoku.com'
  );
});

test('homepage uses the shared site stylesheet', () => {
  const { document } = new JSDOM(html).window;
  const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
  assert.ok(hrefs.includes('/styles.css'));
});

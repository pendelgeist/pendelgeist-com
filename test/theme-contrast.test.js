import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contrastRatio } from '../public/theme-palette.js';

/**
 * WCAG AA contrast check for every fixed (non-random) theme's real CSS color
 * pairings, mirroring the values hardcoded in public/styles.css. The Random
 * Light/Dark themes already get their own generated-palette coverage in
 * theme-palette.test.js; this file is for the themes whose colors are
 * hand-picked and so can't self-correct the way rollPalette() does.
 *
 * Regression coverage for a real bug: several components render text/borders
 * on top of --color-chrome (nav bar, filter bars, eva's chrome-styled
 * buttons) using --color-text or --color-accent instead of --color-nav-link.
 * In the default Light theme, --color-chrome is intentionally
 * close to (or identical to) --color-accent, so that mismatch produces
 * unreadable or fully invisible text.
 */

const MIN_NORMAL = 4.5;
const MIN_LARGE = 3.0;
const MIN_UI = 3.0; // non-text UI component / border contrast, WCAG 1.4.11

function hex(spec) {
  const s = spec.replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const THEMES = {
  Light: {
    bg: '#f5f5f5', text: '#000', accent: '#315979', surface: '#fff', chrome: '#315979', muted: '#666', navLink: '#fff', title: '#000',
  },
  Dark: {
    bg: '#000', text: '#00a200', accent: '#f00', surface: '#111', chrome: '#000', muted: '#00a200', navLink: '#f00', title: '#f00',
  },
  Vaporwave: {
    bg: '#1a0b2e', text: '#f2e9ff', accent: '#ff71ce', surface: '#2d1b4e', chrome: '#130821', muted: '#b39ddb', navLink: '#01cdfe', title: '#ff71ce',
  },
  'FFVII Menu': {
    bg: '#0a1030', text: '#fff', accent: '#6ecfff', surface: '#14206b', chrome: '#0a1030', muted: '#9fb4e0', navLink: '#fff', title: '#fff',
  },
  Manga: {
    bg: '#f6f6f4', text: '#111', accent: '#111', surface: '#fff', chrome: '#141414', muted: '#4a4a4a', navLink: '#f6f6f4', title: '#111',
  },
  'Manga (Comedy)': {
    bg: '#fff', text: '#111', accent: '#111', surface: '#fff', chrome: '#141414', muted: '#4a4a4a', navLink: '#f6f6f4', title: '#111',
  },
  'Manga (Seinen)': {
    bg: '#ecebe6', text: '#111', accent: '#111', surface: '#fff', chrome: '#141414', muted: '#3d3d3d', navLink: '#f6f6f4', title: '#111',
  },
  'Manga (Shoujo)': {
    bg: '#fff', text: '#111', accent: '#111', surface: '#fff', chrome: '#e4e4e4', muted: '#555', navLink: '#222', title: '#111',
  },
  'Manga (4-Koma)': {
    bg: '#fff', text: '#111', accent: '#111', surface: '#fff', chrome: '#fff', muted: '#444', navLink: '#111', title: '#111',
  },
  'Game Boy': {
    bg: '#9bbc0f', text: '#0f380f', accent: '#0f380f', surface: '#8bac0f', chrome: '#0f380f', muted: '#0f380f', navLink: '#9bbc0f', title: '#0f380f',
  },
  'Eva-01': {
    bg: '#0d0912', text: '#f3eefb', accent: '#9be34f', surface: '#2b1747', chrome: '#5a2d91', muted: '#cbb8e8', navLink: '#d4f78a', title: '#9be34f',
  },
};

for (const [name, t] of Object.entries(THEMES)) {
  const bg = hex(t.bg);
  const surface = hex(t.surface);
  const chrome = hex(t.chrome);
  const text = hex(t.text);
  const accent = hex(t.accent);
  const muted = hex(t.muted);
  const navLink = hex(t.navLink);
  const title = hex(t.title);
  const surfaceText = hex(t.surfaceText ?? t.text);
  const surfaceTitle = hex(t.surfaceTitle ?? t.title);
  const surfaceAccent = hex(t.surfaceAccent ?? t.accent);
  const surfaceMuted = hex(t.surfaceMuted ?? t.muted);
  const entryBorderAccent = hex(t.entryBorderAccent ?? t.accent);
  const entryBorderMuted = hex(t.entryBorderMuted ?? t.muted);

  test(`${name}: page-level text/accent/muted meet AA against bg`, () => {
    assert.ok(contrastRatio(text, bg) >= MIN_NORMAL, `body text vs bg: ${contrastRatio(text, bg).toFixed(2)}`);
    assert.ok(contrastRatio(accent, bg) >= MIN_LARGE, `.section h2/.loading (accent) vs bg: ${contrastRatio(accent, bg).toFixed(2)}`);
    assert.ok(contrastRatio(muted, bg) >= MIN_NORMAL, `muted text vs bg: ${contrastRatio(muted, bg).toFixed(2)}`);
  });

  test(`${name}: nav-link meets AA against chrome (nav, filter bars, chrome-styled buttons)`, () => {
    assert.ok(
      contrastRatio(navLink, chrome) >= MIN_NORMAL,
      `nav-link vs chrome: ${contrastRatio(navLink, chrome).toFixed(2)} -- covers .nav-left a, .nav-title, ` +
      `.theme-picker, .theme-reroll, #runQuery, section summary h2, .filter-group label, eva's .jump-link/.detail-quote`
    );
  });

  test(`${name}: entry-node-badge's bg-on-accent/muted fill stays readable`, () => {
    assert.ok(contrastRatio(bg, accent) >= MIN_NORMAL, `badge text (bg) vs accent fill: ${contrastRatio(bg, accent).toFixed(2)}`);
    assert.ok(contrastRatio(bg, muted) >= MIN_NORMAL, `badge text (bg) vs muted fill: ${contrastRatio(bg, muted).toFixed(2)}`);
  });

  test(`${name}: surface-rendered text (cards, inputs, detail panel) meets AA against surface`, () => {
    assert.ok(contrastRatio(surfaceText, surface) >= MIN_NORMAL, `text vs surface: ${contrastRatio(surfaceText, surface).toFixed(2)}`);
    assert.ok(contrastRatio(surfaceTitle, surface) >= MIN_NORMAL, `title vs surface: ${contrastRatio(surfaceTitle, surface).toFixed(2)}`);
    assert.ok(contrastRatio(surfaceAccent, surface) >= MIN_NORMAL, `accent vs surface: ${contrastRatio(surfaceAccent, surface).toFixed(2)}`);
    assert.ok(contrastRatio(surfaceMuted, surface) >= MIN_NORMAL, `muted vs surface: ${contrastRatio(surfaceMuted, surface).toFixed(2)}`);
  });

  test(`${name}: eva timeline-node type-indicator borders meet UI contrast against surface`, () => {
    assert.ok(contrastRatio(entryBorderAccent, surface) >= MIN_UI, `character/theory border vs surface: ${contrastRatio(entryBorderAccent, surface).toFixed(2)}`);
    assert.ok(contrastRatio(entryBorderMuted, surface) >= MIN_UI, `fact/unknowable border vs surface: ${contrastRatio(entryBorderMuted, surface).toFixed(2)}`);
  });
}

// --- Theme decoration, which the variable pairings above can't see ---

const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf-8');

test('theme decoration on body::before/::after paints under the content, not over it', () => {
  assert.match(css, /:root\[data-theme\] body \{\s*position: relative;\s*isolation: isolate;\s*\}/);
  assert.match(css, /:root\[data-theme\] body::before,\s*:root\[data-theme\] body::after \{\s*z-index: -1;\s*\}/);
});

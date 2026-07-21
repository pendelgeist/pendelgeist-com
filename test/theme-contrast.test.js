import { test } from 'node:test';
import assert from 'node:assert/strict';
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
 * In the default Light theme (and Rainbow), --color-chrome is intentionally
 * close to (or identical to) --color-accent, so that mismatch produces
 * unreadable or fully invisible text. GeoCities '99 separately pairs a light
 * "silver" --color-surface with a foreground palette tuned only for its navy
 * page background, which fails outright against that surface unless
 * overridden (see the GeoCities-scoped variable block in styles.css).
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
  Rainbow: {
    bg: '#fdfdff', text: '#1a1a1a', accent: '#7a2ea1', surface: '#fff', chrome: '#1a1a2e', muted: '#555', navLink: '#fff', title: '#1a1a1a',
  },
  Vaporwave: {
    bg: '#1a0b2e', text: '#f2e9ff', accent: '#ff71ce', surface: '#2d1b4e', chrome: '#130821', muted: '#b39ddb', navLink: '#01cdfe', title: '#ff71ce',
  },
  'FFVII Menu': {
    bg: '#0a1030', text: '#fff', accent: '#6ecfff', surface: '#14206b', chrome: '#0a1030', muted: '#9fb4e0', navLink: '#fff', title: '#fff',
  },
  // FFXIV's surface/chrome are translucent (backdrop-filter over a body
  // gradient); approximated here as solid colors close to their composited
  // appearance, since exact alpha-compositing isn't the point of this test.
  'FFXIV Eorzea': {
    bg: '#0b0d12', text: '#f0e6d2', accent: '#d4af37', surface: '#181c26', chrome: '#0d0f14', muted: '#9a8f78', navLink: '#f0e6d2', title: '#d4af37',
  },
  "GeoCities '99": {
    bg: '#000080', text: '#00ff00', accent: '#ff00ff', surface: '#c0c0c0', chrome: '#000000', muted: '#ffff00', navLink: '#00ffff', title: '#ff0000',
    // GeoCities-only: the variables actually used by anything rendered on
    // --color-surface (article/.detail-panel/inputs/#result), overridden in
    // styles.css since the page-level neon palette above fails against
    // silver.
    surfaceText: '#000080', surfaceTitle: '#800000', surfaceAccent: '#800080', surfaceMuted: '#404040',
    // Also GeoCities-only: eva's .entry-type-* left borders, hardcoded
    // (not re-exported as --color-accent/--color-muted) so
    // .entry-node-badge's already-correct color-vs-accent/muted pairing
    // isn't disturbed by the surface fix.
    entryBorderAccent: '#800080', entryBorderMuted: '#404040',
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
      `nav-link vs chrome: ${contrastRatio(navLink, chrome).toFixed(2)} -- covers .nav-left a, .nav-title, .info-link, ` +
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

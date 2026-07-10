/**
 * Color math for the "Random (Light)" / "Random (Dark)" themes. Only the hue
 * and saturation of each role are actually random - lightness is always
 * solved for so every text/background pairing clears WCAG AA (4.5:1) against
 * whatever it's actually rendered on. See theme.js for how a rolled palette
 * gets applied to the page and persisted.
 */

const MIN_CONTRAST = 4.5; // WCAG AA for normal text

// Every custom property a rolled palette sets. theme.js clears exactly these
// when switching away from a random theme, so an old inline override (which
// would otherwise outrank the next theme's plain CSS rule) doesn't linger.
export const PALETTE_PROPERTIES = [
  '--color-bg',
  '--color-text',
  '--color-accent',
  '--color-surface',
  '--color-chrome',
  '--color-muted',
  '--color-nav-link',
  '--color-input-border',
  '--color-input-focus',
  '--color-title',
  '--color-guideline-border',
  '--color-article-border',
  '--color-section-border',
  '--shadow-heading',
  '--shadow-focus',
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** @param {number} h 0-360 @param {number} s 0-100 @param {number} l 0-100 */
export function hslToRgb(h, s, l) {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n) => lN - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: 255 * f(0), g: 255 * f(8), b: 255 * f(4) };
}

function channelLuminance(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two sRGB colors; always >= 1. */
export function contrastRatio(rgbA, rgbB) {
  const lA = relativeLuminance(rgbA) + 0.05;
  const lB = relativeLuminance(rgbB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

/** A hue/sat/lightness triple, bundled with its RGB so CSS text and contrast checks never drift apart. */
function color(h, s, l) {
  return { css: `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`, rgb: hslToRgb(h, s, l) };
}

function colorWithAlpha(h, s, l, alpha) {
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${alpha})`;
}

/**
 * Finds a lightness at the given hue/saturation - searching from the middle
 * toward `toward` ('light' or 'dark') - that reaches minRatio contrast
 * against bgRgb. Falls back to the extreme (0%/100%) if nothing between
 * qualifies; every caller here constrains its background lightness so that's
 * never actually reached in practice, but it keeps the search total.
 */
function findContrastingLightness(bgRgb, hue, saturation, toward, minRatio) {
  const step = toward === 'light' ? 2 : -2;
  for (let l = 50; toward === 'light' ? l <= 100 : l >= 0; l += step) {
    if (contrastRatio(hslToRgb(hue, saturation, l), bgRgb) >= minRatio) return l;
  }
  return toward === 'light' ? 100 : 0;
}

/**
 * Rolls a full random palette for "random-light" or "random-dark". The nav
 * bar is always a dark bar regardless of mode (matching the built-in
 * light/dark themes), so its text just needs to clear contrast against a
 * fixed dark chrome rather than the overall background.
 * @param {'light'|'dark'} mode
 */
export function rollPalette(mode) {
  const isDark = mode === 'dark';
  const toward = isDark ? 'light' : 'dark'; // text/accent search direction, away from the background

  const bgHue = randomInt(0, 359);
  const bgSat = randomInt(15, 45);
  const bgLightness = isDark ? randomInt(8, 15) : randomInt(92, 97);
  const bg = color(bgHue, bgSat, bgLightness);

  const surfaceLightness = clamp(bgLightness + (isDark ? randomInt(4, 8) : -randomInt(3, 6)), 0, 100);
  const surface = color(bgHue, bgSat, surfaceLightness);

  const textSat = randomInt(5, 20);
  const textLightness = findContrastingLightness(bg.rgb, bgHue, textSat, toward, MIN_CONTRAST);
  const text = color(bgHue, textSat, textLightness);

  const mutedSat = textSat + 10;
  const mutedLightness = findContrastingLightness(surface.rgb, bgHue, mutedSat, toward, MIN_CONTRAST);
  const muted = color(bgHue, mutedSat, mutedLightness);

  const accentHue = (bgHue + randomInt(60, 300)) % 360;
  const accentSat = randomInt(55, 85);
  const accentLightness = findContrastingLightness(bg.rgb, accentHue, accentSat, toward, MIN_CONTRAST);
  const accent = color(accentHue, accentSat, accentLightness);

  const chromeSat = randomInt(20, 50);
  const chromeLightness = randomInt(8, 16);
  const chrome = color(bgHue, chromeSat, chromeLightness);

  const navLinkSat = randomInt(40, 70);
  const navLinkLightness = findContrastingLightness(chrome.rgb, accentHue, navLinkSat, 'light', MIN_CONTRAST);
  const navLink = color(accentHue, navLinkSat, navLinkLightness);

  return {
    '--color-bg': bg.css,
    '--color-text': text.css,
    '--color-accent': accent.css,
    '--color-surface': surface.css,
    '--color-chrome': chrome.css,
    '--color-muted': muted.css,
    '--color-nav-link': navLink.css,
    '--color-input-border': accent.css,
    '--color-input-focus': accent.css,
    '--color-title': accent.css,
    '--color-guideline-border': isDark ? colorWithAlpha(accentHue, accentSat, accentLightness, 0.4) : color(bgHue, 15, 85).css,
    '--color-article-border': isDark ? 'transparent' : color(bgHue, 10, 85).css,
    '--color-section-border': accent.css,
    '--shadow-heading': isDark ? `0 0 20px ${colorWithAlpha(accentHue, accentSat, accentLightness, 0.5)}` : '0 0 20px transparent',
    '--shadow-focus': isDark ? `0 0 10px ${colorWithAlpha(accentHue, accentSat, accentLightness, 0.5)}` : '0 0 10px transparent',
  };
}

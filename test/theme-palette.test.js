import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, hslToRgb, rollPalette, PALETTE_PROPERTIES } from '../public/theme-palette.js';

const MIN_CONTRAST = 4.5; // WCAG AA for normal text
const ROLLS_PER_MODE = 200;

function rgbFromCss(value) {
  const match = value.match(/hsla?\(([-\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/);
  assert.ok(match, `expected an hsl()/hsla() color, got "${value}"`);
  const [, h, s, l] = match;
  return hslToRgb(Number(h), Number(s), Number(l));
}

test('contrastRatio matches known WCAG reference values', () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  assert.ok(Math.abs(contrastRatio(white, black) - 21) < 0.01);
  assert.equal(contrastRatio(white, white), 1);
  assert.equal(contrastRatio(black, white), contrastRatio(white, black), 'order should not matter');
});

test('rollPalette sets every property theme.js needs to be able to clear', () => {
  const palette = rollPalette('dark');
  for (const prop of PALETTE_PROPERTIES) {
    assert.ok(prop in palette, `missing ${prop}`);
  }
});

for (const mode of ['light', 'dark']) {
  test(`rollPalette('${mode}') always meets AA contrast for text/accent/muted/nav-link, across ${ROLLS_PER_MODE} rolls`, () => {
    for (let i = 0; i < ROLLS_PER_MODE; i++) {
      const palette = rollPalette(mode);
      const bg = rgbFromCss(palette['--color-bg']);
      const surface = rgbFromCss(palette['--color-surface']);
      const chrome = rgbFromCss(palette['--color-chrome']);

      assert.ok(contrastRatio(rgbFromCss(palette['--color-text']), bg) >= MIN_CONTRAST, 'text vs bg');
      assert.ok(contrastRatio(rgbFromCss(palette['--color-accent']), bg) >= MIN_CONTRAST, 'accent vs bg');
      assert.ok(contrastRatio(rgbFromCss(palette['--color-muted']), surface) >= MIN_CONTRAST, 'muted vs surface');
      assert.ok(contrastRatio(rgbFromCss(palette['--color-nav-link']), chrome) >= MIN_CONTRAST, 'nav-link vs chrome');
    }
  });
}

test('rollPalette picks a visibly different accent hue from the background hue', () => {
  for (let i = 0; i < ROLLS_PER_MODE; i++) {
    const palette = rollPalette(i % 2 === 0 ? 'light' : 'dark');
    const [bgHue] = palette['--color-bg'].match(/hsla?\(([-\d.]+)/).slice(1).map(Number);
    const [accentHue] = palette['--color-accent'].match(/hsla?\(([-\d.]+)/).slice(1).map(Number);
    const diff = Math.min(Math.abs(bgHue - accentHue), 360 - Math.abs(bgHue - accentHue));
    assert.ok(diff >= 60, `expected accent hue to be at least 60 degrees from bg hue, got ${diff}`);
  }
});

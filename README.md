# pendelgeist-com

Personal site, served as static assets from a Cloudflare Worker (see `wrangler.jsonc`).

## Structure

- `public/index.html` — homepage, links out to the other sites.
- `public/vqar/` — Very Quick Anime Reviews, a small vanilla-JS app.
- `public/styles.css` — shared site styles. `public/vqar/styles.css` layers VQAR-only styles on top.
- `public/theme.js` — the theme picker (see below), loaded by every page.

## Theme

Every page loads `theme.js`, which adds an Auto/Light/Dark `<select>` into the `<nav>`
and persists the choice to `localStorage` (`pendelgeist:theme`). Picking a theme sets
`data-theme="light"|"dark"` on `<html>`; "Auto" removes it and falls back to the
OS/browser preference. An inline script in each page's `<head>` applies a saved theme
before first paint to avoid a flash of the wrong theme.

The actual colors live in `styles.css` as `--color-*` custom properties defined with
`light-dark(lightValue, darkValue)`, which resolve off the *used value* of `color-scheme`
— so picking a theme just narrows `color-scheme` to `light` or `dark`
(`:root[data-theme="dark"] { color-scheme: dark; }`) rather than redefining every
variable. A future non-light/dark theme would instead override the `--color-*`
variables directly for its own `[data-theme="..."]` selector, and get added to the
`THEMES` list in `theme.js`.

## VQAR data

Review data lives in gists, not in this repo. `public/vqar/app.js` fetches a manifest
gist first (`MANIFEST_URL`), which lists each season and an absolute raw URL to that
season's own gist:

```json
{
  "currentSeason": "spring-2026",
  "seasons": [
    { "id": "spring-2026", "name": "Spring 2026", "file": "https://gist.githubusercontent.com/.../raw/vqar-season-spring-2026.json" }
  ]
}
```

Each season's `file` must be the full raw URL to its own gist — not a bare filename —
since seasons are separate gists rather than multiple files in one. Adding a new season
means creating a new gist and adding an entry to the manifest; editing an old season's
gist never touches the others.

The manifest and the *current* season are always fetched fresh. Past seasons are cached
in `localStorage` after their first load, so switching between them is free after the
first visit — clear site data to force a re-fetch. If a season's URL is wrong or its gist
is unreachable, the page shows an error naming that season instead of failing silently.

### Review shape

Each entry in a season's `reviewed` array is a single-episode review plus three optional
follow-up notes, each shaped like `{ ratingNumber, ratingText, review, dateReviewed }`:

- `fullReview` — a full-series re-review once a "Finish Ep"-rated show actually gets finished.
- `op` / `ed` — opening/ending callouts, handy for finding the year's best OP/ED later.

All three are optional and independent — add whichever applies whenever you get to it.

## Development

```
npm install
npm test
```

Tests (`test/`) run against the real `app.js` and `index.html` with a mocked
`fetch`/`localStorage` via jsdom — see `test/helpers.js`. CI runs them on every PR
(`.github/workflows/test.yml`).

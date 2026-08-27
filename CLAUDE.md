# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The README is the long-form reference — data shapes, runbooks, the reasoning behind each
decision. This file is the short version: what to run, and the conventions that are easy to
break without noticing.

## Commands

```
npm install
npm test                                   # runs test/*.test.js via node --test
node --test test/theme.test.js             # run a single test file
npm run dev                                # wrangler dev - exercises the Worker (incl. /graphql) locally
npm run deploy                             # wrangler deploy
npm run validate-vqar                      # checks every committed VQAR season for consistency
npm run validate-vqar -- ./draft.json      # or check a local file/URL directly
npm run validate-anilist                   # cross-checks VQAR titles/ids against AniList (live, slow)
npm run build-fsar-index                   # regenerate public/fsar/data/index.json from the review files
npm run build-vqar-index                   # regenerate public/vqar/data/index.json from the season files
```

Both index builders take `--check`, which exits 1 on a stale index and writes nothing —
that's what the data tests use.

There is no build/lint step. `public/` is served as-is (no bundler, no framework, no
transpilation) — only `src/worker.js` gets bundled, and only by Wrangler at deploy/dev time.
So a browser file has to be valid, runnable ES module source exactly as committed: no JSX, no
TypeScript syntax, no bare import specifiers. Types are JSDoc comments only.

## Architecture

Static site (`public/`) served from a Cloudflare Worker, plus a small GraphQL API (`src/`)
backed by the same data. Two independent things share one Worker:

- **Static assets** (`public/`): plain HTML/CSS/vanilla-JS ES modules, no build step. There
  are eight pages: `/` (home), `/vqar`, `/fsar`, `/vqar-stats`, `/nasubi`, `/eva-tv`,
  `/eva-tv/sources`, and `/graphql`. Each loads shared `/styles.css` + `/theme.js`, then its
  own page-specific stylesheet and script.
- **The Worker** (`src/worker.js`): only actually runs for non-GET/HEAD requests to
  `/graphql` — see `assets.run_worker_first` in `wrangler.jsonc`. Everything else, including
  `GET /graphql` (which serves `public/graphql/index.html`, the query explorer), is served
  directly as a static asset without invoking the Worker at all. Cloudflare Workers disallow
  async I/O at module top-level scope, so the GraphQL schema is built lazily on first request
  (`getSchema()` in `worker.js`), not at import time.

### Shared modules

Page-specific *CSS* is deliberately **not** shared — every page carries its own copy of
`.filters`/`.guidelines`/`.data-table`/etc., matching what's already there, so a restyle
never reaches across pages. Page *JS* is the opposite: when two pages need the same
behavior, it moves into a shared module at `public/` root rather than being copied.

| Module | Shared by | What it holds |
| --- | --- | --- |
| `public/inline-markdown.js` | `/nasubi`, `/fsar` | the `**bold**`/`*italic*`/`[text](url)` parser for committed prose |
| `public/streaming.js` | `/vqar`, `/fsar`, `scripts/validateSeason.js` | service keys, badge + badge-row rendering |
| `public/external-links.js` | `/vqar`, `/fsar` | the AniList/ANN/Wikipedia reference links |
| `public/data-table.js` | `/nasubi`, `/vqar-stats` | the sortable table, stat-tile grid, and bar chart |
| `public/vqar/data-paths.js` | `/vqar`, `/vqar-stats`, `src/schema.js` | the path to the VQAR season index |
| `public/vqar/rating.js` | `/vqar`, `/vqar-stats` | which rating wins once a show has both an ep-1 rating and a re-review |

Each has its own test file. Adding a shared module is the right move when a second page
needs the same behavior — don't copy the function.

### VQAR data flow

Review data is committed under `public/vqar/data/`: one file per season in `seasons/`, plus a
**generated** `index.json` naming the current season and listing where each season lives.
Regenerate it with `npm run build-vqar-index` after touching a season file —
`test/vqar-data.test.js` fails if the committed one is stale.

Two fields exist only so that index can be generated rather than hand-maintained, and
`scripts/validateSeason.js` enforces both: exactly one season carries `"current": true`
(that's where `currentSeason` comes from — move it when a season rolls over), and seasons are
ordered newest-first by parsing `<season>-<year>` out of the id, with an explicit numeric
`sortKey` as the escape hatch for an id that doesn't fit.

**Editing a season**: edit `public/vqar/data/seasons/<id>.json`, run `npm run build-vqar-index`,
run `npm test`. Adding a review = appending to that season's `reviewed` array (only `titleEN`,
`ratingText`, `dateReviewed` are required) and removing the title from `pending`/`skipped` if
it was there.

**Starting a season**: add `seasons/<season>-<year>.json` with a matching `id`, a `name`,
`"current": true`, and empty `reviewed`/`pending`/`skipped` — then **remove `current` from the
previous season**, since exactly one may carry it. Rebuild the index and run the tests. Full
runbook, with the shape of each field, is in the README under "Starting a new season".

Never hand-edit `public/vqar/data/index.json`; it's generated, and `build-vqar-index` refuses
to write it at all if any season fails validation.

Four independent consumers read that index, whose path is exported once from
`public/vqar/data-paths.js` so it can't drift:
- `public/vqar/app.js` — the display page, fetches client-side. Loads one season at a time,
  on demand.
- `public/vqar-stats/app.js` — always loads *every* season, since every stat on it is an
  aggregate. Crunching lives in `stats.js`, kept pure and DOM-free so it's testable without
  a DOM or a fetch; keep it that way.
- `src/schema.js` — the GraphQL resolvers, read the same files server-side through the
  Worker's `ASSETS` binding (`makeRootValue({ assets, origin })`, wired up in
  `src/worker.js`) rather than over the network, and reshape them to add `season`/`seasonName`
  per review, mirroring what `app.js` does on the client.
- `scripts/validate-vqar.js` — a standalone consistency checker, not part of the deployed
  site; the committed data is checked by `test/vqar-data.test.js` in CI regardless. With no
  arguments it checks the committed set (`scripts/loadTargets.js` reports `committed: true`,
  which is what makes the whole-set checks meaningful); a path passed on the CLI is treated as
  a draft, so it's exempt from the id-matches-filename and exactly-one-current rules.

### FSAR data flow

`/fsar` (Full Season Anime Reviews) is the long-form counterpart to VQAR. Its data is
committed under `public/fsar/data/`: one file per review in `reviews/`, plus a **generated**
`index.json` holding every review's card-level metadata (everything except `sections`). The
list view loads only the index; a review body is fetched when that review is opened.
Regenerate with `npm run build-fsar-index` — `test/fsar-data.test.js` fails if the committed
index is stale.

Four pieces have to agree on the review shape, so the shape lives in exactly one place:
- `public/fsar/schema.js` — statuses, formats, the fixed section list and order, and the
  small display helpers. Imported by all three of the below.
- `public/fsar/app.js` — the page. One page, two views, routed on `?show=`.
- `scripts/validateFsarReview.js` — shape validation, in the same spirit as
  `scripts/validateSeason.js`. Rejects unknown section names rather than letting the page
  silently drop them.
- `scripts/build-fsar-index.js` — runs the validator over every review, then writes the index.

A review's `status` is `wip` or `done`, and it's the only thing validation branches on: a
`wip` draft may be empty (it renders with an "In Progress" badge), a `done` one must have a
verdict one-liner and at least one written section. Reviews are not all recent shows — `year`,
`format` (TV/OVA/ONA/Movie/Special) and free-text `airedLabel` carry release info instead of a
VQAR-style season id, and episode counts are optional.

### Other pages

`/eva-tv`, `/eva-tv/sources` and `/nasubi` each read a fixed set of committed JSON with no
generated index, since the content changes rarely (`public/eva-tv/data.json`,
`public/nasubi/data/*.json`). Nasubi's three raw dataset files are themselves generated —
run `node scripts/nasubi/generate-data.js` after editing anything under
`scripts/nasubi/source/` or the categorization logic. Its `content.json` prose is *not*
regenerated: if a script change shifts a number the narrative quotes, update the prose by
hand. Both pages are documented in full in the README.

### Theme system

`public/theme.js` builds the theme `<select>` (+ a 🎲 reroll button, shown only for the two
Random themes) into every page's `<nav>`, and persists the choice to `localStorage`. Colors
are `--color-*` custom properties in `public/styles.css`:
- Auto/Light/Dark share one set of values via `light-dark()`; picking one just narrows
  `color-scheme`.
- Rainbow/Vaporwave/FFVII Menu/Eva-01 are fixed themes that override every `--color-*` (plus
  fonts, borders, radii, spacing) for their own `[data-theme="..."]` selector, with bespoke
  CSS flourishes on top. Adding a new one this way = a CSS block + an entry in the `THEMES`
  array in `theme.js`. All per-theme motion is neutralized by the blanket
  `prefers-reduced-motion: reduce` rule at the bottom of `styles.css` — keep new flourishes
  covered by it.
- Random (Light)/Random (Dark) have no fixed values — `public/theme-palette.js` rolls a
  random hue and *solves for* a lightness that clears WCAG AA contrast (4.5:1) against
  whatever it renders on, rather than picking blind. `PALETTE_PROPERTIES` in that file is the
  authoritative list of every custom property a rolled palette can set; `theme.js` clears
  exactly those when switching away from a random theme.

Each page's `<head>` has an inline pre-paint `<script>` (duplicated into all eight pages on
purpose — it must run before first paint, so it can't be a module) that re-applies the saved
theme/palette before first render. If it ever changes, change it in **every** page:
`test/pages.test.js` asserts all eight copies are identical and that they use the same
storage keys `theme.js` writes.

## Conventions

These are the ones that bite. The README explains the reasoning behind each.

**Fetching committed JSON.** Always `cache: 'no-cache'` and nothing else — it revalidates, so
an unchanged file comes back as a 304. Do not add a cache-busting query string (`?t=...`)
on top: it forces a full download every time and throws away the 304. Do not add a
`localStorage` cache of fetched data: these are same-origin assets behind a CDN, and a cache
with no version key hides an edit from returning visitors indefinitely.

**`localStorage`.** Reader preferences only (theme, spoiler state, panel width), and every
read *and* write wrapped in `try`/`catch`. With site data blocked, even reading throws — and
these calls happen at module scope, where an unguarded one takes the whole page down.

**Building DOM.** Everything renders via `document.createElement` + `textContent`, never
`innerHTML`. Committed prose is hand-written and quotes real titles; a stray `<` has to stay
text. `public/inline-markdown.js` is the only thing that turns markup into elements, and it
builds nodes too.

**Contrast.** `test/theme-contrast.test.js` checks every fixed theme against the pairings the
CSS actually produces. Two rules keep new components from breaking it: never render text or a
border on a `--color-chrome` background with anything but `--color-nav-link`; and never dim
text with `opacity` for a muted or hover look — use `--color-muted`, or invert
foreground/background, or change `text-decoration`. (A `:disabled` control is the exception.)

**Interactive elements.** Anything clickable is a real `<button>` or `<a href>`, not a
`div`/`th` with a click handler — a bare element with `tabindex` takes focus and then does
nothing on Enter. Sortable table headers follow this (`<th scope="col">` wrapping a
`<button>`, with `aria-sort` on the `th`); so do the `/fsar` cards, which are real `<a href>`
elements whose plain left click is intercepted for `history.pushState`.

## Testing conventions

Tests run against the real browser-facing files (`public/vqar/app.js`, `*.html`) via
`node --test` + jsdom, with `fetch`/`localStorage` mocked. `test/helpers.js` exports what a
page test needs: `loadApp` (the VQAR page) and `loadFsarApp`, which each build a jsdom
document from the real `index.html` and re-import the page's `app.js` against it under a
cache-busting query string, so module-level state never leaks between tests;
`createLocalStorageStub`; `createPathFetchStub`, keyed on pathname rather than filename since
every page fetches same-origin paths (`/fsar/data/index.json` vs
`/fsar/data/reviews/<id>.json`); and `waitFor`, since the pages render off a promise. The
other pages build their own loader the same way in their own test file.
`createPathFetchStub` doubles as the stub for the Worker's `ASSETS` binding in
`test/graphql.test.js`/`test/worker.test.js` — same route table, and the binding takes a URL
where `fetch` takes a string.

Committed data (`public/vqar/data/`, `public/fsar/data/`, `public/nasubi/data/`) is validated
by its own test rather than a manually-run script, since CI can check it. No separate test
build — the same ES modules that ship to the browser are imported directly into the test
process, so a shared module gets a plain unit test (`test/data-table.test.js`,
`test/streaming.test.js`, `test/external-links.test.js`, `test/rating.test.js`) with only a
jsdom `document` for setup.

When fixing a bug, write the test that fails against the old code first, and check that it
actually does.

## Workflow

After pushing commits to a feature branch in this repo, open a pull request for it
automatically — no need to ask first each time. Skip this if a PR for that branch
already exists (update the existing one instead) or if the user asks otherwise.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm install
npm test                                   # runs test/*.test.js via node --test
node --test test/theme.test.js             # run a single test file
npm run dev                                # wrangler dev - exercises the Worker (incl. /graphql) locally
npm run deploy                             # wrangler deploy
npm run validate-vqar                      # checks every committed VQAR season for consistency
npm run validate-vqar -- ./draft.json      # or check a local file/URL directly
npm run build-fsar-index                   # regenerate public/fsar/data/index.json from the review files
npm run build-vqar-index                   # regenerate public/vqar/data/index.json from the season files
```

There is no build/lint step. `public/` is served as-is (no bundler, no framework, no
transpilation) — only `src/worker.js` gets bundled, and only by Wrangler at deploy/dev time.

## Architecture

Static site (`public/`) served from a Cloudflare Worker, plus a small GraphQL API
(`src/`) backed by the same data. Two independent things share one Worker:

- **Static assets** (`public/`): everything is plain HTML/CSS/vanilla-JS ES modules,
  no build step. Each page (`index.html`, `vqar/index.html`, `graphql/index.html`) loads
  shared `/styles.css` + `/theme.js`, then its own page-specific styles/script. Two small
  modules are shared across pages rather than copy-pasted: `public/inline-markdown.js` (the
  `**bold**`/`*italic*`/`[text](url)` parser `/nasubi` and `/fsar` render prose with) and
  `public/streaming.js` (streaming service keys + badge rendering, used by `/vqar`, `/fsar`,
  and `scripts/validateSeason.js`). Page-specific CSS is deliberately *not* shared — every
  page carries its own copy of `.filters`/`.guidelines`, matching what's already there.
- **The Worker** (`src/worker.js`): only actually runs for non-GET/HEAD requests to
  `/graphql` — see `assets.run_worker_first` in `wrangler.jsonc`. Everything else,
  including `GET /graphql` (which serves `public/graphql/index.html`, the query
  explorer), is served directly as a static asset without invoking the Worker at all.
  Cloudflare Workers disallow async I/O at module top-level scope, so the GraphQL
  schema is built lazily on first request (`getSchema()` in `worker.js`), not at import
  time.

### VQAR data flow

Review data is committed to this repo, under `public/vqar/data/`: one file per season in
`seasons/`, plus a **generated** `index.json` naming the current season and listing where
each season lives (documented in the README under "VQAR data"). Regenerate it with
`npm run build-vqar-index` after touching a season file — `test/vqar-data.test.js` fails if
the committed one is stale.

Two fields exist only so that index can be generated rather than hand-maintained, and
`scripts/validateSeason.js` enforces both: exactly one season carries `"current": true`
(that's where `currentSeason` comes from — move it when a season rolls over), and seasons
are ordered newest-first by parsing `<season>-<year>` out of the id, with an explicit
numeric `sortKey` as the escape hatch for an id that doesn't fit.

Three independent consumers read that index, whose path is exported once from
`public/vqar/data-paths.js` so it can't drift:
- `public/vqar/app.js` — the display page, fetches client-side, is otherwise
  independent of everything below. Loads one season at a time, on demand.
- `src/schema.js` — the GraphQL resolvers, read the same files server-side through the
  Worker's `ASSETS` binding (`makeRootValue({ assets, origin })`, wired up in
  `src/worker.js`) rather than over the network, and reshape them to add
  `season`/`seasonName` per review, mirroring what `app.js` does on the client.
- `scripts/validate-vqar.js` — a standalone consistency checker, not part of the deployed
  site; the committed data is checked by `test/vqar-data.test.js` in CI regardless.

`public/vqar-stats/app.js` is a fourth reader, but unlike `/vqar` it always loads every
season, since every stat on it is an aggregate.

### FSAR data flow

`/fsar` (Full Season Anime Reviews) is the long-form counterpart to VQAR, and unlike VQAR its
data is committed to this repo, under `public/fsar/data/`: one file per review in `reviews/`,
plus a **generated** `index.json` holding every review's card-level metadata (everything
except `sections`). The list view loads only the index; a review body is fetched when that
review is opened. Regenerate the index with `npm run build-fsar-index` after touching a
review file — `test/fsar-data.test.js` fails if the committed one is stale.

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
`format` (TV/OVA/ONA/Movie/Special) and free-text `airedLabel` carry release info instead of
a VQAR-style season id, and episode counts are optional.

### Theme system

`public/theme.js` builds the theme `<select>` (+ a 🎲 reroll button, shown only for the
two Random themes) into every page's `<nav>`, and persists the choice to `localStorage`.
Colors are `--color-*` custom properties in `public/styles.css`:
- Auto/Light/Dark share one set of values via `light-dark()`; picking one just narrows
  `color-scheme`.
- Rainbow/Vaporwave/FFVII Menu are fixed themes that override every `--color-*` for
  their own `[data-theme="..."]` selector, plus bespoke CSS flourishes. Adding a new one
  this way = a CSS block + an entry in the `THEMES` array in `theme.js`.
- Random (Light)/Random (Dark) have no fixed values — `public/theme-palette.js` rolls a
  random hue and *solves for* a lightness that clears WCAG AA contrast (4.5:1) against
  whatever it renders on, rather than picking blind. `PALETTE_PROPERTIES` in that file is
  the authoritative list of every custom property a rolled palette can set; `theme.js`
  clears exactly those when switching away from a random theme.

Each page's `<head>` has an inline pre-paint `<script>` (duplicated per page on purpose)
that re-applies the saved theme/palette before first render, avoiding a flash of the
wrong theme. Keep it in sync across `index.html`, `vqar/index.html`, and `graphql/index.html`
if it ever changes.

### Testing conventions

Tests run against the real browser-facing files (`public/vqar/app.js`, `*.html`) via
`node --test` + jsdom, with `fetch`/`localStorage` mocked (see `test/helpers.js`,
`createFetchStub`/`createLocalStorageStub`; `/fsar` uses `loadFsarApp` +
`createPathFetchStub`, keyed on pathname rather than filename since it fetches
same-origin relative paths). Committed data (`public/vqar/data/`, `public/fsar/data/`, `public/nasubi/data/`)
is validated by its own test rather than a manually-run script, since CI can check it. No separate test build — same ES modules
that ship to the browser are imported directly into the test process.

`test/helpers.js`'s `createPathFetchStub` is keyed on pathname (every page fetches
same-origin paths), and doubles as the stub for the Worker's `ASSETS` binding in
`test/graphql.test.js`/`test/worker.test.js`.

## Workflow

After pushing commits to a feature branch in this repo, open a pull request for it
automatically — no need to ask first each time. Skip this if a PR for that branch
already exists (update the existing one instead) or if the user asks otherwise.

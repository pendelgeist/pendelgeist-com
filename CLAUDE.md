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
  no build step. Every page loads shared `/styles.css` + `/theme.js`, then its own
  page-specific styles/script. Three small modules are shared across pages rather than
  copy-pasted: `public/inline-markdown.js` (the `**bold**`/`*italic*`/`[text](url)` parser
  `/nasubi` and `/fsar` render prose with), `public/streaming.js` (streaming service keys +
  badge rendering, used by `/vqar`, `/fsar`, and `scripts/validateSeason.js`), and
  `public/vqar/data-paths.js` (the season index path, shared by `/vqar`, `/vqar-stats` and
  `src/schema.js`). Page-specific CSS is deliberately *not* shared — every page carries its
  own copy of `.filters`/`.guidelines`, matching what's already there.
- **Fetching data**: every page uses `fetch(url, { cache: 'no-cache' })` — revalidate, so an
  unchanged file costs a 304 rather than a re-download. Don't add a `?t=${Date.now()}`
  buster (it defeats the cache entirely) and don't add a `localStorage` copy of the data
  (it has no version key and goes stale on an edit). See "Caching convention" in the README.
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

**Editing a season**: edit `public/vqar/data/seasons/<id>.json`, run
`npm run build-vqar-index`, run `npm test`. Adding a review = appending to that season's
`reviewed` array (only `titleEN`, `ratingText`, `dateReviewed` are required) and removing
the title from `pending`/`skipped` if it was there.

**Starting a season**: add `seasons/<season>-<year>.json` with a matching `id`, a `name`,
`"current": true`, and empty `reviewed`/`pending`/`skipped` — then **remove `current` from
the previous season**, since exactly one may carry it. Rebuild the index and run the tests.
Full runbook, with the shape of each field, is in the README under "Starting a new season".

Never hand-edit `public/vqar/data/index.json`; it's generated, and `build-vqar-index`
refuses to write it at all if any season fails validation.

Three independent consumers read that index, whose path is exported once from
`public/vqar/data-paths.js` so it can't drift:
- `public/vqar/app.js` — the display page, fetches client-side, is otherwise
  independent of everything below. Loads one season at a time, on demand.
- `src/schema.js` — the GraphQL resolvers, read the same files server-side through the
  Worker's `ASSETS` binding (`makeRootValue({ assets, origin })`, wired up in
  `src/worker.js`) rather than over the network, and reshape them to add
  `season`/`seasonName` per review, mirroring what `app.js` does on the client.
- `scripts/validate-vqar.js` — a standalone consistency checker, not part of the deployed
  site; the committed data is checked by `test/vqar-data.test.js` in CI regardless. With no
  arguments it checks the committed set (`scripts/loadTargets.js` reports `committed: true`,
  which is what makes the whole-set checks meaningful); a path passed on the CLI is treated
  as a draft, so it's exempt from the id-matches-filename and exactly-one-current rules.

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
- Rainbow/Vaporwave/FFVII Menu/Eva-01 are fixed themes that override every `--color-*` for
  their own `[data-theme="..."]` selector, plus bespoke CSS flourishes. Adding a new one
  this way = a CSS block + an entry in the `THEMES` array in `theme.js`;
  `test/styles-contract.test.js` fails if you do one without the other.
- Random (Light)/Random (Dark) have no fixed values — `public/theme-palette.js` rolls a
  random hue and *solves for* a lightness that clears WCAG AA contrast (4.5:1) against
  whatever it renders on, rather than picking blind. `PALETTE_PROPERTIES` in that file is
  the authoritative list of every custom property a rolled palette can set; `theme.js`
  clears exactly those when switching away from a random theme.

Each page's `<head>` has an inline pre-paint `<script>` (duplicated per page on purpose)
that re-applies the saved theme/palette before first render, avoiding a flash of the
wrong theme. It has to be identical in **every** page — `test/pages.test.js` compares the
copies character for character, so changing one and not the rest fails the suite.

### Testing conventions

Tests run against the real browser-facing files (`public/vqar/app.js`, `*.html`) via
`node --test` + jsdom, with `fetch` mocked by `test/helpers.js`'s `createPathFetchStub` —
keyed on pathname, since every page fetches same-origin paths. It doubles as the stub for
the Worker's `ASSETS` binding in `test/graphql.test.js`/`test/worker.test.js`.
`createLocalStorageStub` is for the pages that still keep something per-reader (`/fsar`
spoiler state, `/eva-tv` panel width, and `theme.js` everywhere) — the VQAR pages keep
nothing, so their helpers don't wire it up. Committed data (`public/vqar/data/`,
`public/fsar/data/`, `public/nasubi/data/`) is validated by its own test rather than a
manually-run script, since CI can check it. No separate test build — the same ES modules
that ship to the browser are imported directly into the test process.

Two suites exist to catch drift between files that have to agree but can't import each
other: `test/pages.test.js` (every page's `<head>`: pre-paint script, meta description,
unique title, `lang`) and `test/styles-contract.test.js` (every `THEMES` id and every
`STREAMING_SERVICES` key has matching rules in `styles.css`, and vice versa).

## Workflow

After pushing commits to a feature branch in this repo, open a pull request for it
automatically — no need to ask first each time. Skip this if a PR for that branch
already exists (update the existing one instead) or if the user asks otherwise.

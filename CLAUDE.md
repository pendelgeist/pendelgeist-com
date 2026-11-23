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
npm run fetch-anilist-tags                 # fills each review's generated `anilist` object from AniList
npm run fetch-anilist-tags -- --from=a.json,b.json   # same, from responses to --print-queries run by hand
npm run build-vqar-index                   # regenerate public/vqar/data/index.json from the season files
```

The index builder takes `--check`, which exits 1 on a stale index and writes nothing —
that's what the data tests use.

There is no build/lint step. `public/` is served as-is (no bundler, no framework, no
transpilation) — only `src/worker.js` gets bundled, and only by Wrangler at deploy/dev time.
So a browser file has to be valid, runnable ES module source exactly as committed: no JSX, no
TypeScript syntax, no bare import specifiers. Types are JSDoc comments only.

## Architecture

Static site (`public/`) served from a Cloudflare Worker, plus a small GraphQL API (`src/`)
backed by the same data. Two independent things share one Worker:

- **Static assets** (`public/`): plain HTML/CSS/vanilla-JS ES modules, no build step. There
  are eight pages: `/` (home), `/vqar`, `/games`, `/vqar-stats`, `/nasubi`, `/eva-tv`,
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
| `public/inline-markdown.js` | `/nasubi` | the `**bold**`/`*italic*`/`[text](url)` parser for committed prose |
| `public/streaming.js` | `/vqar`, `scripts/validateSeason.js` | service keys, badge + badge-row rendering |
| `public/external-links.js` | `/vqar` | the AniList/ANN/Wikipedia reference links |
| `public/data-table.js` | `/nasubi`, `/vqar-stats` | the sortable table, stat-tile grid, and bar chart |
| `public/dates.js` | `/vqar`, `scripts/validateSeason.js` | the two date forms: a day (`isDay`) and an Eastern moment (`isMoment`, `isEasternMoment`), plus `dayOf` and `easternMoment` |
| `public/vqar/seasons.js` | `/vqar-stats`, `src/schema.js`, `scripts/` | what a season id means: `isLineup` (a `<season>-<year>` lineup vs. a shelf) and `seasonSortKey` |
| `public/vqar/data-paths.js` | `/vqar`, `/vqar-stats`, `src/schema.js` | the path to the VQAR season index |
| `public/vqar/list-entries.js` | `/vqar`, `/vqar-stats`, `src/schema.js`, `scripts/` | a `toReview`/`notReviewing` entry is a title string *or* an object with optional notes; read titles through `entryTitle` |
| `public/vqar/oped.js` | `/vqar`, `/vqar-stats`, `src/schema.js`, `scripts/validateSeason.js` | a liked OP/ED is always a list of the numbers liked (`[1]`, `[1, 2]`), never a bare `true`; read it through `isLikedOpEd`/`opEdNumbers`, never `=== true` |
| `public/vqar/reviews.js` | `/vqar`, `/vqar-stats`, `src/schema.js` | a show's `reviews` list: each review's derived stage (`reviewStage`), the current one, the first impression, and how the rating moved since (`ratingShift`) |
| `public/vqar/rating.js` | `/vqar`, `/vqar-stats`, `src/` | the show's rating is its latest review's (`effectiveRatingNumber`), a review's label falls back to its tier's (`ratingText`), which shows are still waiting on a revisit (`awaitingRevisit`) |
| `public/vqar/aired.js` | `/vqar`, `scripts/` | when a show first aired: its label, whether it differs from the lineup it sits in (`airedDiffers`) |

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

**Shows and reviews** (README → "Glossary", "Show shape"): each entry in `shows` is a **show**,
with every review of it in `reviews`, oldest first. A review is `{ episodes?, final?, ratingNumber,
ratingText?, text, dateReviewed }`. Its **stage** is derived, never stored: `episodes: 1` is the
first impression, a later one is a revisit, `final: true` is the verdict on the whole run, and a
first review with no episode-1 basis (a backfill) is just a review. The latest review's rating is
the show's everywhere. Leave `ratingText` out unless the user wrote a custom label; it falls back
to the tier's.

**Editing a season**: edit `public/vqar/data/seasons/<id>.json`, run `npm run build-vqar-index`,
run `npm test`. A first impression = appending a show to that season's `shows`:
`{ "titleEN": "...", "reviews": [{ "episodes": 1, "ratingNumber": 3, "text": "...", "dateReviewed": "..." }] }`.
`dateReviewed` is a full timestamp with the reviewer's Eastern offset like
`2026-10-08T10:30:00-04:00` — stamp it with `TZ=America/New_York date +%Y-%m-%dT%H:%M:%S%:z`, not
`date -u`: the page shows the date exactly as written, so a UTC stamp puts an evening review on
tomorrow's date. Remove the title from `toReview`/`notReviewing` if it was there.

**Dates** come in two forms (`public/dates.js`, README → "Dates"): a **day**, `YYYY-MM-DD`
Eastern, for anything where only the day matters (`watched.from`/`to`, `premieres`; stamp with
`TZ=America/New_York date +%F`), and a **moment**, an Eastern-offset timestamp, for when a review
was written (every `dateReviewed`). A review whose time isn't known gets noon Eastern that day
(`easternMoment(day)`), never midnight.

**Re-reviewing a show** (after watching more of it): append a review to that show's existing
`reviews` — `ratingNumber`, `text`, `dateReviewed` (a moment), plus `episodes` when the user says
how far in they are, or `final: true` for their verdict once they've finished it (which needs
`watched.finished`). Don't start a new entry, even for a second cour in a later season: a show
stays where it was first reviewed, and the same `anilistId` in two files is rejected. **If the
user hasn't given a rating, ask for one before saving.** Offer the
six tiers (5 Peak, Nice Ep Broh / 4 Yeah, Here's Hoping / 3 Meh, Finishing the Ep / 2 Trash, for
Second Screen Only / 1 Never, Please No More Like This Ever / 0 Dead, El-Hazard 2 Over This). A
custom `ratingText` is fine, but it still needs the tier's `ratingNumber`. The latest review's
`ratingNumber` is the show's in "Highest Rating" sorting, the rating filter, and every
`/vqar-stats` number (`effectiveRatingNumber` in `public/vqar/rating.js`), so
`scripts/validateSeason.js` rejects a review without one.

**Liking an OP/ED**: set `"op"` / `"ed"` on the show's entry. A season can have several, so it
always names the number(s): `"op": [2]` (OP 2), `"ed": [1, 3]`. If the user doesn't say which,
use `[1]`. That's the whole marking: no rating, note or date, and validation rejects a bare
`true` or anything but a list of distinct whole numbers from 1.

**Watched dates**: `"watched": { "from": "2026-04-01", "to": "2026-06-10" }` records the days
the first and last episodes were watched (days, never timestamps; Eastern, from the watch
history). For a show that wasn't finished add `"episode"`, the last one reached (`6`), plus
`"season"` for a multi-season run (`"season": 2, "episode": 6`); both are numbers, never text.
`from` is required, `to` optional. It's independent of `dateReviewed` (when a review was written).

**AniList tags**: a show's `anilist` object (format/genres/tags/studios) is generated by
`npm run fetch-anilist-tags` from its `anilistId`, and the script overwrites it on every run, so
never hand-edit it. After adding a show with an `anilistId`, rerun the script. If AniList is
unreachable from here, run the `--print-queries` queries by hand, or ask the user to, and import
the results with `--from`. The script also fills in a show's `aired` (`{ "season": "spring",
"year": 2010 }`, or `{ "year": 2026 }`) where it has none, and never overwrites one. A show with no
`anilistId` yet gets linked by search instead: `--print-search-queries`, then `--link-from=…`.
That sets `anilistId`, the tags, `aired`, and `titleJP` from AniList's native title. Never `--accept` a match the script reports as unsure without checking that
it's the same show. README → "AniList tags".

**Finishing a show**: set `"finished": true` in the show's `watched` when the user says they
watched the whole thing. It's a bare marking like op/ed, and it's independent of everything else.
Don't infer it from a revisit, which may cover only an episode or two, or from a rating, since a
season of trash can get finished too. Don't add it unless the user says so. A `final` review
requires it.

**Lineups and shelves**: a season file whose id is `<season>-<year>` is a **lineup**, an
anime season; any other id is a **shelf** (`isLineup` in `public/vqar/seasons.js` decides, so
there's no flag to keep in step). A live first impression goes in the season being reviewed, even
for an older show picked up then (its `aired` says when it aired). A backfill - reviewed after
watching a stretch of a show, whenever that was - goes in the lineup of the season it aired in
(its `aired`): create the lineup file if it doesn't exist yet (no `current`). A show with no
aired season (no AniList entry) goes in the lineup of the season it was watched in. There is no
Backlog any more; a shelf (any other id, with a numeric `sortKey`) is still understood by the
validators, stats and API, but none exists. Shows with no first impression - a backfilled
lineup's - count in every total and average but are left out of the per-season stats
(`_lineup`/`liveShows` in `public/vqar-stats/stats.js`).
README → "Lineups and shelves".

**Starting a season**: add `seasons/<season>-<year>.json` with a matching `id`, a `name`,
`"current": true`, and empty `shows`/`toReview`/`notReviewing` — then **remove `current` from the
previous season**, since exactly one may carry it. Rebuild the index and run the tests. Full
runbook, with the shape of each field, is in the README under "Starting a new season".

Never hand-edit `public/vqar/data/index.json`; it's generated, and `build-vqar-index` refuses
to write it at all if any season fails validation.

Four independent consumers read that index, whose path is exported once from
`public/vqar/data-paths.js` so it can't drift:
- `public/vqar/app.js` — the display page, fetches client-side. Loads one season at a time,
  on demand. The Season dropdown shows each season's show count, read from the index (`shows`,
  generated from each season file), so it never has to load a file to say it. To Be Reviewed / Not Reviewing are the picked season's lists (the current
  season's under All Seasons, which it loads alongside). Its chip filters (rating/streaming/extras) live in the DOM-free `filters.js`, and
  every control is mirrored into the query string with `replaceState`.
- `public/vqar-stats/app.js` — always loads *every* season, since every stat on it is an
  aggregate. Crunching lives in `stats.js`, kept pure and DOM-free so it's testable without
  a DOM or a fetch; keep it that way.
- `src/schema.js` — the GraphQL resolvers, read the same files server-side through the
  Worker's `ASSETS` binding (`makeRootValue({ assets, origin })`, wired up in
  `src/worker.js`) rather than over the network, and reshape them to add `season`/`seasonName`
  and the current rating per `Show`, and a `stage` per `Review`, mirroring what `app.js` does on
  the client. Its recommendations are two
  steps, because AniList blocks requests from Cloudflare Workers, so the site never calls it:
  `anilistQuery` builds a query for the user to run at anilist.co, and `recommend` takes the
  pasted result. The scoring is pure, in `src/recommend.js`. README → "Recommendations".
- `scripts/validate-vqar.js` — a standalone consistency checker, not part of the deployed
  site; the committed data is checked by `test/vqar-data.test.js` in CI regardless. With no
  arguments it checks the committed set (`scripts/loadTargets.js` reports `committed: true`,
  which is what makes the whole-set checks meaningful); a path passed on the CLI is treated as
  a draft, so it's exempt from the id-matches-filename and exactly-one-current rules.

### Game reviews

`/games` (Very Quick Game Reviews) is first impressions of games, VQAR-style but deliberately
small: one committed file, `public/games/data.json` (`{ "games": [...] }`), no generated index, no
filters. Shape and helpers are in `public/games/schema.js`; `scripts/validateGameReviews.js` checks
the file and `test/games-data.test.js` runs it in CI. A game is shaped like a VQAR show: `id` (slug,
used in the shareable `?game=<id>` link), `title`, optional `platform`, `reviews` (oldest first),
and `"played": { "finished": true }` only when the user says they finished it. Each review needs
`text`, `ratingNumber` (VQAR's 0–5 tiers) and `dateReviewed` (Eastern-offset timestamp, stamped the
same way as VQAR's); `ratingText` (only for a custom label), `hoursPlayed` and `final: true` (the
last review, once finished) are optional. Playing more = append to the game's `reviews` (the
latest one counts) — don't start a new entry. **If the user hasn't given a rating, ask for one
before saving.** README → "Very Quick Game Reviews page".

### Other pages

`/eva-tv`, `/eva-tv/sources` and `/nasubi` each read a fixed set of committed JSON with no
generated index, since the content changes rarely (`public/eva-tv/data.json`,
`public/nasubi/data/*.json`). Nasubi's three raw dataset files are themselves generated —
run `node scripts/nasubi/generate-data.js` after editing anything under
`scripts/nasubi/source/` or the categorization logic. Its `content.json` prose is *not*
regenerated: if a script change shifts a number the narrative quotes, update the prose by
hand. Both pages are documented in full in the README.

### Theme system

`public/theme.js` builds the theme `<select>` (+ a 🎲 reroll button, shown only for the
Random theme) into every page's `<nav>`, and persists the choice to `localStorage`. Colors
are `--color-*` custom properties in `public/styles.css`:
- Auto/Light/Dark share one set of values via `light-dark()`; picking one just narrows
  `color-scheme`.
- Vaporwave/FFVII Menu/Eva-01/Shoujo Manga/Seinen Manga/Game Boy are fixed themes that override every `--color-*` (plus
  fonts, borders, radii, spacing) for their own `[data-theme="..."]` selector, with bespoke
  CSS flourishes on top. Adding a new one this way = a CSS block + an entry in the `THEMES`
  array in `theme.js`. All per-theme motion is neutralized by the blanket
  `prefers-reduced-motion: reduce` rule at the bottom of `styles.css` — keep new flourishes
  covered by it. Full-page decoration goes on `body::before`/`::after`, which every theme
  gets at `z-index: -1` inside an isolated body, so it stays under the text.
- Random has no fixed values — `public/theme-palette.js` rolls light or dark plus a
  random hue (the palette carries its own `color-scheme`) and *solves for* a lightness that clears WCAG AA contrast (4.5:1) against
  whatever it renders on, rather than picking blind. `PALETTE_PROPERTIES` in that file is the
  authoritative list of every custom property a rolled palette can set; `theme.js` clears
  exactly those when switching away from Random.

Each page's `<head>` has an inline pre-paint `<script>` (duplicated into all eight pages on
purpose — it must run before first paint, so it can't be a module) that re-applies the saved
theme/palette before first render. If it ever changes, change it in **every** page:
`test/pages.test.js` asserts all eight copies are identical and that they use the same
storage keys `theme.js` writes. It also honors a `?theme=<id>` share link (theme.js validates,
saves and strips it; the 🔗 button next to the picker builds one).

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
`<button>`, with `aria-sort` on the `th`).

## Testing conventions

Tests run against the real browser-facing files (`public/vqar/app.js`, `*.html`) via
`node --test` + jsdom, with `fetch`/`localStorage` mocked. `test/helpers.js` exports what a
page test needs: `loadApp` (the VQAR page), which builds a jsdom
document from the real `index.html` and re-imports the page's `app.js` against it under a
cache-busting query string, so module-level state never leaks between tests;
`createLocalStorageStub`; `createPathFetchStub`, keyed on pathname rather than filename since
every page fetches same-origin paths (`/vqar/data/index.json` vs
`/vqar/data/seasons/<id>.json`); and `waitFor`, since the pages render off a promise. The
other pages build their own loader the same way in their own test file.
`createPathFetchStub` doubles as the stub for the Worker's `ASSETS` binding in
`test/graphql.test.js`/`test/worker.test.js` — same route table, and the binding takes a URL
where `fetch` takes a string.

Fixtures for shows, seasons and games come from the builders in `test/fixtures.js`
(`makeShow`, `makeSeason`, `makeGame`): a test describes the data in its vocabulary (`text`,
`revisit`, `reviews`, `shows`, `toReview`, `notReviewing`, `premieres`, `watched.from`...) and the
builder turns that into the data's actual shape. A show's rating fields given straight on
`makeShow` are its first impression (`episodes: 1`); pass `reviews` to write the list exactly. Don't hand-write the data shape in a page, stats or API
test — when the shape changes, only the builders should have to. A builder never adds a field
the test didn't give, and `test/fixtures.test.js` checks that what they build passes the real
validators. Validator tests, which are about the shape itself, are the exception.

Committed data (`public/vqar/data/`, `public/nasubi/data/`) is validated
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

# pendelgeist-com

**Status: alpha.** Personal site, actively in flux — structure, content, and conventions
here can and do change without much ceremony.

Personal site, served as static assets from a Cloudflare Worker (see `wrangler.jsonc`).
The Worker (`src/worker.js`) also backs a small GraphQL API over the same anime data.

## Structure

- `public/index.html` — homepage, links out to the other sites.
- `public/vqar/` — Very Quick Anime Reviews, a small vanilla-JS app.
- `public/fsar/` — Full Season Anime Reviews, the long-form counterpart to VQAR.
- `public/eva-tv/` — Neon Genesis Evangelion episode timeline, a small vanilla-JS app.
- `public/nasubi/` — a data analysis of Nasubi's *Susunu! Denpa Shonen* sweepstakes ordeal.
- `public/vqar-stats/` — "VQAR By The Numbers", a fun stats page over the VQAR review data.
- `public/graphql/` — a GraphQL query explorer for the API described below.
- `public/styles.css` — shared site styles. `public/vqar/styles.css` and `public/graphql/styles.css`
  layer page-specific styles on top.
- `public/theme.js` / `public/theme-palette.js` — the theme picker (see below) and the
  color-math behind the two random themes, loaded by every page.
- `public/inline-markdown.js` — the tiny `**bold**`/`*italic*`/`[text](url)` parser the
  pages that render committed prose (`/nasubi`, `/fsar`) share.
- `public/streaming.js` — streaming service metadata + badge rendering, shared by `/vqar`,
  `/fsar`, and `scripts/validateSeason.js`.
- `public/manifest-url.js` — the manifest gist URL, the one thing `public/vqar/app.js`,
  `src/schema.js`, and `scripts/validate-gists.js` all need to agree on.
- `src/worker.js` / `src/schema.js` — the Worker's fetch handler and GraphQL schema/resolvers.

## Theme

Every page loads `theme.js`, which adds a theme `<select>` into the `<nav>` and persists
the choice to `localStorage` (`pendelgeist:theme`). Picking a theme sets `data-theme="..."`
on `<html>`; "Auto" removes it and falls back to the OS/browser preference. An inline
script in each page's `<head>` applies a saved theme (and, for the random themes, its
saved palette — see below) before first paint to avoid a flash of the wrong theme.

The actual colors live in `styles.css` as `--color-*` custom properties. "Auto"/Light/Dark
define them with `light-dark(lightValue, darkValue)`, which resolves off the *used value*
of `color-scheme` — so picking Light or Dark just narrows `color-scheme` to one value
(`:root[data-theme="dark"] { color-scheme: dark; }`) rather than redefining every variable.
Rainbow, Vaporwave, FFVII Menu, and Eva-01 are fixed novelty themes that instead override
every `--color-*` directly for their own `[data-theme="..."]` selector. Beyond color, each
also gets its own `--font-heading`/`--font-body`, `--border-width`/`--border-style`,
`--radius-card`, and `--spacing-section` (the base values live in `:root`, same pattern as
the colors), plus theme-specific flourishes layered on top: Rainbow adds an animated
background wash, a gradient "frame" around every card and the nav bar, gradient text on
every heading, and confetti-colored list bullets; Vaporwave adds a hazy sunset glow, a
drifting neon grid floor, and glowing card/nav borders; FFVII Menu keeps it to a radial
background glow, a diagonal gradient/bevel on every card echoing the game's own dialog
boxes, and a pulsing "materia" glow on section headings; Eva-01 (Neon Genesis Evangelion's
Unit-01, in purple/acid-green with a MAGI-terminal monospace font) adds faint scanlines and
a quick heartbeat-style pulse on section headings. All per-theme motion is neutralized by a
blanket `prefers-reduced-motion: reduce` rule at the bottom of `styles.css`, so it never
overrides that OS/browser preference. A new theme along these lines just needs a CSS block
like those and an entry in the `THEMES` list in `theme.js`.

FFVII Menu's headings also use Reactor7, a pixel font by Caveras modeled on the original
PlayStation release's actual in-game font, self-hosted at `public/fonts/reactor7/` and
loaded via `@font-face` at the top of `styles.css`. It's licensed CC BY-NC-SA 3.0 (see
`public/fonts/reactor7/license.txt`) — non-commercial use only, with attribution — and is
deliberately only ever set at 16px multiples (`.section h2` is 2rem, `.nav-title` is 1rem),
since it's a pixel font that blurs at any other size.

### Random (Light) / Random (Dark)

These two don't have fixed colors — `public/theme-palette.js` rolls a random hue for the
background and a random (but sufficiently different) hue for the accent, then *solves for*
a lightness at each hue that clears WCAG AA contrast (4.5:1) against whatever it'll actually
render on, rather than just picking one and hoping. `test/theme-palette.test.js` rolls each
mode 200 times and checks every text/background pairing still clears that bar.

The rolled palette is saved to `localStorage` per mode (`pendelgeist:theme:palette:random-light`/
`...random-dark`), so revisiting or switching back to it reuses the same colors instead of
re-rolling — a 🎲 button appears next to the picker (only while a random theme is active) to
roll a new one on demand. Switching to any other theme clears the inline overrides so they
don't linger on top of that theme's plain CSS.

### Contrast conventions for the fixed themes

Unlike Random Light/Dark, the fixed themes (Auto/Light/Dark, Rainbow, Vaporwave, FFVII,
Eva-01) have hand-picked colors that can't self-correct — `test/theme-contrast.test.js`
checks every one of them against the real pairings the CSS actually produces, and encodes the
convention that keeps new components from breaking it:

- **Never pair `--color-text`/`--color-accent` with a `--color-chrome` background.**
  `--color-chrome` is meant for nav-bar-style UI (the nav itself, filter bars, chrome-styled
  buttons), and in some themes it's deliberately close to or identical to `--color-accent`
  (Light: both `#315979`) or close to `--color-text`'s darkness (Rainbow). Anything rendering
  text or a border on `--color-chrome` should use `--color-nav-link` instead — the variable
  specifically chosen to stay readable against it.
- **Don't dim text with `opacity` for a "muted/secondary" look** — it stacks with whatever
  color is already chosen (sometimes on top of `--color-muted`, which is already the
  de-emphasized tone) and can push a previously-fine pairing below AA depending on the theme.
  Use `--color-muted` outright instead; if a distinct hover state is needed, prefer inverting
  foreground/background or changing `text-decoration` over dimming opacity, since those don't
  put the contrast ratio at risk.

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

Each season's own gist has `id`, `name`, `reviewed`, `pending`, and `skipped`. It may also
carry a `number` (e.g. a MAL season id like `2603`) — that's optional, informational
metadata for your own reference and isn't read by the app or the manifest.

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

A review may also carry an optional `anilistId` (an AniList media id, e.g. `154587`) —
purely for linking out to that show's AniList page from VQAR and the GraphQL API. Full
show metadata (synopsis, episode counts, community scores) intentionally lives on AniList
rather than being duplicated into these gists; see "Validating against AniList" below for
finding the right id.

A review may also carry an optional `annId` (an Anime News Network encyclopedia id, e.g.
`22622`) — same idea as `anilistId`, but links out to the show's ANN encyclopedia page
instead. Add it by hand; there's no automated lookup for it like `validate-against-anilist.js`.

A review may also carry an optional `streaming` array of service keys (`crunchyroll`,
`hidive`, `youtube`, `netflix`, `hulu`, `prime`) the show is available on, e.g.
`["crunchyroll", "hulu"]` — renders as small badges on the entry. Purely informational and
hand-maintained; there's no live lookup, so it'll drift if a show leaves a service.

A review may also carry an optional `crunchyrollUrl`, `hidiveUrl`, and/or `netflixUrl` (a
direct link to the show's page on that service) — whichever of these are present makes the
matching badge ("CR", "HD", "NF") itself clickable. The other streaming badges (YouTube,
Hulu, Prime Video) stay non-clickable; there's no equivalent field for them.

A review may also carry an optional `watchProgress` (a free-text string, e.g. `"Ep 3"`) —
a silly personal tracker for how far a 4/5 ("Yeah") revisit candidate actually got before
either finishing (graduating to a `fullReview`) or stalling out again. Purely for your own
amusement; not required, and `/vqar-stats`' Revisit Candidates list stays title-only
regardless - it only shows up alongside the rest of a review on `/vqar` itself.

### Updating gist data

`scripts/update-gist.js` pushes a locally-edited season (or the manifest) straight to its
gist via the GitHub API, instead of hand-pasting JSON into the gist editor. It always runs
a season through `validateSeason` first — a season with issues is never pushed — and
prints a diff summary (titles added/removed/edited) against the live content. It's a dry
run by default; pass `--write` to actually push, which requires a `GITHUB_TOKEN` env var
(a PAT scoped to just `gist` write access).

```
npm run update-gist -- spring-2026 ./draft-season.json           # dry run: prints the diff
npm run update-gist -- spring-2026 ./draft-season.json --write   # pushes it
npm run update-gist -- manifest ./draft-manifest.json --write    # or update the manifest itself
```

### Validating gist data

`scripts/validate-gists.js` is a standalone check — it's not part of the website, just
something to run occasionally to make sure the underlying data is internally consistent.
It flags a show that's marked reviewed but still left in pending/skipped, a show listed in
both pending and skipped, duplicate entries within the same list, and reviews missing
required fields or with an unparseable date.

```
npm run validate-gists                  # fetches the live manifest and checks every season
npm run validate-gists -- ./draft.json  # or check one or more local files/URLs directly
```

### Validating against AniList

`scripts/validate-against-anilist.js` cross-checks the same gist data against
[AniList's public GraphQL API](https://anilist.co/graphiql) — one live request per show, so
it's meant to be run occasionally rather than in CI (unlike `validate-gists`, which is
purely local). For each reviewed show it either confirms an existing `anilistId` still
resolves to a matching title, or searches by title and suggests an `anilistId` to add when
it finds a confident match; pending/skipped titles just get a lighter existence check as a
spelling sanity check.

```
npm run validate-anilist                    # fetches the live manifest and checks every season
npm run validate-anilist -- ./draft.json    # or check one or more local files/URLs directly
npm run validate-anilist -- --delay=2500    # slow down if AniList starts rate-limiting
```

## Evangelion page

`public/eva-tv/` is a small standalone page at `/eva-tv`, separate from the VQAR/gist data
flow above — its content lives in `public/eva-tv/data.json`, committed to this repo rather
than a gist, since it changes far less often than a season's reviews.

It's a horizontally-scrolling timeline anchored to the 26 TV episodes plus a final "EoE"
(*The End of Evangelion*) column. The JSON has three top-level keys:

- `sources` — a dictionary of citations, keyed by a short id: `{ lang, title, url }`.
  Shared across entries so the same Wikipedia/EvaGeeks/etc. page isn't repeated inline
  every time it's cited.
- `episodes` — the columns themselves, in order: `{ number, title, subtitle? }`. `number`
  is either a TV episode int (1–26) or the string `"eoe"`.
- `entries` — everything that gets plotted onto the timeline: characters, facts, fan
  theories, and open questions, all in one flat list rather than four separate ones.
  Each has `{ id, episode, scene?, type, title, body, links, sourceRefs?, quote? }`:
  - `episode` matches an entry in `episodes[].number` — put an entry at whichever episode
    is its first meaningful point of appearance.
  - `scene` is an optional free-text marker (e.g. "Power cable severed, plug depth
    critical") for *where within* that episode, when it's clearly identifiable — left out
    otherwise rather than guessed at.
  - `type` is one of `character` / `fact` / `theory` / `unknowable`, and drives each
    node's styling on the timeline (badge letter, border style/color).
  - `links` is a list of `{ id, label }` pairs pointing at other entries — these render as
    "jump to" buttons in the detail panel, letting a theory point forward to where it's
    paid off, or a fact point forward to a theory built on it. This is deliberately
    hand-curated (not auto-derived), so where things link to is easy to keep tweaking.
  - `sourceRefs` is a list of keys into the top-level `sources` dictionary; each renders as
    a clickable citation link at the bottom of the entry's detail panel.
  - `quote` is optional: `{ lang, original, translation }` — the original-language excerpt
    a fact was actually drawn from (almost always Japanese, since most of the deeper
    production/episode-title material only exists on Japanese Wikipedia), paired with an
    English translation. Rendered as a small blockquote above the sources line. Entries
    sourced from English-language material (most of the character/theory entries) cite
    their `sourceRefs` without a `quote`, since there's no original-language excerpt to
    pair against.

`public/eva-tv/app.js` fetches `data.json` directly (no manifest indirection, since it's one
file), lays out one column per episode with its entries as clickable nodes, and opens the
selected entry in a fixed detail panel at the bottom — including its "jump to" links. A
long episode's entries flow into extra side-by-side sub-columns via plain CSS multi-column
layout (`columns` on `.episode-entries`, sized against a viewport-derived height on
`.timeline-scroll`) rather than a fixed per-episode count, so the split adapts to whatever
height is actually available in portrait or landscape. Editing the content means editing
`data.json` and redeploying — there's no live external data source to keep in sync here,
unlike VQAR.

## Nasubi page

`public/nasubi/` is a standalone page at `/nasubi`: a data analysis of Nasubi's 11-month
sweepstakes ordeal on *Susunu! Denpa Shonen* (1998-99) and the Korea sequel that followed.
Like the Evangelion page, all its content is committed JSON rather than a gist, under
`public/nasubi/data/`:

- `content.json` — the curated narrative: a `meta` block (title/subtitle/intro) plus a
  `japan` and `korea` object. Each of those is a flat map of named sections (e.g.
  `economics`, `categoryBreakdown`), rendered in the order listed in `JAPAN_SECTION_ORDER` /
  `KOREA_SECTION_ORDER` in `app.js` — reordering the narrative means editing those arrays,
  not the JSON. A section is `{ heading, body, columns?, rows?, chart?, items? }`: `body` is
  an array of paragraphs (supports `**bold**`, `*italic*`, `[text](url)` links via a small
  inline parser in `app.js`, not real Markdown); `columns`/`rows` render a sortable table;
  `chart` (`{ labelKey, valueKey }`, both matching entries in `columns`) adds a bar chart
  above it for a single numeric column; `items` (`[{ jp, en }]`) renders a bilingual list
  instead of a table, used for the Korea "oddities". `japan.keyTakeaways` and
  `korea.keyDifferences` are plain string arrays, rendered as a numbered list.
- `entries-japan.json` / `winnings-japan.json` / `entries-korea.json` — the full raw
  datasets behind the analysis (every postcard batch, every prize, every Korea entry),
  parsed from the original transcribed/translated tables. These back the "Browse the Raw
  Data" section at the bottom of the page (search by Japanese or English name, sort any
  column), independent of the curated `content.json` narrative above it.

Adding more analysis later means extending `content.json` (new section keys need adding to
the order arrays in `app.js` too) or dropping in a new dataset JSON file plus a matching
`<option>`/`DATASETS` entry for the data browser. There's no live external data source here,
same as the Evangelion page.

The three raw dataset JSON files are themselves generated, not hand-written: `scripts/nasubi/`
holds the original transcribed source tables (`source/*.md`), the categorization/parsing
scripts that turn them into stats, and `generate-data.js`, which imports those scripts'
parsing logic and writes `public/nasubi/data/{entries-japan,winnings-japan,entries-korea}.json`
plus prints every numeric table `content.json`'s narrative sections quote (category
breakdowns, food subcategory breakdown, persistence index) so a content edit can be checked
against fresh output. Run `node scripts/nasubi/generate-data.js` after editing anything in
`scripts/nasubi/source/` or the categorization logic. `content.json`'s prose isn't
regenerated — it's hand-maintained and needs updating manually if a script change shifts a
number it quotes.

## VQAR stats page

`public/vqar-stats/` is a standalone page at `/vqar-stats`, "VQAR By The Numbers" — a fun,
freer-format data analysis of the VQAR review data, in the spirit of the Nasubi page above
but computed live instead of from committed JSON, since VQAR's data (unlike Nasubi's) keeps
growing every season.

`app.js` fetches the same manifest + every season gist documented under "VQAR data" above
(sharing `/vqar/app.js`'s `localStorage` cache key prefix, so a season cached from either
page warms the cache for the other), flattens every season's `reviewed` array into one list,
and hands it to `stats.js` — a set of pure, DOM-free functions (`computeGlanceStats`,
`computeRatingDistribution`, `computeRatingsOverTime`, `computeHallOfFame`,
`computeSecondImpressions`, `computeOpEdHighlights`, `computeRevisitCandidates`,
`computeContinuationWatch`) that each derive one stat/section from the flattened review
list. Keeping these pure and separate from `app.js`'s fetch/render code is what makes them
unit-testable without a DOM or a live gist fetch — see `test/vqar-stats.test.js`.

Sections rendered from those functions: a numbers-at-a-glance stat grid, a rating
distribution bar chart (ordered low to high), average rating per season over time,
best/worst-rated shows, "Second Impressions" (how a `fullReview` re-review's rating compares
to the original episode-1 rating — a swing metric unique to VQAR's data shape), and top-rated
OP/ED callouts. Only reviews with a numeric `ratingNumber` count toward averages/rankings —
a `ratingText`-only entry is still valid, just excluded from those. Once a review has a
`fullReview`, its rating supersedes the original episode-1 `ratingNumber` everywhere ratings
get aggregated or ranked (averages, the distribution chart, Hall of Fame, Continuing Seasons
Worth Watching) — `computeSecondImpressions` is the one exception, since it exists specifically
to compare the two. `/vqar`'s own "Highest/Lowest Rating" sort follows the same rule. "Ratings
Over Time" hides itself whenever the current view (e.g. the season filter) covers just one
season, since a trend needs more than one point on it. There's no raw review browser/search on
this page — that's what `/vqar` (per-season) and `/graphql` (query anything) are for.

"Season Spotlight" is a pair of sections at the top of the page that track whichever season
is currently in view — the current season when the filter is "All Seasons" or the current
season itself, or the picked season when a past one is selected (`spotlightSeasonId` in
`applySeasonFilter()`):

- **Revisit Candidates** (`computeRevisitCandidates`) — that season's 4/5s ("Yeah") that
  haven't gotten a `fullReview` yet, i.e. shows liked enough on episode 1 to be worth
  actually going back and finishing/re-reviewing.
- **Continuing Seasons Worth Watching** (`computeContinuationWatch`) — that season's full
  lineup (pending, skipped, and reviewed titles alike) cross-checked by title against shows
  rated 4+ in an *earlier* season (judged by each season's earliest `dateReviewed`, since
  manifest order isn't guaranteed to be chronological — see `seasonEarliestTimestamp`),
  surfacing exceptions to VQAR's usual "skip continuing/returning seasons" guidance.
  Matching is a best-effort text heuristic (`normalizeBaseTitle` strips common sequel
  markers — "Season 2", "2nd Season", "Part 2", "Cour 2", roman numerals — before
  comparing), not a real season-relation lookup, so an unconventionally-named sequel can
  slip through.

A Season filter above those sections (defaults to "All Seasons") re-slices the loaded
seasons/reviews and re-runs every `compute*`/render call — including Season Spotlight's —
against just the one picked. `applySeasonFilter()` in `app.js` does the slicing, off the same
in-memory `allSeasons`/`allReviews` fetched once at load, so switching seasons never
re-fetches. The selection is linkable: it's kept in sync with the URL's `?season=` query
param via `history.replaceState` (so it doesn't spam browser history), and read back out on
load (`seasonFromUrl()`) to pre-select a season from a shared link — an unrecognized id
falls back to "All Seasons" rather than erroring.

Adding a new stat means adding a `compute*` function to `stats.js` (plus a test) and a
render function in `app.js` that calls it — no committed data to regenerate, unlike Nasubi.

## Full Season Anime Reviews page

`public/fsar/` is a standalone page at `/fsar`, "Full Season Anime Reviews" — the long-form
counterpart to VQAR. VQAR is five to ten minutes of a first episode and a one-liner on
everything in a season; FSAR is a full writeup of a show actually watched to the end, which
in practice means shows that were worth finishing. Plenty of them are decades old rather
than current-season.

Like the Evangelion and Nasubi pages (and unlike VQAR), the data is committed to this repo
rather than living in gists, under `public/fsar/data/`:

- `reviews/<id>.json` — one file per review, the full writeup. One file each so a new review
  never touches an existing one, and so a long writeup only gets downloaded when it's opened.
- `index.json` — **generated**, not hand-written: every review's card-level metadata (i.e.
  everything except its `sections`), which is all the list view needs. Rebuild it with
  `npm run build-fsar-index` after adding or editing a review; `test/fsar-data.test.js`
  fails if the committed index is stale.

### Review shape

`public/fsar/schema.js` is the authoritative description of the shape (and is imported by
the page, the index builder, and the validator so the three can't drift). A review is:

```json
{
  "id": "gunbuster",
  "status": "done",
  "titleEN": "Gunbuster",
  "titleJP": "トップをねらえ！",
  "format": "OVA",
  "year": 1988,
  "airedLabel": "1988-89",
  "episodeCount": 6,
  "episodesWatched": 6,
  "dateReviewed": "2026-03-02",
  "dateUpdated": "2026-03-09",
  "verdict": { "ratingNumber": 5, "ratingText": "Peak", "oneLiner": "..." },
  "recommendedFor": ["..."],
  "notFor": ["..."],
  "tags": ["mecha", "sci-fi"],
  "availabilityNote": "Out of print in the US; secondhand disc or bust.",
  "sections": {
    "story": ["paragraph", "paragraph"],
    "production": ["paragraph"],
    "op": { "ratingText": "Peak", "body": ["paragraph"] },
    "ed": { "ratingText": "Nice", "body": ["paragraph"] },
    "notes": [{ "heading": "...", "body": ["paragraph"] }],
    "spoilers": [{ "heading": "...", "body": ["paragraph"] }]
  }
}
```

- **`status`** is `wip` or `done`. A `wip` review is a draft still being revised — it renders
  and stays linkable, it just wears an "In Progress" badge, since these take several passes
  before they settle. It's also the one thing validation keys off: a `wip` review may be
  completely empty, while a `done` one must have a `verdict.oneLiner` and at least one
  written section.
- **`sections`** is a fixed set, all optional. `story`/`production` are arrays of paragraphs;
  `op`/`ed` add a `ratingText` alongside their body. New section names are rejected rather
  than silently dropped — anything that doesn't fit goes in `notes` (free-form
  `{ heading, body }` blocks) or `spoilers`. Keeping the layout identical across every
  writeup is the point: a link handed to someone lands them somewhere familiar.
- **`spoilers`** render collapsed, in their own section at the bottom, behind a "Reveal all
  spoilers" toggle whose state is remembered per reader (`pendelgeist:fsar:spoilers` in
  `localStorage`). Nothing spoiler-y belongs in the other sections — that separation is what
  makes a review safe to link to someone who hasn't watched the show.
- **`recommendedFor`/`notFor`** are structured rather than prose because pointing a specific
  person at a specific show is the main thing these get used for.
- **`year`/`format`/`airedLabel`** carry the release info, since these aren't organized by
  season the way VQAR is and aren't all TV: `format` is one of TV/OVA/ONA/Movie/Special, and
  `airedLabel` is free text (`"Summer 2025"`, `"1988-89"`) shown in place of the bare year.
  The page's Decade filter is derived from `year`. `episodeCount`/`episodesWatched` are
  optional and may be `null`, which older shows often want.
- **`streaming`** (plus the matching `crunchyrollUrl`/`hidiveUrl`/`netflixUrl`), `anilistId`,
  and `annId` work exactly as they do in VQAR — same keys, same badges, shared code. For a
  show no service carries, `availabilityNote` is free text saying where it actually lives.
- **`wikipediaUrl`/`wikipediaJaUrl`** are full article URLs rather than ids, since Wikipedia
  is keyed on the article title and the two language editions disagree about it. Both render
  as outbound links in the review header alongside AniList/ANN. The Japanese article is worth
  carrying separately — it is routinely far more detailed on staff and broadcast history.
- Prose supports `**bold**`, `*italic*`, and `[text](url)` via `public/inline-markdown.js`,
  same as the Nasubi page. It is not real Markdown.

### The page

One page, two views, switched on the `?show=` query param, so there's no build step or
server routing involved:

- `/fsar` — the card list, with Search / Decade / Tag / Status / Sort filters. The Decade and
  Tag options are built from the data rather than hardcoded. Decade, tag, and status
  selections are mirrored into the URL (via `history.replaceState`, so they don't spam
  browser history), making a filtered list linkable too.
- `/fsar?show=<id>` — one full review, which is the link to hand someone. Cards are real
  `<a href>` elements, so open-in-new-tab and copy-link work; a plain left click is
  intercepted and handled with `history.pushState` instead. Back/forward re-render the right
  view, and a review body is fetched at most once per session.

### Validating and rebuilding

`scripts/validateFsarReview.js` checks one review's shape; `scripts/build-fsar-index.js`
runs it over every file and refuses to write the index if anything is wrong. Both are
exercised by `test/fsar-data.test.js`, which runs in CI — unlike the VQAR gist validators,
this data is in-repo, so every PR checks it automatically.

```
npm run build-fsar-index              # regenerate index.json from the review files
node scripts/build-fsar-index.js --check   # exit 1 if it's stale, write nothing
```

## GraphQL API

`GET /graphql` serves a small vanilla-JS query explorer (`public/graphql/`); `POST /graphql`
runs a query against a schema (`src/schema.js`) built with `graphql-js` and executed in the
Worker. Both routes are handled by `src/worker.js`, which otherwise just forwards every
other request to the static assets — the VQAR page itself is untouched and still fetches
the gists directly, client-side.

The API fetches the same manifest + per-season gists documented above, reshaping each
review to add its `season`/`seasonName`, the way `public/vqar/app.js` does on the client.

Gist fetches (manifest and each season) are cached at the edge via `src/cache.js`, keyed
on URL, for 10 minutes — shows are added at most a few times a day, often zero, so a
query lagging behind a fresh edit by up to that long is a reasonable trade for cutting
nearly all repeat gist fetches. A failed fetch is never cached, so an outage isn't stuck.
`caches.default` isn't available under `node --test`, so tests exercise it via a small
in-memory stub (see `test/cache.test.js`) and otherwise just fall back to a plain fetch.

```
type Query {
  seasons: [SeasonSummary!]!    # every season in the manifest (id + name only)
  currentSeason: Season         # the manifest's current season, with full review data
  season(id: ID!): Season       # a specific season's full data, by id
}
```

Example request:

```
curl -X POST https://pendelgeist.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ currentSeason { name reviewed { titleEN ratingText } } }"}'
```

CORS is open on `/graphql`, so it's queryable from other origins too. Because the Worker
now has a `main` script (`src/worker.js`) instead of serving assets only, `/graphql` is
listed under `assets.run_worker_first` in `wrangler.jsonc` — otherwise Cloudflare would
serve the static explorer page for every method, including `POST`, without ever running
the Worker.

## Development

```
npm install
npm test
npm run dev     # wrangler dev, for exercising the Worker (including /graphql) locally
npm run deploy  # wrangler deploy
```

Tests (`test/`) run against the real `app.js` and `index.html` with a mocked
`fetch`/`localStorage` via jsdom — see `test/helpers.js`. The GraphQL schema/resolvers
(`test/graphql.test.js`) and the Worker's routing (`test/worker.test.js`) are tested the
same way, with `fetch` mocked instead of hitting the real gists. CI runs them on every PR
(`.github/workflows/test.yml`).

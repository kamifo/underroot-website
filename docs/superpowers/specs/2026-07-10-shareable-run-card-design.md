# Shareable Run Card — Design

**Date:** 2026-07-10
**Status:** Approved (pending spec review)

## Summary

Add a standalone, linkable page for a single run — the same "playing card" that
today only appears as a modal on the Maw's Ledger boards — reachable at
`/r/<share_id>`. The page carries per-run Open Graph / Twitter meta so links
unfurl a rich preview on Discord/X/WhatsApp/etc., backed by a server-generated
1200×630 unfurl image, plus on-page social share buttons.

Ties into the Maw's Ledger redesign: the existing card modal gains a Share
action, and the boards expose each run's share id so any listed run is one click
from a shareable link.

### Locked design decisions

- **Page layout:** "Card + context" (Direction B) — the card on the left; a
  headline, a line of flavour, the fuller stat ledger, and an "Explore the full
  Ledger →" CTA on the right; share bar beneath.
- **Unfurl image:** "Horizontal dossier" (Option 1) — digger portrait left; name
  + epitaph + a three-stat row (Days / Descent / Lineage) right; `underroot.se`
  brand mark; site palette (clay accents, fang motif, Press Start 2P).
- **Identity:** a new **`share_id`** distinct from `run_uuid`. `run_uuid` stays
  the private write key; `share_id` is the public, listable id.
- **`share_id` format:** 12-char hex, DB-generated.
- **Unfurl generation:** dynamic PNG via `@resvg/resvg-wasm`, reusing `digger.js`
  through a new SVG `CI` implementation.
- **Entry points:** direct/shared links (primary) **plus** the board tie-in.
- **Share targets:** Copy link + native Web Share (always); WhatsApp, X, Reddit,
  Bluesky; Discord via paste-to-unfurl.

## Non-goals

- Game-side changes. The game repo will build the death-screen share link from
  the `url` that `submit-run` now returns; that work lives in the game repo.
- A public JSON run endpoint (`/api/run`). Nothing needs it — the card route and
  OG route share a server-side DB helper, and the boards already carry the
  `share_id`. Not built (YAGNI).
- Editing/deleting shared cards; per-run privacy toggles. Only non-quarantined
  runs are viewable; that is the whole access model.

## Architecture

### 1. Schema (`db/schema.sql`)

Add one column to `runs`:

```sql
share_id TEXT UNIQUE NOT NULL
  DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
CREATE INDEX IF NOT EXISTS runs_share_idx ON runs (share_id);
```

- 12 hex chars ≈ 48 bits — unguessable / non-enumerable at this scale.
- DB-side volatile default means `ALTER TABLE ... ADD COLUMN` backfills every
  existing row with a distinct id automatically — no backfill script.
- Applied by hand in the Neon console (project convention — no migration tool),
  and reflected in `db/schema.sql` as the source of truth. For the existing
  table:
  `ALTER TABLE runs ADD COLUMN share_id TEXT UNIQUE NOT NULL DEFAULT substr(replace(gen_random_uuid()::text,'-',''),1,12);`
  then `CREATE INDEX ...`.

### 2. Ingest (`_lib/db.js`, `submit-run.js`)

- `upsertRun` gains `RETURNING share_id` and returns it. `share_id` is never in
  the `INSERT` column list nor the `ON CONFLICT DO UPDATE SET` list, so:
  - first insert → the DB default assigns a fresh id;
  - re-POST of the same `run_uuid` (run continues) → the existing id is retained
    (the shared link stays stable across a run's lifetime).
- `submit-run` returns `{ ok: true, url: "<origin>/r/<share_id>" }` instead of
  `{ ok: true }`. Additive and backward-compatible. `<origin>` is derived from
  the request (`x-forwarded-proto` + `x-forwarded-host`/`host`), with an optional
  `SITE_ORIGIN` env override.
- Quarantined runs still return the same shape (a `url` is returned but the card
  route will 404 it — no information leak beyond "not viewable").

### 3. Server read helper (`_lib/db.js`)

`getRunByShareId(sql, id) -> row | null`

```sql
SELECT digger_name, gen, days, depth, cause,
       villager_deaths, blocks, peak_population,
       payload->'cosmetics' AS cosmetics,
       payload->'peaks'->>'gold' AS gold,
       received_at::date AS date
FROM runs
WHERE share_id = ${id} AND NOT quarantined
LIMIT 1
```

Shared by the card route and the OG route — no internal HTTP hop, one source of
truth for "what a card knows". `gold` is null for runs with no gold peak; the
"greatest hoard" context row is simply omitted in that case (as `stats.js`
already does).

### 4. Card page (`api/card.js`, served at `/r/:id`)

- `vercel.json` (new — first in the repo) rewrites `/r/:id → /api/card?id=:id`.
- Reads the run via `getRunByShareId`.
- **Found:** returns a full HTML document, server-rendered, containing:
  - `<title>` + `<meta name="description">` describing the run;
  - Open Graph: `og:title`, `og:description`, `og:image` (absolute
    `<origin>/api/og?id=<id>`), `og:image:width/height` (1200/630), `og:url`,
    `og:type=article`;
  - Twitter: `twitter:card=summary_large_image`, `twitter:title/description/image`;
  - the Direction-B page body (matches the site chrome: back link to the Ledger,
    Play Free button, footer);
  - the run inlined as `<script type="application/json" id="run-data">` so the
    client hydrates the canvas with **no extra fetch**;
  - `<script type="module" src="/assets/card-page.js">`.
- **Missing / quarantined:** a themed 404 HTML page ("The Maw has no record of
  this run"), HTTP 404.
- **Escaping:** this is a new server-rendered-HTML surface. All player-provided
  strings (`digger_name`, and anything derived) are HTML-escaped in text context
  and attribute-escaped in meta `content="..."`. A small `escapeHtml` /
  `escapeAttr` helper; unit-tested against `"`, `<`, `>`, `&`, `'`.

### 5. OG image (`api/og.js`, `/api/og?id=<id>` → `image/png`)

- Reads the run via `getRunByShareId`.
- `buildOgSvg(run)` (`_lib/og-card.js`, pure) composes the 1200×630 Option-1 SVG:
  background gradient + warm glow, the digger on the left via `diggerSvg`, and
  the text block (kicker "The Maw's Ledger", name, epitaph, three stat tiles) +
  `underroot.se` brand mark. All text values escaped for XML.
- Rasterize with `@resvg/resvg-wasm`:
  - `initWasm` once per instance (module-level, awaited lazily);
  - fonts bundled and registered (resvg-wasm ships no system fonts):
    `PressStart2P-Regular.ttf` (name/stats/kicker) and a serif TTF, e.g.
    `PTSerif-Italic.ttf` (epitaph). Stored under `api/_lib/fonts/`.
- **Caching:** `Cache-Control: s-maxage=300, stale-while-revalidate=86400`.
  Not immutable — a run can be re-POSTed while play continues. (Platforms cache
  unfurls on their own side regardless; perfect freshness isn't achievable.)
- **Failure modes never 500 the unfurl:** missing id, DB error, or rasterizer
  error → return a static fallback PNG (the Maw) with a short cache and log the
  error. A shared link always yields a branded image.

### 6. Digger → SVG (`assets/digger-svg.js`)

- `SvgCI` implements the five `CI` methods (`draw_rect`, `draw_circle`,
  `draw_colored_polygon`, `draw_line`, `draw_polyline`) as SVG element strings,
  reusing the `css()` colour convention.
- `diggerSvg(loadout, size) -> string` wraps the emitted elements in a
  `<g transform="translate(size/2, size/2 + 31*scale) scale(scale)">` matching
  `drawDigger`'s transform (`scale = size / 76`).
- Imports `drawFull`, `Color`, `V`, `Rect2` from `digger.js`. **`digger.js` is
  unchanged** — it stays the single source of geometry; the SVG port only swaps
  the sink. (`drawFull` is already exported.)
- Runs server-side under Node ESM (`"type": "module"`); it never touches
  `canvas`/DOM (only `drawDigger` does, which the OG path does not call).

### 7. Client (`assets/card-page.js`)

- Reads `#run-data`, draws the digger via existing `drawDigger` onto the page's
  portrait canvas, renders the Direction-B ledger rows.
- Wires share actions against `location.href`:
  - **Copy link** (primary) — clipboard, with a "Copied" confirmation;
  - **Native share** — `navigator.share(...)` when available (mobile), else the
    button is hidden;
  - **WhatsApp** — `https://wa.me/?text=<text+url>`;
  - **X** — `https://twitter.com/intent/tweet?text=<text>&url=<url>`;
  - **Reddit** — `https://www.reddit.com/submit?url=<url>&title=<title>`;
  - **Bluesky** — `https://bsky.app/intent/compose?text=<text+url>`;
  - **Discord** — no intent URL; a small "paste the link to unfurl" hint next to
    Copy link.

### 8. Shared formatting (`assets/format.js`)

`CAUSE_LABELS`, `num`, `metres`, `roman`, `fmtDate` are duplicated across
`stats.js` and `player-card.js`. Extract them into `assets/format.js` and import
from all three consumers (`stats.js`, `player-card.js`, `card-page.js`) rather
than adding a third copy. Behaviour-preserving refactor of code we're already
touching.

### 9. Board tie-in (`api/stats.js`, `api/leaderboard.js`, `assets/player-card.js`)

- Add `share_id` to the `SELECT`s feeding the lineage board, unbroken board
  (`api/stats.js`), and both leaderboard queries (`api/leaderboard.js`); pass it
  through on each row.
- `player-card.js`: `attachCard` carries `share_id` into the normalized run; the
  modal gains a **Copy link** button and an **Open card ↗** link to
  `/r/<share_id>`.
- The modal now has multiple focusable elements. Update the focus trap: the
  current handler hard-pins Tab to `.pc-close`; change it to cycle among all
  focusable elements in the card (close + share controls).

## Data flow

```
Game death screen ──POST /api/submit-run──▶ upsert (RETURNING share_id)
                                             └─▶ { ok, url: /r/<share_id> }

Player shares /r/<id>
   │
   ├─ crawler (Discord/X/…) ─GET /r/<id>─▶ api/card.js ─▶ HTML + OG meta
   │                          └─GET /api/og?id=<id>─▶ api/og.js
   │                                 getRunByShareId ─▶ buildOgSvg ─▶ resvg ─▶ PNG
   │
   └─ human ─GET /r/<id>─▶ api/card.js ─▶ HTML (inlined run JSON)
                                   └─▶ card-page.js draws digger + wires share

Ledger board row ──click──▶ player-card modal ──Share──▶ copy /r/<id>
```

## Error handling

| Case | Card route (`/r/:id`) | OG route (`/api/og`) |
|---|---|---|
| Bad/missing/quarantined id | Themed 404 HTML | Static fallback PNG |
| DB error | 500 (generic) | Static fallback PNG (logged) |
| Rasterizer error | — | Static fallback PNG (logged) |
| Player-string injection | Escaped in HTML + meta | Escaped for XML |

## Testing

Pure `node --test` units, matching the existing `_lib` / `digger` test style:

- **`assets/digger-svg.test.js`** — a known loadout emits the expected SVG
  primitives (counts/shape of rect/circle/polygon), transform wrapper present.
- **`api/_lib/og-card.test.js`** — `buildOgSvg` output contains the name and the
  three stat values; markup in a hostile `digger_name` is escaped; dimensions are
  1200×630.
- **`api/card.test.js`** — HTML/meta builder escapes `"`, `<`, `>`, `&`, `'` in
  name and derived title/description; absolute `og:image`/`og:url` built from a
  given origin.

Manual acceptance:

- `node scripts/dev-server.mjs` + `node scripts/seed-stats.js`, capture a
  `share_id` from the DB (or add a line to `seed-stats.js` printing one sample
  `/r/<id>`), then load `/r/<id>` and `/api/og?id=<id>`; verify the digger
  matches the modal card and the unfurl renders.
- Run `/r/<id>` through an OG validator (e.g. opengraph.xyz) to confirm the
  card unfurls.

## Dependencies

- **New:** `@resvg/resvg-wasm` (pure-wasm SVG→PNG; no native binary — safe on
  Vercel Node functions).
- **New assets:** `PressStart2P-Regular.ttf`, `PTSerif-Italic.ttf` (or
  equivalent serif) under `api/_lib/fonts/`; a static fallback OG PNG under
  `assets/images/`.

## Security & privacy

- `share_id` is public and listable; `run_uuid` (the upsert write key) is never
  exposed. Listing `share_id` on the boards cannot be used to overwrite a run.
- Only non-quarantined runs are viewable (`getRunByShareId` filters them).
- Server-rendered HTML/meta and the OG SVG are new injection surfaces; all
  player strings are escaped (previously everything was client-side
  `textContent`).

## Files

**New:** `vercel.json`, `api/card.js`, `api/og.js`, `api/_lib/og-card.js`,
`assets/digger-svg.js`, `assets/card-page.js`, `assets/format.js`,
`api/_lib/fonts/*.ttf`, `assets/images/og-fallback.png`, plus the three test
files.

**Modified:** `db/schema.sql`, `api/_lib/db.js`, `api/submit-run.js`,
`api/stats.js`, `api/leaderboard.js`, `assets/player-card.js`, `assets/stats.js`,
`api/README.md`, `package.json`.

# The Maw's Ledger — Stats Page Redesign (Phase 1)

**Date:** 2026-07-09
**Repo:** underroot_website (website-only; no game-client changes)
**Status:** Design — awaiting review

## Context

`stats.html` today is a correct but flat dashboard: a hero tile row, two leaderboards, a superlatives row, and a wall of seven charts. It reads like a spreadsheet and gives a first-time visitor no reason to scroll or share. The data pipeline (Neon Postgres ← `/api/submit-run`, aggregated by `/api/stats`) is solid and stays as-is.

This is **Phase 1 of a 4-phase roadmap** agreed during brainstorming:

1. **The Ledger redesign** ← this spec (website-only)
2. ~~Real digger avatars~~ — **pulled into Phase 1** (it's a code port, needs no art)
3. Personal permalink (`stats.html?run=<uuid>`) — small game change + website
4. My Village (stable install id) — game + website

Phases 3–4 get their own specs later. This spec covers **only** what ships without touching the game.

## Goals

Turn the stats page into a **scroll-driven "story"** in the game's voice — the Maw narrating the community's collective saga — while keeping every real aggregate. Concretely:

- A cinematic **hero** on the existing `The_Maw.png` art, with headline KPIs overlaid.
- **Narrative beats** that pair a line of prose with one inline visual (not a wall of charts).
- Full-bleed **art dividers** between sections (parallax), using `The_Village.png` / `Underground.png`.
- **The Hall of the Great** — the two existing leaderboards, restyled, each row showing the player's **real, procedurally-rendered digger** (not a dot).
- **The Hall of Fools** — "Dubious Honours": silly, screenshot-bait awards computed from existing data.
- **The Dig** — the depth charts, restyled and framed.
- A **full leaderboard** page (the top-20 boards become "view all").

## Non-Goals (explicit scope fence)

- **No game-client changes.** No new payload fields, no share-button changes, no install id.
- **No personalization.** No `?run=` / `?me=` views (Phases 3–4).
- **No new death-moment data.** This is why the *Well-Fed Corpse* award (most stored food at death) is **dropped** — that field isn't in the payload today.
- No changes to `submit-run`, validation, or plausibility.

## Architecture

Three units, each independently testable:

### 1. `assets/digger.js` — the digger renderer (port)

A standalone canvas module that draws a digger from a `cosmetics` loadout dict, ported **1:1** from the game's `scripts/world/DiggerRenderer.gd`.

- **Public API:** `drawDigger(canvasEl, loadout, { box })` — clears the canvas and draws the figure scaled to fit a `box`×`box` square, feet-down. Mirrors the GDScript `draw_slot_icon(..., "form")` framing: figure is ~76 units tall, origin translated to bottom-centre, `scale = box / 76`.
- **Primitive mapping** (the whole port is this table applied mechanically):
  | GDScript (`ci`) | Canvas 2D (`ctx`) |
  |---|---|
  | `draw_rect(Rect2(x,y,w,h), c)` | `fillStyle=c; fillRect(x,y,w,h)` |
  | `draw_circle(p, r, c)` | `arc(p.x,p.y,r,0,2π); fill()` |
  | `draw_colored_polygon(pts, c)` | `beginPath; moveTo/lineTo…; fill()` |
  | `draw_line(a,b,c,w)` | `lineWidth=w; moveTo;lineTo; stroke()` |
- **Colors:** `Color(r,g,b,a)` floats → `rgba(r*255,g*255,b*255,a)`; `Color.html("#hex")` → the hex. A small `COSMETIC_COLORS` constant holds the **skin** and **tunic-dye** hex values (the only lookups the renderer does via `DataRegistry`). Copied from the game's `data/cosmetics.json`; `hair_color` / `beard_color` need no table (they ride in the loadout as hex already).
- **`low_perf` is always `false`** on web (full detail).
- **Defaults:** every slot read uses `loadout.get(slot, default)` in GDScript; the JS port mirrors each default, so older runs that only carry `{headwear, tunic_dye}` still render a complete humble digger.
- **Maintainability note (important):** keep `digger.js` **structurally identical** to `DiggerRenderer.gd` — same function names, order, and magic numbers — and stamp a header comment `// ported from DiggerRenderer.gd @ <commit>`. When the game adds a cosmetic, the change is a trivial diff to carry over. This duplication is the accepted cost of rendering real diggers on the web without art.

### 2. Server aggregates — Hall of Fools + full boards

**`/api/stats` gains a `fools` object.** Each award is a small, plausibility-respecting query over `WHERE NOT quarantined`. Awards with no qualifying run return `null` and the tile is hidden.

| Award | Rule | Returns |
|---|---|---|
| **Speedrun to Oblivion** | count of runs with `first_death_days = 0` | `{ n }` (reuses existing `superlatives.day0_deaths`) |
| **Hoarder of Nothing** | longest run that ended holding no gold: `NOT (payload->'peaks' ? 'gold')`, `ORDER BY days DESC` | `{ digger_name, days }` |
| **The Overconfident** | deepest dig among runs that died young (`days <= 15`), `ORDER BY depth DESC` | `{ digger_name, depth, days }` |
| **Groundhog Village** | run with the most generations lost on a single day — max count of `lineage` entries sharing a `days` value | `{ digger_name, n }` |
| **Scratched the Surface** | longest-lived village that barely dug (`days >= 20`), `ORDER BY depth ASC, days DESC` | `{ digger_name, days, depth }` |

The award-selection SQL is added to `stats.js`'s handler; the cache header (`s-maxage=300`) already amortizes the extra queries. The pure "which row wins" logic for any award that can be expressed over already-fetched rows is extracted into a testable helper where practical.

**New `api/leaderboard.js`** — `GET /api/leaderboard?board=lineage|unbroken&offset=<n>` returns the next page (page size 50, capped) of the same ordering `/api/stats` uses, so "View full board" reads identically to the embedded top-20. Same CORS/`getSql` pattern as existing endpoints. Whitelist `board` to the two known values; clamp `offset`.

### 3. `stats.html` + `assets/stats.js` — the page

`stats.html` is restructured into the scroll sequence (hero → beats → dividers → halls → dig → footer). `assets/stats.js` keeps its spine — `fetch('/api/stats')`, the **0-run empty state**, the **error state**, `Number()` bigint handling, `metres()`/`num()`, `el()` `textContent` safety, and the chart.js setup — and gains DOM-building for the new sections. Preserved invariants:

- **Every player-provided string still goes through `el(tag, text)` / `textContent`.** Digger rendering is canvas (no injection surface). Award subtitles built from `digger_name` use `textContent`.
- **`metres(tiles) = round(tiles × 1.5)`** stays the depth convention everywhere (the earlier mockups showed raw tile numbers — the real page uses `metres()`).
- Charts stay chart.js with the existing clay/red palette; the two narrative-beat visuals (survival line, cause bars) may be lightweight inline SVG/CSS to sit naturally in prose, or small chart.js instances — implementer's choice, whichever reads cleaner in the beat.

**Page sequence:**

1. **Hero** — full-bleed `The_Maw.png`, gradient scrim, title "The Maw's Ledger", and 4 KPI tiles overlaid from `totals`: souls claimed, villages fallen (`runs`), deepest dig (`metres(deepest)`), longest hold (`longest` days).
2. **Beat I — "The Shovel"** — prose + the survival curve (`charts.survival`).
3. **Beat II — "The Fall"** — prose + cause breakdown (`causes`) as ember bars.
4. **Divider** — `The_Village.png`, parallax, Maw quote.
5. **The Hall of the Great** — Longest Lineages (`boards.lineage`) + The Unbroken (`boards.unbroken`), each row rendering a real digger via `drawDigger` from `r.cosmetics`; "View full board" → `leaderboard.html`.
6. **The Hall of Fools** — `fools` awards as medal tiles; null awards hidden.
7. **Divider** — `Underground.png`, Maw quote.
8. **The Dig** — progression band, depth histogram, scatter (`charts.*`), restyled.
9. **Footer** — existing play CTA + share prompt.

**New `leaderboard.html`** — a simple full-width table page reading `/api/leaderboard`, with the same digger avatars and "Load more" pagination. Shares the page CSS/footer.

## Data-sparsity behavior

Production launches near-empty (few real runs — see the earlier telemetry finding). The page must degrade, not look broken:

- **0 runs:** existing empty state ("be the first — share from the death screen"). Unchanged.
- **Low but non-zero:** boards render however many rows exist; Fools tiles with no qualifier are hidden; the progression chart (needs ≥3 runs per day) hides itself when `charts.progression` is empty rather than drawing an empty box.
- Local development uses `scripts/seed-stats.js` (existing) plus, optionally, the FriarTuck2 telemetry-derived run for a realistic preview.

## Testing

- **Pure units get tests** (matching the repo's `_lib/*.test.js` style): the `COSMETIC_COLORS` resolution + any extracted Fools-selection helper. A light `digger.js` smoke check that `drawDigger` runs against a stub 2D context without throwing for (a) a full loadout and (b) a `{headwear, tunic_dye}`-only loadout.
- **DB-backed endpoints** (`fools` queries, `leaderboard.js`) are verified manually against the local dev-server + seed data (`scripts/dev-server.mjs`), consistent with how existing endpoints are checked.
- **Visual verification** via the dev server: hero/art/scroll on desktop + mobile widths, digger avatars in board rows, graceful degradation at 0 / 1 / many runs.

## Rollout

Single Vercel deploy (direct-to-main, per this repo's flow). No migration, no schema change, no game release required. Fully reversible by reverting the commit.

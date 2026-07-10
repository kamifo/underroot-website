# Stats: record attribution + tiles/discoveries metrics

**Date:** 2026-07-10
**Status:** Approved, ready for planning

## Problem

Two gaps on the community stats page (`stats.html` / `assets/stats.js`, fed by `api/stats.js`):

1. **No attribution on record tiles.** The superlative tiles — *greatest hoard*, *most souls lost in one village*, *longest lineage* — show a bare number and no digger. The API computes them with scalar `max()`, which discards the row, so the front-end has no name to render. (The Hall of Fools tiles directly below already show `digger_name`, because they use `ORDER BY … LIMIT 1`.)

2. **Depth is a poor headline stat.** Depth is capped (~340 raw units → 510m), so every surviving village clusters at the ceiling and the stat stops discriminating between players. More interesting, wide-ranging per-run metrics are already collected but not surfaced:
   - `blocks` (tiles dug), range `0–5,000,000`, already summed as `totals.blocks` in the API but never rendered.
   - `discoveries`, range `0–500`, a real column (`db.js`) never aggregated or shown.

## Goals

- Attribute the record-holder tiles to the digger who set them, as clickable player cards consistent with the leaderboard rows.
- Promote a wide-ranging dig metric (tiles clawed) into the hero, replacing the saturated depth KPI.
- Add two leaderboards — by tiles dug and by discoveries — where players actually spread out.

## Non-goals

- No changes to the full-board page (`leaderboard.html` / `api/leaderboard.js`). The two new boards are top-20 only, no "View all" link (easy follow-up if wanted later).
- No new site-wide "total discoveries" hero KPI (keeps the hero a clean 4-column grid; the interesting *range* lives in the new leaderboard).
- Depth is not removed — it remains a column on the lineage/tiles boards and feeds the depth charts; it is only demoted out of the hero.

## Data facts (verified)

- `blocks`, `discoveries`, `discovery_pct`, `villager_deaths`, `gen`, `depth`, `days` are all top-level columns on `runs` (`api/_lib/db.js` insert list).
- Gold lives in the JSON payload: `payload->'peaks'->>'gold'` (not every run has it — guard with `payload->'peaks' ? 'gold'`).
- `cosmetics` for the avatar is `payload->'cosmetics'`.
- `share_id` is the stable public id used by `attachCard` / the `/r/<id>` card route.
- `totals.blocks` is already computed in the totals query; `totals.deepest` is used *only* by the hero's deepest KPI.

## Part 1 — Record attribution (clickable player cards)

### API (`api/stats.js`)

The single superlatives query keeps the two counts needed for the Day-0 percentage (`day0_deaths`, `first_deaths`) but drops `max_gold` / `max_souls` / `max_gen`. Add three row-returning queries shaped like the existing Hall of Fools queries, each returning `{ share_id, digger_name, cosmetics, <value> }`:

```sql
-- greatest hoard
SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
       (payload->'peaks'->>'gold')::int AS gold
FROM runs WHERE NOT quarantined AND payload->'peaks' ? 'gold'
ORDER BY (payload->'peaks'->>'gold')::int DESC LIMIT 1

-- most souls lost in one village
SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics, villager_deaths
FROM runs WHERE NOT quarantined
ORDER BY villager_deaths DESC LIMIT 1

-- longest lineage
SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics, gen
FROM runs WHERE NOT quarantined
ORDER BY gen DESC LIMIT 1
```

Each holder is `null` when no run qualifies (e.g. no run has a gold peak) — the front-end must skip a null holder's tile, matching the Hall of Fools' null handling.

Response shape:

```js
superlatives: {
  day0_deaths, first_deaths,      // counts, for the Day-0 percentage
  hoard,                          // { share_id, digger_name, cosmetics, gold } | null
  souls,                          // { share_id, digger_name, cosmetics, villager_deaths } | null
  lineage,                        // { share_id, digger_name, cosmetics, gen } | null
}
```

### Front-end (`assets/stats.js`)

- New `recordTile(label, valueText, holder)`: renders like `.hero-tile` (value in `.num`, label in `.lbl`) plus a small name line — a 28px `drawDigger` avatar canvas + `holder.digger_name` — and calls `attachCard(tile, holder)` so a click opens the full player card. Mirrors `diggerCell`'s avatar/`attachCard` wiring.
- The Day-0 Death Club tile stays a plain `heroTile` (percentage of a group, not a single holder).
- Superlatives render block: Day-0 (`heroTile`) + `recordTile` for each non-null holder (hoard/souls/lineage). Value text stays as today: `${num(gold)} gold`, `num(villager_deaths)`, `${num(gen)} generations`.

### CSS (`stats.html`)

One small rule for the in-tile name line: an avatar+name flex row (reuse `.avatar-canvas`), muted, centered under the label; `cursor: pointer` on record tiles. No new tile-grid layout.

## Part 2 — Hero: "tiles clawed" replaces "deepest"

- `assets/stats.js`: replace `heroTile('deepest anyone dared', metres(totals.deepest))` with `heroTile('tiles clawed from the earth', num(totals.blocks))`.
- `api/stats.js`: drop `coalesce(max(depth),0)::int AS deepest` from the totals query (now unused; depth still comes from the dedicated day/depth scan and scatter query).
- Hero remains 4 KPIs: souls · villages · **tiles clawed** · longest. The fixed `.kpis` 4-column grid is unchanged.

## Part 3 — Two new leaderboards

Two top-20 boards rendered by the existing `renderBoardWithAvatars` (clickable player cards for free).

### API (`api/stats.js`)

```sql
-- Most Tiles Clawed
SELECT share_id, digger_name, blocks, days, depth, cause,
       payload->'cosmetics' AS cosmetics, received_at::date AS date
FROM runs WHERE NOT quarantined
ORDER BY blocks DESC LIMIT ${LEADER_N}

-- Greatest Discoverers
SELECT share_id, digger_name, discoveries, discovery_pct, days,
       payload->'cosmetics' AS cosmetics, received_at::date AS date
FROM runs WHERE NOT quarantined
ORDER BY discoveries DESC LIMIT ${LEADER_N}
```

Add to the response as `boards.tiles` and `boards.discoveries`.

### Front-end (`assets/stats.js`)

Two `renderBoardWithAvatars` calls:

- **tiles** columns: `Tiles` (num, `num(r.blocks)`) · `Days` (num) · `Depth` (num, `metres`) · `Fate` (`CAUSE_LABELS`) · `Date` (`slice(0,10)`).
- **discoveries** columns: `Discoveries` (num) · `Found %` (num, `${r.discovery_pct}%`) · `Days` (num) · `Date`.

### HTML (`stats.html`)

Two new `<section>`s placed after `#section-unbroken` (grouping all boards before the Hall of Fools), each with a kicker/heading, an italic `p.sub`, and a `.table-wrap > table` container:

- **Most Tiles Clawed** — sub: *"Depth hits a floor. The earth moved never does."*
- **Greatest Discoverers** — sub: *"Not how deep — how much of the dark they mapped."*

## Testing / verification

No new pure logic, so no new unit tests. Verification:

- Existing `api/*.test.js` suite still passes.
- Preview-server checks: superlative record tiles show avatar + name and open the player card on click; Day-0 tile has no name; hero shows "tiles clawed"; both new boards populate, are ordered correctly, and their rows open player cards.

## Files touched

- `api/stats.js` — superlatives → holder rows; drop `deepest`; add `boards.tiles` / `boards.discoveries`.
- `assets/stats.js` — `recordTile`; superlatives render; hero KPI swap; two board renders.
- `stats.html` — record-tile name-line CSS; two new board sections.

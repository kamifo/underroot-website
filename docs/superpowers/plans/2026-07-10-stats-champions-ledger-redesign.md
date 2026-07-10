# Stats: Champions + Ledger Redesign — Implementation Plan

> Follow-up to `2026-07-10-stats-attribution-and-dig-metrics.md`. Replaces the superlative tiles + four 20-row boards with a Champions row and one sortable Ledger table. Plus: sort Longest Lineages by generation, and add Discoveries to the `/r/` card page.

**Goal:** Kill the repetition (4 near-identical tables, "longest lineage" shown as both a tile and a table) and give records real spotlight.

**Architecture:** `api/stats.js` returns six record-holder objects (in `superlatives`) + one `ledger` array (top 50 runs, all metrics). `assets/stats.js` renders a Champions row (Day-0 tile + 6 clickable record cards) and one client-sortable Ledger table. `stats.html` swaps four board sections for two.

---

## Already done on this branch
- Longest Lineages now sorts `gen DESC, days DESC, depth DESC` in `api/stats.js` and `api/leaderboard.js`.

## Task A: API — champion holders + ledger (`api/stats.js`)

- Remove the four board queries (`lineageBoard`, `unbrokenBoard`, `tilesBoard`, `discoveriesBoard`).
- Add three more record-holder queries (same card-field shape as `hoard`/`souls`/`lineage`):
  - `unbroken`: `... first_death_days AS unbroken_days, days, depth, gen, cause, date ... WHERE first_death_days IS NOT NULL ORDER BY first_death_days DESC LIMIT 1`
  - `tiles`: `... blocks, days, depth, gen, cause, date ... ORDER BY blocks DESC LIMIT 1`
  - `discoveries`: `... discoveries, days, depth, gen, cause, date ... ORDER BY discoveries DESC LIMIT 1`
- Extend the `superlatives` object with `unbroken`, `tiles`, `discoveries` (each `?? null`).
- Add a `ledger` query: `SELECT share_id, digger_name, gen, days, depth, blocks, discoveries, cause, payload->'cosmetics' AS cosmetics, received_at::date AS date FROM runs WHERE NOT quarantined ORDER BY gen DESC, days DESC LIMIT 50`.
- Response: replace `boards: {…}` with `ledger`.

## Task B: Front-end — Champions + sortable Ledger (`assets/stats.js`)

- Destructure `ledger` instead of `boards`.
- Delete the four `renderBoardWithAvatars` calls and the now-unused `renderBoardWithAvatars` function (keep `diggerCell`).
- Champions render (replaces the superlatives block), appending to `#champions`: Day-0 `heroTile` then `recordTile` for lineage, unbroken, tiles, discoveries, hoard, souls (each guarded on non-null). Value text: `${num(gen)} generations`, `${num(unbroken_days)} days unbroken`, `${num(blocks)} tiles`, `${num(discoveries)} found`, `${num(gold)} gold`, `num(villager_deaths)`.
- New `renderLedger(table, rows)`: sortable table. Columns `gen/days/blocks(Tiles)/discoveries/depth(Depth)` numeric+sortable, `cause(Fate)` non-sortable. Header click toggles sort dir (default `gen ↓`); active header shows ↓/↑. Rows: rank `#`, `diggerCell(r)` (clickable card), then column cells. Re-render tbody on sort. Keyboard-accessible headers (role=button, Enter/Space).
- Call `renderLedger(document.getElementById('board-ledger'), ledger)`.

## Task C: HTML + CSS (`stats.html`)

- Remove `#section-lineage`, `#section-unbroken`, `#section-tiles`, `#section-discoveries`.
- In their place add `#section-champions` (kicker "The Hall of the Great", h2 "Champions of the Deep", `.tile-row#champions`) and `#section-ledger` (h2 "The Ledger", `.table-wrap > table#board-ledger`, plus a "View the full boards →" link to `leaderboard.html?board=lineage`).
- Remove `<section class="tile-row" id="superlatives">` from `#section-dig` (records now live in Champions).
- CSS: `th.sortable { cursor: pointer; user-select: none; }` + hover; active-sort indicator is text (↓/↑) so no extra rule needed.

## Task D: Discoveries on the card page (`api/_lib/db.js`, `api/_lib/card-html.js`, test)

- `getRunByShareId`: add `discoveries` to the SELECT.
- `card-html.js`: after the "Blocks mined" context row, `if (run.discoveries != null) context.push(row('Discoveries', num(run.discoveries)));`
- `card-html.test.js`: add `discoveries: 61` to `RUN`; assert the rendered HTML includes `Discoveries` and `61`.

## Verification
- `npm test` green (card-html discoveries assertion added).
- Dev server + browser: Champions row shows 6 record cards + Day-0, all record cards open the right player card; Ledger sorts by each header (click Tiles → descending by blocks, click again → ascending); `/r/<id>` page shows a Discoveries row. No console errors. Screenshot Champions + Ledger.

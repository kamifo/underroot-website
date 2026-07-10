# Task fulfillment stats — design

**Date:** 2026-07-10
**Status:** approved, pending implementation plan

## Goal

Surface the `tasks_fulfilled` / `tasks_denied` data (already ingested and stored,
never displayed) on the community stats page as a set of player-facing honours: a
"stingy" pair in the Hall of Fools, a "generous" pair in Champions, and a
community-wide aggregate in the page's narrative beat copy.

## Background

Every run already stores two validated, first-class columns:

- `tasks_fulfilled INT NOT NULL DEFAULT 0`
- `tasks_denied INT NOT NULL DEFAULT 0`

(see `db/schema.sql:23-24`, validated in `api/_lib/validate.js` with bounds
`[0, 100_000]`). Nothing on the stats page reads them today. This feature is
purely additive on the read side — no schema migration, no ingest change.

Let `T = tasks_fulfilled + tasks_denied` (total villager requests in a run).

## Feature 1 — four superlative tiles

Two new dubious honours and two new triumphs, all built from the existing tile
components (`foolTile` / `recordTile` in `assets/stats.js`). Each tile carries the
standard card fields (`share_id`, `digger_name`, `cosmetics`, `days`, `depth`,
`gen`, `cause`, `date`) so it opens the digger's player card, exactly like every
other tile in those rows.

### Hall of Fools (stingy)

| Key | Metric | Copy |
| --- | --- | --- |
| `taskmaster` | raw: max `tasks_denied` | 🙅 **The Taskmaster** — "{name} turned away {N} villager requests." |
| `coldshoulder` | rate: max `tasks_denied / T`, floored | 🪙 **Cold Shoulder** — "{name} refused {pct}% of {T} requests." |

### Champions (generous)

| Key | Metric | Tile |
| --- | --- | --- |
| `generous_count` | raw: max `tasks_fulfilled` | label "most requests granted", value `N`, unit "granted" |
| `generous_rate` | rate: max `tasks_fulfilled / T`, floored | label "most generous", value `pct`, unit "% granted" |

### The rate floor

The two rate tiles rank only runs with `T >= TASK_FLOOR`, a named constant in
`api/stats.js`. **`TASK_FLOOR = 50`.** Without it, a run that fielded a single
request and denied it would show 100% denial and win "Cold Shoulder" — noise, not
stinginess. 50 total requests is a meaningful sample (the reference run in
`db/sample-run.json` has 216).

Ties on any metric break toward the latest submission (`received_at DESC`), matching
the existing fools/superlatives queries.

## Feature 2 — community aggregate in beat copy

Add two sums to the existing `totals` query (no extra table scan):

```sql
coalesce(sum(tasks_fulfilled), 0)::bigint AS tasks_granted,
coalesce(sum(tasks_denied),    0)::bigint AS tasks_denied
```

Render a new prose-only narrative beat, **"III. The Bargain"**, placed after the
existing "II. The Fall" beat and before the village divider in `stats.html`. Copy,
derived from the data so it stays true to the numbers:

> "Across every village, {granted} requests were granted and {denied} turned away."

Prose-only — no chart on the art side (unlike beats I and II). The `.beat` grid can
render a single full-width prose column.

## Data flow

```
runs.tasks_fulfilled / runs.tasks_denied  (existing columns)
        │
        ├─ totals query  → totals.tasks_granted / totals.tasks_denied   → beat III copy
        ├─ raw max(denied)     → fools.taskmaster        → Hall of Fools tile
        ├─ rate max(denied/T)  → fools.coldshoulder      → Hall of Fools tile   (T >= 50)
        ├─ raw max(fulfilled)  → superlatives.generous_count → Champions tile
        └─ rate max(fulfilled/T) → superlatives.generous_rate → Champions tile  (T >= 50)
```

Each new single-run query returns a card-shaped row (or `null` when no run
qualifies), mirroring the existing `hoarder` / `hoard` / `tiles` queries. The
frontend pushes a tile only when its value is non-null, so an empty dataset degrades
cleanly.

### Rate query shape (example — Cold Shoulder)

```sql
SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
       days, depth, gen, cause, received_at::date AS date,
       tasks_denied, (tasks_fulfilled + tasks_denied) AS req_total,
       round(100.0 * tasks_denied / (tasks_fulfilled + tasks_denied), 1) AS deny_pct
FROM runs
WHERE NOT quarantined AND (tasks_fulfilled + tasks_denied) >= ${TASK_FLOOR}
ORDER BY tasks_denied::real / (tasks_fulfilled + tasks_denied) DESC, received_at DESC
LIMIT 1
```

`generous_rate` is the same with the ratio ordered `ASC` and reporting a granted
percentage (`100 - deny_pct`). The raw tiles are a plain `ORDER BY tasks_denied DESC`
/ `tasks_fulfilled DESC LIMIT 1`.

## Layout

- **Hall of Fools:** up to 6 tiles today → up to 8. Even; no concern.
- **Champions:** up to 5 tiles today → up to 7 (odd). The tile row is a wrapping
  grid, so this is cosmetic. Eyeball it live; if the odd tile reads as unbalanced,
  split Champions into two even rows. Not a blocker for this change.

## Caveat

Task counts depend on the game client reporting them. Older runs may submit `0/0`.
The `coalesce` in the aggregate and the `TASK_FLOOR` on the rate tiles handle this
gracefully — the tiles simply favour runs that actually reported task activity. This
mirrors the known reliability caveat on the `discoveries` metric. Not a correctness
issue; worth a one-line code comment near the queries.

## Out of scope

- No new chart (task activity over time, denial-rate histogram, etc.).
- No new DB column, index, or ingest change.
- No leaderboard board for tasks — tiles only.

## Files touched

- `api/stats.js` — two sums in `totals`; four new single-run queries; `TASK_FLOOR`
  constant; extend the `fools` and `superlatives` response objects.
- `assets/stats.js` — two `foolTile` pushes, two `recordTile` pushes, beat III copy.
- `stats.html` — new "III. The Bargain" prose beat section with a `beat-bargain-copy`
  element.

## Testing

- Extend `scripts/seed-stats.js` fixtures (or verify existing seed) so seeded runs
  carry varied `tasks_fulfilled` / `tasks_denied`, including at least one run above
  and one below `TASK_FLOOR`, to exercise both raw and rate tiles.
- Verify observable behaviour in the preview: the four tiles render with correct
  holders, each opens the right player card, and the beat copy shows the summed
  totals. Assert on rendered text / real clicks, not internal state.

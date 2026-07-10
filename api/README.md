# Community Stats API

Two Vercel serverless functions backed by Neon Postgres. The game's death
screen POSTs run summaries; the stats page reads one cached aggregate blob.

## Where the knobs live

| Knob | File |
|---|---|
| Plausibility limits (depth cap, mining rate, gen churn, …) | `_lib/plausibility.js` → `LIMITS` |
| Rate limit (submissions/hour/IP) | `submit-run.js` → `RATE_PER_HOUR` |
| Body size cap | `submit-run.js` → `BODY_CAP` |
| Leaderboard size / history sample | `stats.js` → `LEADER_N`, `HISTORY_SAMPLE` |
| CORS origin allowlist | `_lib/ingest.js` → `ORIGIN_ALLOW` |
| Payload schema (field ranges, cause enum, name cap) | `_lib/validate.js` |
| `share_id` format | `db/schema.sql` |
| OG image layout / fonts | `api/_lib/og-card.js`, `api/_lib/fonts/` |

**`MAX_DEPTH_TILES` (392) is derived from the game's `data/layers.json`**
(deepest layer bottom 342 tiles + 50 grace). If the game ever adds a deeper
layer, update it here or honest deep runs will be quarantined.

**`MAX_GEN` (500) is a generous flat backstop, not the real bound.** The game
has no generation cap and a struggling player racks up deaths fast, so this is
set high to avoid 422-rejecting honest long runs. The meaningful anti-nonsense
guard is `GEN_PER_DAY_MAX` (gen churn relative to days), which *quarantines*
rather than rejects. If you raise it, keep `_lib/validate.js` → `GEN_MAX` in
sync (it caps both the top-level gen and every lineage entry).

## Quarantine moderation

Implausible submissions are stored with `quarantined = true` (the client still
gets a 200 — no feedback loop for forgers) and never appear in stats. Review
them in the Neon console:

```sql
SELECT run_uuid, digger_name, days, depth, blocks, quarantine_reasons, received_at
FROM runs WHERE quarantined ORDER BY received_at DESC LIMIT 50;
```

Delete garbage rows outright; un-quarantine a false positive with
`UPDATE runs SET quarantined = false WHERE run_uuid = '...'` (then consider
loosening the tripped limit in `plausibility.js`).

## Shareable run cards

Each run gets a `share_id`: a public, listable id (12 hex chars) that's
DISTINCT from the private `run_uuid` write key used to upsert the row. The
boards expose `share_id` freely — unlike `run_uuid`, it can't be used to
overwrite a run, so it's safe to publish.

`submit-run` now returns `{ ok, url }` where `url` is
`<origin>/r/<share_id>` — the game's death screen links straight to this as
the "share your run" URL.

- `/r/:id` — rewritten to `/api/card?id=` (see `vercel.json`). Server-renders
  an HTML card with per-run OpenGraph/Twitter meta so the link unfurls nicely
  in chat apps and socials. 404s on unknown or quarantined ids.
- `/api/og?id=<share_id>` — the 1200×630 PNG used as the unfurl image,
  rendered via `@resvg/resvg-wasm` from `api/_lib/og-card.js` (fonts bundled
  in `api/_lib/fonts/`). Falls back to `api/_lib/og-fallback.png` on any
  rendering error.

`SITE_ORIGIN` optionally overrides the request-derived origin used to build
these absolute URLs (useful if the function ever runs behind a proxy that
mangles `Host`).

## Schema changes

No migration tool — edit `db/schema.sql` and apply by hand in the Neon console
SQL editor (plain Run, not Explain). Keep `db/schema.sql` as the source of truth.

## Local dev loop

```
node scripts/dev-server.mjs 3000     # loads .env.development.local + vercel dev
node scripts/seed-stats.js 40        # fake plausible runs (localhost only by default)
node db/check-schema.mjs             # sanity: table + indexes exist
npm test                             # 36 unit tests over _lib/
curl -s -X POST localhost:3000/api/submit-run -H "Content-Type: application/json" --data-binary @db/sample-run.json
```

`.env.development.local` is gitignored; the Neon integration's env vars are
marked sensitive in Vercel (not pullable), so `DATABASE_URL` must be pasted
from the Neon console's Connect dialog. `IP_SALT` is any long random string —
rotating it only resets rate-limit counters.

## Contract with the game client

The game half must satisfy the invariants in `_lib/validate.js` +
`_lib/plausibility.js`. The full checklist lives in the game repo's plan:
`underroot/docs/superpowers/plans/2026-07-08-community-stats-game.md`.
The load-bearing ones: stable `run_uuid` per playthrough (upsert key — never
regenerate on lineage deaths), causes mapped to the enum ids, the final
lineage entry exactly equal to the run's gen/days/depth/cause, history ≤ 400
rows (downsample client-side; the API rejects rather than truncates), depths
in TILES (the site converts to meters).

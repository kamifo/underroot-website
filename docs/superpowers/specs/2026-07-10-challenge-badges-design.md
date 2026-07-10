# Challenge badges — design

**Date:** 2026-07-10
**Status:** approved, pending implementation plan

## Goal

Show which Challenges a run was played under, as small emoji badges, on the three
places a run is listed or displayed: the stats **Ledger**, the full **leaderboard**
boards, and the standalone **player-card page**.

## Background

Challenges are opt-in run modifiers in the game. Each run submits the active set as
`payload.challenges` — an array of string ids (validated in
`api/_lib/validate.js:72`, up to 10 ids, stored inside the `payload` JSONB, not a
column). The data already flows: the game serializes it in
`CommunityStats.gd:235`. Nothing on the website reads it yet.

The game (`ChallengeManager.gd`, the `CATALOG` const) is the source of truth for the
six challenges, each with a canonical id, display name, and emoji glyph:

| id | name | emoji |
| --- | --- | --- |
| `lone_villager` | The Lone Villager | 🕯️ |
| `brittle_world` | Brittle World | 🔨 |
| `eye_of_the_storm` | Eye of the Storm | ⛈️ |
| `ravenous_maw` | The Ravenous Maw | 🦷 |
| `black_rot` | The Black Rot | ☠️ |
| `two_fronts` | Two Fronts | ⚔️ |

We reuse the game's own emoji so website badges match the in-game UI exactly.

## Feature — challenge badges

### Shared registry (single source of truth on the website)

Add to `assets/format.js` (the existing DOM-free shared module, alongside
`CAUSE_LABELS`):

```js
// Mirrors the game's ChallengeManager.CATALOG. Ordered to match the game's grid.
// Unknown ids (a future game Challenge before this map is updated) are skipped by
// the renderer, so drift degrades gracefully rather than breaking.
export const CHALLENGES = {
  lone_villager:    { name: 'The Lone Villager', emoji: '🕯️' },
  brittle_world:    { name: 'Brittle World',     emoji: '🔨' },
  eye_of_the_storm: { name: 'Eye of the Storm',  emoji: '⛈️' },
  ravenous_maw:     { name: 'The Ravenous Maw',  emoji: '🦷' },
  black_rot:        { name: 'The Black Rot',     emoji: '☠️' },
  two_fronts:       { name: 'Two Fronts',        emoji: '⚔️' },
};

// ids → [{ id, name, emoji }], preserving input order, skipping unknown ids.
export function challengeBadges(ids) { … }
```

### Shared renderer

A single small DOM helper builds the badge cluster from an id array: a `<span>` per
known challenge showing the emoji, with `title` = the challenge name for hover, and
an accessible label. Empty / missing arrays render nothing. Where the helper lives:
the Ledger and leaderboard both build rows imperatively, so a shared
`renderChallengeBadges(ids) -> HTMLElement | null` (in a small module both import, or
co-located with the existing row helpers) avoids copy-paste. The card page renders
its own roomier variant (emoji + visible name) from the same registry.

### Surfaces

1. **Player-card page** — the roomy home.
   - API: add `payload->'challenges' AS challenges` to `getRunByShareId`
     (`api/_lib/db.js:64`). The card HTML already inlines the whole run object
     (`api/_lib/card-html.js:35`), so the field reaches the client for free once the
     query returns it.
   - Render in `assets/card-page.js`: badges with visible names (not just emoji),
     as a "played under" row. No badges rendered when the run had no challenges.

2. **Stats Ledger** — the sortable table on `stats.html`.
   - API: add `payload->'challenges' AS challenges` to the ledger query
     (`api/stats.js:30`).
   - `renderLedger` (`assets/stats.js:76`): append the emoji cluster to the
     **digger-name cell**, not a new column — keeps the table from widening and
     avoids implying a sortable-by-challenge column.

3. **Leaderboard** — the full boards on `leaderboard.html`.
   - API: add `payload->'challenges' AS challenges` to the board SELECTs
     (`api/leaderboard.js:29` and `:35`).
   - `assets/leaderboard.js` row render (~`:31`): same emoji cluster, same
     name-cell placement as the Ledger.

## Data flow

```
game run  ──submit──►  payload.challenges: ["ravenous_maw", …]   (already stored)
                              │
   ┌──────────────────────────┼───────────────────────────────┐
   │ getRunByShareId +challenges → card-html inlines → card-page.js badges (named)
   │ /api/stats ledger +challenges → stats.js renderLedger  → name-cell emoji cluster
   │ /api/leaderboard boards +challenges → leaderboard.js   → name-cell emoji cluster
   └──────────────────────────────────────────────────────────┘
                              │
                    CHALLENGES registry (format.js) resolves id → { name, emoji }
```

## Icon choice

Emoji, taken verbatim from the game's `CATALOG`. Rationale: zero new art assets,
ships immediately, theme-proof in light/dark, and identical to what the player saw
in-game. The game also defines a per-challenge accent colour (`ACCENT` in
`ChallengeManager.gd`); we do **not** use it now (YAGNI) — plain emoji badges with
name tooltips are enough. If we later want coloured chips, the accents are available
to mirror.

## Edge cases

- **No challenges:** empty array → render nothing. The common case (most runs are
  played without Challenges); surfaces must not show an empty container or stray
  separator.
- **Unknown id:** an id not in the registry (e.g. a Challenge the game adds before
  this map is updated) is skipped by `challengeBadges`. Never render a raw id or a
  broken glyph.
- **Order:** preserve the submitted array order (the game submits the active set;
  order is not meaningful but should be stable per run).
- **Escaping:** ids are already constrained by `ID_RE` at ingest; the registry is a
  fixed allow-list, so rendered text comes only from our own constants, never
  player input.

## Registry sync

`CHALLENGES` duplicates the game's `CATALOG` (separate repos, no shared build).
Drift is safe by construction — a new game Challenge simply won't badge on the site
until the map is updated, and stale entries never break rendering. Worth a code
comment pointing at `ChallengeManager.gd` as the upstream source.

## Out of scope

- No filtering / sorting boards by challenge.
- No challenge-specific superlative tiles or leaderboards.
- No custom art, colour chips, or tooltips beyond the native `title` hover.
- No backfill concern — old runs simply carry `[]` and badge nothing.

## Files touched

- `assets/format.js` — `CHALLENGES` registry + `challengeBadges(ids)` helper.
- `api/_lib/db.js` — add `challenges` to `getRunByShareId`.
- `api/stats.js` — add `challenges` to the ledger query.
- `api/leaderboard.js` — add `challenges` to the board SELECTs.
- `assets/stats.js` — badge cluster in `renderLedger` name cell.
- `assets/leaderboard.js` — badge cluster in the row render.
- `assets/card-page.js` — named badge row on the card page.
- (shared badge renderer — new tiny module or co-located helper imported by the
  ledger + leaderboard.)

## Testing

- Seed fixtures: give some seeded runs non-empty `challenges` (including a mix and an
  unknown id) so the Ledger/leaderboard exercise the cluster and the skip path.
- Verify observable behaviour in preview: badges appear with correct emoji, hovering
  shows the challenge name, runs without challenges show no cluster, and the card
  page shows the named "played under" row. Assert on rendered DOM / hover title, not
  internal state.

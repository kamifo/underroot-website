# Shareable Run Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `/r/<share_id>` page for a single run with per-run Open Graph unfurl (server-rendered 1200×630 PNG) and social share buttons, tying into the Maw's Ledger redesign.

**Architecture:** A new `share_id` column (public, distinct from the private `run_uuid` write key) identifies a run. A Vercel serverless HTML route (`api/card.js`, rewritten from `/r/:id`) server-renders the card with OG meta and inlines the run JSON; a companion image route (`api/og.js`) rasterizes an SVG built by reusing `digger.js` through a new SVG sink, via `@resvg/resvg-wasm`. The existing card modal and boards expose the `share_id` so any listed run is one click from a link.

**Tech Stack:** Static HTML + Vercel Node serverless functions, Neon Postgres (`@neondatabase/serverless`), `@resvg/resvg-wasm`, `node --test` (pure unit tests).

---

## Conventions in this repo (read first)

- **Tests are pure** `node --test` files colocated with the code (`*.test.js`). Only pure logic is unit-tested; DB-glue in `_lib/db.js` and the HTTP routes are verified by running the dev server. Do **not** try to unit-test `db.js` queries — split pure logic out and test that, verify the query by hand.
- Run all tests: `npm test`. Run one file: `node --test api/_lib/og-card.test.js`.
- Local dev: `node scripts/dev-server.mjs 3000` (loads `.env.development.local` + `vercel dev`), then `node scripts/seed-stats.js 40`.
- All player-provided strings are escaped/`textContent` — never interpolated raw. The server routes are a **new** HTML/XML injection surface; escaping helpers are mandatory.
- ESM throughout (`"type": "module"`). Server routes may import from `assets/` via relative paths — those modules are DOM-free except `drawDigger`.

---

## File Structure

**New files**
- `vercel.json` — `/r/:id` rewrite + font/asset bundling for `api/og.js`.
- `assets/format.js` — shared formatters (`CAUSE_LABELS`, `num`, `metres`, `roman`, `fmtDate`, `causeLabel`, `shareTargets`). Imported by client and server.
- `assets/digger-svg.js` — `SvgCI` + `diggerSvg(loadout, size)`; reuses `digger.js` geometry, emits SVG.
- `assets/card-page.js` — client hydration for the card page (draw digger, wire share).
- `assets/card-page.css` — card page styles (Direction B).
- `api/card.js` — HTML route for `/r/:id`.
- `api/_lib/card-html.js` — pure `renderCardHtml` / `renderNotFoundHtml` + `escapeHtml`.
- `api/og.js` — PNG route for `/api/og?id=`.
- `api/_lib/og-card.js` — pure `buildOgSvg(run)` + `escapeXml`.
- `api/_lib/rasterize.js` — resvg-wasm init + `renderPng(svg)`.
- `api/_lib/fonts/PressStart2P-Regular.ttf`, `api/_lib/fonts/PTSerif-Italic.ttf` — bundled fonts.
- `api/_lib/og-fallback.png` — static fallback unfurl image.
- Tests: `assets/format.test.js`, `assets/digger-svg.test.js`, `api/_lib/og-card.test.js`, `api/_lib/card-html.test.js`, `api/_lib/ingest.test.js` (extend existing).

**Modified files**
- `db/schema.sql` — add `share_id` column + index.
- `db/check-schema.mjs` — assert the new column/index.
- `api/_lib/db.js` — `upsertRun` returns `share_id`; new `getRunByShareId`.
- `api/_lib/ingest.js` — new `originFromReq`.
- `api/submit-run.js` — return `{ ok, url }`.
- `api/stats.js`, `api/leaderboard.js` — add `share_id` to board rows.
- `assets/stats.js`, `assets/player-card.js` — use `format.js`; modal Share action + focus trap.
- `scripts/seed-stats.js` — print one sample `/r/<id>`.
- `api/README.md` — document the card/og routes + `share_id`.
- `package.json` — add `@resvg/resvg-wasm`.

---

## Task 1: Add `share_id` to the schema

**Files:**
- Modify: `db/schema.sql`
- Modify: `db/check-schema.mjs`

- [ ] **Step 1: Add the column + index to `db/schema.sql`**

In the `CREATE TABLE runs (...)` body, add after the `payload JSONB NOT NULL` line (before the closing `);`):

```sql
  ,
  -- Public, listable id for the shareable run-card page. Distinct from run_uuid,
  -- which stays the private upsert/write key. 12 hex chars (~48 bits): unguessable
  -- and non-enumerable at this scale. DB-generated so ALTER TABLE backfills rows.
  share_id           TEXT UNIQUE NOT NULL
                       DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
```

And add below the existing `CREATE INDEX` lines:

```sql
CREATE INDEX IF NOT EXISTS runs_share_idx ON runs (share_id);
```

- [ ] **Step 2: Apply to the live Neon DB by hand**

In the Neon console SQL editor (project convention — no migration tool), run:

```sql
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE NOT NULL
  DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
CREATE INDEX IF NOT EXISTS runs_share_idx ON runs (share_id);
```

The volatile default assigns a distinct id to every existing row automatically.

- [ ] **Step 3: Extend `db/check-schema.mjs` to assert the column + index**

Read the current file first, then add `share_id` to whatever column-existence check it performs and `runs_share_idx` to its index check, mirroring the existing assertions for `run_uuid` / `runs_leader_idx`.

- [ ] **Step 4: Run the schema check against the live DB**

Run: `node db/check-schema.mjs`
Expected: prints its OK/pass output including the new column and `runs_share_idx` (no missing-column error).

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/check-schema.mjs
git commit -m "feat(card): add public share_id column to runs"
```

---

## Task 2: `originFromReq` helper (pure, tested)

**Files:**
- Modify: `api/_lib/ingest.js`
- Modify: `api/_lib/ingest.test.js`

- [ ] **Step 1: Write the failing test**

Append to `api/_lib/ingest.test.js`:

```js
import { originFromReq } from './ingest.js';

test('originFromReq builds origin from forwarded headers', () => {
  const req = { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'underroot.se' } };
  assert.equal(originFromReq(req), 'https://underroot.se');
});

test('originFromReq falls back to host header and https', () => {
  const req = { headers: { host: 'localhost:3000' } };
  assert.equal(originFromReq(req), 'https://localhost:3000');
});

test('originFromReq honours SITE_ORIGIN env and strips trailing slash', () => {
  const prev = process.env.SITE_ORIGIN;
  process.env.SITE_ORIGIN = 'https://underroot.se/';
  try {
    assert.equal(originFromReq({ headers: {} }), 'https://underroot.se');
  } finally {
    if (prev === undefined) delete process.env.SITE_ORIGIN; else process.env.SITE_ORIGIN = prev;
  }
});

test('originFromReq takes the first forwarded host when comma-listed', () => {
  const req = { headers: { 'x-forwarded-proto': 'https,http', 'x-forwarded-host': 'underroot.se, proxy' } };
  assert.equal(originFromReq(req), 'https://underroot.se');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test api/_lib/ingest.test.js`
Expected: FAIL — `originFromReq` is not exported.

- [ ] **Step 3: Implement `originFromReq` in `api/_lib/ingest.js`**

Add at the end of the file:

```js
// Absolute origin for building shareable/OG-image URLs. Prefers an explicit
// SITE_ORIGIN, else reconstructs from the (first) forwarded proto + host.
export function originFromReq(req) {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/+$/, '');
  const h = req.headers ?? {};
  const first = (v, fallback) => (v ?? fallback).split(',')[0].trim();
  const proto = first(h['x-forwarded-proto'], 'https');
  const host = first(h['x-forwarded-host'] ?? h.host, 'underroot.se');
  return `${proto}://${host}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test api/_lib/ingest.test.js`
Expected: PASS (all originFromReq tests + existing tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/ingest.js api/_lib/ingest.test.js
git commit -m "feat(card): add originFromReq helper"
```

---

## Task 3: DB layer — `upsertRun` returns `share_id`, add `getRunByShareId`

**Files:**
- Modify: `api/_lib/db.js`

No unit test (DB glue — repo convention). Verified via dev server in Task 12.

- [ ] **Step 1: Make `upsertRun` return the row's `share_id`**

In `api/_lib/db.js`, change the `upsertRun` SQL to capture the id: append `RETURNING share_id` to the statement and return it. Replace the `await sql\`...\`;` call so it reads:

```js
  const rows = await sql`
    INSERT INTO runs (
      run_uuid, quarantined, quarantine_reasons, submitter_ip_hash, game_version,
      digger_name, gen, days, depth, blocks, cause,
      discoveries, discovery_pct, villager_deaths, peak_population,
      wall_hp, machines_built, astrolabe_uses, tasks_fulfilled, tasks_denied,
      first_death_days, first_death_depth, payload
    ) VALUES (
      ${run.run_uuid}, ${meta.quarantined}, ${meta.reasons}, ${meta.ipHash}, ${run.game_version},
      ${run.digger_name}, ${run.gen}, ${run.days}, ${run.depth}, ${run.blocks}, ${run.cause},
      ${run.discoveries}, ${run.discovery_pct}, ${run.villager_deaths}, ${run.peak_population},
      ${run.wall_hp}, ${run.machines_built}, ${run.astrolabe_uses}, ${run.tasks_fulfilled}, ${run.tasks_denied},
      ${meta.firstDeathDays}, ${meta.firstDeathDepth},
      ${JSON.stringify({ challenges: run.challenges, peaks: run.peaks, lineage: run.lineage, history: run.history, cosmetics: run.cosmetics })}
    )
    ON CONFLICT (run_uuid) DO UPDATE SET
      received_at = now(),
      quarantined = EXCLUDED.quarantined,
      quarantine_reasons = EXCLUDED.quarantine_reasons,
      game_version = EXCLUDED.game_version,
      digger_name = EXCLUDED.digger_name,
      gen = EXCLUDED.gen, days = EXCLUDED.days, depth = EXCLUDED.depth,
      blocks = EXCLUDED.blocks, cause = EXCLUDED.cause,
      discoveries = EXCLUDED.discoveries, discovery_pct = EXCLUDED.discovery_pct,
      villager_deaths = EXCLUDED.villager_deaths, peak_population = EXCLUDED.peak_population,
      wall_hp = EXCLUDED.wall_hp, machines_built = EXCLUDED.machines_built,
      astrolabe_uses = EXCLUDED.astrolabe_uses,
      tasks_fulfilled = EXCLUDED.tasks_fulfilled, tasks_denied = EXCLUDED.tasks_denied,
      first_death_days = EXCLUDED.first_death_days, first_death_depth = EXCLUDED.first_death_depth,
      payload = EXCLUDED.payload
    RETURNING share_id
  `;
  return rows[0].share_id;
```

Note: `share_id` is deliberately **absent** from both the INSERT column list and the `DO UPDATE SET` list — a first insert gets the DB default; a re-POST of the same `run_uuid` keeps its existing id (stable link). Update the function's doc comment to say so.

- [ ] **Step 2: Add `getRunByShareId`**

Append to `api/_lib/db.js`:

```js
// One run's public card data, by its share_id. Only non-quarantined runs are
// viewable. `gold` is null for runs with no gold peak (caller omits that row).
export async function getRunByShareId(sql, id) {
  const rows = await sql`
    SELECT digger_name, gen, days, depth, cause,
           villager_deaths, blocks, peak_population,
           payload->'cosmetics' AS cosmetics,
           (payload->'peaks'->>'gold')::int AS gold,
           received_at::date AS date
    FROM runs
    WHERE share_id = ${id} AND NOT quarantined
    LIMIT 1`;
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Sanity-check it parses**

Run: `node --check api/_lib/db.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/db.js
git commit -m "feat(card): upsertRun returns share_id; add getRunByShareId"
```

---

## Task 4: `submit-run` returns the share URL

**Files:**
- Modify: `api/submit-run.js`

- [ ] **Step 1: Capture the returned id and return the URL**

In `api/submit-run.js`, add `originFromReq` to the ingest import:

```js
import { deriveFirstDeath, corsHeaders, hashIp, originFromReq } from './_lib/ingest.js';
```

Change the `upsertRun` call to capture its return, and change the success response:

```js
    const shareId = await upsertRun(sql, run, {
      quarantined: !plausible,
      reasons,
      ipHash,
      firstDeathDays: first_death_days,
      firstDeathDepth: first_death_depth,
    });

    // Same 200 either way — quarantine stays invisible to the client. The url is
    // the death-screen share link; a quarantined run's card route will 404 it.
    return res.status(200).json({ ok: true, url: `${originFromReq(req)}/r/${shareId}` });
```

- [ ] **Step 2: Verify it parses**

Run: `node --check api/submit-run.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add api/submit-run.js
git commit -m "feat(card): submit-run returns the /r/<id> share url"
```

---

## Task 5: Shared formatters — `assets/format.js`

**Files:**
- Create: `assets/format.js`
- Create: `assets/format.test.js`

- [ ] **Step 1: Write the failing test**

Create `assets/format.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { num, metres, roman, causeLabel, fmtDate, shareTargets, CAUSE_LABELS } from './format.js';

test('num formats with thousands separators', () => {
  assert.equal(num(6601), '6,601');
});

test('metres converts tiles to metres (×1.5, rounded)', () => {
  assert.equal(metres(324), '486 m');
});

test('roman maps small ints and falls back to the number', () => {
  assert.equal(roman(8), 'VIII');
  assert.equal(roman(99), '99');
});

test('causeLabel maps known causes and passes through unknown', () => {
  assert.equal(causeLabel('maw_breach'), CAUSE_LABELS.maw_breach);
  assert.equal(causeLabel('mystery'), 'mystery');
  assert.equal(causeLabel(null), null);
});

test('fmtDate renders an ISO-ish date', () => {
  assert.equal(fmtDate('2026-07-08'), '8 Jul 2026');
});

test('shareTargets builds encoded intent URLs', () => {
  const t = shareTargets('https://underroot.se/r/abc', 'Fell day 85', 'RIP my village');
  assert.ok(t.x.includes('https%3A%2F%2Funderroot.se%2Fr%2Fabc'));
  assert.ok(t.whatsapp.startsWith('https://wa.me/?text='));
  assert.ok(t.reddit.includes('title=Fell'));
  assert.ok(t.bluesky.startsWith('https://bsky.app/intent/compose?text='));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test assets/format.test.js`
Expected: FAIL — cannot find module `./format.js`.

- [ ] **Step 3: Implement `assets/format.js`**

```js
// Shared, DOM-free formatters used by the stats page, the card modal, and the
// standalone card page. Single source of truth — do not re-copy these.

export const CAUSE_LABELS = {
  maw_breach: 'The Maw breached the base',
  starvation: 'Starvation',
  dehydration: 'Dehydration',
  starvation_dehydration: 'Starvation & dehydration',
  starvation_away: 'Starved while away',
  dehydration_away: 'Dehydrated while away',
  starvation_dehydration_away: 'Starved & dehydrated while away',
  abandoned: 'Lost the will to continue',
  other: 'Unknown fate',
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const num = (n) => Number(n).toLocaleString('en-US');
export const metres = (tiles) => `${num(Math.round(Number(tiles) * 1.5))} m`;
export const roman = (n) => ROMAN[n] ?? String(n);
export const causeLabel = (c) => (c == null ? null : (CAUSE_LABELS[c] ?? c));

export function fmtDate(v) {
  const iso = String(v).slice(0, 10);
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Social share intent URLs. Discord has no intent URL (paste-to-unfurl instead).
export function shareTargets(url, title, text) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const msg = encodeURIComponent(`${text} ${url}`);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${u}`,
    whatsapp: `https://wa.me/?text=${msg}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
    bluesky: `https://bsky.app/intent/compose?text=${msg}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test assets/format.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/format.js assets/format.test.js
git commit -m "feat(card): shared format.js (formatters + share intents)"
```

---

## Task 6: Repoint `stats.js` and `player-card.js` at `format.js`

**Files:**
- Modify: `assets/stats.js`
- Modify: `assets/player-card.js`

Behaviour-preserving DRY refactor. No new test — existing `digger.test.js` still passes and Task 12 verifies the pages render.

- [ ] **Step 1: `assets/stats.js` — import formatters, delete the local copies**

Add to the imports at the top:

```js
import { CAUSE_LABELS, num, metres } from './format.js';
```

Delete the local `const CAUSE_LABELS = {...}` block (lines defining causes), the local `const num = ...`, and the local `const metres = ...`. Leave `el()`, `heroTile()`, etc. untouched.

- [ ] **Step 2: `assets/player-card.js` — import formatters, delete local copies**

Add to the imports at the top:

```js
import { num, roman, metres, fmtDate, causeLabel } from './format.js';
```

Delete the local `CAUSE_LABELS`, `ROMAN`, `roman`, `num`, `metres`, `fmtDate`, and `causeLabel` definitions. Keep `FANG`, `CSS`, and everything else. (`player-card.js` referenced `CAUSE_LABELS` only inside its old `causeLabel`, which now lives in `format.js` — so it is not imported here.)

- [ ] **Step 3: Verify both parse**

Run: `node --check assets/stats.js && node --check assets/player-card.js`
Expected: no output.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add assets/stats.js assets/player-card.js
git commit -m "refactor(card): stats.js + player-card.js use shared format.js"
```

---

## Task 7: Digger → SVG — `assets/digger-svg.js`

**Files:**
- Create: `assets/digger-svg.js`
- Create: `assets/digger-svg.test.js`

- [ ] **Step 1: Write the failing test**

Create `assets/digger-svg.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { diggerSvg, SvgCI } from './digger-svg.js';
import { drawFull } from './digger.js';

test('diggerSvg wraps geometry in a scaled, translated <g>', () => {
  // size=76 → scale=1, translate=(38, 38+31)=(38,69)
  const svg = diggerSvg({}, 76);
  assert.match(svg, /^<g transform="translate\(38 69\) scale\(1\)">/);
  assert.ok(svg.endsWith('</g>'));
  assert.ok(svg.includes('<circle'), 'head is a circle');
  assert.ok(svg.includes('<rect'), 'belt/legs are rects');
});

test('SvgCI emits one element per draw call', () => {
  const ci = new SvgCI();
  drawFull(ci, { extra: 'extra_sash', form: '' }, false);
  const s = ci.toString();
  assert.ok(s.includes('<polygon'), 'sash is a polygon');
});

test('a crowned digger differs from bare (no case fall-through)', () => {
  assert.notEqual(diggerSvg({ headwear: 'head_crown' }, 300), diggerSvg({ headwear: 'head_bare' }, 300));
});

test('the Maw-Eaten form emits polylines (magma cracks)', () => {
  assert.ok(diggerSvg({ form: 'form_maweaten' }, 300).includes('<polyline'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test assets/digger-svg.test.js`
Expected: FAIL — cannot find module `./digger-svg.js`.

- [ ] **Step 3: Implement `assets/digger-svg.js`**

```js
// Server-side SVG port of the digger renderer. Reuses digger.js geometry — the
// same drawFull(ci, loadout) — by swapping the canvas sink for an SVG sink.
// digger.js stays the single source of truth; this only changes the output.
import { drawFull } from './digger.js';

// Mirrors digger.js's private css() (colors are {r,g,b,a} in 0..1 or a hex string).
const cssColor = (c) =>
  (typeof c === 'string' ? c
    : `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a ?? 1})`);

const pts = (a) => a.map((p) => `${p.x},${p.y}`).join(' ');

// Implements the five CI methods digger.js calls, as SVG element strings.
export class SvgCI {
  constructor() { this.parts = []; }
  draw_rect(r, c) { this.parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${cssColor(c)}"/>`); }
  draw_circle(p, rad, c) { this.parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${rad}" fill="${cssColor(c)}"/>`); }
  draw_colored_polygon(p, c) { this.parts.push(`<polygon points="${pts(p)}" fill="${cssColor(c)}"/>`); }
  draw_line(a, b, c, w) { this.parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${cssColor(c)}" stroke-width="${w}"/>`); }
  draw_polyline(p, c, w) { this.parts.push(`<polyline points="${pts(p)}" fill="none" stroke="${cssColor(c)}" stroke-width="${w}"/>`); }
  toString() { return this.parts.join(''); }
}

// Draw a digger into an `size`×`size` box, feet-down, matching drawDigger's
// transform (scale = size/76, centre_y offset +31*scale). Returns an SVG <g>.
export function diggerSvg(loadout, size) {
  const scale = size / 76;
  const tx = size / 2;
  const ty = size / 2 + 31 * scale;
  const ci = new SvgCI();
  drawFull(ci, loadout ?? {}, false);
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${ci.toString()}</g>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test assets/digger-svg.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/digger-svg.js assets/digger-svg.test.js
git commit -m "feat(card): SVG digger renderer reusing digger.js geometry"
```

---

## Task 8: OG SVG composition — `api/_lib/og-card.js`

**Files:**
- Create: `api/_lib/og-card.js`
- Create: `api/_lib/og-card.test.js`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/og-card.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOgSvg, escapeXml, OG_W, OG_H } from './og-card.js';

const RUN = { digger_name: 'Heimdall', gen: 8, days: 85, depth: 324, cause: 'maw_breach', cosmetics: { headwear: 'head_crown' } };

test('escapeXml neutralizes markup characters', () => {
  assert.equal(escapeXml(`a<b>&"'`), 'a&lt;b&gt;&amp;&quot;&apos;');
});

test('buildOgSvg is 1200x630 and contains the run details', () => {
  const svg = buildOgSvg(RUN);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes(`width="${OG_W}"`) && svg.includes(`height="${OG_H}"`));
  assert.ok(svg.includes('HEIMDALL') || svg.includes('Heimdall'));
  assert.ok(svg.includes('85'), 'days');
  assert.ok(svg.includes('486'), 'descent in metres');
  assert.ok(svg.includes('VIII'), 'lineage roman');
  assert.ok(svg.includes('The Maw breached the base'), 'epitaph');
  assert.ok(svg.includes('<g transform="translate'), 'embeds the digger');
});

test('buildOgSvg escapes a hostile digger name', () => {
  const svg = buildOgSvg({ ...RUN, digger_name: '<script>x</script>' });
  assert.ok(!svg.includes('<script>'));
  // Name is escaped then upper-cased, so match the entity case-insensitively.
  assert.ok(/&lt;script&gt;/i.test(svg));
});

test('buildOgSvg truncates an over-long name', () => {
  const svg = buildOgSvg({ ...RUN, digger_name: 'Aaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.ok(svg.includes('…'), 'ellipsis');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test api/_lib/og-card.test.js`
Expected: FAIL — cannot find module `./og-card.js`.

- [ ] **Step 3: Implement `api/_lib/og-card.js`**

```js
// Pure builder for the 1200×630 unfurl image (SVG). Rasterized to PNG by
// api/og.js via resvg. Layout: "horizontal dossier" — portrait left, name +
// epitaph + a three-stat row right, underroot.se brand mark. Site palette.
import { diggerSvg } from '../../assets/digger-svg.js';
import { num, metres, roman, causeLabel } from '../../assets/format.js';

export const OG_W = 1200;
export const OG_H = 630;

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// A small downward fang (the Maw's tooth) as a polygon, at (x,y), width w.
const fang = (x, y, w, fill) =>
  `<polygon points="${x},${y} ${x + w},${y} ${x + w * 0.775},${y + w * 0.75} ${x + w / 2},${y + w * 1.375} ${x + w * 0.225},${y + w * 0.75}" fill="${fill}"/>`;

export function buildOgSvg(run) {
  const name = escapeXml(truncate(String(run.digger_name ?? 'Unknown'), 15)).toUpperCase();
  const epitaph = escapeXml(causeLabel(run.cause) ?? 'Fate unrecorded');
  const days = escapeXml(num(run.days));
  const descent = escapeXml(metres(run.depth));
  const gen = escapeXml(run.gen != null ? roman(run.gen) : '·');
  const portrait = diggerSvg(run.cosmetics || {}, 330); // drawn feet-down in a 330 box

  const PS = 'Press Start 2P';
  const stat = (x, value, label) => `
    <text x="${x}" y="470" font-family="${PS}" font-size="34" fill="#a36936">${value}</text>
    <text x="${x}" y="505" font-family="${PS}" font-size="14" fill="rgba(255,255,255,0.55)" letter-spacing="2">${label}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <defs>
    <radialGradient id="warm" cx="20%" cy="30%" r="60%">
      <stop offset="0%" stop-color="rgba(80,52,30,0.75)"/><stop offset="60%" stop-color="rgba(20,16,12,0)"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="rgba(214,146,78,0.30)"/><stop offset="70%" stop-color="rgba(214,146,78,0)"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0c0907"/><stop offset="55%" stop-color="#14100c"/><stop offset="100%" stop-color="#0b0806"/>
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#warm)"/>
  <rect x="0" y="0" width="${OG_W}" height="6" fill="#8c2828"/>
  <ellipse cx="255" cy="300" rx="200" ry="200" fill="url(#glow)"/>
  <g transform="translate(90 150)">${portrait}</g>

  <text x="470" y="185" font-family="${PS}" font-size="20" fill="#a36936" letter-spacing="4">THE MAW&apos;S LEDGER</text>
  <text x="470" y="285" font-family="${PS}" font-size="52" fill="#ffffff">${name}</text>
  ${fang(470, 330, 20, '#c05a4c')}
  <text x="502" y="352" font-family="PT Serif" font-style="italic" font-size="30" fill="#c05a4c">${epitaph}</text>
  ${stat(470, days, 'DAYS')}
  ${stat(700, descent, 'DESCENT')}
  ${stat(930, gen, 'LINEAGE')}

  ${fang(1052, 588, 14, 'rgba(255,255,255,0.34)')}
  <text x="1075" y="600" font-family="${PS}" font-size="16" fill="rgba(255,255,255,0.34)">underroot.se</text>
</svg>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test api/_lib/og-card.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/og-card.js api/_lib/og-card.test.js
git commit -m "feat(card): buildOgSvg — 1200x630 unfurl composition"
```

---

## Task 9: Fonts, fallback image, and the rasterizer

**Files:**
- Modify: `package.json` (add dependency)
- Create: `api/_lib/fonts/PressStart2P-Regular.ttf`
- Create: `api/_lib/fonts/PTSerif-Italic.ttf`
- Create: `api/_lib/og-fallback.png`
- Create: `api/_lib/rasterize.js`

- [ ] **Step 1: Install the rasterizer**

Run: `npm install @resvg/resvg-wasm`
Expected: `@resvg/resvg-wasm` appears under `dependencies` in `package.json`; `package-lock.json` updates.

- [ ] **Step 2: Add the bundled fonts (OFL, must be committed)**

Download and place (both are SIL Open Font License, redistributable):
- `api/_lib/fonts/PressStart2P-Regular.ttf` — from Google Fonts "Press Start 2P" (internal family name `Press Start 2P`).
- `api/_lib/fonts/PTSerif-Italic.ttf` — from Google Fonts "PT Serif" italic (internal family name `PT Serif`).

Verify they exist and are non-empty:
Run: `node -e "const {statSync}=require('fs');for(const f of ['api/_lib/fonts/PressStart2P-Regular.ttf','api/_lib/fonts/PTSerif-Italic.ttf'])console.log(f, statSync(f).size)"`
Expected: two lines, each with a size > 10000.

- [ ] **Step 3: Add a static fallback unfurl image**

Create `api/_lib/og-fallback.png` — a 1200×630 branded image (reuse `assets/images/The_Maw.png` cropped/letterboxed to 1200×630, with "The Maw's Ledger" text, exported as PNG). Any on-brand 1200×630 PNG is acceptable; this only shows when a card can't render.

Verify: `node -e "console.log(require('fs').statSync('api/_lib/og-fallback.png').size)"` → size > 1000.

- [ ] **Step 4: Implement `api/_lib/rasterize.js`**

```js
// resvg-wasm wrapper: init the wasm once per instance, register our bundled
// fonts (resvg ships none), rasterize an SVG string to a PNG Buffer.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const require = createRequire(import.meta.url);
let wasmReady;
let fontsPromise;

function ensureWasm() {
  if (!wasmReady) {
    // require.resolve makes the .wasm a traced dependency on Vercel.
    const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
    wasmReady = readFile(wasmPath).then((buf) => initWasm(buf));
  }
  return wasmReady;
}

function loadFonts() {
  if (!fontsPromise) {
    const dir = fileURLToPath(new URL('./fonts/', import.meta.url));
    fontsPromise = Promise.all([
      readFile(dir + 'PressStart2P-Regular.ttf'),
      readFile(dir + 'PTSerif-Italic.ttf'),
    ]);
  }
  return fontsPromise;
}

export async function renderPng(svg) {
  await ensureWasm();
  const fontBuffers = await loadFonts();
  const resvg = new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Press Start 2P' },
    fitTo: { mode: 'width', value: 1200 },
  });
  return Buffer.from(resvg.render().asPng());
}
```

If `require.resolve('@resvg/resvg-wasm/index_bg.wasm')` throws (package layout changed), run `ls node_modules/@resvg/resvg-wasm/*.wasm` and use whatever `.wasm` file it lists.

- [ ] **Step 5: Smoke-test the rasterizer end-to-end (real PNG bytes)**

Run:
```bash
node -e "import('./api/_lib/og-card.js').then(async ({buildOgSvg})=>{const {renderPng}=await import('./api/_lib/rasterize.js');const png=await renderPng(buildOgSvg({digger_name:'Heimdall',gen:8,days:85,depth:324,cause:'maw_breach',cosmetics:{headwear:'head_crown'}}));require('fs').writeFileSync('og-smoke.png',png);console.log('PNG bytes:',png.length,'magic:',png.slice(0,4).toString('hex'))})"
```
Expected: prints `PNG bytes: <large>` and `magic: 89504e47` (PNG signature). Open `og-smoke.png` and confirm the digger + text render.

- [ ] **Step 6: Clean up the smoke artifact and commit**

```bash
rm -f og-smoke.png
git add package.json package-lock.json api/_lib/rasterize.js api/_lib/fonts api/_lib/og-fallback.png
git commit -m "feat(card): resvg-wasm rasterizer + bundled fonts and fallback"
```

---

## Task 10: OG image route — `api/og.js`

**Files:**
- Create: `api/og.js`

Route glue — verified via the smoke test above and the dev server in Task 12.

- [ ] **Step 1: Implement `api/og.js`**

```js
// GET /api/og?id=<share_id> -> image/png. The per-run unfurl image. Never 500s
// a crawler: any failure (bad id, DB down, raster error) returns the static
// fallback so a shared link always yields a branded preview.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corsHeaders } from './_lib/ingest.js';
import { getSql, getRunByShareId } from './_lib/db.js';
import { buildOgSvg } from './_lib/og-card.js';
import { renderPng } from './_lib/rasterize.js';

const FALLBACK = readFileSync(fileURLToPath(new URL('./_lib/og-fallback.png', import.meta.url)));
const isShareId = (s) => /^[0-9a-f]{12}$/.test(s);

function sendFallback(res) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).end(FALLBACK);
}

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const id = String(req.query?.id ?? '');
  try {
    const run = isShareId(id) ? await getRunByShareId(getSql(), id) : null;
    if (!run) return sendFallback(res);
    const png = await renderPng(buildOgSvg(run));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).end(png);
  } catch (err) {
    console.error('og failed:', err instanceof Error ? err.message : err);
    return sendFallback(res);
  }
}
```

- [ ] **Step 2: Verify it parses**

Run: `node --check api/og.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add api/og.js
git commit -m "feat(card): /api/og image route with safe fallback"
```

---

## Task 11: Card HTML builder — `api/_lib/card-html.js`

**Files:**
- Create: `api/_lib/card-html.js`
- Create: `api/_lib/card-html.test.js`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/card-html.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCardHtml, renderNotFoundHtml, escapeHtml } from './card-html.js';

const RUN = { digger_name: 'Heimdall', gen: 8, days: 85, depth: 324, cause: 'maw_breach',
  villager_deaths: 210, blocks: 6601, peak_population: 342, gold: 4034,
  cosmetics: { headwear: 'head_crown' }, date: '2026-07-08' };
const OPTS = { origin: 'https://underroot.se', id: 'a3f9c2d81e04' };

test('escapeHtml neutralizes the five entities', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('renderCardHtml emits absolute OG meta from origin + id', () => {
  const html = renderCardHtml(RUN, OPTS);
  assert.ok(html.includes('<meta property="og:image" content="https://underroot.se/api/og?id=a3f9c2d81e04"'));
  assert.ok(html.includes('<meta property="og:url" content="https://underroot.se/r/a3f9c2d81e04"'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('<meta property="og:image:width" content="1200"'));
});

test('renderCardHtml puts the run details in title and body', () => {
  const html = renderCardHtml(RUN, OPTS);
  assert.ok(html.includes('Heimdall'));
  assert.ok(html.includes('day 85'));
  assert.ok(html.includes('486 m'));
});

test('renderCardHtml escapes a hostile name in meta and body', () => {
  const html = renderCardHtml({ ...RUN, digger_name: '"><script>x</script>' }, OPTS);
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderCardHtml inlines run JSON with < escaped', () => {
  const html = renderCardHtml(RUN, OPTS);
  assert.ok(html.includes('id="run-data"'));
  assert.ok(!/<script[^>]*id="run-data"[^>]*>[^<]*<script/.test(html), 'no raw </script> break-out');
});

test('renderNotFoundHtml is a themed 404 doc', () => {
  const html = renderNotFoundHtml('https://underroot.se');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(/no record|not found/i.test(html));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test api/_lib/card-html.test.js`
Expected: FAIL — cannot find module `./card-html.js`.

- [ ] **Step 3: Implement `api/_lib/card-html.js`**

```js
// Pure server-rendered HTML for the standalone run card (Direction B) + a themed
// 404. All player strings are escaped — this is a server-HTML injection surface.
import { num, metres, roman, causeLabel, fmtDate } from '../../assets/format.js';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const shell = (title, desc, head, body) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}"/>
<link rel="icon" type="image/png" href="/assets/images/underroot_favicon.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/card-page.css"/>
${head}
</head><body>${body}</body></html>`;

const row = (k, v) => `<div class="pc-row"><span class="pc-k">${escapeHtml(k)}</span><span class="pc-v">${escapeHtml(v)}</span></div>`;

export function renderCardHtml(run, { origin, id }) {
  const name = String(run.digger_name ?? 'Unknown');
  const epitaph = causeLabel(run.cause) ?? 'Fate unrecorded';
  const genPhrase = run.gen != null ? `${num(run.gen)} generation${run.gen === 1 ? '' : 's'} dug ` : '';
  const title = `${name}'s village fell on day ${num(run.days)} — The Maw's Ledger`;
  const desc = `${genPhrase}${metres(run.depth)} before ${epitaph.toLowerCase()}. See the run.`;
  const url = `${origin}/r/${id}`;
  const ogImg = `${origin}/api/og?id=${id}`;
  // Inline JSON for the client (canvas cosmetics + share text). Escape "<" so a
  // "</script>" inside any string can't close the tag early.
  const dataJson = JSON.stringify(run).replace(/</g, '\\u003c');

  const head = `
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:image" content="${escapeHtml(ogImg)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${escapeHtml(url)}"/>
<meta property="og:type" content="article"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(title)}"/>
<meta name="twitter:description" content="${escapeHtml(desc)}"/>
<meta name="twitter:image" content="${escapeHtml(ogImg)}"/>`;

  const ledger = [row('Endured', `${num(run.days)} days`), row('Descent', metres(run.depth))];
  if (run.gen != null) ledger.push(row('Lineage', `Gen ${roman(run.gen)}`));

  const context = [];
  if (run.villager_deaths != null) context.push(row('Souls lost', num(run.villager_deaths)));
  if (run.blocks != null) context.push(row('Blocks mined', num(run.blocks)));
  if (run.peak_population != null) context.push(row('Peak village', num(run.peak_population)));
  if (run.gold != null) context.push(row('Greatest hoard', `${num(run.gold)} gold`));

  const body = `
<header class="cp-head">
  <a class="cp-back" href="/stats.html">← The Maw's Ledger</a>
  <a class="cp-play" href="https://play.underroot.se">▶ Play Free</a>
</header>
<main class="cp-main">
  <div class="pc-card" role="img" aria-label="${escapeHtml(name)}'s run card">
    <div class="pc-corner tl"><span>${run.gen != null ? escapeHtml(roman(run.gen)) : '·'}</span></div>
    <div class="pc-corner br"><span>${run.gen != null ? escapeHtml(roman(run.gen)) : '·'}</span></div>
    <div class="pc-inner">
      <div class="pc-name">${escapeHtml(name)}</div>
      <div class="pc-kicker">The Maw's Ledger</div>
      <div class="pc-portrait"><div class="pc-glow"></div><canvas id="card-canvas" width="440" height="440" style="width:220px;height:220px"></canvas></div>
      <div class="pc-epitaph">${escapeHtml(epitaph)}</div>
      <div class="pc-ledger">${ledger.join('')}</div>
      <div class="pc-foot">Recorded ${escapeHtml(fmtDate(run.date))}</div>
    </div>
  </div>
  <section class="cp-context">
    <h1>${escapeHtml(name)}'s village fell on day ${escapeHtml(num(run.days))}.</h1>
    <p class="cp-flavor">${escapeHtml(genPhrase ? genPhrase.replace(/ $/, '') + ' ' : 'A lone digger reached ')}${escapeHtml(metres(run.depth))} into the dark before ${escapeHtml(epitaph.toLowerCase())}.</p>
    <div class="pc-ledger cp-fulllist">${context.join('')}</div>
    <a class="cp-cta" href="/stats.html">Explore the full Ledger →</a>
    <div class="cp-share-label">Share this end</div>
    <div class="cp-share" id="share"></div>
    <div class="cp-discord-hint">Sharing on Discord? Just paste the link — it unfurls the card.</div>
  </section>
</main>
<footer class="cp-footer">A Swavvy AB game · © 2026 Swavvy AB. All rights reserved.</footer>
<script type="application/json" id="run-data">${dataJson}</script>
<script type="module" src="/assets/card-page.js"></script>`;

  return shell(title, desc, head, body);
}

export function renderNotFoundHtml(_origin) {
  const body = `
<main class="cp-main cp-404">
  <div class="pc-card"><div class="pc-inner">
    <div class="pc-kicker">The Maw's Ledger</div>
    <h1 class="pc-name">No record</h1>
    <p class="pc-epitaph">The Maw has no record of this run.</p>
    <a class="cp-cta" href="/stats.html">Explore the full Ledger →</a>
  </div></div>
</main>`;
  return shell('No record — The Maw\'s Ledger', 'The Maw has no record of this run.', '', body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test api/_lib/card-html.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/card-html.js api/_lib/card-html.test.js
git commit -m "feat(card): server-rendered card HTML + OG meta (escaped)"
```

---

## Task 12: Card route + `vercel.json` rewrite

**Files:**
- Create: `api/card.js`
- Create: `vercel.json`

- [ ] **Step 1: Implement `api/card.js`**

```js
// GET /r/:id (rewritten to /api/card?id=:id) -> text/html. Server-renders the
// run card with per-run OG meta and inlines the run JSON. 404 (themed) when the
// id is unknown or the run is quarantined.
import { getSql, getRunByShareId } from './_lib/db.js';
import { renderCardHtml, renderNotFoundHtml } from './_lib/card-html.js';
import { originFromReq } from './_lib/ingest.js';

const isShareId = (s) => /^[0-9a-f]{12}$/.test(s);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const id = String(req.query?.id ?? '');
  const origin = originFromReq(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const run = isShareId(id) ? await getRunByShareId(getSql(), id) : null;
    if (!run) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send(renderNotFoundHtml(origin));
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(renderCardHtml(run, { origin, id }));
  } catch (err) {
    console.error('card failed:', err instanceof Error ? err.message : err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send(renderNotFoundHtml(origin));
  }
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "rewrites": [
    { "source": "/r/:id", "destination": "/api/card?id=:id" }
  ],
  "functions": {
    "api/og.js": { "includeFiles": "api/_lib/**" },
    "api/card.js": { "includeFiles": "api/_lib/**" }
  }
}
```

`includeFiles: "api/_lib/**"` guarantees the fonts and fallback PNG ship with the functions even if Vercel's tracer misses the `fs` reads.

- [ ] **Step 3: Verify `api/card.js` parses and `vercel.json` is valid JSON**

Run: `node --check api/card.js && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('vercel.json OK')"`
Expected: `vercel.json OK`.

- [ ] **Step 4: Commit**

```bash
git add api/card.js vercel.json
git commit -m "feat(card): /r/:id card route + vercel rewrite"
```

---

## Task 13: Card page client + styles

**Files:**
- Create: `assets/card-page.js`
- Create: `assets/card-page.css`

Client/DOM code — no unit test; verified in Task 15's manual pass.

- [ ] **Step 1: Implement `assets/card-page.js`**

```js
// Hydrates the standalone card page: draws the digger onto the card canvas from
// the inlined run JSON, and wires the share controls against the current URL.
import { drawDigger } from './digger.js';
import { shareTargets } from './format.js';

const dataEl = document.getElementById('run-data');
const run = dataEl ? JSON.parse(dataEl.textContent) : {};

const canvas = document.getElementById('card-canvas');
if (canvas) drawDigger(canvas, run.cosmetics || {});

const url = location.href;
const title = document.title;
const text = document.querySelector('meta[name="description"]')?.content ?? title;
const targets = shareTargets(url, title, text);

const shareRoot = document.getElementById('share');
if (shareRoot) {
  const btn = (label, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sbtn ${cls}`;
    b.textContent = label;
    return b;
  };
  const link = (label, href) => {
    const a = document.createElement('a');
    a.className = 'sbtn';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    return a;
  };

  // Copy link (primary)
  const copy = btn('Copy link', 'primary');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      const prev = copy.textContent;
      copy.textContent = 'Copied ✓';
      setTimeout(() => { copy.textContent = prev; }, 1600);
    } catch { /* clipboard blocked — no-op */ }
  });
  shareRoot.append(copy);

  // Native share (mobile) — only if supported
  if (navigator.share) {
    const nat = btn('Share…', '');
    nat.addEventListener('click', () => navigator.share({ title, text, url }).catch(() => {}));
    shareRoot.append(nat);
  }

  shareRoot.append(
    link('X', targets.x),
    link('WhatsApp', targets.whatsapp),
    link('Reddit', targets.reddit),
    link('Bluesky', targets.bluesky),
  );
}
```

- [ ] **Step 2: Implement `assets/card-page.css`**

Port the card visuals from `player-card.js`'s `CSS` (the `.pc-*` rules) into a stylesheet, and add the Direction-B page chrome. Use the site palette variables at `:root`. Concretely:

```css
:root {
  --bg:#14100c; --panel:#1b1611; --ink:rgba(255,255,255,.88); --muted:rgba(255,255,255,.52);
  --faint:rgba(255,255,255,.32); --red:#8c2828; --line:rgba(255,255,255,.10); --clay:#a36936;
}
*,*::before,*::after { margin:0; padding:0; box-sizing:border-box; }
body { background:
    radial-gradient(120% 90% at 50% -10%, rgba(60,40,24,.5), transparent 60%),
    linear-gradient(180deg,#0c0907,#14100c 60%,#0c0907);
  color:var(--ink); font-family:Georgia,serif; line-height:1.7; min-height:100vh; -webkit-font-smoothing:antialiased; }
a { color:inherit; }

.cp-head { display:flex; justify-content:space-between; align-items:center; max-width:1000px; margin:0 auto; padding:20px clamp(16px,5vw,32px); }
.cp-back { color:var(--muted); text-decoration:none; font-size:11px; letter-spacing:.12em; text-transform:uppercase; }
.cp-back:hover { color:#fff; }
.cp-play { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#fff; background:rgba(140,40,40,.9);
  border:1px solid rgba(255,255,255,.3); padding:9px 16px; border-radius:2px; text-decoration:none; box-shadow:0 0 22px rgba(140,40,40,.4); }

.cp-main { max-width:1000px; margin:0 auto; padding:12px clamp(16px,5vw,32px) 40px; display:flex; gap:34px; flex-wrap:wrap; align-items:flex-start; }
.cp-context { flex:1; min-width:260px; }
.cp-context h1 { font-family:Georgia,serif; font-weight:normal; color:#fff; font-size:1.5rem; margin-bottom:12px; }
.cp-flavor { color:rgba(255,255,255,.7); font-style:italic; font-size:1.05rem; margin-bottom:18px; }
.cp-fulllist { margin-bottom:18px; }
.cp-cta { display:inline-block; color:var(--clay); text-decoration:none; font-size:13px; letter-spacing:.06em; }
.cp-cta:hover { color:#fff; }
.cp-share-label { margin:22px 0 10px; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--faint); }
.cp-share { display:flex; gap:8px; flex-wrap:wrap; }
.sbtn { display:inline-flex; align-items:center; gap:7px; font:inherit; font-size:12px; letter-spacing:.04em; padding:9px 14px;
  border-radius:3px; border:1px solid var(--line); background:var(--panel); color:var(--ink); cursor:pointer; text-decoration:none; }
.sbtn:hover { border-color:rgba(255,255,255,.25); }
.sbtn.primary { border-color:var(--clay); color:#f0dcc0; box-shadow:0 0 16px rgba(163,105,54,.22) inset; }
.cp-discord-hint { margin-top:12px; font-size:12px; color:var(--muted); font-style:italic; }
.cp-footer { text-align:center; padding:40px 20px; border-top:1px solid var(--line); color:var(--faint); font-size:12px; letter-spacing:.06em; background:#0c0907; }

/* Card — ported from player-card.js CSS */
.pc-card { position:relative; width:min(320px,92vw); padding:16px; flex:none; border-radius:10px;
  background:radial-gradient(120% 80% at 50% 0%, rgba(163,105,54,.10), transparent 55%), linear-gradient(180deg,#221a12,#1b1611 40%,#17120d);
  border:1px solid rgba(163,105,54,.45); box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 0 0 1px rgba(0,0,0,.5), 0 30px 70px -20px rgba(0,0,0,.85); }
.pc-card::before { content:""; position:absolute; inset:8px; border:1px solid rgba(163,105,54,.28); border-radius:6px; pointer-events:none; }
.pc-corner { position:absolute; color:var(--clay); font-family:'Press Start 2P',monospace; font-size:11px; z-index:3; }
.pc-corner.tl { top:16px; left:17px; } .pc-corner.br { bottom:16px; right:17px; transform:rotate(180deg); }
.pc-inner { position:relative; z-index:2; padding:14px 16px 6px; text-align:center; }
.pc-name { font-family:'Press Start 2P',monospace; font-size:14px; line-height:1.5; color:#fff; text-shadow:0 2px 10px rgba(0,0,0,.7); margin:2px 24px 3px; }
.pc-kicker { font-family:'Press Start 2P',monospace; font-size:8px; letter-spacing:.16em; text-transform:uppercase; color:var(--red); margin-bottom:12px; }
.pc-portrait { position:relative; height:236px; margin:0 4px 6px; border-radius:6px; overflow:hidden; display:flex; align-items:flex-end; justify-content:center;
  background:radial-gradient(60% 50% at 50% 42%, rgba(163,105,54,.20), transparent 70%), linear-gradient(180deg,#120e0a,#1c1610); border:1px solid var(--line); }
.pc-glow { position:absolute; left:50%; top:44%; width:150px; height:150px; transform:translate(-50%,-50%); pointer-events:none;
  background:radial-gradient(circle, rgba(214,146,78,.28), transparent 68%); }
.pc-portrait canvas { position:relative; z-index:2; margin-bottom:8px; filter:drop-shadow(0 6px 10px rgba(0,0,0,.55)); }
.pc-epitaph { color:#c86a63; font-size:.98rem; font-style:italic; margin:12px 6px 14px; }
.pc-ledger { border-top:1px solid var(--line); border-bottom:1px solid var(--line); margin:0 2px; padding:4px 0; }
.pc-row { display:flex; justify-content:space-between; align-items:baseline; padding:7px 6px; border-bottom:1px solid rgba(255,255,255,.05); }
.pc-row:last-child { border-bottom:none; }
.pc-k { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
.pc-v { font-family:'Press Start 2P',monospace; font-size:10px; color:var(--clay); }
.pc-foot { text-align:center; padding:11px 6px 4px; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }
.cp-404 { justify-content:center; }
@media (max-width:680px){ .cp-main{ gap:22px; } }
```

- [ ] **Step 3: Verify JS parses**

Run: `node --check assets/card-page.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add assets/card-page.js assets/card-page.css
git commit -m "feat(card): standalone card page client + styles"
```

---

## Task 14: Board tie-in — expose `share_id`, add modal Share action

**Files:**
- Modify: `api/stats.js`
- Modify: `api/leaderboard.js`
- Modify: `assets/player-card.js`

- [ ] **Step 1: Add `share_id` to the board queries in `api/stats.js`**

In the `lineageBoard` query, change the SELECT list to include `share_id`:

```js
    const lineageBoard = await sql`
      SELECT share_id, digger_name, days, depth, gen, cause, blocks,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY days DESC, depth DESC LIMIT ${LEADER_N}`;
```

In the `unbrokenBoard` query likewise:

```js
    const unbrokenBoard = await sql`
      SELECT share_id, digger_name, first_death_days AS days, first_death_depth AS depth,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
      FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL
      ORDER BY first_death_days DESC, first_death_depth DESC LIMIT ${LEADER_N}`;
```

- [ ] **Step 2: Add `share_id` to both queries in `api/leaderboard.js`**

In the `unbroken` branch SELECT and the `lineage` branch SELECT, add `share_id,` as the first column (matching Step 1's pattern).

- [ ] **Step 3: Carry `share_id` into the modal + add the Share action in `assets/player-card.js`**

In `attachCard`, add `share_id` to the normalized object:

```js
  const normalized = {
    name: run.digger_name ?? run.name,
    cosmetics: run.cosmetics,
    days: run.days, depth: run.depth, gen: run.gen, cause: run.cause, date: run.date,
    share_id: run.share_id,
  };
```

In `cardMarkup`, after the `.pc-foot` div inside the template, add a share row (only rendered when a `share_id` is present). Replace the `<div class="pc-foot"></div>` line with:

```js
      <div class="pc-foot"></div>
      <div class="pc-share-row"></div>`;
```

Then after the existing `card.querySelector('.pc-foot').textContent = ...;` line, add:

```js
  if (run.share_id) {
    const shareUrl = `${location.origin}/r/${run.share_id}`;
    const shareRow = card.querySelector('.pc-share-row');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'pc-share-btn';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copy.textContent = 'Copied ✓';
        setTimeout(() => { copy.textContent = 'Copy link'; }, 1600);
      } catch { /* clipboard blocked */ }
    });
    const open = document.createElement('a');
    open.className = 'pc-share-btn';
    open.href = shareUrl;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open card ↗';
    shareRow.append(copy, open);
  }
```

Add CSS for the share row to the `CSS` template string (near the `.pc-foot` rule):

```css
.pc-share-row { display:flex; gap:8px; justify-content:center; padding:10px 6px 2px; }
.pc-share-btn { font:inherit; font-size:11px; letter-spacing:.04em; padding:7px 12px; border-radius:3px;
  border:1px solid var(--line, rgba(255,255,255,0.10)); background:rgba(0,0,0,0.25); color:var(--ink, rgba(255,255,255,0.88));
  cursor:pointer; text-decoration:none; transition:border-color 0.18s, color 0.18s; }
.pc-share-btn:hover, .pc-share-btn:focus-visible { border-color:var(--clay, #a36936); color:#f0dcc0; outline:none; }
```

- [ ] **Step 4: Fix the focus trap for multiple focusables**

The modal's keydown handler currently forces every Tab onto `.pc-close`. Replace the Tab branch in `ensureModal` (the `if (e.key === 'Tab')` line) with a real cycle:

```js
    if (e.key === 'Tab') {
      const f = [...backdrop.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      // else: let Tab move naturally between the focusable controls
    }
```

- [ ] **Step 5: Verify parses + full suite**

Run: `node --check api/stats.js && node --check api/leaderboard.js && node --check assets/player-card.js && npm test`
Expected: no parse output; `npm test` PASS.

- [ ] **Step 6: Commit**

```bash
git add api/stats.js api/leaderboard.js assets/player-card.js
git commit -m "feat(card): expose share_id on boards + modal share action"
```

---

## Task 15: Seed helper, docs, and full manual acceptance

**Files:**
- Modify: `scripts/seed-stats.js`
- Modify: `api/README.md`

- [ ] **Step 1: Print a sample share link from `seed-stats.js`**

In `scripts/seed-stats.js`, capture the last successful response body and print a sample card link. Change the fetch loop so a successful response records its `url`:

```js
let failed = 0;
let sampleUrl = null;
for (let i = 0; i < COUNT; i++) {
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeRun()),
    });
  } catch {
    console.error(`seed ${i}: cannot reach ${ENDPOINT} — is the dev server running?`);
    failed++;
    continue;
  }
  if (!r.ok) { failed++; console.error(`seed ${i}: HTTP ${r.status}`); }
  else { try { sampleUrl = (await r.json()).url ?? sampleUrl; } catch { /* older API */ } }
}
console.log(`seeded ${COUNT - failed}/${COUNT} runs -> ${ENDPOINT}`);
if (sampleUrl) console.log(`sample card: ${sampleUrl}`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Document the new routes + `share_id` in `api/README.md`**

Add a short "Shareable run cards" section covering: `share_id` (public id, distinct from the private `run_uuid` write key); `submit-run` now returns `{ ok, url }`; the `/r/:id` card route and `/api/og?id=` image route; the `@resvg/resvg-wasm` dep + bundled fonts under `api/_lib/fonts/`; and that `SITE_ORIGIN` can override the derived origin. Add `share_id` / OG-image knobs to the "Where the knobs live" table.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS — includes `format`, `digger-svg`, `og-card`, `card-html`, `ingest` (incl. `originFromReq`), and the pre-existing tests.

- [ ] **Step 4: Manual acceptance against the dev server**

```bash
node scripts/dev-server.mjs 3000    # terminal 1
node scripts/seed-stats.js 40       # terminal 2 — note the printed "sample card: …/r/<id>"
```

Verify each:
- Open the `sample card` URL (`http://localhost:3000/r/<id>`): the digger matches the modal art, the ledger + context render, share buttons appear.
- `curl -s -o og.png "http://localhost:3000/api/og?id=<id>" && node -e "console.log(require('fs').statSync('og.png').size)"` → non-trivial size; open `og.png` and confirm the horizontal-dossier unfurl. Then `rm og.png`.
- `curl -s "http://localhost:3000/r/<id>" | grep -o 'og:image[^>]*'` → shows the absolute `/api/og?id=<id>` URL.
- Unknown id: `http://localhost:3000/r/000000000000` → themed 404 page; `http://localhost:3000/api/og?id=000000000000` → the fallback PNG.
- `stats.html`: open a board card → the modal now shows Copy link / Open card ↗; Tab cycles through close + share controls; "Open card ↗" lands on the right `/r/<id>`.
- `leaderboard.html`: open a card there too → same Copy link / Open card ↗ appear (confirms `assets/leaderboard.js` passes the API row, which now carries `share_id`, straight into `attachCard`). If they're missing, `assets/leaderboard.js` builds a custom row object — add `share_id` to it.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-stats.js api/README.md
git commit -m "docs(card): seed sample link + document card/og routes"
```

- [ ] **Step 6: (Deploy-time) OG validator check**

After deploying the branch (Vercel preview), run the preview `/r/<id>` through an OG debugger (e.g. opengraph.xyz or the platform's own card validator) and confirm the image unfurls. Note: `SITE_ORIGIN` need not be set — the origin is derived from request headers — but set it if the preview host differs from the canonical one.

---

## Self-Review Notes (for the implementer)

- **`share_id` shape** is `^[0-9a-f]{12}$`; the card and og routes both validate against that regex before hitting the DB — keep them in sync if the format changes.
- **Type consistency:** `getRunByShareId` returns `{ digger_name, gen, days, depth, cause, villager_deaths, blocks, peak_population, cosmetics, gold, date }`. `buildOgSvg`, `renderCardHtml`, and `card-page.js` all read from that exact shape.
- **`digger.js` is never edited** — `digger-svg.js` reuses its `drawFull` export. If a cosmetic is added to the game, both canvas and SVG paths pick it up for free.
- **Escaping:** `escapeHtml` (HTML/attr) in `card-html.js`, `escapeXml` in `og-card.js`, and `<` for the inlined JSON. Every player string passes through one of these.

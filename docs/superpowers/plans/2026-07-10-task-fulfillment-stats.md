# Task Fulfillment Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each run's `tasks_fulfilled` / `tasks_denied` data as four superlative tiles (two "stingy" in the Hall of Fools, two "generous" in Champions) plus a community-aggregate beat sentence.

**Architecture:** Purely read-side. A new pure `ratePct` helper (unit-tested) does the percentage math; `api/stats.js` adds two `sum()` aggregates and four single-run queries (raw + rate, rate gated by a `TASK_FLOOR`); `assets/stats.js` renders the tiles with the existing `foolTile` / `recordTile` helpers; `stats.html` gains one prose-only "beat". No schema, ingest, or column changes — the columns already exist and validate.

**Tech Stack:** Vanilla ES-module browser JS, Neon serverless Postgres (tagged-template SQL), `node --test` for unit tests, Vercel dev server for observable verification.

**Spec:** `docs/superpowers/specs/2026-07-10-task-fulfillment-stats-design.md`

**Verification note:** `api/stats.js` and `assets/stats.js` have no unit tests in this repo (they need a live DB / DOM). Following the established pattern, their tasks are verified *observably* via the Vercel dev server + `scripts/seed-stats.js`, asserting on rendered output — not internal state. Only the pure `ratePct` helper gets a `node --test` unit test.

---

## File Structure

- `assets/format.js` — **modify**: add the pure `ratePct(part, other)` formatter (shared source of truth for the percentage math).
- `assets/format.test.js` — **modify**: unit tests for `ratePct`.
- `api/stats.js` — **modify**: `TASK_FLOOR` constant; two sums in the `totals` query; four single-run queries; extend the `fools` and `superlatives` response objects.
- `assets/stats.js` — **modify**: import `ratePct`; two `foolTile` pushes; two `recordTile` pushes; the bargain beat copy.
- `stats.html` — **modify**: new "III. The Bargain" prose-only beat section + a `.beat.solo` CSS rule.
- `scripts/seed-stats.js` — **modify**: guarantee some seeded runs fall below `TASK_FLOOR` so the rate tiles' exclusion path is exercised.

---

## Task 1: `ratePct` percentage helper

**Files:**
- Modify: `assets/format.js`
- Test: `assets/format.test.js`

- [ ] **Step 1: Write the failing test**

Add to `assets/format.test.js`:

```js
import { ratePct } from './format.js'; // add ratePct to the existing import line

test('ratePct is the whole-number percent of part within part+other', () => {
  assert.equal(ratePct(67, 149), 31);   // 67 / 216 = 31.0%
  assert.equal(ratePct(149, 67), 69);   // 149 / 216 = 69.0%
});

test('ratePct is 0 when there are no requests at all', () => {
  assert.equal(ratePct(0, 0), 0);       // no divide-by-zero
});

test('ratePct coerces string inputs (Postgres bigint serialization)', () => {
  assert.equal(ratePct('1', '3'), 25);
});
```

(Merge `ratePct` into the existing top-of-file import rather than adding a second import line.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ratePct` is not exported (`SyntaxError` / `undefined is not a function`).

- [ ] **Step 3: Implement the helper**

Add to `assets/format.js` (near `num` / `metres`):

```js
// Whole-number percentage of `part` within `part + other`; 0 when the total is 0
// (no divide-by-zero). Coerces inputs — Postgres bigint aggregates arrive as strings.
export const ratePct = (part, other) => {
  const p = Number(part), total = Number(part) + Number(other);
  return total > 0 ? Math.round((p / total) * 100) : 0;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `ratePct` cases green, existing format tests still green.

- [ ] **Step 5: Commit**

```bash
git add assets/format.js assets/format.test.js
git commit -m "feat(stats): add ratePct percentage helper"
```

---

## Task 2: Server aggregates & superlative queries

**Files:**
- Modify: `api/stats.js`

- [ ] **Step 1: Add the `TASK_FLOOR` constant**

At the top of `api/stats.js`, beside `LEDGER_N` / `HISTORY_SAMPLE`:

```js
const TASK_FLOOR = 50; // min villager requests (fulfilled+denied) to qualify for the RATE tiles
```

- [ ] **Step 2: Add the two community sums to the `totals` query**

In the existing `totals` SELECT, add two columns before `FROM runs`:

```js
    const [totals] = await sql`
      SELECT count(*)::int AS runs,
             coalesce(sum(villager_deaths), 0)::bigint AS souls,
             coalesce(sum(blocks), 0)::bigint AS blocks,
             coalesce(max(days), 0)::int AS longest,
             coalesce(sum(tasks_fulfilled), 0)::bigint AS tasks_granted,
             coalesce(sum(tasks_denied), 0)::bigint AS tasks_denied
      FROM runs WHERE NOT quarantined`;
```

- [ ] **Step 3: Add the two raw-count single-run queries**

After the existing superlative queries (e.g. below the `[discoveries]` query, before the `superlatives` object), add:

```js
    // Task honours. Raw-count tiles reward volume; rate tiles (below) reward the
    // ratio but require TASK_FLOOR total requests so a 1-of-1 run can't win.
    const [taskmaster] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             tasks_denied
      FROM runs WHERE NOT quarantined AND tasks_denied > 0
      ORDER BY tasks_denied DESC, received_at DESC LIMIT 1`;
    const [generousCount] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             tasks_fulfilled
      FROM runs WHERE NOT quarantined AND tasks_fulfilled > 0
      ORDER BY tasks_fulfilled DESC, received_at DESC LIMIT 1`;
```

- [ ] **Step 4: Add the two rate single-run queries (floored)**

Directly below Step 3's queries:

```js
    const [coldShoulder] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             tasks_fulfilled, tasks_denied
      FROM runs
      WHERE NOT quarantined AND (tasks_fulfilled + tasks_denied) >= ${TASK_FLOOR}
      ORDER BY tasks_denied::real / (tasks_fulfilled + tasks_denied) DESC, received_at DESC
      LIMIT 1`;
    const [generousRate] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             tasks_fulfilled, tasks_denied
      FROM runs
      WHERE NOT quarantined AND (tasks_fulfilled + tasks_denied) >= ${TASK_FLOOR}
      ORDER BY tasks_fulfilled::real / (tasks_fulfilled + tasks_denied) DESC, received_at DESC
      LIMIT 1`;
```

- [ ] **Step 5: Extend the response objects**

Add the generous tiles to the existing `superlatives` object:

```js
      generous_count: generousCount ?? null, // { …, tasks_fulfilled } | null
      generous_rate: generousRate ?? null,   // { …, tasks_fulfilled, tasks_denied } | null
```

Add the stingy tiles to the existing `fools` object:

```js
      taskmaster: taskmaster ?? null,        // { …, tasks_denied } | null
      coldshoulder: coldShoulder ?? null,    // { …, tasks_fulfilled, tasks_denied } | null
```

- [ ] **Step 6: Verify the API responds with the new fields**

Start the dev server (preview tooling, `vercel-dev` config on port 3000). Seed data if the DB is empty: `node scripts/seed-stats.js 40`.
Fetch `http://localhost:3000/api/stats` and confirm the JSON contains: `totals.tasks_granted`, `totals.tasks_denied`, `superlatives.generous_count`, `superlatives.generous_rate`, `fools.taskmaster`, `fools.coldshoulder`.
Expected: the four superlative fields are objects with a `share_id` and the relevant task counts (or `null` if no run qualifies); the two totals are numeric strings.

- [ ] **Step 7: Commit**

```bash
git add api/stats.js
git commit -m "feat(stats): task fulfillment aggregates and superlative queries"
```

---

## Task 3: Render the four tiles

**Files:**
- Modify: `assets/stats.js`

- [ ] **Step 1: Import `ratePct`**

Extend the existing format import:

```js
import { CAUSE_LABELS, num, metres, ratePct } from './format.js';
```

- [ ] **Step 2: Add the two stingy tiles to the Hall of Fools**

In `render()`, in the Hall of Fools block, after the existing `f.scratched` push and before the `superlatives.souls` (Gravekeeper) push, add:

```js
  if (f.taskmaster) tiles.push(foolTile('🙅', 'The Taskmaster', `${f.taskmaster.digger_name} turned away ${num(f.taskmaster.tasks_denied)} villager requests.`, f.taskmaster));
  if (f.coldshoulder) {
    const c = f.coldshoulder;
    const total = Number(c.tasks_fulfilled) + Number(c.tasks_denied);
    tiles.push(foolTile('🪙', 'Cold Shoulder', `${c.digger_name} refused ${ratePct(c.tasks_denied, c.tasks_fulfilled)}% of ${num(total)} requests.`, c));
  }
```

- [ ] **Step 3: Add the two generous tiles to Champions**

In the Champions block, after the existing `s.hoard` push, add:

```js
  if (s.generous_count) champEl.append(recordTile('most requests granted', num(s.generous_count.tasks_fulfilled), 'granted', s.generous_count));
  if (s.generous_rate) champEl.append(recordTile('most generous', String(ratePct(s.generous_rate.tasks_fulfilled, s.generous_rate.tasks_denied)), '% granted', s.generous_rate));
```

- [ ] **Step 4: Verify the tiles render and open cards**

With the dev server running and data seeded, load `stats.html` in the preview.
Expected:
- Hall of Fools shows "The Taskmaster" and "Cold Shoulder" tiles with sensible copy (a denial count; a `NN% of NNN requests`).
- Champions shows "most requests granted" and "most generous" tiles.
- Clicking each of the four tiles opens the correct digger's player card (they carry `share_id`).
Assert on rendered text and a real click opening the card — not internal state.

- [ ] **Step 5: Commit**

```bash
git add assets/stats.js
git commit -m "feat(stats): render task fulfillment fool and champion tiles"
```

---

## Task 4: Community aggregate beat

**Files:**
- Modify: `stats.html`
- Modify: `assets/stats.js`

- [ ] **Step 1: Add the prose-only beat section to `stats.html`**

Between the `beat-fall` section (closes at line ~227) and the `divider-village` (line ~229), insert:

```html
      <section class="beat solo" id="beat-bargain">
        <div class="prose"><div class="kicker">III. The Bargain</div><h2>Every request is a reckoning.</h2><p id="beat-bargain-copy"></p></div>
      </section>
```

- [ ] **Step 2: Add the `.beat.solo` CSS rule**

In the `<style>` block, right after the `.beat` rule (near line 154):

```css
    .beat.solo { grid-template-columns:1fr; max-width:640px; }
```

- [ ] **Step 3: Populate the beat copy from the totals**

In `render()`, after the existing `beat-fall-copy` assignment, add:

```js
  document.getElementById('beat-bargain-copy').textContent =
    `Across every village, ${num(Number(totals.tasks_granted))} requests were granted and ${num(Number(totals.tasks_denied))} turned away.`;
```

- [ ] **Step 4: Verify the beat renders with real numbers**

Reload `stats.html` in the preview.
Expected: the "III. The Bargain" beat shows a sentence with two comma-formatted totals that match `sum(tasks_fulfilled)` / `sum(tasks_denied)` from the API; it spans a single readable column (not a half-width grid cell).

- [ ] **Step 5: Commit**

```bash
git add stats.html assets/stats.js
git commit -m "feat(stats): add The Bargain community-aggregate beat"
```

---

## Task 5: Seed coverage for the rate floor

**Files:**
- Modify: `scripts/seed-stats.js`

- [ ] **Step 1: Make some seeded runs fall below `TASK_FLOOR`**

Replace the `tasks_fulfilled` / `tasks_denied` line in `fakeRun()`:

```js
    astrolabe_uses: rnd(0, 3), tasks_fulfilled: rnd(0, 200), tasks_denied: rnd(0, 80),
```

with a mix that guarantees both sides of the 50-request floor:

```js
    // ~1 in 4 runs is a low-request village (below the stats rate floor) so the
    // rate tiles' exclusion path is exercised; the rest span the full range.
    astrolabe_uses: rnd(0, 3),
    ...(rnd(0, 3) === 0
      ? { tasks_fulfilled: rnd(0, 12), tasks_denied: rnd(0, 8) }
      : { tasks_fulfilled: rnd(20, 200), tasks_denied: rnd(0, 90) }),
```

- [ ] **Step 2: Re-seed and verify both paths**

Run: `node scripts/seed-stats.js 40`
Then fetch `http://localhost:3000/api/stats` and confirm `fools.coldshoulder` / `superlatives.generous_rate` are non-null AND their `tasks_fulfilled + tasks_denied >= 50` (the floor held — no low-request run won a rate tile), while `fools.taskmaster` / `superlatives.generous_count` may point at any run.
Expected: rate holders are above the floor; raw holders reflect the max counts.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-stats.js
git commit -m "test(stats): seed low-request runs to exercise the task rate floor"
```

---

## Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full-page smoke test**

With the dev server running and freshly seeded data, load `stats.html` and confirm together:
- Hero band unchanged (4 tiles).
- "III. The Bargain" beat shows the granted/denied totals.
- Champions row shows the two new generous tiles alongside the existing records.
- Hall of Fools shows the two new stingy tiles.
- All four new tiles open the right player card on click.
- No console errors; the page still renders when `superlatives.generous_*` / `fools.*` are null (test by loading against an empty DB or a run set with all-zero tasks — the tiles simply don't appear and nothing throws).

- [ ] **Step 2: Run the unit suite once more**

Run: `npm test`
Expected: PASS (all `ratePct` + existing tests green).

- [ ] **Step 3: Capture proof**

Take a preview screenshot of the Champions + Hall of Fools rows and the Bargain beat to share with the user.

---

## Self-Review (completed during authoring)

- **Spec coverage:** Four tiles (Task 3), rate floor `TASK_FLOOR=50` (Task 2), community aggregate beat (Task 4), card-opening holders (Task 3 verify), graceful empty/zero handling (Task 6 Step 1), seed coverage for the floor (Task 5). All spec sections mapped.
- **Placeholders:** none — every code step shows complete code.
- **Type/name consistency:** response keys `generous_count`, `generous_rate`, `taskmaster`, `coldshoulder` are defined in Task 2 Step 5 and consumed by the exact same names in Task 3; `ratePct(part, other)` signature is consistent between Task 1 and its call sites (`ratePct(denied, fulfilled)` for denial %, `ratePct(fulfilled, denied)` for grant %); `totals.tasks_granted` / `totals.tasks_denied` defined in Task 2 Step 2 and used in Task 4 Step 3.

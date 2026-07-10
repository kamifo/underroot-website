# Stats: Record Attribution + Tiles/Discoveries Metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute the record-holder superlative tiles to the diggers who set them (as clickable player cards), replace the saturated "deepest" hero KPI with "tiles clawed", and add two leaderboards (most tiles dug, most discoveries unearthed).

**Architecture:** Server-side aggregation in `api/stats.js` (Neon serverless SQL) emits one JSON blob; `assets/stats.js` renders it into `stats.html` using XSS-safe DOM helpers. Record tiles reuse the existing `attachCard` / `drawDigger` player-card machinery already used by the leaderboard rows. The two new boards reuse `renderBoardWithAvatars`, so they are clickable for free.

**Tech Stack:** Vanilla ES modules, Chart.js (unchanged here), Neon Postgres via `@neondatabase/serverless`, Vercel serverless functions, `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-10-stats-attribution-and-dig-metrics-design.md`

**Testing note:** `stats.js` (API + front-end) has no unit-test harness in this repo — the API is raw SQL and the front-end is DOM rendering; `node --test` only covers pure modules (`validate`, `plausibility`, `leaderboard`, `card-html`, `og-card`). So the new behaviour is verified via the live `/api/stats` response shape and browser checks against the dev server, with `npm test` run as a regression guard that nothing else broke. This matches the repo's existing practice.

---

## File Structure

- **`api/stats.js`** (modify) — totals query drops `deepest`; superlatives split into two count-scalars plus three attributed holder rows; two new board queries (`tiles`, `discoveries`); response object extended.
- **`assets/stats.js`** (modify) — new `recordTile()` helper; hero KPI swap; superlatives render uses `recordTile`; two new `renderBoardWithAvatars` calls.
- **`stats.html`** (modify) — CSS for the in-tile attribution line; two new board `<section>`s.

No new files. No changes to `leaderboard.js` / `leaderboard.html` (the two new boards are top-20 only, no "View all" — a deliberate non-goal).

---

## Task 1: API — attribution, hero-stat swap, and two new boards (`api/stats.js`)

**Files:**
- Modify: `api/stats.js` (totals query ~17-23; superlatives query ~41-47; boards ~29-39; response ~139-146)

All changes are SQL projection + response shape. Verified by inspecting the live `/api/stats` JSON.

- [ ] **Step 1: Drop the now-unused `deepest` from the totals query**

Find (around line 17):

```js
    const [totals] = await sql`
      SELECT count(*)::int AS runs,
             coalesce(sum(villager_deaths), 0)::bigint AS souls,
             coalesce(sum(blocks), 0)::bigint AS blocks,
             coalesce(max(days), 0)::int AS longest,
             coalesce(max(depth), 0)::int AS deepest
      FROM runs WHERE NOT quarantined`;
```

Replace with (removes the `deepest` line; `blocks` is already summed and will feed the new hero KPI):

```js
    const [totals] = await sql`
      SELECT count(*)::int AS runs,
             coalesce(sum(villager_deaths), 0)::bigint AS souls,
             coalesce(sum(blocks), 0)::bigint AS blocks,
             coalesce(max(days), 0)::int AS longest
      FROM runs WHERE NOT quarantined`;
```

- [ ] **Step 2: Add the two new board queries after the `unbrokenBoard` query**

After the `unbrokenBoard` query (ends ~line 39), add:

```js
    const tilesBoard = await sql`
      SELECT share_id, digger_name, blocks, days, depth, gen, cause,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY blocks DESC LIMIT ${LEADER_N}`;

    const discoveriesBoard = await sql`
      SELECT share_id, digger_name, discoveries, depth, days, gen, cause,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY discoveries DESC LIMIT ${LEADER_N}`;
```

(`gen` and `cause` are selected so the player card opened from a row shows its lineage/epitaph lines, even though those columns aren't displayed in the board itself.)

- [ ] **Step 3: Replace the scalar superlatives query with counts + three attributed holders**

Find (around line 41):

```js
    const [superlatives] = await sql`
      SELECT
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days = 0)  AS day0_deaths,
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL) AS first_deaths,
        (SELECT max((payload->'peaks'->>'gold')::int) FROM runs WHERE NOT quarantined AND payload->'peaks' ? 'gold') AS max_gold,
        (SELECT max(villager_deaths) FROM runs WHERE NOT quarantined) AS max_souls,
        (SELECT max(gen)::int FROM runs WHERE NOT quarantined) AS max_gen`;
```

Replace with (keep the two counts the Day-0 percentage needs; fetch the record-holders as full rows like the Hall of Fools queries do):

```js
    // Day-0 Death Club is a percentage of a group — no single holder.
    const [dayCounts] = await sql`
      SELECT
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days = 0)  AS day0_deaths,
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL) AS first_deaths`;

    // Record-holders: full rows (name + cosmetics + card context) so each tile
    // opens the digger's player card, exactly like a leaderboard row.
    const [hoard] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             (payload->'peaks'->>'gold')::int AS gold
      FROM runs WHERE NOT quarantined AND payload->'peaks' ? 'gold'
      ORDER BY (payload->'peaks'->>'gold')::int DESC LIMIT 1`;
    const [souls] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             villager_deaths
      FROM runs WHERE NOT quarantined
      ORDER BY villager_deaths DESC LIMIT 1`;
    const [lineage] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY gen DESC LIMIT 1`;

    const superlatives = {
      day0_deaths: dayCounts.day0_deaths,
      first_deaths: dayCounts.first_deaths,
      hoard: hoard ?? null,      // { …, gold } | null (no run has a gold peak)
      souls: souls ?? null,      // { …, villager_deaths } | null
      lineage: lineage ?? null,  // { …, gen } | null
    };
```

- [ ] **Step 4: Add the two boards to the response**

Find (around line 142):

```js
      boards: { lineage: lineageBoard, unbroken: unbrokenBoard },
```

Replace with:

```js
      boards: { lineage: lineageBoard, unbroken: unbrokenBoard, tiles: tilesBoard, discoveries: discoveriesBoard },
```

(The `superlatives` key on the response object at ~line 143 is unchanged — it now references the object built in Step 3 instead of the destructured query row.)

- [ ] **Step 5: Run the regression suite**

Run: `npm test`
Expected: all tests pass (no stats.js tests exist; this confirms the edit didn't break `leaderboard`/`validate`/etc.).

- [ ] **Step 6: Commit**

```bash
git add api/stats.js
git commit -m "feat(stats): attribute record superlatives, drop deepest total, add tiles/discoveries boards (api)"
```

---

## Task 2: Front-end — record tiles + hero KPI swap (`assets/stats.js`, `stats.html`)

**Files:**
- Modify: `assets/stats.js` (add `recordTile`; hero render ~97-102; superlatives render ~144-152)
- Modify: `stats.html` (CSS near `.hero-tile`, ~line 69)

- [ ] **Step 1: Add the `recordTile` helper**

In `assets/stats.js`, immediately after the existing `heroTile` function (ends ~line 38), add:

```js
// Like heroTile, but attributed: a value + label + a small avatar/name line,
// and the whole tile opens the holder's player card (reuses attachCard, exactly
// like the leaderboard name cells). `holder` carries { digger_name, cosmetics,
// share_id, days, depth, gen, cause, date } — the card degrades if fields are absent.
function recordTile(label, valueText, holder) {
  const t = el('div', undefined, 'hero-tile record-tile');
  t.append(el('div', valueText, 'num'), el('div', label, 'lbl'));
  const who = el('div', undefined, 'record-who');
  const cv = document.createElement('canvas');
  const CSS = 22, PX = CSS * 2;
  cv.width = PX; cv.height = PX;
  cv.style.width = `${CSS}px`; cv.style.height = `${CSS}px`;
  cv.className = 'avatar-canvas';
  drawDigger(cv, holder.cosmetics || {});
  who.append(cv, el('span', holder.digger_name));
  t.append(who);
  attachCard(t, holder);
  return t;
}
```

- [ ] **Step 2: Swap the "deepest" hero KPI for "tiles clawed"**

Find (around line 97):

```js
  document.getElementById('hero').append(
    heroTile('souls claimed by the Maw', num(totals.souls)),
    heroTile('villages fallen', num(totals.runs)),
    heroTile('deepest anyone dared', metres(totals.deepest)),
    heroTile('longest a village held', `${num(totals.longest)} days`),
  );
```

Replace the third line so it reads:

```js
  document.getElementById('hero').append(
    heroTile('souls claimed by the Maw', num(totals.souls)),
    heroTile('villages fallen', num(totals.runs)),
    heroTile('tiles clawed from the earth', num(totals.blocks)),
    heroTile('longest a village held', `${num(totals.longest)} days`),
  );
```

- [ ] **Step 3: Attribute the record superlatives in the render**

Find (around line 144):

```js
  // ---- Superlatives ----
  const day0pct = superlatives.first_deaths
    ? Math.round((100 * superlatives.day0_deaths) / superlatives.first_deaths) : 0;
  document.getElementById('superlatives').append(
    heroTile('Day-0 Death Club', `${day0pct}% of first diggers`),
    heroTile('greatest hoard', `${num(superlatives.max_gold ?? 0)} gold`),
    heroTile('most souls lost in one village', num(superlatives.max_souls ?? 0)),
    heroTile('longest lineage', `${num(superlatives.max_gen ?? 0)} generations`),
  );
```

Replace with (Day-0 stays a plain tile; the three record-holders become attributed cards, each skipped when its holder is null):

```js
  // ---- Superlatives ----
  const day0pct = superlatives.first_deaths
    ? Math.round((100 * superlatives.day0_deaths) / superlatives.first_deaths) : 0;
  const supEl = document.getElementById('superlatives');
  supEl.append(heroTile('Day-0 Death Club', `${day0pct}% of first diggers`));
  if (superlatives.hoard) {
    supEl.append(recordTile('greatest hoard', `${num(superlatives.hoard.gold)} gold`, superlatives.hoard));
  }
  if (superlatives.souls) {
    supEl.append(recordTile('most souls lost in one village', num(superlatives.souls.villager_deaths), superlatives.souls));
  }
  if (superlatives.lineage) {
    supEl.append(recordTile('longest lineage', `${num(superlatives.lineage.gen)} generations`, superlatives.lineage));
  }
```

- [ ] **Step 4: Add the attribution-line CSS**

In `stats.html`, find the `.hero-tile .lbl` rule (around line 69):

```css
    .hero-tile .lbl { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
```

Add directly after it:

```css
    .record-tile { cursor: pointer; }
    .record-who { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; font-size: 12.5px; font-style: italic; color: var(--muted); }
    .record-who span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

(The hover affordance — avatar glow + underlined name — comes for free from the `.pc-trigger` rules that `attachCard` applies.)

- [ ] **Step 5: Commit**

```bash
git add assets/stats.js stats.html
git commit -m "feat(stats): attributed record tiles + tiles-clawed hero KPI (front-end)"
```

---

## Task 3: Front-end — the two new leaderboards (`stats.html`, `assets/stats.js`)

**Files:**
- Modify: `stats.html` (new sections after `#section-unbroken`, ~line 219)
- Modify: `assets/stats.js` (two `renderBoardWithAvatars` calls after the unbroken render, ~line 125)

- [ ] **Step 1: Add the two board sections to the page**

In `stats.html`, find the end of the Unbroken section (around line 219):

```html
      <section id="section-unbroken">
        <h2>The Unbroken — longest without a single death</h2>
        <p class="sub">How far the <em>original</em> digger got before the village first mourned.</p>
        <div class="table-wrap"><table id="board-unbroken"></table></div>
        <a class="viewall" href="leaderboard.html?board=unbroken">View the full board →</a>
      </section>
```

Directly after that closing `</section>`, add:

```html
      <section id="section-tiles">
        <div class="kicker">The Hall of the Great</div>
        <h2>Most Tiles Clawed</h2>
        <p class="sub">Depth hits a floor. The earth moved never does.</p>
        <div class="table-wrap"><table id="board-tiles"></table></div>
      </section>

      <section id="section-discoveries">
        <h2>Greatest Discoverers</h2>
        <p class="sub">Not how deep — how much of the buried strange they dragged into the light.</p>
        <div class="table-wrap"><table id="board-discoveries"></table></div>
      </section>
```

- [ ] **Step 2: Render the two boards**

In `assets/stats.js`, find the end of the `board-unbroken` render (around line 121-125):

```js
  renderBoardWithAvatars(document.getElementById('board-unbroken'), boards.unbroken, [
    { label: 'Days undying', num: true, fmt: (r) => num(r.days) },
    { label: 'Depth', num: true, fmt: (r) => metres(r.depth) },
    { label: 'Date', fmt: (r) => String(r.date).slice(0, 10) },
  ]);
```

Directly after that call, add:

```js
  renderBoardWithAvatars(document.getElementById('board-tiles'), boards.tiles, [
    { label: 'Tiles', num: true, fmt: (r) => num(r.blocks) },
    { label: 'Days', num: true, fmt: (r) => num(r.days) },
    { label: 'Depth', num: true, fmt: (r) => metres(r.depth) },
    { label: 'Fate', fmt: (r) => CAUSE_LABELS[r.cause] ?? r.cause },
    { label: 'Date', fmt: (r) => String(r.date).slice(0, 10) },
  ]);

  renderBoardWithAvatars(document.getElementById('board-discoveries'), boards.discoveries, [
    { label: 'Discoveries', num: true, fmt: (r) => num(r.discoveries) },
    { label: 'Depth', num: true, fmt: (r) => metres(r.depth) },
    { label: 'Days', num: true, fmt: (r) => num(r.days) },
    { label: 'Date', fmt: (r) => String(r.date).slice(0, 10) },
  ]);
```

- [ ] **Step 3: Commit**

```bash
git add stats.html assets/stats.js
git commit -m "feat(stats): add Most Tiles Clawed and Greatest Discoverers boards"
```

---

## Task 4: End-to-end verification

**Files:** none (verification only)

The dev server loads `.env.development.local` (real Neon dev DB) via the wrapper. Seed data first so every board and record tile has rows.

- [ ] **Step 1: Seed the dev database**

Run: `node scripts/seed-stats.js`
Expected: prints a count of inserted sample runs, exits 0. (These rows carry `blocks`, `discoveries`, and gold peaks, so tiles/discoveries boards and the hoard tile all populate.)

- [ ] **Step 2: Start the dev server (background)**

Run: `node scripts/dev-server.mjs 3000`
Expected: `vercel dev` boots and listens on `http://localhost:3000`. Leave it running.

- [ ] **Step 3: Verify the API shape**

Run (Python reads the response from stdin — avoids this repo's ESM/`require` pitfall and any temp-file path issues):

```bash
curl -s http://localhost:3000/api/stats | python -c "import sys,json; j=json.load(sys.stdin); s=j['superlatives']; b=j['boards']; print('deepest gone:', 'deepest' not in j['totals']); print('blocks:', j['totals']['blocks']); print('hoard holder:', s['hoard'] and s['hoard']['digger_name']); print('souls holder:', s['souls'] and s['souls']['digger_name']); print('lineage holder:', s['lineage'] and s['lineage']['digger_name']); print('tiles rows:', len(b['tiles']), 'top blocks:', b['tiles'][0]['blocks'] if b['tiles'] else None); print('disc rows:', len(b['discoveries']), 'top disc:', b['discoveries'][0]['discoveries'] if b['discoveries'] else None)"
```

Expected:
- `deepest gone: true`
- `blocks:` a positive number
- `hoard holder:`, `souls holder:`, `lineage holder:` each a digger name (not `null`)
- `tiles rows:` and `disc rows:` each `> 0`, with a descending top value

- [ ] **Step 4: Verify the page in the browser**

Open `http://localhost:3000/stats.html` in the preview browser and confirm:
1. **Hero band** shows four KPIs, the third reading **"tiles clawed from the earth"** with a number — and no "deepest" tile.
2. **Superlatives row** (down in the "Beneath" section): the *greatest hoard*, *most souls lost*, and *longest lineage* tiles each show a **digger avatar + name** beneath the label; the *Day-0 Death Club* tile does **not**.
3. **Clicking** a record tile opens the player-card modal for that digger (avatar drawn large, name, epitaph). Pressing Escape closes it.
4. Two new boards — **Most Tiles Clawed** and **Greatest Discoverers** — appear after The Unbroken, each populated and ordered descending by its lead column.
5. **Clicking** a row in either new board opens that digger's card.

Capture a screenshot of the superlatives row (showing the attributed names) and of the two new boards as proof.

- [ ] **Step 5: Final regression + stop server**

Run: `npm test`
Expected: all pass.

Stop the background dev server.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Part 1 attribution → Task 1 Step 3 (API holders) + Task 2 Steps 1,3 (recordTile, render). Part 2 hero swap → Task 1 Step 1 (drop deepest) + Task 2 Step 2 (tiles KPI). Part 3 two boards → Task 1 Step 2 (queries) + Task 3 (sections + renders). Non-goals honoured: no `leaderboard.js`/`leaderboard.html` changes, no "View all" links on the new boards, no 5th hero KPI, `discovery_pct` not shown. Verification section → Task 4.
- **Placeholder scan:** none — every code step shows the full before/after and every command has an expected result.
- **Type consistency:** API emits `superlatives.{hoard,souls,lineage}` with fields `{digger_name, cosmetics, share_id, days, depth, gen, cause, date, gold|villager_deaths}`; front-end reads exactly those (`superlatives.hoard.gold`, `superlatives.souls.villager_deaths`, `superlatives.lineage.gen`) and passes the holder straight to `attachCard`, whose `normalized` picks up `digger_name/cosmetics/days/depth/gen/cause/date/share_id`. Board rows expose `blocks`/`discoveries`/`depth`/`days`/`cause`/`date` matching the column `fmt`s. `recordTile` is defined (Task 2 Step 1) before use (Task 2 Step 3).

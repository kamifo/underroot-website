# The Maw's Ledger — Stats Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Underroot community stats page as a scroll-driven "story" in the game's voice — hero on Maw art, narrative beats, real procedurally-rendered digger avatars on the leaderboards, a Hall of Fools, restyled charts, and a full paginated leaderboard.

**Architecture:** Three independent units. (1) `assets/digger.js` — an ES-module canvas port of the game's `DiggerRenderer.gd`, drawing each shared run's real digger from its `cosmetics` loadout. (2) Server aggregates — a `fools` block added to `/api/stats` and a new `/api/leaderboard` paginated endpoint. (3) The redesigned `stats.html` + `assets/stats.js` (converted to an ES module that imports `digger.js`) plus a new `leaderboard.html`.

**Tech Stack:** Vanilla ES modules (no framework), HTML canvas 2D, Chart.js 4 (CDN global), Neon serverless Postgres, Vercel functions, `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-09-stats-ledger-redesign-design.md`

---

## File Structure

**Create:**
- `assets/digger.js` — canvas digger renderer, ported 1:1 from `scripts/world/DiggerRenderer.gd`. Exports `drawDigger` (public) + `CI`, `drawFull`, `COSMETIC_COLORS` (for tests).
- `assets/digger.test.js` — smoke tests: renderer runs against a stub 2D context for full/minimal loadouts and every headwear + form.
- `api/leaderboard.js` — `GET /api/leaderboard?board=&offset=` paginated boards. Exports `parseLeaderboardQuery` for tests + default handler.
- `api/leaderboard.test.js` — unit tests for `parseLeaderboardQuery`.
- `leaderboard.html` — full-board page.
- `assets/leaderboard.js` — ES module loader for `leaderboard.html`.

**Modify:**
- `api/stats.js` — add the `fools` aggregates to the response.
- `stats.html` — restructure into the scroll sections; load scripts as modules.
- `assets/stats.js` — convert to ES module; import `drawDigger`; render hero/beats/halls/fools/dig with graceful degradation.

**Untouched:** `api/submit-run.js`, `api/_lib/validate.js`, `api/_lib/plausibility.js`, `db/schema.sql`. No game-client changes.

---

## Reference: GDScript → Canvas translation rules

The digger port applies these rules mechanically to `scripts/world/DiggerRenderer.gd`:

| GDScript | JavaScript |
|---|---|
| `var x := expr` / `var x: T := expr` | `const x = expr` |
| `Vector2(a, b)` | `V(a, b)` |
| `Rect2(a, b, c, d)` | `Rect2(a, b, c, d)` |
| `Color(r, g, b)` / `Color(r,g,b,a)` | `Color(r, g, b)` / `Color(r, g, b, a)` |
| `Color.html("#hex")` | `Color.html('#hex')` |
| `PackedVector2Array([Vector2(a,b), ...])` | `[V(a, b), ...]` |
| `minf(x, y)` / `maxf(x, y)` | `Math.min(x, y)` / `Math.max(x, y)` |
| `str(loadout.get("k", "d"))` | `String(loadout.k ?? 'd')` |
| `match expr: "a": … _: …` | `switch (expr) { case 'a': … break; default: … }` |
| `for v: float in [ … ]:` | `for (const v of [ … ])` |
| `ci.draw_*` | `ci.draw_*` (identical method names — that's the point of the shim) |

`low_perf` is always `false` on the web (pass `false` everywhere).

---

## Task 1: Digger renderer — shim, colors, orchestration, smoke skeleton

**Files:**
- Create: `assets/digger.js`
- Test: `assets/digger.test.js`

- [ ] **Step 1: Write the failing smoke test**

```js
// assets/digger.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFull, CI } from './digger.js';

// A no-op 2D context that records call counts, so we can assert the renderer
// issued draw calls without a real canvas.
export function fakeCtx() {
  const calls = [];
  const rec = (n) => (...a) => calls.push([n, ...a]);
  return {
    calls, fillStyle: '', strokeStyle: '', lineWidth: 0,
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), arc: rec('arc'), fill: rec('fill'),
    stroke: rec('stroke'), fillRect: rec('fillRect'),
  };
}

test('renders the default humble digger without throwing', () => {
  const ctx = fakeCtx();
  drawFull(new CI(ctx), {}, false);
  assert.ok(ctx.calls.length > 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test assets/digger.test.js`
Expected: FAIL — `Cannot find module './digger.js'` (or `drawFull is not a function`).

- [ ] **Step 3: Create `assets/digger.js` with the shim, color table, color helpers, and orchestration**

```js
// assets/digger.js
// Digger renderer for the web. Ported 1:1 from scripts/world/DiggerRenderer.gd
// @ <fill in the underroot game repo commit hash at implementation time>.
// KEEP STRUCTURALLY IDENTICAL to the GDScript source: same function names, same
// order, same magic numbers — so future cosmetic additions are a trivial diff.
// Coordinate space matches the game: feet at origin, up = negative Y.

// Only skin + tunic-dye ids need a color lookup (hair_color / beard_color ride
// in the loadout as hex already). Copied from the game's data/cosmetics.json.
export const COSMETIC_COLORS = {
  skin: { skin_tan: '#e6c299', skin_fair: '#f0d2b0', skin_olive: '#c8a878', skin_brown: '#9a6e48', skin_dark: '#6e4a30' },
  dye:  { rust: '#6b3b2e', flax: '#cdbd98', walnut: '#4f3a25', ochre: '#b08a3c', soot: '#2c2825', moss: '#5d6a3e', royal: '#3a4a8a', slate: '#54606a' },
};

// --- Godot value shims ---
export function Color(r, g, b, a = 1) { return { r, g, b, a }; }
Color.html = (hex) => {
  const n = hex.replace('#', '');
  return { r: parseInt(n.slice(0, 2), 16) / 255, g: parseInt(n.slice(2, 4), 16) / 255, b: parseInt(n.slice(4, 6), 16) / 255, a: 1 };
};
export const V = (x, y) => ({ x, y });
export const Rect2 = (x, y, w, h) => ({ x, y, w, h });
const css = (c) => (typeof c === 'string' ? c : `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a ?? 1})`);

// --- CanvasItem shim: same method names as Godot's `ci` ---
export class CI {
  constructor(ctx) { this.ctx = ctx; }
  draw_rect(r, c) { this.ctx.fillStyle = css(c); this.ctx.fillRect(r.x, r.y, r.w, r.h); }
  draw_circle(p, rad, c) { this.ctx.fillStyle = css(c); this.ctx.beginPath(); this.ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); this.ctx.fill(); }
  draw_colored_polygon(pts, c) {
    this.ctx.fillStyle = css(c); this.ctx.beginPath(); this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.closePath(); this.ctx.fill();
  }
  draw_line(a, b, c, w) { this.ctx.strokeStyle = css(c); this.ctx.lineWidth = w; this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke(); }
  draw_polyline(pts, c, w) {
    this.ctx.strokeStyle = css(c); this.ctx.lineWidth = w; this.ctx.beginPath(); this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.stroke();
  }
}

// --- color helpers (ported from _skin / _skin_shadow / _tunic_dye) ---
function _skin(loadout) { return Color.html(COSMETIC_COLORS.skin[loadout.skin ?? 'skin_tan'] ?? '#e6c299'); }
function _skin_shadow(loadout) { const s = _skin(loadout); return Color(s.r * 0.88, s.g * 0.84, s.b * 0.80, 0.30); }
function _tunic_dye(loadout) { return Color.html(COSMETIC_COLORS.dye[loadout.tunic_dye ?? 'rust'] ?? '#6b3b2e'); }

// --- forms ---
function _active_form(loadout) { const f = String(loadout.form ?? 'form_none'); return f !== 'form_none' ? f : ''; }
function _draw_form(ci, form, low_perf) { switch (form) { case 'form_maweaten': _draw_maweaten(ci, low_perf); break; } }

// --- orchestration (ported from draw_body_below_tool / _above_tool / draw_full) ---
function drawBodyBelowTool(ci, loadout, low_perf) {
  const form = _active_form(loadout);
  if (form !== '') { _draw_form(ci, form, low_perf); return; }
  _draw_boots(ci, loadout, low_perf);
  _draw_legs(ci, loadout, low_perf);
  _draw_belt(ci);
  _draw_tunic(ci, loadout, low_perf);
  _draw_extra_back(ci, loadout, low_perf);
  _draw_arms(ci, loadout, low_perf);
  _draw_lantern(ci);
}
function drawBodyAboveTool(ci, loadout, low_perf) {
  if (_active_form(loadout) !== '') return;
  _draw_head(ci, loadout);
  _draw_beard(ci, loadout, low_perf);
  _draw_hair(ci, loadout, low_perf);
  _draw_headwear(ci, loadout, low_perf);
  _draw_extra_hands(ci, loadout, low_perf);
}
export function drawFull(ci, loadout, low_perf) {
  drawBodyBelowTool(ci, loadout, low_perf);
  drawBodyAboveTool(ci, loadout, low_perf);
}

// Public: draw a digger scaled to fit a square canvas (feet-down), matching the
// game's slot-icon "form" framing (figure ~76 units tall, centre_y -31).
export function drawDigger(canvas, loadout) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width; // caller sets width=height (px); use 2× CSS px for crispness
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = size / 76;
  ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2 + 31 * scale);
  drawFull(new CI(ctx), loadout ?? {}, false);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// --- piece functions: ported in Tasks 2–3 ---
// The three below are worked examples establishing the pattern; the rest follow
// the same mechanical translation in later tasks. Placeholder stubs so Task 1
// compiles and the default-digger smoke test exercises real geometry.
function _draw_belt(ci) {
  ci.draw_rect(Rect2(-7.0, -25.0, 14.0, 2.0), Color(0.16, 0.10, 0.06));
  ci.draw_rect(Rect2(-1.5, -25.5, 3.0, 2.6), Color(0.69, 0.54, 0.18));
}
function _draw_head(ci, loadout) {
  const skin = _skin(loadout);
  ci.draw_circle(V(0.0, -46.0), 7.5, skin);
  ci.draw_circle(V(2.5, -44.5), 4.3, _skin_shadow(loadout));
  ci.draw_circle(V(-2.5, -46.5), 1.3, Color(0.12, 0.08, 0.04));
  ci.draw_circle(V(1.5, -46.5), 1.3, Color(0.12, 0.08, 0.04));
  ci.draw_circle(V(-2.1, -46.9), 0.45, Color(0.92, 0.92, 0.86, 0.85));
  ci.draw_circle(V(1.9, -46.9), 0.45, Color(0.92, 0.92, 0.86, 0.85));
  ci.draw_rect(Rect2(-0.4, -44.6, 1.5, 2.0), Color(skin.r * 0.80, skin.g * 0.76, skin.b * 0.72, 0.5));
}
function _tunic_collar(ci, deep) {
  ci.draw_colored_polygon([V(-3.0, -39.0), V(3.0, -39.0), V(1.6, -36.0), V(0.0, -34.8), V(-1.6, -36.0)], deep);
}

// Temporary minimal stubs so drawFull runs end-to-end in Task 1; each is REPLACED
// by its full port in Task 2/3.
function _draw_boots() {}
function _draw_legs() {}
function _draw_tunic(ci, loadout) { const base = _tunic_dye(loadout); ci.draw_rect(Rect2(-7.0, -39.0, 14.0, 14.0), base); _tunic_collar(ci, Color(base.r * 0.58, base.g * 0.58, base.b * 0.58)); }
function _draw_extra_back() {}
function _draw_arms() {}
function _draw_lantern() {}
function _draw_beard() {}
function _draw_hair() {}
function _draw_headwear() {}
function _draw_extra_hands() {}
function _draw_maweaten() {}
```

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `node --test assets/digger.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add assets/digger.js assets/digger.test.js
git commit -m "feat(digger): canvas renderer shim, colors, orchestration + smoke test"
```

---

## Task 2: Port the body pieces

Replace the temporary stubs for the body pieces with 1:1 ports of these functions from `scripts/world/DiggerRenderer.gd`, applying the translation-rules table above:

- `_draw_boots` (lines ~115–174), `_draw_legs` (~176–178), `_draw_tunic` (~187–262), `_tunic_torso_detail` (~266–274), `_draw_extra_back` (~282–315), `_draw_arms` (~317–326), `_draw_lantern` (~328–331), `_draw_beard` (~347–415), `_draw_hair` (~417–490), `_draw_extra_hands` (~526–542).

(`_draw_belt`, `_draw_head`, `_tunic_collar` are already fully ported from Task 1. `_draw_tunic` and the stubs are REPLACED with the full versions here.)

**Files:**
- Modify: `assets/digger.js`
- Test: `assets/digger.test.js`

- [ ] **Step 1: Extend the smoke test to exercise the body branches**

```js
// append to assets/digger.test.js
test('renders a fully-equipped body loadout without throwing', () => {
  const ctx = fakeCtx();
  drawFull(new CI(ctx), {
    skin: 'skin_dark', tunic: 'tunic_robe', tunic_dye: 'royal',
    boots: 'boots_laced', beard: 'beard_bushy', hair: 'hair_long', extra: 'extra_mantle',
  }, false);
  assert.ok(ctx.calls.some(([n]) => n === 'fill'));
});

test('every tunic / boots / beard / hair variant renders', () => {
  const tunics = ['tunic_plain', 'tunic_furtrim', 'tunic_robe', 'tunic_jerkin', 'tunic_gambeson', 'tunic_oilskin'];
  const boots = ['boots_plain', 'boots_furcuff', 'boots_ironshod', 'boots_laced', 'boots_tall', 'boots_warmarch'];
  const beards = ['beard_stubble', 'beard_clean', 'beard_goatee', 'beard_braided', 'beard_bushy', 'beard_long'];
  const hairs = ['hair_short', 'hair_bald', 'hair_long', 'hair_topknot', 'hair_ponytail', 'hair_mohawk'];
  const extras = ['extra_none', 'extra_amulet', 'extra_mantle', 'extra_sash', 'extra_gloves'];
  for (const set of [tunics, boots, beards, hairs, extras]) {
    for (const id of set) {
      const ctx = fakeCtx();
      const key = { tunic: 'tunic', boots: 'boots', beard: 'beard', hair: 'hair', extra: 'extra' };
      // Apply id to whichever slot it belongs to; unknown slots keep defaults.
      const lo = {};
      if (id.startsWith('tunic')) lo.tunic = id; else if (id.startsWith('boots')) lo.boots = id;
      else if (id.startsWith('beard')) lo.beard = id; else if (id.startsWith('hair')) lo.hair = id;
      else lo.extra = id;
      drawFull(new CI(ctx), lo, false);
      assert.ok(ctx.calls.length > 0, id);
      void key;
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test assets/digger.test.js`
Expected: PASS actually still possible (stubs are no-ops that don't throw). The test guards behavior, so to force a real failure first, temporarily change the new assertion `ctx.calls.some(([n]) => n === 'fill')` — the stubbed `_draw_tunic` DOES call fill, but stubbed boots/arms don't. If all new assertions pass against stubs, that's acceptable: the test's value is regression protection once real ports land. Proceed to Step 3 regardless.

- [ ] **Step 3: Replace each stub with its full port**

Port verbatim from `DiggerRenderer.gd` using the rules table. Worked example — `_draw_arms` (source ~317–326) becomes:

```js
function _draw_arms(ci, loadout, _low_perf) {
  const base = _tunic_dye(loadout);
  const dark = Color(base.r * 0.82, base.g * 0.82, base.b * 0.82);
  ci.draw_rect(Rect2(-12.0, -38.0, 5.0, 12.0), base);
  ci.draw_rect(Rect2(7.0, -38.0, 5.0, 12.0), dark);
  ci.draw_rect(Rect2(-12.0, -38.0, 5.0, 1.4), Color(Math.min(base.r * 1.18, 1.0), Math.min(base.g * 1.16, 1.0), Math.min(base.b * 1.14, 1.0)));
  ci.draw_rect(Rect2(7.0, -38.0, 5.0, 1.4), Color(Math.min(dark.r * 1.15, 1.0), Math.min(dark.g * 1.13, 1.0), Math.min(dark.b * 1.12, 1.0)));
  ci.draw_rect(Rect2(-12.0, -28.0, 5.0, 2.0), Color(base.r * 0.62, base.g * 0.62, base.b * 0.62));
  ci.draw_rect(Rect2(7.0, -28.0, 5.0, 2.0), Color(dark.r * 0.68, dark.g * 0.68, dark.b * 0.68));
}
```

Worked example — a `switch` from `_draw_boots` (the `boots_furcuff` case, source ~125–130):

```js
function _draw_boots(ci, loadout, low_perf) {
  ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 9.0), Color(0.31, 0.22, 0.13));
  ci.draw_rect(Rect2(1.0, -9.0, 5.0, 9.0), Color(0.26, 0.18, 0.11));
  ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 1.6), Color(0.39, 0.29, 0.18));
  ci.draw_rect(Rect2(1.0, -9.0, 5.0, 1.6), Color(0.33, 0.24, 0.14));
  ci.draw_rect(Rect2(-6.6, -2.2, 6.1, 2.2), Color(0.15, 0.10, 0.06));
  ci.draw_rect(Rect2(0.5, -2.2, 6.1, 2.2), Color(0.12, 0.08, 0.05));
  switch (String(loadout.boots ?? 'boots_plain')) {
    case 'boots_furcuff':
      ci.draw_rect(Rect2(-6.5, -11.0, 6.0, 2.5), Color(0.79, 0.74, 0.64));
      ci.draw_rect(Rect2(0.5, -11.0, 6.0, 2.5), Color(0.70, 0.65, 0.55));
      if (!low_perf) { ci.draw_circle(V(-3.5, -10.0), 0.9, Color(0.86, 0.82, 0.72)); ci.draw_circle(V(3.5, -10.0), 0.9, Color(0.78, 0.74, 0.64)); }
      break;
    // … port the remaining cases (boots_ironshod, boots_laced, boots_tall,
    //    boots_warmarch, default boots_plain) the same way …
  }
}
```

Complete every listed function this way. Keep the default (`_:`) GDScript branch as the `switch` `default:` case.

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `node --test assets/digger.test.js`
Expected: PASS (all tests, no throws).

- [ ] **Step 5: Commit**

```bash
git add assets/digger.js assets/digger.test.js
git commit -m "feat(digger): port body pieces (boots, tunic, arms, hair, beard, extras)"
```

---

## Task 3: Port headwear and the Maw-Eaten form

Port these from `DiggerRenderer.gd` (rules table applies; note `_draw_maweaten` uses `draw_polyline`, already in the shim):

- `_draw_headwear` dispatch (~492–524), and its helpers: `_draw_helm_dome` (~544–560), `_draw_horns` (~562–575), `_draw_crown` (~577–587), `_draw_crown_jeweled` (~589–620), `_draw_crown_ravenous` (~622–655), `_draw_helm_cracked` (~657–678), `_draw_plague_mask` (~680–704), `_draw_propeller` (~786–807), `_draw_partyhat` (~809–832).
- `_draw_maweaten` (~706–781) — replaces the Task 1 stub.

**Files:**
- Modify: `assets/digger.js`
- Test: `assets/digger.test.js`

- [ ] **Step 1: Extend the smoke test to cover every headwear + the form**

```js
// append to assets/digger.test.js
test('every headwear renders without throwing', () => {
  const hats = ['head_bare', 'head_clothcap', 'head_ironhelm', 'head_horned', 'head_crown',
    'head_diadem', 'head_ravenous', 'head_crackhelm', 'head_plaguemask', 'head_propeller', 'head_birthday'];
  for (const hw of hats) {
    const ctx = fakeCtx();
    drawFull(new CI(ctx), { headwear: hw }, false);
    assert.ok(ctx.calls.length > 0, hw);
  }
});

test('the Maw-Eaten form renders and overrides other slots', () => {
  const ctx = fakeCtx();
  drawFull(new CI(ctx), { form: 'form_maweaten', headwear: 'head_crown' }, false);
  assert.ok(ctx.calls.some(([n]) => n === 'stroke'), 'maweaten draws polylines');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test assets/digger.test.js`
Expected: FAIL — the maweaten test asserts a `stroke` call, but the Task 1 stub `_draw_maweaten` is empty, so no strokes are recorded.

- [ ] **Step 3: Port the headwear dispatch, its helpers, and `_draw_maweaten`**

Replace the `_draw_headwear` and `_draw_maweaten` stubs and add the helper functions, ported verbatim. Worked example — `_draw_headwear` dispatch:

```js
function _draw_headwear(ci, loadout, low_perf) {
  switch (String(loadout.headwear ?? 'head_bare')) {
    case 'head_clothcap':
      ci.draw_colored_polygon([V(-7.0, -49.0), V(-6.5, -52.0), V(-3.5, -54.6), V(0.0, -55.6), V(3.5, -54.6), V(6.5, -52.0), V(7.0, -49.0)], Color(0.36, 0.42, 0.25));
      ci.draw_rect(Rect2(-7.6, -50.0, 15.2, 2.2), Color(0.28, 0.33, 0.19));
      if (!low_perf) ci.draw_circle(V(0.0, -55.8), 1.3, Color(0.46, 0.52, 0.32));
      break;
    case 'head_ironhelm': _draw_helm_dome(ci, low_perf); break;
    case 'head_horned': _draw_helm_dome(ci, low_perf); _draw_horns(ci, low_perf); break;
    case 'head_crown': _draw_crown(ci, low_perf); break;
    case 'head_diadem': _draw_crown_jeweled(ci, low_perf); break;
    case 'head_ravenous': _draw_crown_ravenous(ci, low_perf); break;
    case 'head_crackhelm': _draw_helm_cracked(ci, low_perf); break;
    case 'head_plaguemask': _draw_plague_mask(ci, low_perf); break;
    case 'head_propeller': _draw_propeller(ci, low_perf); break;
    case 'head_birthday': _draw_partyhat(ci, low_perf); break;
    default: break; // head_bare
  }
}
```

Then port each helper and `_draw_maweaten` the same way (the Maw-Eaten `ci.draw_polyline(PackedVector2Array([...]), magma, 0.8)` calls become `ci.draw_polyline([V(...), ...], magma, 0.8)`).

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `node --test assets/digger.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add assets/digger.js assets/digger.test.js
git commit -m "feat(digger): port headwear variants and the Maw-Eaten form"
```

---

## Task 4: `/api/leaderboard` paginated endpoint

**Files:**
- Create: `api/leaderboard.js`
- Test: `api/leaderboard.test.js`

- [ ] **Step 1: Write the failing test for `parseLeaderboardQuery`**

```js
// api/leaderboard.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeaderboardQuery } from './leaderboard.js';

test('defaults to lineage board, offset 0, page 50', () => {
  assert.deepEqual(parseLeaderboardQuery({}), { board: 'lineage', offset: 0, limit: 50 });
});
test('accepts the unbroken board', () => {
  assert.equal(parseLeaderboardQuery({ board: 'unbroken' }).board, 'unbroken');
});
test('rejects unknown board names (falls back to lineage)', () => {
  assert.equal(parseLeaderboardQuery({ board: 'garbage' }).board, 'lineage');
});
test('clamps a negative or non-numeric offset to 0', () => {
  assert.equal(parseLeaderboardQuery({ offset: '-5' }).offset, 0);
  assert.equal(parseLeaderboardQuery({ offset: 'abc' }).offset, 0);
});
test('caps a huge offset', () => {
  assert.equal(parseLeaderboardQuery({ offset: '999999999' }).offset, 100000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test api/leaderboard.test.js`
Expected: FAIL — `Cannot find module './leaderboard.js'`.

- [ ] **Step 3: Implement `api/leaderboard.js`**

```js
// api/leaderboard.js
// GET /api/leaderboard?board=lineage|unbroken&offset=<n> — one page (50 rows) of
// a full board, same ordering as /api/stats' embedded top-20, for "View all".
import { corsHeaders } from './_lib/ingest.js';
import { getSql } from './_lib/db.js';

const PAGE = 50;
const MAX_OFFSET = 100000;

export function parseLeaderboardQuery(q) {
  const board = q?.board === 'unbroken' ? 'unbroken' : 'lineage';
  let offset = Number.parseInt(q?.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.min(offset, MAX_OFFSET);
  return { board, offset, limit: PAGE };
}

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const { board, offset, limit } = parseLeaderboardQuery(req.query ?? {});
    const sql = getSql();
    const rows = board === 'unbroken'
      ? await sql`
          SELECT digger_name, first_death_days AS days, first_death_depth AS depth,
                 payload->'cosmetics' AS cosmetics, received_at::date AS date
          FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL
          ORDER BY first_death_days DESC, first_death_depth DESC
          OFFSET ${offset} LIMIT ${limit}`
      : await sql`
          SELECT digger_name, days, depth, gen, cause, blocks,
                 payload->'cosmetics' AS cosmetics, received_at::date AS date
          FROM runs WHERE NOT quarantined
          ORDER BY days DESC, depth DESC
          OFFSET ${offset} LIMIT ${limit}`;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ board, offset, limit, rows });
  } catch (err) {
    console.error('leaderboard failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal error' });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test api/leaderboard.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/leaderboard.js api/leaderboard.test.js
git commit -m "feat(api): paginated /api/leaderboard endpoint"
```

---

## Task 5: Hall of Fools aggregates on `/api/stats`

**Files:**
- Modify: `api/stats.js` (add queries + extend the response object)

- [ ] **Step 1: Add the Fools queries inside the handler's `try`, after the existing `scatter`/`causesByGen` blocks**

```js
    // ---- Hall of Fools: dubious honours (each null when no run qualifies) ----
    const [hoarder] = await sql`
      SELECT digger_name, days FROM runs
      WHERE NOT quarantined AND NOT (payload->'peaks' ? 'gold')
      ORDER BY days DESC LIMIT 1`;
    const [overconfident] = await sql`
      SELECT digger_name, depth, days FROM runs
      WHERE NOT quarantined AND days <= 15
      ORDER BY depth DESC LIMIT 1`;
    const [scratched] = await sql`
      SELECT digger_name, days, depth FROM runs
      WHERE NOT quarantined AND days >= 20
      ORDER BY depth ASC, days DESC LIMIT 1`;
    const [groundhog] = await sql`
      SELECT digger_name, mx FROM (
        SELECT digger_name, (
          SELECT max(cnt) FROM (
            SELECT count(*) AS cnt
            FROM jsonb_array_elements(payload->'lineage') AS e
            GROUP BY (e->>'days')
          ) g
        ) AS mx
        FROM runs WHERE NOT quarantined
      ) s WHERE mx >= 2 ORDER BY mx DESC LIMIT 1`;

    const fools = {
      speedrun: superlatives.day0_deaths ?? 0,        // count; reuse existing superlative
      hoarder: hoarder ?? null,                        // { digger_name, days }
      overconfident: overconfident ?? null,            // { digger_name, depth, days }
      scratched: scratched ?? null,                    // { digger_name, days, depth }
      groundhog: groundhog ?? null,                    // { digger_name, mx }
    };
```

- [ ] **Step 2: Add `fools` to the response payload**

Modify the `return res.status(200).json({ … })` to include `fools`:

```js
    return res.status(200).json({
      totals,
      causes,
      boards: { lineage: lineageBoard, unbroken: unbrokenBoard },
      superlatives,
      fools,
      charts: { survival, runLenHist, depthHist, progression, scatter, causesByGen },
    });
```

- [ ] **Step 3: Verify against the local dev server + seed data**

```bash
node scripts/dev-server.mjs 3000   # in one terminal
node scripts/seed-stats.js 60      # in another: seeds 60 fake runs locally
curl -s http://localhost:3000/api/stats | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).fools,null,2)))"
```

Expected: a `fools` object printed with `speedrun` (a number) and `hoarder` / `overconfident` / `scratched` / `groundhog` each either an object or `null`. No 500.

- [ ] **Step 4: Commit**

```bash
git add api/stats.js
git commit -m "feat(api): Hall of Fools aggregates on /api/stats"
```

---

## Task 6: Digger avatar cell — board rendering helper

Convert `assets/stats.js` to an ES module and add a board renderer that draws a digger canvas in each row. This task wires the renderer into the page without yet restructuring the whole layout.

**Files:**
- Modify: `assets/stats.js` (add `import`; add `diggerCell` + `renderBoardWithAvatars`)
- Modify: `stats.html` (script tags → modules)

- [ ] **Step 1: Change the script tags in `stats.html`**

Replace the two `<script … defer>` lines (`stats.js` currently `<script src="/assets/stats.js" defer>`) so Chart.js stays a classic global and stats.js becomes a module loaded after it:

```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js" integrity="sha384-JUh163oCRItcbPme8pYnROHQMC6fNKTBWtRG3I3I0erJkzNgL7uxKlNwcrcFKeqF" crossorigin="anonymous" defer></script>
  <script type="module" src="/assets/stats.js"></script>
```

(Keep the Chart.js tag BEFORE the module tag — both defer and execute in document order, so the `Chart` global is set first.)

- [ ] **Step 2: Add the import and avatar helpers at the top of `assets/stats.js`**

```js
import { drawDigger } from './digger.js';

// A leaderboard name cell: a small digger canvas + the digger name. The canvas
// is drawn at 2× CSS pixels for crispness. cosmetics may be null/partial on old
// runs — drawDigger defaults every missing slot.
function diggerCell(name, cosmetics) {
  const td = document.createElement('td');
  const cv = document.createElement('canvas');
  const CSS = 28, PX = CSS * 2;
  cv.width = PX; cv.height = PX;
  cv.style.width = `${CSS}px`; cv.style.height = `${CSS}px`;
  cv.className = 'avatar-canvas';
  drawDigger(cv, cosmetics || {});
  const span = el('span', name); // el() = existing XSS-safe helper
  td.className = 'name-cell';
  td.append(cv, span);
  return td;
}
```

- [ ] **Step 3: Add a board renderer that uses avatar cells for the digger column**

```js
// Like renderBoard, but the first column is a digger avatar + name. `cols` here
// excludes the digger column (added automatically as the first data column).
function renderBoardWithAvatars(table, rows, cols) {
  table.replaceChildren();
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  head.append(el('th', '#'), el('th', 'Digger'));
  for (const c of cols) head.append(el('th', c.label, c.num ? 'num' : ''));
  thead.append(head);
  table.append(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.append(el('td', String(i + 1)));
    tr.append(diggerCell(r.digger_name, r.cosmetics));
    for (const c of cols) tr.append(el('td', c.fmt(r), c.num ? 'num' : ''));
    tbody.append(tr);
  });
  table.append(tbody);
}
```

- [ ] **Step 4: Swap the two board render calls to use avatars**

In `render()`, replace the `renderBoard(document.getElementById('board-lineage'), …)` and `board-unbroken` calls with `renderBoardWithAvatars(...)`, dropping the now-redundant `{ label: 'Digger', fmt: (r) => r.digger_name }` column from each `cols` array (the avatar cell supplies it).

- [ ] **Step 5: Add avatar CSS to the `<style>` block in `stats.html`**

```css
    .name-cell { display: flex; align-items: center; gap: 10px; }
    .avatar-canvas { flex: none; image-rendering: auto; background: rgba(255,255,255,0.02); border-radius: 3px; }
```

- [ ] **Step 6: Verify in the browser**

```bash
node scripts/dev-server.mjs 3000
node scripts/seed-stats.js 60
```

Open `http://localhost:3000/stats.html`. Expected: both leaderboards show a small rendered digger beside each name (crown/helm/etc. per the seeded `cosmetics`). Check the browser console for errors (module load, `Chart` global).

- [ ] **Step 7: Commit**

```bash
git add stats.html assets/stats.js
git commit -m "feat(stats): real digger avatars on the leaderboards"
```

---

## Task 7: Restructure `stats.html` into the scroll layout

Rebuild the page markup + CSS into the Ledger sections. This is presentation only; `stats.js` populates them in Task 8.

**Files:**
- Modify: `stats.html`

- [ ] **Step 1: Replace the `<article class="doc">` body with the scroll sections**

Keep `#stats-error`, `#empty-state`, and every id `stats.js` targets (`hero`, `board-lineage`, `board-unbroken`, `superlatives`, and the seven `chart-*` canvases). Add the new hero, beat, divider, and fools containers. Structure:

```html
  <div class="hero" id="hero-band">
    <div class="hero-inner">
      <div class="kicker">The Community Archive</div>
      <h1>The Maw's Ledger</h1>
      <p class="lede">Every village that ever dug. Every soul it cost. The Maw keeps count.</p>
      <div class="kpis" id="hero"></div>   <!-- KPI tiles injected here -->
    </div>
  </div>

  <article class="doc">
    <div id="stats-error">The village archive is unreachable right now — try again soon.</div>
    <div id="empty-state">No runs shared yet — be the first: share your run from the death screen.</div>

    <div id="stats-content">
      <section class="beat" id="beat-shovel">
        <div class="prose"><div class="kicker">I. The Shovel</div><h2>They took up the shovel.</h2><p id="beat-shovel-copy"></p></div>
        <div class="art"><div class="chart-box"><canvas id="chart-survival" role="img" aria-label="Survival curve"></canvas></div></div>
      </section>

      <section class="beat flip" id="beat-fall">
        <div class="prose"><div class="kicker">II. The Fall</div><h2>Everyone loses. Here is how.</h2><p id="beat-fall-copy"></p></div>
        <div class="art"><div class="chart-box"><canvas id="chart-causes" role="img" aria-label="Deaths by cause"></canvas></div></div>
      </section>

      <div class="divider" id="divider-village"><p class="q">"You build walls against a thing that has never known a wall it could not pass."</p></div>

      <section id="section-lineage">
        <div class="kicker">The Hall of the Great</div>
        <h2>Longest Lineages</h2>
        <div class="table-wrap"><table id="board-lineage"></table></div>
        <a class="viewall" href="leaderboard.html?board=lineage">View the full board →</a>
      </section>

      <section id="section-unbroken">
        <h2>The Unbroken — longest without a single death</h2>
        <p class="sub">How far the <em>original</em> digger got before the village first mourned.</p>
        <div class="table-wrap"><table id="board-unbroken"></table></div>
        <a class="viewall" href="leaderboard.html?board=unbroken">View the full board →</a>
      </section>

      <section id="section-fools">
        <div class="kicker">The Hall of Fools</div>
        <h2>Dubious Honours</h2>
        <p class="sub">Not every legend is a hero. The Maw remembers these too.</p>
        <div class="fools" id="fools"></div>
      </section>

      <div class="divider" id="divider-underground"><p class="q">"Down and down. As if the answer were ever at the bottom."</p></div>

      <section id="section-dig">
        <div class="kicker">Beneath</div>
        <h2>How deep the community dares</h2>
        <div class="chart-grid">
          <div class="chart-box"><canvas id="chart-progression" role="img" aria-label="Depth progression"></canvas></div>
          <div class="chart-box"><canvas id="chart-depth-hist" role="img" aria-label="Runs by final depth"></canvas></div>
          <div class="chart-box"><canvas id="chart-scatter" role="img" aria-label="Depth versus days"></canvas></div>
        </div>
        <section class="tile-row" id="superlatives" style="margin-top:40px"></section>
        <div class="chart-grid" style="margin-top:20px">
          <div class="chart-box"><canvas id="chart-runlen" role="img" aria-label="Runs by length"></canvas></div>
          <div class="chart-box"><canvas id="chart-causes-gen" role="img" aria-label="Deaths by cause per generation"></canvas></div>
        </div>
      </section>
    </div>
  </article>
```

- [ ] **Step 2: Add the section CSS to the `<style>` block**

```css
    .hero { position: relative; min-height: 92vh; display: flex; flex-direction: column; justify-content: flex-end;
      background: url('assets/images/The_Maw.png') center/cover no-repeat; }
    .hero::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(20,16,12,.5),rgba(20,16,12,.1) 40%,var(--bg) 100%); }
    .hero-inner { position:relative; z-index:2; max-width:var(--maxw); margin:0 auto; width:100%; padding:0 clamp(20px,5vw,40px) 46px; }
    .hero h1 { text-shadow:0 2px 20px rgba(0,0,0,.8); }
    .hero .lede { text-shadow:0 1px 8px rgba(0,0,0,.8); }
    .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:30px; }
    @media(max-width:680px){ .kpis{ grid-template-columns:repeat(2,1fr);} }
    .beat { display:grid; grid-template-columns:1fr 1fr; gap:44px; align-items:center; margin-top:80px; }
    .beat.flip .art { order:2; }
    .beat .prose p { color:rgba(255,255,255,.8); font-style:italic; font-size:1.1rem; }
    @media(max-width:680px){ .beat{ grid-template-columns:1fr; gap:22px;} .beat.flip .art{ order:0;} }
    .divider { height:46vh; margin:56px 0; background-attachment:fixed; background-position:center; background-size:cover; position:relative; display:flex; align-items:center; justify-content:center; }
    .divider#divider-village { background-image:url('assets/images/The_Village.png'); }
    .divider#divider-underground { background-image:url('assets/images/Underground.png'); }
    .divider::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,var(--bg),rgba(20,16,12,.3) 30% 70%,var(--bg)); }
    .divider .q { position:relative; z-index:2; font-family:'Press Start 2P',monospace; font-size:clamp(12px,2.2vw,17px); line-height:1.7; color:#fff; text-align:center; text-shadow:0 2px 16px #000; max-width:760px; padding:0 24px; }
    .viewall { display:inline-block; margin-top:14px; color:var(--clay); text-decoration:none; font-size:13px; letter-spacing:.06em; }
    .viewall:hover { color:#fff; }
    .fools { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; }
    .fool { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:18px; }
    .fool .medal { font-size:24px; margin-bottom:8px; }
    .fool .award { color:#fff; font-size:1.05rem; margin-bottom:4px; }
    .fool .who { font-size:12.5px; color:var(--muted); font-style:italic; }
```

- [ ] **Step 3: Verify the page still loads (data wiring comes next)**

```bash
node scripts/dev-server.mjs 3000
```

Open `http://localhost:3000/stats.html`. Expected: hero art with title renders; boards/charts still populate (existing `stats.js` still targets the same ids); new empty `#fools` / beats present. Some copy is blank until Task 8. No console errors.

- [ ] **Step 4: Commit**

```bash
git add stats.html
git commit -m "feat(stats): scroll layout — hero, beats, dividers, halls, fools"
```

---

## Task 8: Wire the new sections in `assets/stats.js`

**Files:**
- Modify: `assets/stats.js` (hero KPIs, beat copy, fools tiles, graceful degradation)

- [ ] **Step 1: Rewrite the hero tiles to the four Ledger KPIs**

Replace the existing `#hero` append block with:

```js
  document.getElementById('hero').append(
    heroTile('souls claimed by the Maw', num(totals.souls)),
    heroTile('villages fallen', num(totals.runs)),
    heroTile('deepest anyone dared', metres(totals.deepest)),
    heroTile('longest a village held', `${num(totals.longest)} days`),
  );
```

- [ ] **Step 2: Fill the narrative beat copy from real aggregates**

```js
  // Beat copy — derived from the data so the story stays true to the numbers.
  const runs = Number(totals.runs);
  document.getElementById('beat-shovel-copy').textContent =
    `${num(runs)} villages have taken up the shovel. Most never saw day ten. A rare few saw a hundred — none saw the end.`;
  const topCause = causes[0] ? (CAUSE_LABELS[causes[0].cause] ?? causes[0].cause) : 'the dark';
  document.getElementById('beat-fall-copy').textContent =
    `The most common fate is ${topCause.toLowerCase()}. You dig too greedily, or you simply forget to eat.`;
```

- [ ] **Step 3: Render the Hall of Fools tiles**

```js
  // ---- Hall of Fools ----
  function foolTile(medal, award, who) {
    const d = el('div', undefined, 'fool');
    d.append(el('div', medal, 'medal'), el('div', award, 'award'), el('div', who, 'who'));
    return d;
  }
  const foolsEl = document.getElementById('fools');
  const f = data.fools ?? {};
  const tiles = [];
  if (f.speedrun > 0) tiles.push(foolTile('🥇', 'Speedrun to Oblivion', `${num(f.speedrun)} villages died on day zero.`));
  if (f.hoarder) tiles.push(foolTile('💰', 'Hoarder of Nothing', `${f.hoarder.digger_name} lasted ${num(f.hoarder.days)} days holding not one gold.`));
  if (f.overconfident) tiles.push(foolTile('⚰️', 'The Overconfident', `${f.overconfident.digger_name} reached ${metres(f.overconfident.depth)} — dead by day ${num(f.overconfident.days)}.`));
  if (f.groundhog) tiles.push(foolTile('🔁', 'Groundhog Village', `${f.groundhog.digger_name} lost ${num(f.groundhog.mx)} generations in a single day.`));
  if (f.scratched) tiles.push(foolTile('🕳️', 'Scratched the Surface', `${f.scratched.digger_name} survived ${num(f.scratched.days)} days, only ${metres(f.scratched.depth)} deep.`));
  if (tiles.length) foolsEl.append(...tiles);
  else document.getElementById('section-fools').style.display = 'none';
```

(All player names go through `el(tag, text)` / `textContent` — never interpolated into `innerHTML`. The template strings above assign to `.textContent` via `el()`, which is safe.)

- [ ] **Step 4: Degrade the progression chart when empty**

Guard the progression chart (it needs ≥3 runs per day, so it's empty on a sparse DB):

```js
  if (!charts.progression.length) {
    document.getElementById('chart-progression').closest('.chart-box').style.display = 'none';
  } else {
    // …existing new Chart(document.getElementById('chart-progression'), …) call…
  }
```

- [ ] **Step 5: Verify in the browser at 0, 1, and many runs**

```bash
node scripts/dev-server.mjs 3000
```

- Many runs: `node scripts/seed-stats.js 80` → hero shows four KPIs; beats show sentences; Fools tiles render; all charts present.
- Sparse: reset the local DB (or use a fresh Neon dev branch) and seed just `node scripts/seed-stats.js 1` → progression chart hidden, Fools tiles that have no qualifier are absent, no console errors.
- Zero: with an empty table, the existing empty-state shows and `#stats-content` is hidden.

- [ ] **Step 6: Commit**

```bash
git add assets/stats.js
git commit -m "feat(stats): wire hero KPIs, narrative beats, Hall of Fools + sparse-data degradation"
```

---

## Task 9: The full leaderboard page

**Files:**
- Create: `leaderboard.html`
- Create: `assets/leaderboard.js`

- [ ] **Step 1: Create `leaderboard.html`**

Reuse the stats page CSS variables/footer. Minimal body:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Full Leaderboard — Underroot</title>
  <link rel="icon" type="image/png" href="assets/images/underroot_favicon.png" />
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <style>
    /* copy the :root vars, body, table, .name-cell, .avatar-canvas, footer rules from stats.html */
  </style>
  <script type="module" src="/assets/leaderboard.js"></script>
</head>
<body>
  <article class="doc">
    <a class="back" href="stats.html">← Back to the Ledger</a>
    <h1 id="lb-title">Longest Lineages</h1>
    <div id="lb-error" style="display:none">The archive is unreachable — try again soon.</div>
    <div class="table-wrap"><table id="lb-table"></table></div>
    <button id="lb-more" style="display:none">Load more</button>
  </article>
</body>
</html>
```

- [ ] **Step 2: Create `assets/leaderboard.js`**

```js
import { drawDigger } from './digger.js';

const num = (n) => Number(n).toLocaleString('en-US');
const metres = (t) => `${num(Math.round(Number(t) * 1.5))} m`;
const CAUSE_LABELS = { maw_breach: 'The Maw breached the base', starvation: 'Starvation', dehydration: 'Dehydration', starvation_dehydration: 'Starvation & dehydration', starvation_away: 'Starved while away', dehydration_away: 'Dehydrated while away', starvation_dehydration_away: 'Starved & dehydrated while away', abandoned: 'Lost the will to continue', other: 'Unknown fate' };

const params = new URLSearchParams(location.search);
const board = params.get('board') === 'unbroken' ? 'unbroken' : 'lineage';
let offset = 0;
const rows = [];

function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function nameCell(name, cosmetics) {
  const td = el('td', undefined, 'name-cell');
  const cv = document.createElement('canvas'); cv.width = 56; cv.height = 56; cv.style.width = '28px'; cv.style.height = '28px'; cv.className = 'avatar-canvas';
  drawDigger(cv, cosmetics || {});
  td.append(cv, el('span', name));
  return td;
}

function header() {
  const thead = document.createElement('thead'); const tr = document.createElement('tr');
  tr.append(el('th', '#'), el('th', 'Digger'), el('th', 'Days', 'num'), el('th', 'Depth', 'num'));
  if (board === 'lineage') tr.append(el('th', 'Gen', 'num'), el('th', 'Fate'));
  thead.append(tr); return thead;
}

function appendRows(newRows) {
  const table = document.getElementById('lb-table');
  if (!table.querySelector('thead')) table.append(header());
  let tbody = table.querySelector('tbody'); if (!tbody) { tbody = document.createElement('tbody'); table.append(tbody); }
  newRows.forEach((r) => {
    const i = rows.indexOf(r);
    const tr = document.createElement('tr');
    tr.append(el('td', String(i + 1)), nameCell(r.digger_name, r.cosmetics), el('td', num(r.days), 'num'), el('td', metres(r.depth), 'num'));
    if (board === 'lineage') tr.append(el('td', String(r.gen), 'num'), el('td', CAUSE_LABELS[r.cause] ?? r.cause));
    tbody.append(tr);
  });
}

async function loadMore() {
  try {
    const res = await fetch(`/api/leaderboard?board=${board}&offset=${offset}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const start = rows.length; rows.push(...data.rows); appendRows(rows.slice(start));
    offset += data.rows.length;
    document.getElementById('lb-more').style.display = data.rows.length === data.limit ? 'inline-block' : 'none';
  } catch (err) { console.error('leaderboard load failed:', err); document.getElementById('lb-error').style.display = 'block'; }
}

document.getElementById('lb-title').textContent = board === 'unbroken' ? 'The Unbroken' : 'Longest Lineages';
document.getElementById('lb-more').addEventListener('click', loadMore);
loadMore();
```

- [ ] **Step 3: Verify in the browser**

```bash
node scripts/dev-server.mjs 3000
node scripts/seed-stats.js 120
```

Open `http://localhost:3000/leaderboard.html?board=lineage`. Expected: 50 rows with digger avatars, ranks continue past 20; "Load more" fetches the next page and appends (ranks keep counting); switching `?board=unbroken` shows the unbroken columns. The "View the full board" links from `stats.html` land here.

- [ ] **Step 4: Commit**

```bash
git add leaderboard.html assets/leaderboard.js
git commit -m "feat(stats): full paginated leaderboard page with digger avatars"
```

---

## Task 10: Full-page verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`  (= `node --test`)
Expected: all `assets/digger.test.js` + `api/*.test.js` tests PASS.

- [ ] **Step 2: Desktop walkthrough**

```bash
node scripts/dev-server.mjs 3000
node scripts/seed-stats.js 100
```

Open `http://localhost:3000/stats.html` and scroll top→bottom. Confirm: hero art + 4 KPIs; both beats have sentences and a chart; parallax dividers; both leaderboards with real diggers; Fools tiles; the Dig charts + superlatives; footer. No console errors.

- [ ] **Step 3: Mobile width**

In devtools, set width to 375px. Confirm hero KPIs go 2-up, beats stack, tables scroll horizontally (`.table-wrap` already scrolls), dividers still read. No horizontal body scroll.

- [ ] **Step 4: Sparse + empty states**

Point at a Neon dev branch with 1 run (or truncate `runs`): progression chart hidden, only-qualifying Fools tiles show, boards show 1 row. Truncate to 0 rows: empty-state message shows, content hidden.

- [ ] **Step 5: Commit any fixes found, then stop for review**

```bash
git add -A
git commit -m "fix(stats): verification-pass polish"   # only if changes were needed
```

---

## Self-Review (completed during planning)

- **Spec coverage:** hero+KPIs (T7/T8), narrative beats (T7/T8), art dividers (T7), Hall of the Great with real diggers (T1–3, T6), Hall of Fools incl. dropped Well-Fed Corpse (T5/T8), the Dig charts (T7), full leaderboard (T4/T9), digger port + maintainability header (T1), `metres` convention preserved (T8/T9), `textContent` safety preserved (T6/T8/T9), graceful degradation 0/1/many (T8/T10). No game-client changes anywhere. ✓
- **Type consistency:** `drawDigger(canvas, loadout)`, `drawFull(ci, loadout, low_perf)`, `CI`, `COSMETIC_COLORS`, `parseLeaderboardQuery(q) → {board, offset, limit}`, `fools.{speedrun,hoarder,overconfident,groundhog,scratched}` used identically across tasks. ✓
- **Placeholder scan:** the only intentional fill-in is the source commit hash in the `digger.js` header comment (stamped at implementation time); the renderer port references named source functions with exact line ranges + worked examples per primitive type. ✓

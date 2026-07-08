import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, CAUSES } from './validate.js';

function goodPayload() {
  return {
    v: 1,
    run_uuid: '3b9f2a44-1c9e-4c7a-9d1e-2f6a8b0c4d5e',
    game_version: '1.0',
    digger_name: 'Heimdall',
    gen: 8, days: 85, depth: 324, blocks: 6601,
    cause: 'maw_breach',
    discoveries: 61, discovery_pct: 76.0,
    villager_deaths: 210, peak_population: 342,
    wall_hp: 123150, machines_built: 21,
    astrolabe_uses: 1, tasks_fulfilled: 149, tasks_denied: 67,
    challenges: [],
    peaks: { gold: 4034, coal: 270 },
    lineage: [
      { gen: 1, days: 0, depth: 3, cause: 'maw_breach' },
      { gen: 8, days: 85, depth: 324, cause: 'maw_breach' },
    ],
    history: [[1, 12, 80, 6, 0], [2, 30, 150, 8, 1]],
    cosmetics: { headwear: 'head_crown', tunic_dye: 'slate' },
  };
}

test('accepts a well-formed payload', () => {
  const r = validateRun(goodPayload());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('rejects unknown cause', () => {
  const p = goodPayload();
  p.cause = 'meteor';
  assert.equal(validateRun(p).ok, false);
});

test('all enum causes are accepted', () => {
  for (const c of CAUSES) {
    const p = goodPayload();
    p.cause = c;
    p.lineage.forEach((e) => (e.cause = c));
    assert.equal(validateRun(p).ok, true, c);
  }
});

test('strips control chars and caps digger_name at 24 chars', () => {
  const p = goodPayload();
  p.digger_name = 'A\u0000B\u0007C' + 'x'.repeat(50);
  const r = validateRun(p);
  assert.equal(r.ok, true);
  assert.equal(r.value.digger_name.length, 24);
  assert.ok(!/[\u0000-\u001f\u007f]/.test(r.value.digger_name));
});

test('keeps spaces and # in digger names', () => {
  const p = goodPayload();
  p.digger_name = 'Villager #2';
  const r = validateRun(p);
  assert.equal(r.ok, true);
  assert.equal(r.value.digger_name, 'Villager #2');
});

test('rejects out-of-range numbers', () => {
  for (const [k, v] of [['days', -1], ['days', 4000], ['gen', 0], ['gen', 99], ['depth', 20000], ['discovery_pct', 101]]) {
    const p = goodPayload();
    p[k] = v;
    assert.equal(validateRun(p).ok, false, `${k}=${v}`);
  }
});

test('rejects non-integer where int expected', () => {
  const p = goodPayload();
  p.blocks = 12.5;
  assert.equal(validateRun(p).ok, false);
});

test('rejects malformed history rows', () => {
  const p = goodPayload();
  p.history = [[1, 2, 3]]; // must be 5 ints
  assert.equal(validateRun(p).ok, false);
});

test('rejects history longer than 400 rows', () => {
  const p = goodPayload();
  p.history = Array.from({ length: 401 }, (_, i) => [i + 1, 1, 1, 1, 0]);
  assert.equal(validateRun(p).ok, false);
});

test('rejects lineage longer than 60 or with bad shape', () => {
  const p = goodPayload();
  p.lineage = [{ gen: 1, days: 0 }]; // missing depth/cause
  assert.equal(validateRun(p).ok, false);
});

test('rejects bad uuid and bad cosmetic ids', () => {
  const p1 = goodPayload();
  p1.run_uuid = 'not-a-uuid';
  assert.equal(validateRun(p1).ok, false);
  const p2 = goodPayload();
  p2.cosmetics = { headwear: '<script>' };
  assert.equal(validateRun(p2).ok, false);
});

test('missing optional groups are tolerated (old-save submits)', () => {
  const p = goodPayload();
  delete p.peaks;
  delete p.history;
  const r = validateRun(p);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.peaks, {});
  assert.deepEqual(r.value.history, []);
});

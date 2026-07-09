// assets/digger.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFull, CI, drawDigger } from './digger.js';

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

test('renders a fully-equipped body loadout without throwing', () => {
  const ctx = fakeCtx();
  drawFull(new CI(ctx), {
    skin: 'skin_dark', tunic: 'tunic_robe', tunic_dye: 'royal',
    boots: 'boots_laced', beard: 'beard_bushy', hair: 'hair_long', extra: 'extra_mantle',
  }, false);
  assert.ok(ctx.calls.some(([n]) => n === 'fill'));
});

test('every variant renders and differs from its slot default (catches case fall-through)', () => {
  // Fingerprint = the recorded draw-call stream for a given loadout.
  const fingerprint = (lo) => {
    const ctx = fakeCtx();
    drawFull(new CI(ctx), lo, false);
    assert.ok(ctx.calls.length > 0, JSON.stringify(lo));
    return JSON.stringify(ctx.calls);
  };
  // Per slot: the default id (drawn by the switch default branch) + the
  // explicitly-cased variants that MUST each produce different geometry.
  const slots = [
    { key: 'boots', def: 'boots_plain',   variants: ['boots_furcuff','boots_ironshod','boots_laced','boots_tall','boots_warmarch'] },
    { key: 'tunic', def: 'tunic_plain',   variants: ['tunic_furtrim','tunic_robe','tunic_jerkin','tunic_gambeson','tunic_oilskin'] },
    { key: 'beard', def: 'beard_stubble', variants: ['beard_clean','beard_goatee','beard_braided','beard_bushy','beard_long'] },
    { key: 'hair',  def: 'hair_short',    variants: ['hair_bald','hair_long','hair_topknot','hair_ponytail','hair_mohawk'] },
    { key: 'extra', def: 'extra_none',    variants: ['extra_amulet','extra_mantle','extra_sash','extra_gloves'] },
  ];
  for (const { key, def, variants } of slots) {
    const base = fingerprint({ [key]: def });
    for (const id of variants) {
      assert.notEqual(fingerprint({ [key]: id }), base, `${id} rendered identically to ${def} — likely a mistyped case label falling through to default`);
    }
  }
});

test('drawDigger applies the expected scale/translate transform', () => {
  const setCalls = [];
  const ctx = { ...fakeCtx(), setTransform: (...a) => setCalls.push(a), clearRect: () => {} };
  const canvas = { width: 76, height: 76, getContext: () => ctx };
  drawDigger(canvas, {});
  // size=76 → scale=1, translate=(38, 38+31)=(38,69); last setTransform resets to identity
  assert.deepEqual(setCalls[1], [1, 0, 0, 1, 38, 69]);
  assert.deepEqual(setCalls[setCalls.length - 1], [1, 0, 0, 1, 0, 0]);
});

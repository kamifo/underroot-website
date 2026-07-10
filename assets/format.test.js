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

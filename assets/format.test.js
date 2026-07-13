import test from 'node:test';
import assert from 'node:assert/strict';
import { num, metres, roman, causeLabel, fmtDate, shareTargets, CAUSE_LABELS, ratePct, compact, ritualMark } from './format.js';

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

test('ritualMark: pips to 5, then one pip + exact count, empty at 0', () => {
  assert.equal(ritualMark(0), '');
  assert.equal(ritualMark(null), '');
  assert.equal(ritualMark(1), '◆');
  assert.equal(ritualMark(5), '◆◆◆◆◆');
  assert.equal(ritualMark(6), '◆ 6');
  assert.equal(ritualMark(23), '◆ 23');
});

test('compact keeps numbers under 10k exact, shortens the rest', () => {
  assert.equal(compact(9131), '9,131');
  assert.equal(compact(9999), '9,999');
  assert.equal(compact(12400), '12k');
  assert.equal(compact(999999), '1,000k');
  assert.equal(compact(1200000), '1.2M');
  assert.equal(compact(5000000), '5M');
});

test('shareTargets builds encoded intent URLs', () => {
  const t = shareTargets('https://underroot.se/r/abc', 'Fell day 85', 'RIP my village');
  assert.ok(t.x.includes('https%3A%2F%2Funderroot.se%2Fr%2Fabc'));
  assert.ok(t.whatsapp.startsWith('https://wa.me/?text='));
  assert.ok(t.reddit.includes('title=Fell'));
  assert.ok(t.bluesky.startsWith('https://bsky.app/intent/compose?text='));
});

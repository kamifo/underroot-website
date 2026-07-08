import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlausibility } from './plausibility.js';

function goodRun() {
  return {
    gen: 8, days: 85, depth: 324, blocks: 6601, cause: 'maw_breach',
    villager_deaths: 210, peak_population: 342,
    peaks: { gold: 4034 },
    lineage: [
      { gen: 1, days: 0, depth: 3, cause: 'maw_breach' },
      { gen: 6, days: 52, depth: 320, cause: 'dehydration_away' },
      { gen: 8, days: 85, depth: 324, cause: 'maw_breach' },
    ],
    history: [[1, 12, 80, 6, 0], [40, 200, 3000, 100, 50], [85, 324, 6601, 342, 210]],
  };
}

test('accepts a plausible run', () => {
  const r = checkPlausibility(goodRun());
  assert.deepEqual(r.reasons, []);
  assert.equal(r.plausible, true);
});

test('flags impossible mining rate', () => {
  const run = goodRun();
  run.blocks = 9_000_000;
  run.history = [];
  assert.equal(checkPlausibility(run).plausible, false);
});

test('flags depth beyond world bottom', () => {
  const run = goodRun();
  run.depth = 9999;
  run.lineage = []; run.history = [];
  assert.equal(checkPlausibility(run).plausible, false);
});

test('flags non-monotonic lineage', () => {
  const run = goodRun();
  run.lineage = [
    { gen: 3, days: 50, depth: 100, cause: 'starvation' },
    { gen: 2, days: 10, depth: 100, cause: 'starvation' },
  ];
  assert.equal(checkPlausibility(run).plausible, false);
});

test('flags lineage inconsistent with run totals', () => {
  const run = goodRun();
  run.lineage.at(-1).days = 200; // dies later than the run lasted
  assert.equal(checkPlausibility(run).plausible, false);
});

test('flags non-monotonic history and history/total mismatch', () => {
  const r1 = goodRun();
  r1.history = [[5, 100, 500, 10, 0], [4, 120, 600, 10, 0]];
  assert.equal(checkPlausibility(r1).plausible, false);

  const r2 = goodRun();
  r2.history = [[85, 324, 999999, 342, 210]]; // blocks above run total
  assert.equal(checkPlausibility(r2).plausible, false);
});

test('flags history population above peak', () => {
  const run = goodRun();
  run.history = [[40, 200, 3000, 999999, 50]];
  assert.equal(checkPlausibility(run).plausible, false);
});

test('flags lineage that disagrees with run stats', () => {
  const run = goodRun();
  run.lineage.at(-1).cause = 'abandoned'; // run.cause stays maw_breach
  assert.equal(checkPlausibility(run).plausible, false);
});

test('flags impossible generation churn', () => {
  const run = goodRun();
  run.gen = 50; run.days = 1; run.blocks = 100; run.depth = 30;
  run.lineage = [{ gen: 50, days: 1, depth: 30, cause: 'maw_breach' }];
  run.history = [];
  assert.equal(checkPlausibility(run).plausible, false);
});

test('exact cap values are plausible, one past is not', () => {
  const atCap = goodRun();
  atCap.depth = 392;
  atCap.lineage.at(-1).depth = 392;
  atCap.blocks = atCap.days * 800 + 1000;
  atCap.history = [];
  assert.equal(checkPlausibility(atCap).plausible, true);
  const overDepth = goodRun();
  overDepth.depth = 393; overDepth.lineage = []; overDepth.history = [];
  assert.equal(checkPlausibility(overDepth).plausible, false);
  const overBlocks = goodRun();
  overBlocks.blocks = overBlocks.days * 800 + 1001; overBlocks.history = [];
  assert.equal(checkPlausibility(overBlocks).plausible, false);
});

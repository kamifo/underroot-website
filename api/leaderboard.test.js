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

import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFirstDeath, corsHeaders, hashIp } from './ingest.js';

test('derives first-death fields from lineage[0]', () => {
  const d = deriveFirstDeath([{ gen: 1, days: 14, depth: 114, cause: 'starvation' }]);
  assert.deepEqual(d, { first_death_days: 14, first_death_depth: 114 });
});

test('returns nulls for empty lineage', () => {
  assert.deepEqual(deriveFirstDeath([]), { first_death_days: null, first_death_depth: null });
});

test('cors allows known origins and rejects others', () => {
  assert.equal(corsHeaders('https://underroot.se')['Access-Control-Allow-Origin'], 'https://underroot.se');
  assert.equal(corsHeaders('https://html.itch.zone')['Access-Control-Allow-Origin'], 'https://html.itch.zone');
  assert.equal(corsHeaders('http://localhost:8060')['Access-Control-Allow-Origin'], 'http://localhost:8060');
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
});

test('hashIp is stable and does not contain the ip', () => {
  const h = hashIp('1.2.3.4', 'salt');
  assert.equal(h, hashIp('1.2.3.4', 'salt'));
  assert.notEqual(h, hashIp('1.2.3.5', 'salt'));
  assert.ok(!h.includes('1.2.3.4'));
});

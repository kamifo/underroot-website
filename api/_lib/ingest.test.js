import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFirstDeath, corsHeaders, hashIp, originFromReq } from './ingest.js';

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
  assert.equal(corsHeaders('https://underroot-playtest-abc123.vercel.app')['Access-Control-Allow-Origin'], 'https://underroot-playtest-abc123.vercel.app');
  assert.equal(corsHeaders('https://evil-site.vercel.app')['Access-Control-Allow-Origin'], undefined);
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
});

test('vary is always set (cache safety)', () => {
  assert.equal(corsHeaders('https://underroot.se')['Vary'], 'Origin');
  assert.equal(corsHeaders('https://evil.example')['Vary'], 'Origin');
  assert.equal(corsHeaders(undefined)['Vary'], 'Origin');
});

test('missing origin gets base headers only', () => {
  const h = corsHeaders(undefined);
  assert.equal(h['Access-Control-Allow-Origin'], undefined);
  assert.equal(h['Access-Control-Allow-Methods'], 'POST, GET, OPTIONS');
});

test('hashIp requires a salt', () => {
  assert.throws(() => hashIp('1.2.3.4', ''));
  assert.throws(() => hashIp('1.2.3.4', undefined));
});

test('hashIp is stable and does not contain the ip', () => {
  const h = hashIp('1.2.3.4', 'salt');
  assert.equal(h, hashIp('1.2.3.4', 'salt'));
  assert.notEqual(h, hashIp('1.2.3.5', 'salt'));
  assert.ok(!h.includes('1.2.3.4'));
});

test('originFromReq builds origin from forwarded headers', () => {
  const req = { headers: { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'example.com' } };
  assert.equal(originFromReq(req), 'http://example.com');
});

test('originFromReq falls back to host header and https', () => {
  const req = { headers: { host: 'localhost:3000' } };
  assert.equal(originFromReq(req), 'https://localhost:3000');
});

test('originFromReq falls back when a forwarded header is empty', () => {
  const req = { headers: { 'x-forwarded-proto': '', host: 'localhost:3000' } };
  assert.equal(originFromReq(req), 'https://localhost:3000');
});

test('originFromReq honours SITE_ORIGIN env and strips trailing slash', () => {
  const prev = process.env.SITE_ORIGIN;
  process.env.SITE_ORIGIN = 'https://underroot.se/';
  try {
    assert.equal(originFromReq({ headers: {} }), 'https://underroot.se');
  } finally {
    if (prev === undefined) delete process.env.SITE_ORIGIN; else process.env.SITE_ORIGIN = prev;
  }
});

test('originFromReq takes the first forwarded host when comma-listed', () => {
  const req = { headers: { 'x-forwarded-proto': 'https,http', 'x-forwarded-host': 'underroot.se, proxy' } };
  assert.equal(originFromReq(req), 'https://underroot.se');
});

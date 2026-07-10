import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCardHtml, renderNotFoundHtml, escapeHtml } from './card-html.js';

const RUN = { digger_name: 'Heimdall', gen: 8, days: 85, depth: 324, cause: 'maw_breach',
  villager_deaths: 210, blocks: 6601, discoveries: 61, peak_population: 342, gold: 4034,
  cosmetics: { headwear: 'head_crown' }, date: '2026-07-08' };
const OPTS = { origin: 'https://underroot.se', id: 'a3f9c2d81e04' };

test('escapeHtml neutralizes the five entities', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('renderCardHtml emits absolute OG meta from origin + id', () => {
  const html = renderCardHtml(RUN, OPTS);
  assert.ok(html.includes('<meta property="og:image" content="https://underroot.se/api/og?id=a3f9c2d81e04"'));
  assert.ok(html.includes('<meta property="og:url" content="https://underroot.se/r/a3f9c2d81e04"'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('<meta property="og:image:width" content="1200"'));
});

test('renderCardHtml puts the run details in title and body', () => {
  const html = renderCardHtml(RUN, OPTS);
  assert.ok(html.includes('Heimdall'));
  assert.ok(html.includes('day 85'));
  assert.ok(html.includes('486 m'));
});

test('renderCardHtml shows the discoveries count in the context ledger', () => {
  const html = renderCardHtml(RUN, OPTS);
  assert.ok(html.includes('Discoveries'));
  assert.ok(html.includes('61'));
});

test('renderCardHtml escapes a hostile name in meta and body', () => {
  const html = renderCardHtml({ ...RUN, digger_name: '"><script>x</script>' }, OPTS);
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderCardHtml inlines run JSON with < escaped (no </script> breakout)', () => {
  const html = renderCardHtml({ ...RUN, digger_name: '</script><script>alert(1)</script>' }, OPTS);
  // The run JSON sits between the run-data opening tag and its closing </script>.
  const open = html.indexOf('<script type="application/json" id="run-data">');
  assert.ok(open !== -1, 'run-data block present');
  const jsonStart = html.indexOf('>', open) + 1;
  const jsonEnd = html.indexOf('</script>', jsonStart);      // the FIRST </script> after the block opens
  const inlined = html.slice(jsonStart, jsonEnd);
  // The hostile name must NOT have introduced a literal "<" (which could close the tag early).
  assert.ok(!inlined.includes('<'), 'no literal < inside the inlined JSON');
  assert.ok(inlined.includes('\\u003c/script>'), 'the injected </script> was neutralized to \\u003c');
});

test('renderNotFoundHtml is a themed 404 doc', () => {
  const html = renderNotFoundHtml('https://underroot.se');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(/no record|not found/i.test(html));
});

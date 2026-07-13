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

test('renderCardHtml puts tiles dug on the card and demotes descent to the context ledger', () => {
  const html = renderCardHtml(RUN, OPTS);
  const card = html.slice(html.indexOf('pc-card'), html.indexOf('cp-context'));
  const context = html.slice(html.indexOf('cp-context'));
  assert.ok(card.includes('Tiles dug') && card.includes('6,601'), 'card ledger has tiles dug');
  assert.ok(!card.includes('Descent'), 'card ledger no longer shows descent');
  assert.ok(context.includes('Descent') && context.includes('486 m'), 'context ledger gains descent');
  assert.ok(!context.includes('Blocks mined'), 'context ledger drops the now-duplicate blocks row');
});

test('renderCardHtml shows rituals dared with capped pips when > 0', () => {
  const two = renderCardHtml({ ...RUN, astrolabe_uses: 2 }, OPTS);
  assert.ok(two.includes('Rituals dared'));
  assert.ok(two.includes('◆◆ 2'));
  assert.ok(!two.includes('◆◆◆'));
  const many = renderCardHtml({ ...RUN, astrolabe_uses: 23 }, OPTS);
  assert.ok(many.includes('◆◆◆◆◆ 23'), 'pips cap at 5');
  assert.ok(!many.includes('◆◆◆◆◆◆'));
});

test('renderCardHtml hides the rituals row for 0 or missing astrolabe_uses', () => {
  assert.ok(!renderCardHtml({ ...RUN, astrolabe_uses: 0 }, OPTS).includes('Rituals dared'));
  assert.ok(!renderCardHtml(RUN, OPTS).includes('Rituals dared'));
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

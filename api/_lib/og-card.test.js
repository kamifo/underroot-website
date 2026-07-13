import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOgSvg, escapeXml, OG_W, OG_H } from './og-card.js';

const RUN = { digger_name: 'Heimdall', gen: 8, days: 85, depth: 324, blocks: 6601, cause: 'maw_breach', cosmetics: { headwear: 'head_crown' } };

test('escapeXml neutralizes markup characters', () => {
  assert.equal(escapeXml(`a<b>&"'`), 'a&lt;b&gt;&amp;&quot;&apos;');
});

test('buildOgSvg is 1200x630 and contains the run details', () => {
  const svg = buildOgSvg(RUN);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes(`width="${OG_W}"`) && svg.includes(`height="${OG_H}"`));
  assert.ok(svg.includes('HEIMDALL') || svg.includes('Heimdall'));
  assert.ok(svg.includes('85'), 'days');
  assert.ok(svg.includes('TILES DUG') && svg.includes('6,601'), 'tiles dug stat');
  assert.ok(!svg.includes('DESCENT'), 'descent stat replaced');
  assert.ok(svg.includes('VIII'), 'lineage roman');
  assert.ok(svg.includes('The Maw breached the base'), 'epitaph');
  assert.ok(svg.includes('<g transform="translate'), 'embeds the digger');
});

test('buildOgSvg escapes a hostile digger name', () => {
  const svg = buildOgSvg({ ...RUN, digger_name: '<script>x</script>' });
  assert.ok(!svg.includes('<script>'));
  // Name is escaped then upper-cased, so match the entity case-insensitively.
  assert.ok(/&lt;script&gt;/i.test(svg));
});

test('buildOgSvg compacts a huge tiles-dug value to fit its column', () => {
  const svg = buildOgSvg({ ...RUN, blocks: 1200000 });
  assert.ok(svg.includes('1.2M'), 'compact form');
  assert.ok(!svg.includes('1,200,000'), 'no full-width number');
});

test('buildOgSvg truncates an over-long name', () => {
  const svg = buildOgSvg({ ...RUN, digger_name: 'Aaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.ok(svg.includes('…'), 'ellipsis');
});

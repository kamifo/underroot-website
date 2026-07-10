import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOgSvg, escapeXml, OG_W, OG_H } from './og-card.js';

const RUN = { digger_name: 'Heimdall', gen: 8, days: 85, depth: 324, cause: 'maw_breach', cosmetics: { headwear: 'head_crown' } };

test('escapeXml neutralizes markup characters', () => {
  assert.equal(escapeXml(`a<b>&"'`), 'a&lt;b&gt;&amp;&quot;&apos;');
});

test('buildOgSvg is 1200x630 and contains the run details', () => {
  const svg = buildOgSvg(RUN);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes(`width="${OG_W}"`) && svg.includes(`height="${OG_H}"`));
  assert.ok(svg.includes('HEIMDALL') || svg.includes('Heimdall'));
  assert.ok(svg.includes('85'), 'days');
  assert.ok(svg.includes('486'), 'descent in metres');
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

test('buildOgSvg truncates an over-long name', () => {
  const svg = buildOgSvg({ ...RUN, digger_name: 'Aaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.ok(svg.includes('…'), 'ellipsis');
});

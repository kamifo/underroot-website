import test from 'node:test';
import assert from 'node:assert/strict';
import { diggerSvg, SvgCI } from './digger-svg.js';
import { drawFull } from './digger.js';

test('diggerSvg wraps geometry in a scaled, translated <g>', () => {
  // size=76 → scale=1, translate=(38, 38+31)=(38,69)
  const svg = diggerSvg({}, 76);
  assert.match(svg, /^<g transform="translate\(38 69\) scale\(1\)">/);
  assert.ok(svg.endsWith('</g>'));
  assert.ok(svg.includes('<circle'), 'head is a circle');
  assert.ok(svg.includes('<rect'), 'belt/legs are rects');
});

test('SvgCI emits one element per draw call', () => {
  const ci = new SvgCI();
  drawFull(ci, { extra: 'extra_sash', form: '' }, false);
  const s = ci.toString();
  assert.ok(s.includes('<polygon'), 'sash is a polygon');
});

test('a crowned digger differs from bare (no case fall-through)', () => {
  assert.notEqual(diggerSvg({ headwear: 'head_crown' }, 300), diggerSvg({ headwear: 'head_bare' }, 300));
});

test('the Maw-Eaten form emits polylines (magma cracks)', () => {
  assert.ok(diggerSvg({ form: 'form_maweaten' }, 300).includes('<polyline'));
});

// The blank-portrait regression: before the form ports + fallback, any form the
// site didn't know drew NOTHING (Swedish Dave's card was an empty glow).
test('every ported form draws a substantial figure', () => {
  const bare = diggerSvg({}, 300);
  for (const form of ['form_axel', 'form_dave', 'form_hugo']) {
    const svg = diggerSvg({ form }, 300);
    const elements = (svg.match(/<(rect|circle|polygon|line|polyline)/g) || []).length;
    assert.ok(elements > 50, `${form} draws ${elements} elements (expected a full figure)`);
    assert.notEqual(svg, bare, `${form} is not the bare digger`);
  }
});

test('an unknown form falls back to the standard body instead of blanking', () => {
  const svg = diggerSvg({ form: 'form_from_the_future', headwear: 'head_crown' }, 300);
  assert.ok(svg.includes('<circle'), 'head drawn');
  assert.equal(svg, diggerSvg({ form: 'form_none', headwear: 'head_crown' }, 300),
    'renders exactly as if no form were equipped');
});

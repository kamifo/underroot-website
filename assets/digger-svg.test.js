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

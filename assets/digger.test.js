// assets/digger.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFull, CI } from './digger.js';

// A no-op 2D context that records call counts, so we can assert the renderer
// issued draw calls without a real canvas.
export function fakeCtx() {
  const calls = [];
  const rec = (n) => (...a) => calls.push([n, ...a]);
  return {
    calls, fillStyle: '', strokeStyle: '', lineWidth: 0,
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), arc: rec('arc'), fill: rec('fill'),
    stroke: rec('stroke'), fillRect: rec('fillRect'),
  };
}

test('renders the default humble digger without throwing', () => {
  const ctx = fakeCtx();
  drawFull(new CI(ctx), {}, false);
  assert.ok(ctx.calls.length > 0);
});

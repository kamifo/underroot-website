// Server-side SVG port of the digger renderer. Reuses digger.js geometry — the
// same drawFull(ci, loadout) — by swapping the canvas sink for an SVG sink.
// digger.js stays the single source of truth; this only changes the output.
import { drawFull } from './digger.js';

// Mirrors digger.js's private css() (colors are {r,g,b,a} in 0..1 or a hex string).
const cssColor = (c) =>
  (typeof c === 'string' ? c
    : `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a ?? 1})`);

const pts = (a) => a.map((p) => `${p.x},${p.y}`).join(' ');

// Implements the five CI methods digger.js calls, as SVG element strings.
export class SvgCI {
  constructor() { this.parts = []; }
  draw_rect(r, c) { this.parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${cssColor(c)}"/>`); }
  draw_circle(p, rad, c) { this.parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${rad}" fill="${cssColor(c)}"/>`); }
  draw_colored_polygon(p, c) { this.parts.push(`<polygon points="${pts(p)}" fill="${cssColor(c)}"/>`); }
  draw_line(a, b, c, w) { this.parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${cssColor(c)}" stroke-width="${w}"/>`); }
  draw_polyline(p, c, w) { this.parts.push(`<polyline points="${pts(p)}" fill="none" stroke="${cssColor(c)}" stroke-width="${w}"/>`); }
  toString() { return this.parts.join(''); }
}

// Draw a digger into an `size`×`size` box, feet-down, matching drawDigger's
// transform (scale = size/76, centre_y offset +31*scale). Returns an SVG <g>.
export function diggerSvg(loadout, size) {
  const scale = size / 76;
  const tx = size / 2;
  const ty = size / 2 + 31 * scale;
  const ci = new SvgCI();
  drawFull(ci, loadout ?? {}, false);
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${ci.toString()}</g>`;
}

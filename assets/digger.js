// assets/digger.js
// Digger renderer for the web. Ported 1:1 from scripts/world/DiggerRenderer.gd
// @ <fill in the underroot game repo commit hash at implementation time>.
// KEEP STRUCTURALLY IDENTICAL to the GDScript source: same function names, same
// order, same magic numbers — so future cosmetic additions are a trivial diff.
// Coordinate space matches the game: feet at origin, up = negative Y.

// Only skin + tunic-dye ids need a color lookup (hair_color / beard_color ride
// in the loadout as hex already). Copied from the game's data/cosmetics.json.
export const COSMETIC_COLORS = {
  skin: { skin_tan: '#e6c299', skin_fair: '#f0d2b0', skin_olive: '#c8a878', skin_brown: '#9a6e48', skin_dark: '#6e4a30' },
  dye:  { rust: '#6b3b2e', flax: '#cdbd98', walnut: '#4f3a25', ochre: '#b08a3c', soot: '#2c2825', moss: '#5d6a3e', royal: '#3a4a8a', slate: '#54606a' },
};

// --- Godot value shims ---
export function Color(r, g, b, a = 1) { return { r, g, b, a }; }
Color.html = (hex) => {
  const n = hex.replace('#', '');
  return { r: parseInt(n.slice(0, 2), 16) / 255, g: parseInt(n.slice(2, 4), 16) / 255, b: parseInt(n.slice(4, 6), 16) / 255, a: 1 };
};
export const V = (x, y) => ({ x, y });
export const Rect2 = (x, y, w, h) => ({ x, y, w, h });
const css = (c) => (typeof c === 'string' ? c : `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a ?? 1})`);

// --- CanvasItem shim: same method names as Godot's `ci` ---
export class CI {
  constructor(ctx) { this.ctx = ctx; }
  draw_rect(r, c) { this.ctx.fillStyle = css(c); this.ctx.fillRect(r.x, r.y, r.w, r.h); }
  draw_circle(p, rad, c) { this.ctx.fillStyle = css(c); this.ctx.beginPath(); this.ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); this.ctx.fill(); }
  draw_colored_polygon(pts, c) {
    this.ctx.fillStyle = css(c); this.ctx.beginPath(); this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.closePath(); this.ctx.fill();
  }
  draw_line(a, b, c, w) { this.ctx.strokeStyle = css(c); this.ctx.lineWidth = w; this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke(); }
  draw_polyline(pts, c, w) {
    this.ctx.strokeStyle = css(c); this.ctx.lineWidth = w; this.ctx.beginPath(); this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.stroke();
  }
}

// --- color helpers (ported from _skin / _skin_shadow / _tunic_dye) ---
function _skin(loadout) { return Color.html(COSMETIC_COLORS.skin[loadout.skin ?? 'skin_tan'] ?? '#e6c299'); }
function _skin_shadow(loadout) { const s = _skin(loadout); return Color(s.r * 0.88, s.g * 0.84, s.b * 0.80, 0.30); }
function _tunic_dye(loadout) { return Color.html(COSMETIC_COLORS.dye[loadout.tunic_dye ?? 'rust'] ?? '#6b3b2e'); }

// --- forms ---
function _active_form(loadout) { const f = String(loadout.form ?? 'form_none'); return f !== 'form_none' ? f : ''; }
function _draw_form(ci, form, low_perf) { switch (form) { case 'form_maweaten': _draw_maweaten(ci, low_perf); break; } }

// --- orchestration (ported from draw_body_below_tool / _above_tool / draw_full) ---
function drawBodyBelowTool(ci, loadout, low_perf) {
  const form = _active_form(loadout);
  if (form !== '') { _draw_form(ci, form, low_perf); return; }
  _draw_boots(ci, loadout, low_perf);
  _draw_legs(ci, loadout, low_perf);
  _draw_belt(ci);
  _draw_tunic(ci, loadout, low_perf);
  _draw_extra_back(ci, loadout, low_perf);
  _draw_arms(ci, loadout, low_perf);
  _draw_lantern(ci);
}
function drawBodyAboveTool(ci, loadout, low_perf) {
  if (_active_form(loadout) !== '') return;
  _draw_head(ci, loadout);
  _draw_beard(ci, loadout, low_perf);
  _draw_hair(ci, loadout, low_perf);
  _draw_headwear(ci, loadout, low_perf);
  _draw_extra_hands(ci, loadout, low_perf);
}
export function drawFull(ci, loadout, low_perf) {
  drawBodyBelowTool(ci, loadout, low_perf);
  drawBodyAboveTool(ci, loadout, low_perf);
}

// Public: draw a digger scaled to fit a square canvas (feet-down), matching the
// game's slot-icon "form" framing (figure ~76 units tall, centre_y -31).
export function drawDigger(canvas, loadout) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width; // caller sets width=height (px); use 2× CSS px for crispness
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = size / 76;
  ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2 + 31 * scale);
  drawFull(new CI(ctx), loadout ?? {}, false);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// --- piece functions: ported in Tasks 2–3 ---
// The three below are worked examples establishing the pattern; the rest follow
// the same mechanical translation in later tasks. Placeholder stubs so Task 1
// compiles and the default-digger smoke test exercises real geometry.
function _draw_belt(ci) {
  ci.draw_rect(Rect2(-7.0, -25.0, 14.0, 2.0), Color(0.16, 0.10, 0.06));
  ci.draw_rect(Rect2(-1.5, -25.5, 3.0, 2.6), Color(0.69, 0.54, 0.18));
}
function _draw_head(ci, loadout) {
  const skin = _skin(loadout);
  ci.draw_circle(V(0.0, -46.0), 7.5, skin);
  ci.draw_circle(V(2.5, -44.5), 4.3, _skin_shadow(loadout));
  ci.draw_circle(V(-2.5, -46.5), 1.3, Color(0.12, 0.08, 0.04));
  ci.draw_circle(V(1.5, -46.5), 1.3, Color(0.12, 0.08, 0.04));
  ci.draw_circle(V(-2.1, -46.9), 0.45, Color(0.92, 0.92, 0.86, 0.85));
  ci.draw_circle(V(1.9, -46.9), 0.45, Color(0.92, 0.92, 0.86, 0.85));
  ci.draw_rect(Rect2(-0.4, -44.6, 1.5, 2.0), Color(skin.r * 0.80, skin.g * 0.76, skin.b * 0.72, 0.5));
}
function _tunic_collar(ci, deep) {
  ci.draw_colored_polygon([V(-3.0, -39.0), V(3.0, -39.0), V(1.6, -36.0), V(0.0, -34.8), V(-1.6, -36.0)], deep);
}

// Temporary minimal stubs so drawFull runs end-to-end in Task 1; each is REPLACED
// by its full port in Task 2/3.
function _draw_boots() {}
function _draw_legs() {}
function _draw_tunic(ci, loadout) { const base = _tunic_dye(loadout); ci.draw_rect(Rect2(-7.0, -39.0, 14.0, 14.0), base); _tunic_collar(ci, Color(base.r * 0.58, base.g * 0.58, base.b * 0.58)); }
function _draw_extra_back() {}
function _draw_arms() {}
function _draw_lantern() {}
function _draw_beard() {}
function _draw_hair() {}
function _draw_headwear() {}
function _draw_extra_hands() {}
function _draw_maweaten() {}

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

function _draw_boots(ci, loadout, low_perf) {
  // Shared uppers, a shaft highlight and a darker sole give the boots weight;
  // the cuff / toe-plate / strap then varies per style.
  ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 9.0), Color(0.31, 0.22, 0.13));   // left upper
  ci.draw_rect(Rect2(1.0, -9.0, 5.0, 9.0), Color(0.26, 0.18, 0.11));    // right upper
  ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 1.6), Color(0.39, 0.29, 0.18));   // shaft highlight
  ci.draw_rect(Rect2(1.0, -9.0, 5.0, 1.6), Color(0.33, 0.24, 0.14));
  ci.draw_rect(Rect2(-6.6, -2.2, 6.1, 2.2), Color(0.15, 0.10, 0.06));   // left sole
  ci.draw_rect(Rect2(0.5, -2.2, 6.1, 2.2), Color(0.12, 0.08, 0.05));    // right sole
  switch (String(loadout.boots ?? 'boots_plain')) {
    case 'boots_furcuff':
      ci.draw_rect(Rect2(-6.5, -11.0, 6.0, 2.5), Color(0.79, 0.74, 0.64));
      ci.draw_rect(Rect2(0.5, -11.0, 6.0, 2.5), Color(0.70, 0.65, 0.55));
      if (!low_perf) {
        ci.draw_circle(V(-3.5, -10.0), 0.9, Color(0.86, 0.82, 0.72));
        ci.draw_circle(V(3.5, -10.0), 0.9, Color(0.78, 0.74, 0.64));
      }
      break;
    case 'boots_ironshod':
      ci.draw_rect(Rect2(-6.5, -3.4, 6.0, 3.4), Color(0.55, 0.58, 0.61));  // toe cap
      ci.draw_rect(Rect2(0.5, -3.4, 6.0, 3.4), Color(0.50, 0.53, 0.56));
      if (!low_perf) {
        ci.draw_circle(V(-3.5, -1.4), 0.6, Color(0.72, 0.74, 0.77));  // rivets
        ci.draw_circle(V(3.5, -1.4), 0.6, Color(0.66, 0.68, 0.71));
      }
      break;
    case 'boots_laced':
      ci.draw_rect(Rect2(-4.6, -9.0, 2.2, 8.0), Color(0.38, 0.28, 0.18));  // tongues
      ci.draw_rect(Rect2(2.4, -9.0, 2.2, 8.0), Color(0.33, 0.24, 0.15));
      if (!low_perf) {
        const lc = Color(0.74, 0.65, 0.46);
        for (let i = 0; i < 3; i++) {
          const yl = -7.6 + i * 2.4;
          ci.draw_line(V(-5.0, yl), V(-2.0, yl - 1.2), lc, 0.6);          // left X-laces
          ci.draw_line(V(-5.0, yl - 1.2), V(-2.0, yl), lc, 0.6);
          ci.draw_line(V(2.0, yl), V(5.0, yl - 1.2), lc, 0.6);            // right X-laces
          ci.draw_line(V(2.0, yl - 1.2), V(5.0, yl), lc, 0.6);
        }
      }
      break;
    case 'boots_tall':
      ci.draw_rect(Rect2(-6.0, -13.5, 5.0, 5.0), Color(0.31, 0.22, 0.13));  // taller shaft
      ci.draw_rect(Rect2(1.0, -13.5, 5.0, 5.0), Color(0.26, 0.18, 0.11));
      ci.draw_rect(Rect2(-6.6, -13.8, 6.1, 2.2), Color(0.39, 0.28, 0.17));  // fold-over cuff
      ci.draw_rect(Rect2(0.5, -13.8, 6.1, 2.2), Color(0.34, 0.24, 0.15));
      break;
    case 'boots_warmarch':
      // Violet plate greaves over the shared uppers, glowing cuff studs — the
      // Two Fronts mastery trophy.
      ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 9.0), Color(0.37, 0.26, 0.53));   // left plate
      ci.draw_rect(Rect2(1.0, -9.0, 5.0, 9.0), Color(0.31, 0.21, 0.45));    // right plate
      ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 1.4), Color(0.60, 0.47, 0.77));   // shaft highlights
      ci.draw_rect(Rect2(1.0, -9.0, 5.0, 1.4), Color(0.52, 0.40, 0.68));
      ci.draw_rect(Rect2(-6.4, -13.0, 5.4, 2.2), Color(0.21, 0.14, 0.31));  // left cuff
      ci.draw_rect(Rect2(0.6, -13.0, 5.4, 2.2), Color(0.18, 0.12, 0.27));   // right cuff
      ci.draw_rect(Rect2(-6.2, -6.6, 5.4, 1.3), Color(0.21, 0.14, 0.31));   // straps
      ci.draw_rect(Rect2(0.8, -6.6, 5.4, 1.3), Color(0.18, 0.12, 0.27));
      if (!low_perf) {
        ci.draw_circle(V(-3.4, -11.9), 1.1, Color(0.79, 0.65, 0.94, 0.30));  // stud glow
        ci.draw_circle(V(3.6, -11.9), 1.1, Color(0.79, 0.65, 0.94, 0.30));
        ci.draw_circle(V(-3.4, -11.9), 0.6, Color(0.94, 0.89, 1.0));         // studs
        ci.draw_circle(V(3.6, -11.9), 0.6, Color(0.94, 0.89, 1.0));
      }
      break;
    default: // boots_plain (default) — buckle strap
      ci.draw_rect(Rect2(-6.2, -6.6, 5.4, 1.3), Color(0.20, 0.14, 0.09));
      ci.draw_rect(Rect2(0.8, -6.6, 5.4, 1.3), Color(0.18, 0.12, 0.08));
      if (!low_perf) {
        ci.draw_rect(Rect2(-2.4, -6.8, 1.4, 1.7), Color(0.62, 0.49, 0.16));  // buckles
        ci.draw_rect(Rect2(2.6, -6.8, 1.4, 1.7), Color(0.56, 0.44, 0.14));
      }
      break;
  }
}

function _draw_legs(ci, _loadout, _low_perf) {
  ci.draw_rect(Rect2(-5.0, -23.0, 4.0, 14.0), Color(0.36, 0.29, 0.21));
  ci.draw_rect(Rect2(1.0, -23.0, 4.0, 14.0), Color(0.31, 0.25, 0.19));
}

function _draw_tunic(ci, loadout, low_perf) {
  const base = _tunic_dye(loadout);
  const dark = Color(base.r * 0.82, base.g * 0.82, base.b * 0.82);
  const deep = Color(base.r * 0.58, base.g * 0.58, base.b * 0.58);
  const lite = Color(Math.min(base.r * 1.20, 1.0), Math.min(base.g * 1.18, 1.0), Math.min(base.b * 1.16, 1.0));
  switch (String(loadout.tunic ?? 'tunic_plain')) {
    case 'tunic_furtrim':
      ci.draw_rect(Rect2(-7.0, -39.0, 7.0, 14.0), base);
      ci.draw_rect(Rect2(0.0, -39.0, 7.0, 14.0), dark);
      ci.draw_rect(Rect2(-7.5, -27.2, 15.0, 2.6), Color(0.79, 0.74, 0.64));  // fur hem
      if (!low_perf) {
        for (const fx of [-6.0, -3.6, -1.2, 1.2, 3.6, 6.0]) {
          ci.draw_circle(V(fx, -26.0), 1.0, Color(0.86, 0.82, 0.72));
        }
      }
      _tunic_torso_detail(ci, deep, lite, low_perf);
      break;
    case 'tunic_robe':
      ci.draw_rect(Rect2(-8.0, -39.0, 16.0, 17.0), base);
      ci.draw_rect(Rect2(0.0, -39.0, 8.0, 17.0), dark);
      ci.draw_rect(Rect2(-1.0, -39.0, 2.0, 17.0), deep);              // center fold
      ci.draw_rect(Rect2(-8.0, -30.0, 16.0, 1.6), deep);              // waist sash
      if (!low_perf) {
        ci.draw_rect(Rect2(-8.0, -23.8, 16.0, 1.4), Color(0.69, 0.54, 0.18, 0.85));  // hem braid
      }
      _tunic_collar(ci, deep);
      break;
    case 'tunic_jerkin': {
      ci.draw_rect(Rect2(-7.0, -39.0, 7.0, 14.0), base);   // dyed undershirt
      ci.draw_rect(Rect2(0.0, -39.0, 7.0, 14.0), dark);
      const lth = Color(0.34, 0.24, 0.15);
      const lthd = Color(0.28, 0.19, 0.11);
      ci.draw_colored_polygon([  // left leather panel, laced V-opening
        V(-7.0, -39.0), V(-1.5, -39.0), V(-0.5, -31.0),
        V(-1.0, -25.0), V(-7.0, -25.0),
      ], lth);
      ci.draw_colored_polygon([  // right leather panel
        V(7.0, -39.0), V(1.5, -39.0), V(0.5, -31.0),
        V(1.0, -25.0), V(7.0, -25.0),
      ], lthd);
      if (!low_perf) {
        ci.draw_rect(Rect2(-1.5, -37.0, 3.0, 0.7), Color(0.72, 0.62, 0.42));  // laces
        ci.draw_rect(Rect2(-1.2, -34.5, 2.4, 0.7), Color(0.72, 0.62, 0.42));
        ci.draw_rect(Rect2(-0.9, -32.0, 1.8, 0.7), Color(0.72, 0.62, 0.42));
      }
      ci.draw_rect(Rect2(-7.0, -26.4, 14.0, 1.3), lthd);  // hem
      break;
    }
    case 'tunic_gambeson':
      ci.draw_rect(Rect2(-7.0, -39.0, 7.0, 14.0), base);
      ci.draw_rect(Rect2(0.0, -39.0, 7.0, 14.0), dark);
      ci.draw_rect(Rect2(-3.5, -41.0, 7.0, 2.6), deep);    // standing collar
      if (!low_perf) {
        for (const qy of [-36.0, -33.0, -30.0, -27.5]) {
          ci.draw_rect(Rect2(-7.0, qy, 14.0, 0.7), deep);   // quilt rows
        }
        ci.draw_rect(Rect2(-3.7, -37.0, 0.7, 11.0), deep);    // quilt columns
        ci.draw_rect(Rect2(3.0, -37.0, 0.7, 11.0), deep);
      }
      ci.draw_rect(Rect2(-7.0, -39.0, 1.4, 14.0), lite);   // left light edge
      ci.draw_rect(Rect2(-7.0, -26.4, 14.0, 1.3), deep);   // hem shadow
      break;
    case 'tunic_oilskin':
      // Storm-blue oilskin — Eye of the Storm mastery trophy. Own blue palette
      // (ignores the dye), a shoulder mantle over the arm-tops, a glowing collar
      // clasp, and rain running off.
      ci.draw_rect(Rect2(-7.0, -39.0, 7.0, 14.0), Color(0.23, 0.32, 0.49));   // left body
      ci.draw_rect(Rect2(0.0, -39.0, 7.0, 14.0), Color(0.16, 0.24, 0.38));    // right body
      ci.draw_rect(Rect2(-7.0, -39.0, 1.4, 14.0), Color(0.37, 0.52, 0.72));   // left light edge
      ci.draw_rect(Rect2(-7.0, -26.4, 14.0, 1.3), Color(0.09, 0.15, 0.25));   // hem shadow
      ci.draw_colored_polygon([   // shoulder mantle over arm-tops
        V(-8.5, -39.0), V(8.5, -39.0), V(8.5, -35.0),
        V(5.0, -33.0), V(0.0, -34.5), V(-5.0, -33.0), V(-8.5, -35.0),
      ], Color(0.19, 0.28, 0.43));
      ci.draw_colored_polygon([   // collar
        V(-3.0, -39.0), V(3.0, -39.0), V(1.6, -36.0),
        V(0.0, -34.8), V(-1.6, -36.0),
      ], Color(0.11, 0.19, 0.31));
      if (!low_perf) {
        ci.draw_circle(V(0.0, -37.3), 1.8, Color(0.68, 0.88, 1.0, 0.30));   // clasp glow
        ci.draw_line(V(-6.0, -30.0), V(-6.6, -26.0), Color(0.62, 0.75, 0.91, 0.8), 0.5);
        ci.draw_line(V(5.5, -31.0), V(4.9, -27.0), Color(0.62, 0.75, 0.91, 0.8), 0.5);
      }
      ci.draw_circle(V(0.0, -37.3), 0.9, Color(0.89, 0.96, 1.0));            // clasp
      break;
    default: // tunic_plain (default)
      ci.draw_rect(Rect2(-7.0, -39.0, 7.0, 14.0), base);
      ci.draw_rect(Rect2(0.0, -39.0, 7.0, 14.0), dark);
      _tunic_torso_detail(ci, deep, lite, low_perf);
      break;
  }
}

// Shared torso shading: a light front edge, a center seam, a hem shadow, the
// collar, and lacing rungs — keeps the plain/fur-trim tunic from reading flat.
function _tunic_torso_detail(ci, deep, lite, low_perf) {
  ci.draw_rect(Rect2(-7.0, -39.0, 1.4, 14.0), lite);   // left light edge
  ci.draw_rect(Rect2(-0.6, -39.0, 1.2, 13.0), deep);   // center seam
  ci.draw_rect(Rect2(-7.0, -26.4, 14.0, 1.3), deep);   // hem shadow
  _tunic_collar(ci, deep);
  if (!low_perf) {
    ci.draw_rect(Rect2(-1.9, -37.2, 3.8, 0.7), lite);  // lacing rungs
    ci.draw_rect(Rect2(-1.9, -35.2, 3.8, 0.7), lite);
    ci.draw_rect(Rect2(-1.9, -33.2, 3.8, 0.7), lite);
  }
}

function _draw_extra_back(ci, loadout, low_perf) {
  switch (String(loadout.extra ?? 'extra_none')) {
    case 'extra_amulet':
      // A cord around the neck with a gem pendant on the chest — the wager prize.
      ci.draw_line(V(-3.0, -38.5), V(0.0, -33.5), Color(0.55, 0.45, 0.28), 0.8);
      ci.draw_line(V(3.0, -38.5), V(0.0, -33.5), Color(0.45, 0.36, 0.22), 0.8);
      ci.draw_circle(V(0.0, -32.8), 1.9, Color(0.80, 0.66, 0.22));   // gold setting
      ci.draw_circle(V(0.0, -32.8), 1.1, Color(0.45, 0.86, 0.90));   // gem
      if (!low_perf) {
        ci.draw_circle(V(-0.5, -33.3), 0.4, Color(0.92, 0.98, 1.0));  // glint
      }
      break;
    case 'extra_mantle':
      if (low_perf) {
        ci.draw_rect(Rect2(-8.0, -41.0, 16.0, 4.5), Color(0.82, 0.78, 0.68));
      } else {
        ci.draw_colored_polygon([
          V(-8.0, -41.0), V(8.0, -41.0), V(8.0, -37.0),
          V(6.0, -34.5), V(4.0, -37.0), V(2.0, -34.5),
          V(0.0, -37.0), V(-2.0, -34.5), V(-4.0, -37.0),
          V(-6.0, -34.5), V(-8.0, -37.0),
        ], Color(0.82, 0.78, 0.68));
      }
      break;
    case 'extra_sash':
      // Diagonal gold mourning sash with a small candle pin — The Lone Villager
      // mastery trophy. Carries the memory of the village that's gone.
      ci.draw_colored_polygon([
        V(-7.0, -39.0), V(-4.6, -39.0), V(6.0, -26.0), V(3.6, -26.0),
      ], Color(0.74, 0.60, 0.24));
      ci.draw_line(V(-7.0, -39.0), V(3.6, -26.0), Color(0.12, 0.10, 0.07), 0.5);
      ci.draw_line(V(-4.6, -39.0), V(6.0, -26.0), Color(0.12, 0.10, 0.07), 0.5);
      if (!low_perf) {
        ci.draw_circle(V(-0.2, -32.6), 1.6, Color(1.0, 0.82, 0.36, 0.28));  // flame glow
      }
      ci.draw_rect(Rect2(-0.7, -33.0, 1.4, 2.4), Color(0.90, 0.86, 0.74));          // candle
      ci.draw_circle(V(0.0, -33.4), 0.7, Color(1.0, 0.78, 0.30));            // flame
      break;
    default: // none (default) — nothing
      break;
  }
}

function _draw_arms(ci, loadout, _low_perf) {
  const base = _tunic_dye(loadout);
  const dark = Color(base.r * 0.82, base.g * 0.82, base.b * 0.82);
  ci.draw_rect(Rect2(-12.0, -38.0, 5.0, 12.0), base);  // left
  ci.draw_rect(Rect2(7.0, -38.0, 5.0, 12.0), dark);    // right
  // shoulder seams (lighter) + wrist cuffs (darker) so the sleeves read
  ci.draw_rect(Rect2(-12.0, -38.0, 5.0, 1.4), Color(Math.min(base.r * 1.18, 1.0), Math.min(base.g * 1.16, 1.0), Math.min(base.b * 1.14, 1.0)));
  ci.draw_rect(Rect2(7.0, -38.0, 5.0, 1.4), Color(Math.min(dark.r * 1.15, 1.0), Math.min(dark.g * 1.13, 1.0), Math.min(dark.b * 1.12, 1.0)));
  ci.draw_rect(Rect2(-12.0, -28.0, 5.0, 2.0), Color(base.r * 0.62, base.g * 0.62, base.b * 0.62));
  ci.draw_rect(Rect2(7.0, -28.0, 5.0, 2.0), Color(dark.r * 0.68, dark.g * 0.68, dark.b * 0.68));
}

function _draw_lantern(ci) {
  ci.draw_circle(V(-12.5, -29.0), 8.0, Color(1.0, 0.85, 0.30, 0.28));
  ci.draw_rect(Rect2(-15.0, -33.0, 5.0, 8.0), Color(0.58, 0.44, 0.14));
  ci.draw_rect(Rect2(-15.0, -33.0, 5.0, 2.0), Color(0.72, 0.56, 0.22));
}

function _draw_beard(ci, loadout, low_perf) {
  // Beards sit on the lower face (top edge <= -43, below the eye line at -46.5)
  // so they never crowd the eyes regardless of colour.
  const col = Color.html(String(loadout.beard_color ?? '#9a6a40'));
  const dark = Color(col.r * 0.80, col.g * 0.78, col.b * 0.74);
  const lite = Color(Math.min(col.r * 1.20, 1.0), Math.min(col.g * 1.16, 1.0), Math.min(col.b * 1.12, 1.0));
  switch (String(loadout.beard ?? 'beard_stubble')) {
    case 'beard_clean':
      break;
    case 'beard_goatee':
      ci.draw_colored_polygon([  // moustache
        V(-3.0, -43.6), V(3.0, -43.6), V(2.2, -41.9),
        V(0.0, -42.4), V(-2.2, -41.9),
      ], col);
      ci.draw_colored_polygon([  // chin tuft
        V(-2.3, -41.2), V(2.3, -41.2), V(1.8, -37.0),
        V(0.0, -35.6), V(-1.8, -37.0),
      ], col);
      if (!low_perf) {
        ci.draw_rect(Rect2(-0.5, -40.5, 1.0, 3.6), dark);
      }
      break;
    case 'beard_braided':
      ci.draw_colored_polygon([
        V(-5.0, -43.5), V(5.0, -43.5), V(4.5, -40.0),
        V(3.0, -37.5), V(0.0, -36.5), V(-3.0, -37.5),
        V(-4.5, -40.0),
      ], col);
      ci.draw_colored_polygon([  // left braid
        V(-3.2, -38.0), V(-0.6, -38.0), V(-0.9, -32.0),
        V(-1.9, -30.5), V(-2.9, -32.0),
      ], col);
      ci.draw_colored_polygon([  // right braid
        V(0.6, -38.0), V(3.2, -38.0), V(2.9, -32.0),
        V(1.9, -30.5), V(0.9, -32.0),
      ], col);
      if (!low_perf) {
        ci.draw_rect(Rect2(-3.0, -34.6, 2.2, 1.4), lite);  // binding rings
        ci.draw_rect(Rect2(0.8, -34.6, 2.2, 1.4), lite);
      }
      break;
    case 'beard_bushy':
      ci.draw_colored_polygon([
        V(-6.5, -44.5), V(6.5, -44.5), V(6.2, -39.0),
        V(4.0, -34.0), V(0.0, -32.5), V(-4.0, -34.0),
        V(-6.2, -39.0),
      ], col);
      if (!low_perf) {
        ci.draw_colored_polygon([  // moustache shadow
          V(-4.0, -44.0), V(4.0, -44.0), V(3.0, -42.2),
          V(0.0, -43.0), V(-3.0, -42.2),
        ], dark);
        ci.draw_rect(Rect2(-0.7, -43.0, 1.4, 8.5), Color(lite.r, lite.g, lite.b, 0.45));
      }
      break;
    case 'beard_long':
      ci.draw_colored_polygon([  // full mass
        V(-6.0, -44.0), V(6.0, -44.0), V(5.5, -39.5),
        V(3.5, -35.5), V(-3.5, -35.5), V(-5.5, -39.5),
      ], col);
      ci.draw_colored_polygon([  // long tapering braid
        V(-3.5, -35.5), V(3.5, -35.5), V(2.5, -30.0),
        V(0.0, -26.0), V(-2.5, -30.0),
      ], col);
      if (!low_perf) {
        ci.draw_rect(Rect2(-3.0, -34.6, 6.0, 1.2), dark);
        ci.draw_rect(Rect2(-2.2, -30.6, 4.4, 1.1), lite);
      }
      break;
    default: { // stubble (default) — faint jaw shadow + a hint of moustache
      const faint = Color(col.r, col.g, col.b, 0.5);
      ci.draw_colored_polygon([
        V(-5.5, -43.3), V(5.5, -43.3), V(5.0, -40.5),
        V(3.0, -38.6), V(0.0, -38.0), V(-3.0, -38.6),
        V(-5.0, -40.5),
      ], faint);
      ci.draw_rect(Rect2(-2.6, -43.4, 5.2, 1.1), faint);
      break;
    }
  }
}

function _draw_hair(ci, loadout, low_perf) {
  // The hairline across the forehead stays at/above y=-49 — clear of the eyes at
  // -46.5 — so the face always reads. Side-locks and sideburns frame it without
  // crossing the eye line; the crown still covers the scalp so no skin shows on top.
  const col = Color.html(String(loadout.hair_color ?? '#6b4a2e'));
  const dark = Color(col.r * 0.78, col.g * 0.76, col.b * 0.72);
  const lite = Color(Math.min(col.r * 1.28, 1.0), Math.min(col.g * 1.24, 1.0), Math.min(col.b * 1.18, 1.0));
  switch (String(loadout.hair ?? 'hair_short')) {
    case 'hair_bald':
      break;
    case 'hair_long':
      ci.draw_colored_polygon([  // left lock (behind face)
        V(-7.4, -51.0), V(-9.2, -48.0), V(-9.0, -40.0),
        V(-8.0, -33.0), V(-6.5, -31.0), V(-5.0, -33.0),
        V(-5.2, -40.0), V(-6.2, -47.0), V(-7.0, -49.5),
      ], dark);
      ci.draw_colored_polygon([  // right lock
        V(7.4, -51.0), V(9.2, -48.0), V(9.0, -40.0),
        V(8.0, -33.0), V(6.5, -31.0), V(5.0, -33.0),
        V(5.2, -40.0), V(6.2, -47.0), V(7.0, -49.5),
      ], dark);
      ci.draw_colored_polygon([  // crown over the top
        V(-7.2, -49.0), V(-7.4, -51.5), V(-4.5, -53.6),
        V(0.0, -54.4), V(4.5, -53.6), V(7.4, -51.5),
        V(7.2, -49.0), V(4.8, -49.4), V(0.0, -49.6),
        V(-4.8, -49.4),
      ], col);
      if (!low_perf) {
        ci.draw_line(V(-3.0, -53.0), V(-1.0, -50.0), lite, 0.7);
        ci.draw_line(V(2.5, -53.0), V(1.0, -50.0), lite, 0.7);
      }
      break;
    case 'hair_topknot':
      ci.draw_colored_polygon([  // tight pulled-back crown
        V(-6.5, -50.0), V(-6.0, -52.0), V(-3.0, -53.6),
        V(0.0, -54.0), V(3.0, -53.6), V(6.0, -52.0),
        V(6.5, -50.0), V(3.5, -50.4), V(0.0, -50.6),
        V(-3.5, -50.4),
      ], col);
      ci.draw_rect(Rect2(-1.0, -57.0, 2.0, 4.0), col);   // stalk
      ci.draw_circle(V(0.0, -57.6), 2.8, col);            // bun
      if (!low_perf) {
        ci.draw_circle(V(0.9, -58.3), 1.1, lite);
      }
      break;
    case 'hair_ponytail':
      ci.draw_colored_polygon([  // tail (behind, to one side)
        V(6.8, -52.0), V(9.2, -51.0), V(9.6, -45.0),
        V(9.0, -38.0), V(7.8, -35.5), V(6.8, -37.5),
        V(7.2, -44.0), V(6.0, -50.0),
      ], dark);
      ci.draw_colored_polygon([  // crown, open face
        V(-7.0, -49.0), V(-7.3, -51.5), V(-4.5, -53.4),
        V(0.0, -54.2), V(4.5, -53.4), V(7.3, -51.5),
        V(7.0, -49.0), V(4.5, -49.4), V(0.0, -49.6),
        V(-4.5, -49.4),
      ], col);
      if (!low_perf) {
        ci.draw_rect(Rect2(6.4, -46.2, 2.6, 1.4), lite);  // tie band
      }
      break;
    case 'hair_mohawk':
      ci.draw_colored_polygon([  // central fin, bare sides
        V(-2.5, -50.0), V(-2.2, -55.0), V(-1.0, -58.5),
        V(0.2, -59.0), V(1.2, -57.5), V(2.0, -54.0),
        V(2.5, -50.0),
      ], col);
      if (!low_perf) {
        ci.draw_line(V(0.0, -57.5), V(0.0, -51.0), lite, 0.7);
      }
      break;
    default: // short (default) — neat crop with sideburns, open face
      ci.draw_colored_polygon([
        V(-7.0, -49.0), V(-7.3, -51.5), V(-4.5, -53.4),
        V(0.0, -54.2), V(4.5, -53.4), V(7.3, -51.5),
        V(7.0, -49.0), V(7.0, -44.5), V(5.6, -44.8),
        V(5.3, -48.6), V(0.0, -49.3), V(-5.3, -48.6),
        V(-5.6, -44.8), V(-7.0, -44.5),
      ], col);
      if (!low_perf) {
        ci.draw_line(V(-3.0, -52.5), V(-1.0, -50.0), lite, 0.7);
        ci.draw_line(V(2.5, -52.5), V(1.0, -50.0), lite, 0.7);
      }
      break;
  }
}

function _draw_extra_hands(ci, loadout, low_perf) {
  switch (String(loadout.extra ?? 'extra_none')) {
    case 'extra_gloves':
      // Enchanted work gloves: a red glow marks them as the one cosmetic that
      // carries a gameplay effect (+60% berry picking). Glow draws first so the
      // leather and ember rim sit crisply on top; halo skipped in low-perf.
      if (!low_perf) {
        ci.draw_circle(V(-12.0, -26.0), 5.0, Color(0.95, 0.25, 0.15, 0.18));  // left halo
        ci.draw_circle(V(11.0, -26.0), 5.0, Color(0.95, 0.25, 0.15, 0.18));   // right halo
        ci.draw_circle(V(-12.0, -26.0), 2.6, Color(1.0, 0.40, 0.22, 0.35));   // left core
        ci.draw_circle(V(11.0, -26.0), 2.6, Color(1.0, 0.40, 0.22, 0.35));
      }
      ci.draw_rect(Rect2(-14.5, -27.5, 5.0, 3.0), Color(0.26, 0.13, 0.11));   // dark leather
      ci.draw_rect(Rect2(8.5, -27.5, 5.0, 3.0), Color(0.26, 0.13, 0.11));
      ci.draw_rect(Rect2(-14.5, -27.5, 5.0, 0.9), Color(1.0, 0.42, 0.24));    // ember rim
      ci.draw_rect(Rect2(8.5, -27.5, 5.0, 0.9), Color(1.0, 0.42, 0.24));
      break;
    default:
      break;
  }
}

function _draw_headwear(ci, loadout, low_perf) {
  switch (String(loadout.headwear ?? 'head_bare')) {
    case 'head_clothcap':
      // Dome covers the scalp; the brow band sits at -50…-47.8 so the eyes
      // (-46.5) stay clear — the cap reads as worn on the head, not over the face.
      ci.draw_colored_polygon([
        V(-7.0, -49.0), V(-6.5, -52.0), V(-3.5, -54.6),
        V(0.0, -55.6), V(3.5, -54.6), V(6.5, -52.0), V(7.0, -49.0),
      ], Color(0.36, 0.42, 0.25));
      ci.draw_rect(Rect2(-7.6, -50.0, 15.2, 2.2), Color(0.28, 0.33, 0.19));
      if (!low_perf) ci.draw_circle(V(0.0, -55.8), 1.3, Color(0.46, 0.52, 0.32));  // top button
      break;
    case 'head_ironhelm':
      _draw_helm_dome(ci, low_perf);
      break;
    case 'head_horned':
      _draw_helm_dome(ci, low_perf);
      _draw_horns(ci, low_perf);
      break;
    case 'head_crown':
      _draw_crown(ci, low_perf);
      break;
    case 'head_diadem':
      _draw_crown_jeweled(ci, low_perf);
      break;
    case 'head_ravenous':
      _draw_crown_ravenous(ci, low_perf);
      break;
    case 'head_crackhelm':
      _draw_helm_cracked(ci, low_perf);
      break;
    case 'head_plaguemask':
      _draw_plague_mask(ci, low_perf);
      break;
    case 'head_propeller':
      _draw_propeller(ci, low_perf);
      break;
    case 'head_birthday':
      _draw_partyhat(ci, low_perf);
      break;
    default: // bare (default) — nothing
      break;
  }
}

function _draw_helm_dome(ci, low_perf) {
  // Dome bottom at -48; brow band at -49.5…-47.2 clears the eyes (-46.5). A thin
  // nasal guard drops between the eyes (x∈[-0.7,0.7], both eyes are further out).
  ci.draw_colored_polygon([
    V(-7.0, -48.0), V(-7.0, -51.0), V(-5.0, -54.5),
    V(-2.0, -56.0), V(2.0, -56.0), V(5.0, -54.5),
    V(7.0, -51.0), V(7.0, -48.0),
  ], Color(0.55, 0.58, 0.61));
  if (!low_perf) {
    ci.draw_colored_polygon([
      V(-7.0, -48.0), V(-7.0, -51.0), V(-5.0, -54.5),
      V(-2.0, -56.0), V(0.0, -56.0), V(0.0, -48.0),
    ], Color(0.62, 0.65, 0.68));
  }
  ci.draw_rect(Rect2(-7.5, -49.5, 15.0, 2.3), Color(0.44, 0.47, 0.50));  // brow band
  ci.draw_rect(Rect2(-0.7, -49.0, 1.4, 6.0), Color(0.50, 0.53, 0.56));  // nasal guard
  if (!low_perf) {
    ci.draw_circle(V(0.0, -49.4), 1.3, Color(0.62, 0.65, 0.68));  // brow boss
  }
}

function _draw_horns(ci, low_perf) {
  // Bases seat on the raised helm dome's sides (~-51) and sweep up and out.
  if (low_perf) {
    ci.draw_colored_polygon([
      V(-6.5, -51.0), V(-12.0, -62.0), V(-6.5, -53.5)], Color(0.91, 0.88, 0.81));
    ci.draw_colored_polygon([
      V(6.5, -51.0), V(12.0, -62.0), V(6.5, -53.5)], Color(0.91, 0.88, 0.81));
  } else {
    ci.draw_colored_polygon([
      V(-6.5, -51.0), V(-9.5, -56.5), V(-12.0, -62.5),
      V(-10.5, -61.5), V(-8.8, -56.5), V(-6.5, -53.5)], Color(0.91, 0.88, 0.81));
    ci.draw_colored_polygon([
      V(6.5, -51.0), V(9.5, -56.5), V(12.0, -62.5),
      V(10.5, -61.5), V(8.8, -56.5), V(6.5, -53.5)], Color(0.91, 0.88, 0.81));
  }
}

function _draw_crown(ci, low_perf) {
  // Gold band with three points and a small gem — the marquee Astrolabe reward.
  // Band bottom at -49.5 sits above the eyes (-46.5); points rise to -58.5.
  ci.draw_colored_polygon([
    V(-7.0, -49.5), V(-7.0, -53.5), V(-4.0, -56.5),
    V(-2.5, -53.5), V(0.0, -58.5), V(2.5, -53.5),
    V(4.0, -56.5), V(7.0, -53.5), V(7.0, -49.5),
  ], Color(0.85, 0.71, 0.29));
  if (!low_perf) {
    ci.draw_rect(Rect2(-7.0, -50.6, 14.0, 1.4), Color(0.97, 0.86, 0.45));
  }
  ci.draw_circle(V(0.0, -54.5), 1.6, Color(0.50, 0.84, 0.88));
}

function _draw_crown_jeweled(ci, low_perf) {
  // Taller five-point gold crown, gem-studded — the 3rd-ritual Astrolabe Diadem.
  // Band bottom at -49.5 stays above the eyes (-46.5); centre point rises to -63.2.
  const gold = Color(0.79, 0.63, 0.23);
  const gold_pt = Color(0.85, 0.70, 0.29);
  const gold_mid = Color(0.90, 0.75, 0.34);
  const cyan = Color(0.31, 0.82, 0.88);
  const red = Color(0.88, 0.33, 0.42);
  const green = Color(0.44, 0.88, 0.63);
  ci.draw_colored_polygon([  // band
    V(-7.5, -49.5), V(7.5, -49.5),
    V(7.5, -53.0), V(-7.5, -53.0),
  ], gold);
  ci.draw_colored_polygon([  // five points, centre tallest
    V(-7.5, -53.0), V(-6.0, -59.0), V(-4.5, -53.0)], gold_pt);
  ci.draw_colored_polygon([
    V(-4.0, -53.0), V(-2.3, -60.5), V(-0.6, -53.0)], gold_pt);
  ci.draw_colored_polygon([
    V(-1.0, -53.0), V(0.0, -63.2), V(1.0, -53.0)], gold_mid);
  ci.draw_colored_polygon([
    V(0.6, -53.0), V(2.3, -60.5), V(4.0, -53.0)], gold_pt);
  ci.draw_colored_polygon([
    V(4.5, -53.0), V(6.0, -59.0), V(7.5, -53.0)], gold_pt);
  if (!low_perf) {
    ci.draw_rect(Rect2(-7.5, -50.8, 15.0, 1.3), Color(0.97, 0.86, 0.45));  // band highlight
    ci.draw_circle(V(-6.0, -58.6), 1.0, cyan);   // tip gems
    ci.draw_circle(V(-2.3, -60.1), 1.0, red);
    ci.draw_circle(V(2.3, -60.1), 1.0, red);
    ci.draw_circle(V(6.0, -58.6), 1.0, cyan);
    ci.draw_circle(V(0.0, -62.6), 1.5, green);
  }
  // Band centre gem — kept in low-perf so the crown still reads as the Diadem.
  ci.draw_circle(V(0.0, -51.3), 1.5, cyan);
}

function _draw_crown_ravenous(ci, low_perf) {
  // Blackened-crimson spiked crown — The Ravenous Maw mastery trophy. A single
  // glowing red gem is the only ornament. Spikes carry a lit/shadow face each.
  const dark = Color(0.27, 0.07, 0.07);
  const mid = Color(0.42, 0.11, 0.11);
  const lite = Color(0.66, 0.20, 0.18);
  // Five jagged spikes (baseL, apex, baseR) + a darker right-hand shadow face.
  const spikes = [
    [V(-7.5, -53.0), V(-7.6, -61.5), V(-5.0, -53.0)],
    [V(-4.6, -53.0), V(-3.2, -63.0), V(-1.8, -53.0)],
    [V(-1.1, -53.0), V(0.0, -66.0), V(1.1, -53.0)],
    [V(1.8, -53.0), V(3.2, -63.0), V(4.6, -53.0)],
    [V(5.0, -53.0), V(7.6, -61.5), V(7.5, -53.0)],
  ];
  for (const s of spikes) {
    const bl = s[0];
    const ap = s[1];
    const br = s[2];
    const bm = V((bl.x + br.x) * 0.5, -53.0);
    ci.draw_colored_polygon([bl, ap, br], mid);
    ci.draw_colored_polygon([bm, ap, br], dark);
    if (!low_perf) {
      ci.draw_line(bl, ap, lite, 0.4);
    }
  }
  // Band.
  ci.draw_colored_polygon([
    V(-7.5, -49.0), V(7.5, -49.0), V(7.5, -53.0), V(-7.5, -53.0)], mid);
  if (!low_perf) {
    ci.draw_rect(Rect2(-7.5, -49.7, 15.0, 0.7), lite);   // top highlight
  }
  ci.draw_rect(Rect2(-7.5, -52.4, 15.0, 0.6), dark);       // bottom shadow
  // Glowing gem.
  if (!low_perf) {
    ci.draw_circle(V(0.0, -51.0), 3.0, Color(1.0, 0.23, 0.18, 0.30));   // glow halo
  }
  ci.draw_circle(V(0.0, -51.0), 1.8, Color(0.95, 0.18, 0.14));            // gem
  ci.draw_circle(V(-0.6, -51.5), 0.6, Color(1.0, 0.90, 0.86));           // specular
}

function _draw_helm_cracked(ci, low_perf) {
  // Battered steel dome — Brittle World mastery trophy, deliberately the humblest
  // (no gem). Damage reads as a dark gouge, not a cut-out (no fixed backdrop).
  const dark = Color(0.24, 0.29, 0.35);
  const mid = Color(0.44, 0.50, 0.58);
  const lite = Color(0.66, 0.74, 0.81);
  ci.draw_colored_polygon([
    V(-8.0, -48.5), V(-7.4, -54.5), V(-4.5, -58.4),
    V(0.0, -59.2), V(4.5, -58.4), V(7.4, -54.5), V(8.0, -48.5),
  ], mid);
  if (!low_perf) {
    ci.draw_colored_polygon([   // left highlight facet
      V(-6.6, -49.0), V(-4.5, -57.4), V(-1.2, -58.6), V(-4.0, -55.5),
    ], lite);
  }
  ci.draw_rect(Rect2(-8.0, -50.0, 16.0, 2.2), dark);            // brow band
  ci.draw_rect(Rect2(-1.0, -49.8, 2.0, 6.6), Color(0.30, 0.36, 0.43));  // nasal guard
  ci.draw_line(V(0.0, -59.0), V(0.0, -50.0), dark, 0.5);    // comb ridge
  ci.draw_colored_polygon([   // dark gouge / missing chunk on the rim
    V(5.4, -53.5), V(7.6, -49.0), V(6.2, -54.6)], dark);
  if (!low_perf) {
    ci.draw_line(V(-3.6, -57.5), V(-1.8, -52.5), Color(0.16, 0.20, 0.25), 0.7);
    ci.draw_line(V(-1.8, -52.5), V(-4.2, -50.0), Color(0.16, 0.20, 0.25), 0.7);
  }
}

function _draw_plague_mask(ci, low_perf) {
  // Beaked plague-doctor mask — The Black Rot mastery trophy. Bold silhouette;
  // the only fine touch is a faint green glow in the lenses.
  const hood = Color(0.18, 0.23, 0.13);
  const plate = Color(0.49, 0.59, 0.31);
  const beak = Color(0.36, 0.42, 0.24);
  const beakd = Color(0.27, 0.32, 0.18);
  ci.draw_colored_polygon([   // hood over the scalp
    V(-8.5, -47.0), V(-8.0, -54.0), V(-4.0, -58.0),
    V(0.0, -58.6), V(4.0, -58.0), V(8.0, -54.0), V(8.5, -47.0),
  ], hood);
  ci.draw_colored_polygon([   // face plate (covers the eyes)
    V(-7.0, -49.0), V(-7.4, -44.0), V(0.0, -40.0),
    V(7.4, -44.0), V(7.0, -49.0),
  ], plate);
  ci.draw_colored_polygon([   // beak
    V(-2.4, -44.0), V(0.0, -33.0), V(2.4, -44.0)], beak);
  ci.draw_colored_polygon([   // beak shadow face
    V(0.0, -33.0), V(2.4, -44.0), V(0.6, -44.0)], beakd);
  for (const lx of [-3.0, 3.0]) {
    if (!low_perf) {
      ci.draw_circle(V(lx, -46.5), 2.0, Color(0.48, 0.82, 0.42, 0.45));  // lens glow
    }
    ci.draw_circle(V(lx, -46.5), 1.6, Color(0.11, 0.14, 0.09));            // lens
    if (!low_perf) {
      ci.draw_circle(V(lx + 0.5, -47.0), 0.5, Color(0.73, 0.91, 0.62));  // glint
    }
  }
}

function _draw_maweaten(ci, low_perf) {
  // The Maw-Eaten — the apex reskin. Survive 30 days holding all six Challenges,
  // then fall, and rise remade: charred obsidian body, a molten chest-core
  // bleeding magma cracks, coal eyes, clawed hands, a crown of the Maw's fangs.
  const char_a = Color(0.11, 0.08, 0.10);   // darkest plate (right/shadow side)
  const char_c = Color(0.16, 0.11, 0.13);   // mid plate (left/lit side)
  const warm = Color(0.23, 0.14, 0.13);   // warm edge highlight
  const magma = Color(1.0, 0.35, 0.14);
  const ember = Color(1.0, 0.54, 0.23);
  const hot = Color(1.0, 0.94, 0.82);
  if (!low_perf) {
    ci.draw_circle(V(0.0, -30.0), 18.0, Color(1.0, 0.23, 0.08, 0.07));   // ember aura
  }
  // Boots + soles.
  ci.draw_rect(Rect2(-6.0, -9.0, 5.0, 7.0), char_c);
  ci.draw_rect(Rect2(1.0, -9.0, 5.0, 7.0), char_a);
  ci.draw_rect(Rect2(-6.6, -2.4, 6.2, 2.4), Color(0.05, 0.03, 0.04));
  ci.draw_rect(Rect2(0.4, -2.4, 6.2, 2.4), Color(0.04, 0.02, 0.03));
  // Legs.
  ci.draw_rect(Rect2(-5.0, -23.0, 4.0, 14.0), char_c);
  ci.draw_rect(Rect2(1.0, -23.0, 4.0, 14.0), char_a);
  // Tattered tunic (jagged hem) + shadow half + warm left edge.
  ci.draw_colored_polygon([
    V(-8.0, -39.0), V(8.0, -39.0), V(7.0, -25.0), V(5.0, -27.0),
    V(3.0, -25.0), V(1.0, -27.0), V(-1.0, -25.0), V(-3.0, -27.0),
    V(-5.0, -25.0), V(-7.0, -27.0)], char_c);
  ci.draw_colored_polygon([
    V(0.0, -39.0), V(8.0, -39.0), V(7.0, -25.0), V(5.0, -27.0),
    V(3.0, -25.0), V(1.0, -27.0), V(0.0, -25.5)], char_a);
  ci.draw_rect(Rect2(-8.0, -39.0, 1.6, 13.0), warm);
  // Obsidian shoulder shards.
  ci.draw_colored_polygon([V(-8.0, -39.0), V(-11.5, -47.0), V(-6.0, -40.5)], char_c);
  ci.draw_colored_polygon([V(8.0, -39.0), V(11.5, -47.0), V(6.0, -40.5)], char_a);
  // Arms.
  ci.draw_rect(Rect2(-12.0, -38.0, 5.0, 11.0), char_c);
  ci.draw_rect(Rect2(7.0, -38.0, 5.0, 11.0), char_a);
  // Claws (three talons per hand).
  ci.draw_colored_polygon([V(-12.0, -27.0), V(-12.6, -22.8), V(-11.2, -26.6)], char_c);
  ci.draw_colored_polygon([V(-10.4, -27.0), V(-10.4, -22.4), V(-9.2, -26.6)], char_c);
  ci.draw_colored_polygon([V(-8.6, -27.0), V(-8.0, -22.8), V(-7.4, -26.8)], char_c);
  ci.draw_colored_polygon([V(11.6, -27.0), V(12.2, -22.8), V(11.0, -26.6)], char_a);
  ci.draw_colored_polygon([V(10.0, -27.0), V(10.0, -22.4), V(8.8, -26.6)], char_a);
  ci.draw_colored_polygon([V(8.4, -27.0), V(7.8, -22.8), V(7.2, -26.8)], char_a);
  // Magma cracks radiating from the core.
  if (!low_perf) {
    ci.draw_polyline([V(0.0, -38.0), V(-3.0, -33.0), V(-1.0, -29.0), V(-3.0, -25.0)], magma, 0.8);
    ci.draw_polyline([V(0.0, -36.0), V(3.0, -32.0), V(2.0, -27.0)], magma, 0.8);
    ci.draw_polyline([V(-8.0, -36.0), V(-6.0, -31.0)], magma, 0.7);
    ci.draw_polyline([V(8.0, -35.0), V(6.0, -30.0)], magma, 0.7);
    ci.draw_polyline([V(-4.0, -21.0), V(-3.0, -14.0)], magma, 0.7);
    ci.draw_polyline([V(3.0, -20.0), V(4.0, -13.0)], magma, 0.7);
  }
  // Molten chest core.
  if (!low_perf) {
    ci.draw_circle(V(0.0, -34.0), 4.2, Color(1.0, 0.45, 0.16, 0.45));
  }
  ci.draw_circle(V(0.0, -34.0), 2.4, ember);
  ci.draw_circle(V(0.0, -34.0), 1.3, hot);
  // Head.
  ci.draw_circle(V(0.0, -46.0), 7.5, char_c);
  ci.draw_circle(V(2.4, -44.6), 4.0, Color(0.05, 0.03, 0.04, 0.5));
  if (!low_perf) {
    ci.draw_polyline([V(-4.0, -49.0), V(-2.5, -46.0), V(-3.6, -43.0)], magma, 0.6);
    ci.draw_polyline([V(3.6, -49.5), V(2.2, -45.5)], magma, 0.6);
    ci.draw_circle(V(-2.6, -46.5), 2.2, Color(1.0, 0.40, 0.16, 0.5));   // eye glow
    ci.draw_circle(V(1.6, -46.5), 2.2, Color(1.0, 0.40, 0.16, 0.5));
  }
  ci.draw_circle(V(-2.6, -46.5), 1.4, ember);
  ci.draw_circle(V(1.6, -46.5), 1.4, ember);
  ci.draw_circle(V(-2.6, -46.7), 0.55, hot);
  ci.draw_circle(V(1.6, -46.7), 0.55, hot);
  // Crown of the Maw's fangs.
  ci.draw_rect(Rect2(-7.5, -52.6, 15.0, 1.6), Color(0.16, 0.05, 0.05));   // gum band
  const tooth = Color(0.91, 0.86, 0.77);
  const toothd = Color(0.70, 0.64, 0.52);
  ci.draw_colored_polygon([V(-7.5, -52.0), V(-6.0, -59.0), V(-4.4, -52.0)], tooth);
  ci.draw_colored_polygon([V(-4.2, -52.0), V(-2.4, -61.0), V(-0.6, -52.0)], toothd);
  ci.draw_colored_polygon([V(-0.4, -52.0), V(0.6, -62.5), V(1.6, -52.0)], tooth);
  ci.draw_colored_polygon([V(1.8, -52.0), V(3.6, -60.0), V(5.0, -52.0)], toothd);
  ci.draw_colored_polygon([V(5.2, -52.0), V(6.6, -58.0), V(7.5, -52.0)], tooth);
}

// Easter-egg beanie: a blue cap, a stalk, and four rainbow propeller blades.
// Unlocked only via a secret code (see data/codes.json). Drawn static — a
// spinning version would force a per-frame redraw, which we avoid here.
function _draw_propeller(ci, low_perf) {
  // Cap dome + brow band, raised so the brim (-50…-48) clears the eyes (-46.5);
  // the propeller rides on top.
  ci.draw_colored_polygon([
    V(-7.0, -49.0), V(-6.5, -52.0), V(-3.5, -54.6),
    V(0.0, -56.0), V(3.5, -54.6), V(6.5, -52.0), V(7.0, -49.0),
  ], Color(0.20, 0.45, 0.85));
  ci.draw_rect(Rect2(-7.6, -50.0, 15.2, 2.0), Color(0.15, 0.34, 0.70));
  // Stalk up to the propeller hub.
  ci.draw_rect(Rect2(-0.8, -60.5, 1.6, 4.5), Color(0.30, 0.30, 0.32));
  // Four rainbow blades pinwheeling around the hub at (0, -60.5).
  ci.draw_colored_polygon([
    V(0.0, -60.5), V(-9.0, -63.0), V(-1.0, -59.5)], Color(0.92, 0.22, 0.22));  // red
  ci.draw_colored_polygon([
    V(0.0, -60.5), V(9.0, -63.0), V(1.0, -59.5)], Color(0.96, 0.80, 0.20));   // yellow
  ci.draw_colored_polygon([
    V(0.0, -60.5), V(-9.0, -58.0), V(-1.0, -61.5)], Color(0.22, 0.74, 0.34));  // green
  ci.draw_colored_polygon([
    V(0.0, -60.5), V(9.0, -58.0), V(1.0, -61.5)], Color(0.26, 0.52, 0.95));   // blue
  if (!low_perf) {
    ci.draw_circle(V(0.0, -56.2), 1.4, Color(0.97, 0.86, 0.45));  // cap button
  }
  ci.draw_circle(V(0.0, -60.5), 1.3, Color(0.30, 0.30, 0.32));      // hub
}

function _draw_partyhat(ci, low_perf) {
  // Festive striped cone topped with a pom-pom — the HAPPYBIRTHDAY secret hat.
  // Base band bottom at -49.5 clears the eyes (-46.5); the tip rises to -64.
  const pink = Color(0.93, 0.40, 0.60);
  const teal = Color(0.30, 0.78, 0.80);
  const yellow = Color(0.97, 0.83, 0.34);
  const purple = Color(0.62, 0.40, 0.82);
  // Four colour bands stacked up the cone; the x extents track the tapering edge.
  ci.draw_colored_polygon([
    V(-6.5, -49.5), V(6.5, -49.5), V(4.71, -53.5), V(-4.71, -53.5)], pink);
  ci.draw_colored_polygon([
    V(-4.71, -53.5), V(4.71, -53.5), V(2.91, -57.5), V(-2.91, -57.5)], teal);
  ci.draw_colored_polygon([
    V(-2.91, -57.5), V(2.91, -57.5), V(1.345, -61.0), V(-1.345, -61.0)], yellow);
  ci.draw_colored_polygon([
    V(-1.345, -61.0), V(1.345, -61.0), V(0.0, -64.0)], purple);
  if (!low_perf) {
    // Soft highlight down the left face gives the cone some volume.
    ci.draw_colored_polygon([
      V(-6.5, -49.5), V(-2.5, -49.5), V(0.0, -64.0)], Color(1.0, 1.0, 1.0, 0.12));
  }
  // Fluffy cream pom-pom crowning the tip (kept in low-perf — it's the signature).
  ci.draw_circle(V(0.0, -64.6), 1.9, Color(0.97, 0.95, 0.88));
  if (!low_perf) {
    ci.draw_circle(V(-0.7, -65.1), 0.7, Color(1.0, 1.0, 0.97));  // pom-pom sheen
  }
}

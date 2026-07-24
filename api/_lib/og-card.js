// Pure builder for the 1200×630 unfurl image (SVG). Rasterized to PNG by
// api/og.js via resvg. Layout: "horizontal dossier" — portrait left, name +
// epitaph + a three-stat row right, underroot.se brand mark. Site palette.
import { diggerSvg } from '../../assets/digger-svg.js';
import { num, compact, roman, causeLabel } from '../../assets/format.js';

export const OG_W = 1200;
export const OG_H = 630;

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// A small downward fang (the Maw's tooth) as a polygon, at (x,y), width w.
const fang = (x, y, w, fill) =>
  `<polygon points="${x},${y} ${x + w},${y} ${x + w * 0.775},${y + w * 0.75} ${x + w / 2},${y + w * 1.375} ${x + w * 0.225},${y + w * 0.75}" fill="${fill}"/>`;

// The Harrow's hex mark as a real polygon — like the ritual pips, the bundled
// OG fonts have no U+2B21 glyph to lean on.
const hexOutline = (cx, cy, r, stroke) => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="3"/>`;
};

// Astrolabe ritual pips at the top-right of the portrait box (90..420 x, from
// y 150). Same rule as ritualMark: 1–5 diamonds, above 5 one diamond + the
// exact count. Real polygons, not ◆ text — the bundled OG fonts lack U+25C6.
const PIP_FILL = '#d6924e';
function ritualPipsSvg(n) {
  if (!(n > 0)) return '';
  const y = 180, s = 8, right = 412;
  const diamond = (cx) => `<polygon points="${cx},${y - s} ${cx + s},${y} ${cx},${y + s} ${cx - s},${y}" fill="${PIP_FILL}"/>`;
  if (n <= 5) {
    let out = '';
    for (let i = 0; i < n; i++) out += diamond(right - s - i * (s * 2 + 6));
    return out;
  }
  return diamond(right - s)
    + `<text x="${right - s * 2 - 10}" y="${y + 8}" font-family="Press Start 2P" font-size="22" fill="${PIP_FILL}" text-anchor="end">${num(n)}</text>`;
}

// Challenge accent colours (mirrors ChallengeManager's accent map / the HTML
// card). Emoji don't rasterize through resvg, so the OG twin of the card's icon
// badge is a row of accent-coloured dots in the portrait's lower-left.
const CHAL_COLORS = {
  lone_villager: '#f0bd5e', brittle_world: '#8fa6bf', eye_of_the_storm: '#5b9bf0',
  ravenous_maw: '#e84736', black_rot: '#84c656', two_fronts: '#b074ec',
};
const CHAL_ORDER = ['lone_villager', 'brittle_world', 'eye_of_the_storm', 'ravenous_maw', 'black_rot', 'two_fronts'];

function challengeDotsSvg(run) {
  const raw = Array.isArray(run.challenges) ? run.challenges : [];
  const ids = CHAL_ORDER.filter((id) => raw.includes(id));
  if (ids.length === 0) return '';
  const allSix = ids.length === CHAL_ORDER.length;
  const r = 7, gap = 6, padX = 9, padY = 7, step = r * 2 + gap;
  const boxW = ids.length * r * 2 + (ids.length - 1) * gap + padX * 2;
  const boxH = r * 2 + padY * 2;
  const bx = 104, by = 474 - boxH, cy = by + boxH / 2;
  const frame = `<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" rx="9" fill="rgba(8,6,5,0.62)" stroke="${allSix ? 'rgba(232,179,74,0.65)' : 'rgba(120,96,60,0.5)'}" stroke-width="${allSix ? 2 : 1}"/>`;
  const dots = ids.map((id, i) =>
    `<circle cx="${bx + padX + r + i * step}" cy="${cy}" r="${r}" fill="${CHAL_COLORS[id]}" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>`).join('');
  return frame + dots;
}

export function buildOgSvg(run) {
  const name = escapeXml(truncate(String(run.digger_name ?? 'Unknown'), 13)).toUpperCase();
  const epitaph = escapeXml(causeLabel(run.cause) ?? 'Fate unrecorded');
  const days = escapeXml(num(run.days));
  const tiles = escapeXml(compact(run.blocks)); // compact: a 7-digit count won't fit the column
  const gen = escapeXml(run.gen != null ? roman(run.gen) : '·');
  const portrait = diggerSvg(run.cosmetics || {}, 330); // drawn feet-down in a 330 box

  const PS = 'Press Start 2P';
  const stat = (x, value, label) => `
    <text x="${x}" y="470" font-family="${PS}" font-size="34" fill="#a36936">${value}</text>
    <text x="${x}" y="505" font-family="${PS}" font-size="14" fill="rgba(255,255,255,0.55)" letter-spacing="2">${label}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
  <defs>
    <radialGradient id="warm" cx="20%" cy="30%" r="60%">
      <stop offset="0%" stop-color="rgba(80,52,30,0.75)"/><stop offset="60%" stop-color="rgba(20,16,12,0)"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="rgba(214,146,78,0.30)"/><stop offset="70%" stop-color="rgba(214,146,78,0)"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0c0907"/><stop offset="55%" stop-color="#14100c"/><stop offset="100%" stop-color="#0b0806"/>
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#warm)"/>
  <rect x="0" y="0" width="${OG_W}" height="6" fill="#8c2828"/>
  <ellipse cx="255" cy="300" rx="200" ry="200" fill="url(#glow)"/>
  <g transform="translate(90 150)">${portrait}</g>
  ${ritualPipsSvg(run.astrolabe_uses)}
  ${challengeDotsSvg(run)}

  <text x="470" y="185" font-family="${PS}" font-size="20" fill="#a36936" letter-spacing="4">THE MAW&apos;S LEDGER</text>
  <text x="470" y="285" font-family="${PS}" font-size="48" fill="#ffffff">${name}</text>
  ${fang(470, 330, 20, '#c05a4c')}
  <text x="502" y="352" font-family="PT Serif" font-style="italic" font-size="30" fill="#c05a4c">${epitaph}</text>
  ${run.harrow ? hexOutline(482, 392, 13, '#e0852e')
    + `<text x="508" y="401" font-family="PT Serif" font-style="italic" font-size="24" fill="#e0852e">${escapeXml(truncate(`“${String(run.harrow)}” — a harrowed world`, 36))}</text>` : ''}
  ${stat(470, days, 'DAYS')}
  ${stat(700, tiles, 'TILES DUG')}
  ${stat(930, gen, 'LINEAGE')}

  ${fang(975, 588, 14, 'rgba(255,255,255,0.34)')}
  <text x="1000" y="600" font-family="${PS}" font-size="15" fill="rgba(255,255,255,0.34)">underroot.se</text>
</svg>`;
}

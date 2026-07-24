// Pure server-rendered HTML for the standalone run card (Direction B) + a themed
// 404. All player strings are escaped — this is a server-HTML injection surface.
import { num, metres, roman, causeLabel, fmtDate, ritualMark } from '../../assets/format.js';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const shell = (title, desc, head, body) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}"/>
<link rel="icon" type="image/png" href="/assets/images/underroot_favicon.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/card-page.css"/>
${head}
</head><body>${body}</body></html>`;

const row = (k, v) => `<div class="pc-row"><span class="pc-k">${escapeHtml(k)}</span><span class="pc-v">${escapeHtml(v)}</span></div>`;

// Challenge id -> display (name, icon, accent), mirroring the game's
// ChallengeManager.CATALOG + accent map. Only ids listed here render, so an
// unknown/future challenge is dropped rather than shown raw — add new ones here
// to surface them (the same port step the harrow chip needed).
const CHALLENGES = {
  lone_villager:    { name: 'The Lone Villager', icon: '🕯️', color: '#f0bd5e' },
  brittle_world:    { name: 'Brittle World',     icon: '🔨', color: '#8fa6bf' },
  eye_of_the_storm: { name: 'Eye of the Storm',  icon: '⛈️', color: '#5b9bf0' },
  ravenous_maw:     { name: 'The Ravenous Maw',  icon: '🦷', color: '#e84736' },
  black_rot:        { name: 'The Black Rot',     icon: '☠️', color: '#84c656' },
  two_fronts:       { name: 'Two Fronts',        icon: '⚔️', color: '#b074ec' },
};
const CHALLENGE_ORDER = ['lone_villager', 'brittle_world', 'eye_of_the_storm', 'ravenous_maw', 'black_rot', 'two_fronts'];

// The challenge chip strip, or '' for a normal run. Holding all six at once is
// the game's Maw-Eaten apex condition, so it earns a distinct heading + flourish.
function challengeStrip(run) {
  const raw = Array.isArray(run.challenges) ? run.challenges : [];
  const ids = CHALLENGE_ORDER.filter((id) => raw.includes(id));
  if (ids.length === 0) return '';
  const chips = ids.map((id) => {
    const c = CHALLENGES[id];
    return `<span class="chal-chip" style="--chal:${c.color}"><span class="chal-ico">${c.icon}</span>${escapeHtml(c.name)}</span>`;
  }).join('');
  const allSix = ids.length === CHALLENGE_ORDER.length;
  const label = allSix ? 'All six Challenges — held at once' : `Under ${ids.length} Challenge${ids.length === 1 ? '' : 's'}`;
  return `<div class="cp-challenges${allSix ? ' all-six' : ''}"><div class="cp-chal-label">${escapeHtml(label)}</div><div class="cp-chal-chips">${chips}</div></div>`;
}

// Compact icon cluster for the portrait's lower-left corner, so the challenges
// ride ON the card visual (what gets shared/screenshotted), not just the side
// panel. Each icon carries its accent glow; all-six gets a gilded frame.
function challengeBadge(run) {
  const raw = Array.isArray(run.challenges) ? run.challenges : [];
  const ids = CHALLENGE_ORDER.filter((id) => raw.includes(id));
  if (ids.length === 0) return '';
  const allSix = ids.length === CHALLENGE_ORDER.length;
  const icons = ids.map((id) => {
    const c = CHALLENGES[id];
    return `<span class="pc-chal-ico" style="--chal:${c.color}">${c.icon}</span>`;
  }).join('');
  const names = ids.map((id) => CHALLENGES[id].name).join(' · ');
  return `<div class="pc-chal-badge${allSix ? ' all-six' : ''}" title="${escapeHtml(names)}">${icons}</div>`;
}

export function renderCardHtml(run, { origin, id }) {
  const name = String(run.digger_name ?? 'Unknown');
  const epitaph = causeLabel(run.cause) ?? 'Fate unrecorded';
  const genPhrase = run.gen != null ? `${num(run.gen)} generation${run.gen === 1 ? '' : 's'} dug ` : '';
  const title = `${name}'s village fell on day ${num(run.days)} — The Maw's Ledger`;
  const desc = `${genPhrase}${metres(run.depth)} before ${epitaph.toLowerCase()}. See the run.`;
  const url = `${origin}/r/${id}`;
  const ogImg = `${origin}/api/og?id=${id}`;
  // Inline JSON for the client (canvas cosmetics + share text). Escape "<" so a
  // "</script>" inside any string can't close the tag early.
  const dataJson = JSON.stringify(run).replace(/</g, '\\u003c');

  const head = `
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:image" content="${escapeHtml(ogImg)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${escapeHtml(url)}"/>
<meta property="og:type" content="article"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(title)}"/>
<meta name="twitter:description" content="${escapeHtml(desc)}"/>
<meta name="twitter:image" content="${escapeHtml(ogImg)}"/>`;

  const ledger = [row('Endured', `${num(run.days)} days`)];
  // The fallen digger's own watch, derived from lineage: run days minus the
  // previous generation's death day. Every other stat on the card is the
  // VILLAGE's cumulative record — this is the one personal line. Omitted for
  // gen 1 (the watch is the whole run — Endured already says it) and for
  // pre-lineage rows where it can't be derived.
  const lin = Array.isArray(run.lineage) ? run.lineage : [];
  if (run.gen > 1 && run.days != null && lin.length >= 2) {
    const prevDays = Number(lin[lin.length - 2].days);
    if (Number.isFinite(prevDays)) {
      const watch = Math.max(0, run.days - prevDays);
      ledger.push(row('Held the village', `${num(watch)} day${watch === 1 ? '' : 's'}`));
    }
  }
  ledger.push(row('Tiles dug', num(run.blocks)));
  if (run.gen != null) ledger.push(row('Lineage', `Gen ${roman(run.gen)}`));

  const context = [];
  if (run.villager_deaths != null) context.push(row('Souls lost', num(run.villager_deaths)));
  // Descent lives here since tiles dug took its place on the card — demoted, not dropped.
  if (run.depth != null) context.push(row('Descent', metres(run.depth)));
  if (run.discoveries != null) context.push(row('Discoveries', num(run.discoveries)));
  // Pips echo the game's Astrolabe panel (ritualMark: pips to 5, then "◆ N").
  // Hidden entirely at 0 — most runs never dare one.
  if (run.astrolabe_uses > 0) {
    const mark = ritualMark(run.astrolabe_uses);
    context.push(row('Rituals dared', run.astrolabe_uses <= 5 ? `${mark} ${num(run.astrolabe_uses)}` : mark));
  }
  if (run.peak_population != null) context.push(row('Peak village', num(run.peak_population)));
  if (run.gold != null) context.push(row('Greatest hoard', `${num(run.gold)} gold`));
  // A harrowed run wears its design's name — the world was made crueler on purpose.
  if (run.harrow) context.push(row('The Harrow', `“${run.harrow}”`));

  const body = `
<header class="cp-head">
  <a class="cp-back" href="/stats.html">← The Maw's Ledger</a>
  <a class="cp-play" href="https://play.underroot.se">▶ Play Free</a>
</header>
<main class="cp-main">
  <div class="pc-card" role="img" aria-label="${escapeHtml(name)}'s run card">
    <div class="pc-corner tl"><span>${run.gen != null ? escapeHtml(roman(run.gen)) : '·'}</span></div>
    <div class="pc-corner br"><span>${run.gen != null ? escapeHtml(roman(run.gen)) : '·'}</span></div>
    <div class="pc-inner">
      <div class="pc-name">${escapeHtml(name)}</div>
      ${run.harrow ? `<div class="pc-harrow" title="A design of the Artificer's Harrow">⬡ “${escapeHtml(run.harrow)}” — a harrowed world</div>` : ''}
      <div class="pc-kicker">The Maw's Ledger</div>
      <div class="pc-portrait"><div class="pc-glow"></div>${run.astrolabe_uses > 0
        ? `<div class="pc-pips" title="${escapeHtml(num(run.astrolabe_uses))} astrolabe ritual${run.astrolabe_uses === 1 ? '' : 's'} dared">${escapeHtml(ritualMark(run.astrolabe_uses))}</div>` : ''
      }<canvas id="card-canvas" width="440" height="440" style="width:220px;height:220px"></canvas>${challengeBadge(run)}</div>
      <div class="pc-epitaph">${escapeHtml(epitaph)}</div>
      <div class="pc-ledger">${ledger.join('')}</div>
      <div class="pc-foot">Recorded ${escapeHtml(fmtDate(run.date))}</div>
    </div>
  </div>
  <section class="cp-context">
    <h1>${escapeHtml(name)}'s village fell on day ${escapeHtml(num(run.days))}.</h1>
    <p class="cp-flavor">${escapeHtml(genPhrase ? genPhrase.replace(/ $/, '') + ' ' : 'A lone digger reached ')}${escapeHtml(metres(run.depth))} into the dark before ${escapeHtml(epitaph.toLowerCase())}.</p>
    ${challengeStrip(run)}
    <div class="pc-ledger cp-fulllist">${context.join('')}</div>
    <a class="cp-cta" href="/stats.html">Explore the full Ledger →</a>
    <div class="cp-share-label">Share this end</div>
    <div class="cp-share" id="share"></div>
    <div class="cp-discord-hint">Sharing on Discord? Just paste the link — it unfurls the card.</div>
  </section>
</main>
<footer class="cp-footer">A Swavvy AB game · © 2026 Swavvy AB. All rights reserved.</footer>
<script type="application/json" id="run-data">${dataJson}</script>
<script type="module" src="/assets/card-page.js"></script>`;

  return shell(title, desc, head, body);
}

export function renderNotFoundHtml(_origin) {
  const body = `
<main class="cp-main cp-404">
  <div class="pc-card"><div class="pc-inner">
    <div class="pc-kicker">The Maw's Ledger</div>
    <h1 class="pc-name">No record</h1>
    <p class="pc-epitaph">The Maw has no record of this run.</p>
    <a class="cp-cta" href="/stats.html">Explore the full Ledger →</a>
  </div></div>
</main>`;
  return shell('No record — The Maw\'s Ledger', 'The Maw has no record of this run.', '', body);
}

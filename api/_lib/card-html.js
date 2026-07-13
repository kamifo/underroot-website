// Pure server-rendered HTML for the standalone run card (Direction B) + a themed
// 404. All player strings are escaped — this is a server-HTML injection surface.
import { num, metres, roman, causeLabel, fmtDate } from '../../assets/format.js';

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

  const ledger = [row('Endured', `${num(run.days)} days`), row('Descent', metres(run.depth))];
  if (run.gen != null) ledger.push(row('Lineage', `Gen ${roman(run.gen)}`));

  const context = [];
  if (run.villager_deaths != null) context.push(row('Souls lost', num(run.villager_deaths)));
  if (run.blocks != null) context.push(row('Blocks mined', num(run.blocks)));
  if (run.discoveries != null) context.push(row('Discoveries', num(run.discoveries)));
  // Pips echo the game's Astrolabe panel; capped so a ritual-spammer's row
  // can't outgrow the ledger. Hidden entirely at 0 — most runs never dare one.
  if (run.astrolabe_uses > 0) {
    context.push(row('Rituals dared', `${'◆'.repeat(Math.min(run.astrolabe_uses, 5))} ${num(run.astrolabe_uses)}`));
  }
  if (run.peak_population != null) context.push(row('Peak village', num(run.peak_population)));
  if (run.gold != null) context.push(row('Greatest hoard', `${num(run.gold)} gold`));

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
      <div class="pc-kicker">The Maw's Ledger</div>
      <div class="pc-portrait"><div class="pc-glow"></div><canvas id="card-canvas" width="440" height="440" style="width:220px;height:220px"></canvas></div>
      <div class="pc-epitaph">${escapeHtml(epitaph)}</div>
      <div class="pc-ledger">${ledger.join('')}</div>
      <div class="pc-foot">Recorded ${escapeHtml(fmtDate(run.date))}</div>
    </div>
  </div>
  <section class="cp-context">
    <h1>${escapeHtml(name)}'s village fell on day ${escapeHtml(num(run.days))}.</h1>
    <p class="cp-flavor">${escapeHtml(genPhrase ? genPhrase.replace(/ $/, '') + ' ' : 'A lone digger reached ')}${escapeHtml(metres(run.depth))} into the dark before ${escapeHtml(epitaph.toLowerCase())}.</p>
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

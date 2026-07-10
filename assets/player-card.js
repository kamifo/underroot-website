// Player-card modal. Click any digger (name cell) on the stats boards or the
// full leaderboard to raise a playing-card record of that run: the digger drawn
// large, their name, cause of death as an epitaph, and a small stat ledger.
//
// Shared by stats.js and leaderboard.js. attachCard(cell, run) makes a name cell
// interactive; the modal + its CSS are created once, lazily, on first open.
//
// `run` fields (all optional except name): { name, cosmetics, days, depth (tiles),
// gen, cause (raw key), date }. Cards degrade gracefully — the Unbroken board
// carries no cause/gen, so those lines are simply omitted.
import { drawDigger } from './digger.js';
import { num, roman, metres, fmtDate, causeLabel } from './format.js';

// The Maw's tooth — the card's "suit" pip, reused for corners + epitaph flourishes.
const FANG = '<svg viewBox="0 0 8 11" fill="currentColor" aria-hidden="true"><path d="M0 0 H8 L6.2 6 Q4 11 4 11 Q4 11 1.8 6 Z"/></svg>';

const CSS = `
.pc-backdrop {
  position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  padding:24px; overflow-y:auto;
  background:rgba(8,5,3,0.74); backdrop-filter:blur(3px);
  opacity:0; transition:opacity 0.22s ease;
}
.pc-backdrop.pc-open { opacity:1; }
/* Author-level display:flex above beats the UA [hidden] rule, so hiding must be
   explicit — otherwise a closed backdrop lingers at opacity:0 and eats clicks. */
.pc-backdrop[hidden] { display:none; }

/* ── the card ─────────────────────────────────────────────────────────── */
.pc-card {
  position:relative; width:min(344px, 92vw); padding:16px; margin:auto; flex:none;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(163,105,54,0.10), transparent 55%),
    linear-gradient(180deg, #221a12 0%, var(--panel, #1b1611) 40%, #17120d 100%);
  border:1px solid rgba(163,105,54,0.45); border-radius:10px;
  box-shadow:0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(0,0,0,0.5), 0 30px 70px -20px rgba(0,0,0,0.85);
  transform:scale(0.96); opacity:0; transition:transform 0.22s ease, opacity 0.22s ease;
}
.pc-backdrop.pc-open .pc-card { transform:scale(1); opacity:1; }
.pc-card::before { content:""; position:absolute; inset:8px; border:1px solid rgba(163,105,54,0.28); border-radius:6px; pointer-events:none; }

.pc-close {
  position:absolute; top:12px; right:12px; z-index:4; width:30px; height:30px;
  background:rgba(0,0,0,0.35); border:1px solid var(--line, rgba(255,255,255,0.10)); border-radius:4px;
  color:var(--muted, rgba(255,255,255,0.52)); font-family:'Georgia', serif; font-size:18px; line-height:1; cursor:pointer;
  transition:color 0.2s, border-color 0.2s;
}
.pc-close:hover, .pc-close:focus-visible { color:#fff; border-color:var(--clay, #a36936); outline:none; }

.pc-corner { position:absolute; display:flex; flex-direction:column; align-items:center; gap:3px; line-height:1; z-index:3; color:var(--clay, #a36936); }
.pc-corner .pc-rank { font-family:'Press Start 2P', monospace; font-size:11px; }
.pc-corner svg { width:11px; height:14px; display:block; }
.pc-corner.tl { top:16px; left:17px; }
.pc-corner.br { bottom:16px; right:17px; transform:rotate(180deg); }

.pc-inner { position:relative; z-index:2; padding:14px 16px 6px; text-align:center; }
.pc-name { font-family:'Press Start 2P', monospace; font-size:14px; line-height:1.5; color:#fff; text-shadow:0 2px 10px rgba(0,0,0,0.7); margin:2px 24px 3px; }
.pc-kicker { font-family:'Press Start 2P', monospace; font-size:8px; letter-spacing:0.16em; text-transform:uppercase; color:var(--red, #8c2828); margin-bottom:12px; }

.pc-portrait {
  position:relative; height:236px; margin:0 4px 6px; border-radius:6px; overflow:hidden;
  display:flex; align-items:flex-end; justify-content:center;
  background:radial-gradient(60% 50% at 50% 42%, rgba(163,105,54,0.20), transparent 70%), linear-gradient(180deg, #120e0a, #1c1610);
  border:1px solid var(--line, rgba(255,255,255,0.10)); box-shadow:0 2px 14px rgba(0,0,0,0.5) inset;
}
.pc-portrait::after { content:""; position:absolute; inset:0; border-radius:6px; pointer-events:none; box-shadow:0 0 46px 14px rgba(10,7,5,0.75) inset; }
.pc-glow { position:absolute; left:50%; top:44%; width:150px; height:150px; transform:translate(-50%,-50%); pointer-events:none;
  background:radial-gradient(circle, rgba(214,146,78,0.28), transparent 68%); animation:pc-breathe 5.5s ease-in-out infinite; }
.pc-ground { position:absolute; left:50%; bottom:16px; width:120px; height:14px; transform:translateX(-50%); z-index:1;
  background:radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%); }
.pc-portrait canvas { position:relative; z-index:2; margin-bottom:8px; filter:drop-shadow(0 6px 10px rgba(0,0,0,0.55)); }

.pc-epitaph { display:flex; align-items:center; justify-content:center; gap:10px; color:#c86a63; font-size:0.98rem; font-style:italic; margin:12px 6px 14px; }
.pc-epitaph svg { width:8px; height:11px; flex:none; opacity:0.7; }
.pc-epitaph .pc-fang-r { transform:rotate(180deg); }

.pc-ledger { border-top:1px solid var(--line, rgba(255,255,255,0.10)); border-bottom:1px solid var(--line, rgba(255,255,255,0.10)); margin:0 2px; padding:4px 0; }
.pc-row { display:flex; justify-content:space-between; align-items:baseline; padding:7px 6px; border-bottom:1px solid rgba(255,255,255,0.05); }
.pc-row:last-child { border-bottom:none; }
.pc-row .pc-k { font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted, rgba(255,255,255,0.52)); }
.pc-row .pc-v { font-family:'Press Start 2P', monospace; font-size:10px; color:var(--clay, #a36936); }
.pc-foot { text-align:center; padding:11px 6px 4px; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:var(--faint, rgba(255,255,255,0.32)); }
.pc-share-row { display:flex; gap:8px; justify-content:center; padding:10px 6px 2px; }
.pc-share-btn { font:inherit; font-size:11px; letter-spacing:.04em; padding:7px 12px; border-radius:3px;
  border:1px solid var(--line, rgba(255,255,255,0.10)); background:rgba(0,0,0,0.25); color:var(--ink, rgba(255,255,255,0.88));
  cursor:pointer; text-decoration:none; transition:border-color 0.18s, color 0.18s; }
.pc-share-btn:hover, .pc-share-btn:focus-visible { border-color:var(--clay, #a36936); color:#f0dcc0; outline:none; }

@keyframes pc-breathe { 0%,100% { opacity:0.75; } 50% { opacity:1; } }

/* ── trigger affordance on the name cells ─────────────────────────────── */
.pc-trigger { cursor:pointer; }
.pc-trigger .avatar-canvas, .pc-trigger span { transition:box-shadow 0.18s, transform 0.18s, color 0.18s; }
.pc-trigger:hover .avatar-canvas, .pc-trigger:focus-visible .avatar-canvas {
  box-shadow:0 0 0 1.5px var(--clay, #a36936), 0 0 16px rgba(163,105,54,0.75); transform:translateY(-1px) scale(1.08);
}
.pc-trigger:hover span, .pc-trigger:focus-visible span { color:var(--clay, #a36936); text-decoration:underline; text-underline-offset:3px; }
.pc-trigger:focus-visible { outline:none; }

@media (prefers-reduced-motion: reduce) {
  .pc-backdrop, .pc-card { transition:none; }
  .pc-glow { animation:none; }
}
`;

let backdrop = null;   // the singleton modal root
let lastFocus = null;  // element to restore focus to on close

function ensureModal() {
  if (backdrop) return backdrop;
  const style = document.createElement('style');
  style.id = 'pc-styles';
  style.textContent = CSS;
  document.head.append(style);

  backdrop = document.createElement('div');
  backdrop.className = 'pc-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.hidden = true;

  // Backdrop click (outside the card) closes.
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e) => {
    if (backdrop.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = [...backdrop.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      // else: let Tab move naturally between the focusable controls
    }
  });
  document.body.append(backdrop);
  return backdrop;
}

function close() {
  if (!backdrop || backdrop.hidden) return;
  backdrop.classList.remove('pc-open');
  const done = () => { backdrop.hidden = true; backdrop.replaceChildren(); };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Fixed timeout (not transitionend) so the backdrop always tears down — a
  // throttled tab may never fire transitionend, which would leave an invisible
  // overlay swallowing every click.
  if (reduced) done();
  else setTimeout(done, 260);
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  lastFocus = null;
}

function cardMarkup(run) {
  const gen = run.gen != null ? roman(run.gen) : '·';
  const rows = [
    ['Endured', `${num(run.days)} days`],
    ['Descent', metres(run.depth)],
  ];
  if (run.gen != null) rows.push(['Lineage', `Gen ${roman(run.gen)}`]);
  const epitaph = causeLabel(run.cause) ?? 'Fate unrecorded';

  const card = document.createElement('div');
  card.className = 'pc-card';
  card.innerHTML = `
    <button class="pc-close" type="button" aria-label="Close">&times;</button>
    <div class="pc-corner tl"><span class="pc-rank">${gen}</span>${FANG}</div>
    <div class="pc-corner br"><span class="pc-rank">${gen}</span>${FANG}</div>
    <div class="pc-inner">
      <div class="pc-name"></div>
      <div class="pc-kicker">The Maw&rsquo;s Ledger</div>
      <div class="pc-portrait">
        <div class="pc-glow"></div>
        <div class="pc-ground"></div>
        <canvas width="440" height="440" style="width:220px;height:220px"></canvas>
      </div>
      <div class="pc-epitaph">
        <span style="color:#c86a63">${FANG}</span>
        <span class="pc-cause"></span>
        <span class="pc-fang-r" style="color:#c86a63">${FANG}</span>
      </div>
      <div class="pc-ledger">
        ${rows.map(([k, v]) => `<div class="pc-row"><span class="pc-k">${k}</span><span class="pc-v">${v}</span></div>`).join('')}
      </div>
      <div class="pc-foot"></div>
      <div class="pc-share-row"></div>
    </div>`;
  // Player-provided strings via textContent only — never innerHTML.
  card.querySelector('.pc-name').textContent = run.name ?? '';
  card.querySelector('.pc-cause').textContent = epitaph;
  card.querySelector('.pc-foot').textContent = `Recorded ${fmtDate(run.date)}`;
  drawDigger(card.querySelector('canvas'), run.cosmetics || {});
  if (run.share_id) {
    const shareUrl = `${location.origin}/r/${run.share_id}`;
    const shareRow = card.querySelector('.pc-share-row');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'pc-share-btn';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copy.textContent = 'Copied ✓';
        setTimeout(() => { copy.textContent = 'Copy link'; }, 1600);
      } catch { /* clipboard blocked */ }
    });
    const open = document.createElement('a');
    open.className = 'pc-share-btn';
    open.href = shareUrl;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open card ↗';
    shareRow.append(copy, open);
  }
  return card;
}

function open(run, trigger) {
  const root = ensureModal();
  lastFocus = trigger ?? document.activeElement;
  const card = cardMarkup(run);
  card.querySelector('.pc-close').addEventListener('click', close);
  root.replaceChildren(card);
  root.setAttribute('aria-label', `${run.name ?? 'Digger'} — record`);
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  card.querySelector('.pc-close').focus();
  // next frame so the fade/scale transition runs
  requestAnimationFrame(() => root.classList.add('pc-open'));
}

// Make a name cell open its run's card on click / Enter / Space.
export function attachCard(cell, run) {
  cell.classList.add('pc-trigger');
  cell.setAttribute('role', 'button');
  cell.tabIndex = 0;
  cell.title = 'View card';
  cell.setAttribute('aria-label', `View ${run.digger_name ?? run.name ?? 'digger'}'s card`);
  const normalized = {
    name: run.digger_name ?? run.name,
    cosmetics: run.cosmetics,
    days: run.days, depth: run.depth, gen: run.gen, cause: run.cause, date: run.date,
    share_id: run.share_id,
  };
  cell.addEventListener('click', () => open(normalized, cell));
  cell.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(normalized, cell); }
  });
}

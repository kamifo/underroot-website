// Renders /api/stats onto stats.html. All player-provided strings go through
// textContent (via el()) — never innerHTML. bigint aggregates (e.g. totals.souls)
// arrive as JSON strings (Postgres serialization) — always Number() them.
import { drawDigger } from './digger.js';
import { attachCard } from './player-card.js';
import { CAUSE_LABELS, num, metres, ratePct } from './format.js';

// A leaderboard name cell: a small digger canvas + the digger name. The canvas
// is drawn at 2× CSS pixels for crispness. cosmetics may be null/partial on old
// runs — drawDigger defaults every missing slot. Clicking the cell raises the
// full player card (attachCard).
function diggerCell(r) {
  const td = document.createElement('td');
  const cv = document.createElement('canvas');
  const CSS = 28, PX = CSS * 2;
  cv.width = PX; cv.height = PX;
  cv.style.width = `${CSS}px`; cv.style.height = `${CSS}px`;
  cv.className = 'avatar-canvas';
  drawDigger(cv, r.cosmetics || {});
  const span = el('span', r.digger_name); // el() = existing XSS-safe helper
  td.className = 'name-cell';
  td.append(cv, span);
  attachCard(td, r);
  return td;
}

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text; // XSS-safe by construction
  if (className) e.className = className;
  return e;
}

function heroTile(label, value) {
  const t = el('div', undefined, 'hero-tile');
  t.append(el('div', value, 'num'), el('div', label, 'lbl'));
  return t;
}

// A champion stat tile: a short pixel-font number, a small serif unit beneath it,
// the category label, and the record-holder pinned to the bottom (so every tile
// aligns on a shared baseline). The whole tile opens the holder's player card
// (reuses attachCard, like the leaderboard name cells). `holder` carries
// { digger_name, cosmetics, share_id, days, depth, gen, cause, date }.
function recordTile(label, value, unit, holder) {
  const t = el('div', undefined, 'record-tile');
  const val = el('div', undefined, 'rt-value');
  val.append(el('span', value, 'rt-num'), el('span', unit, 'rt-unit'));
  t.append(val, el('div', label, 'rt-label'));
  const who = el('div', undefined, 'record-who');
  const cv = document.createElement('canvas');
  const CSS = 22, PX = CSS * 2;
  cv.width = PX; cv.height = PX;
  cv.style.width = `${CSS}px`; cv.style.height = `${CSS}px`;
  cv.className = 'avatar-canvas';
  drawDigger(cv, holder.cosmetics || {});
  who.append(cv, el('span', holder.digger_name));
  t.append(who);
  attachCard(t, holder);
  return t;
}

// The Ledger: one browsable table of runs. Numeric columns are click-to-sort
// (toggling ↓/↑); the digger column opens each run's player card. Sorting is
// client-side over the fetched pool — the full per-metric boards live on
// leaderboard.html.
const LEDGER_COLS = [
  { key: 'gen', label: 'Gen', num: true, sortable: true, fmt: (r) => String(r.gen) },
  { key: 'days', label: 'Days', num: true, sortable: true, fmt: (r) => num(r.days) },
  { key: 'blocks', label: 'Tiles', num: true, sortable: true, fmt: (r) => num(r.blocks) },
  { key: 'discoveries', label: 'Discoveries', num: true, sortable: true, fmt: (r) => num(r.discoveries) },
  { key: 'astrolabe_uses', label: 'Rituals', num: true, sortable: true, fmt: (r) => num(r.astrolabe_uses) },
  { key: 'depth', label: 'Depth', num: true, sortable: true, fmt: (r) => metres(r.depth) },
  { key: 'cause', label: 'Fate', num: false, sortable: false, fmt: (r) => CAUSE_LABELS[r.cause] ?? r.cause },
];

function renderLedger(table, rows) {
  let sortKey = 'gen';
  let sortDir = -1; // -1 = descending

  // Per-column min/max (constant across re-sorts) for the heat map — a single
  // clay hue whose alpha scales with each value's place in its column. Sorting a
  // column then reads as a clean gradient. Numbers stay as text (never colour-only).
  const ranges = {};
  for (const c of LEDGER_COLS) {
    if (!c.sortable) continue;
    let min = Infinity, max = -Infinity;
    for (const r of rows) { const v = r[c.key]; if (v < min) min = v; if (v > max) max = v; }
    ranges[c.key] = { min, max };
  }
  const heat = (key, v) => {
    const { min, max } = ranges[key];
    const norm = max > min ? (v - min) / (max - min) : 0;
    return `rgba(163,105,54,${(0.05 + 0.42 * norm).toFixed(3)})`; // clay accent
  };

  function draw() {
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });

    table.replaceChildren();
    const thead = document.createElement('thead');
    const head = document.createElement('tr');
    head.append(el('th', '#'), el('th', 'Digger'));
    for (const c of LEDGER_COLS) {
      const active = c.sortable && c.key === sortKey;
      const th = el('th', c.label + (active ? (sortDir < 0 ? ' ↓' : ' ↑') : ''), c.num ? 'num' : '');
      if (c.sortable) {
        th.classList.add('sortable');
        th.tabIndex = 0;
        th.setAttribute('role', 'button');
        th.setAttribute('aria-label', `Sort by ${c.label}`);
        const toggle = () => {
          if (sortKey === c.key) sortDir *= -1;
          else { sortKey = c.key; sortDir = -1; }
          draw();
        };
        th.addEventListener('click', toggle);
        th.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
      }
      head.append(th);
    }
    thead.append(head);
    table.append(thead);

    const tbody = document.createElement('tbody');
    sorted.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.append(el('td', String(i + 1)));
      tr.append(diggerCell(r));
      for (const c of LEDGER_COLS) {
        const td = el('td', c.fmt(r), c.num ? 'num' : '');
        if (c.sortable) td.style.backgroundColor = heat(c.key, r[c.key]);
        tr.append(td);
      }
      tbody.append(tr);
    });
    table.append(tbody);
  }

  draw();
}

function showError() {
  document.getElementById('stats-error').style.display = 'block';
  document.getElementById('stats-content').style.display = 'none';
}

async function main() {
  let data;
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    showError();
    return;
  }
  // Render failures (API shape drift, Chart.js missing) must not half-render silently.
  try {
    render(data);
  } catch (err) {
    console.error('stats render failed:', err);
    showError();
  }
}

function render(data) {
  const { totals, causes, ledger, superlatives, charts } = data;

  // ---- Empty state: production launches with zero shared runs ----
  if (Number(totals.runs) === 0) {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('stats-content').style.display = 'none';
    return;
  }

  // ---- Hero ----
  document.getElementById('hero').append(
    heroTile('souls claimed by the Maw', num(totals.souls)),
    heroTile('villages fallen', num(totals.runs)),
    heroTile('tiles clawed from the earth', num(totals.blocks)),
    heroTile('longest a village held', `${num(totals.longest)} days`),
    heroTile('astrolabe rituals dared', num(totals.astrolabe_rituals)),
  );

  // Beat copy — derived from the data so the story stays true to the numbers.
  const runs = Number(totals.runs);
  document.getElementById('beat-shovel-copy').textContent =
    `${num(runs)} villages have taken up the shovel. Most never saw day ten. A rare few saw a hundred — none saw the end.`;
  const topCause = causes[0] ? (CAUSE_LABELS[causes[0].cause] ?? causes[0].cause) : 'the dark';
  document.getElementById('beat-fall-copy').textContent =
    `The most common fate is ${topCause.toLowerCase()}. You dig too greedily, or you simply forget to eat.`;
  document.getElementById('beat-bargain-copy').textContent =
    `Across every village, ${num(Number(totals.tasks_granted))} requests were granted and ${num(Number(totals.tasks_denied))} turned away.`;

  // ---- The Ledger (one sortable table) ----
  renderLedger(document.getElementById('board-ledger'), ledger);

  // ---- Hall of Fools ----
  function foolTile(medal, award, who, holder) {
    const d = el('div', undefined, 'fool');
    d.append(el('div', medal, 'medal'), el('div', award, 'award'), el('div', who, 'who'));
    // Single-run honours open the digger's card; Speedrun (a cohort count) passes
    // no holder and stays plain text.
    if (holder && holder.share_id) attachCard(d, holder);
    return d;
  }
  const foolsEl = document.getElementById('fools');
  const f = data.fools ?? {};
  const tiles = [];
  if (f.speedrun > 0) tiles.push(foolTile('🥇', 'Speedrun to Oblivion', `${num(f.speedrun)} villages died on day zero.`));
  if (f.hoarder) tiles.push(foolTile('💰', 'Hoarder of Nothing', `${f.hoarder.digger_name} lasted ${num(f.hoarder.days)} days holding not one gold.`, f.hoarder));
  if (f.overconfident) tiles.push(foolTile('⚰️', 'The Overconfident', `${f.overconfident.digger_name} reached ${metres(f.overconfident.depth)} — dead by day ${num(f.overconfident.days)}.`, f.overconfident));
  if (f.groundhog) tiles.push(foolTile('🔁', 'Groundhog Village', `${f.groundhog.digger_name} lost ${num(f.groundhog.mx)} generations in a single day.`, f.groundhog));
  if (f.scratched) tiles.push(foolTile('🕳️', 'Scratched the Surface', `${f.scratched.digger_name} survived ${num(f.scratched.days)} days, only ${metres(f.scratched.depth)} deep.`, f.scratched));
  if (f.taskmaster) tiles.push(foolTile('🙅', 'The Taskmaster', `${f.taskmaster.digger_name} turned away ${num(f.taskmaster.tasks_denied)} villager requests.`, f.taskmaster));
  if (f.coldshoulder) {
    const c = f.coldshoulder;
    const total = Number(c.tasks_fulfilled) + Number(c.tasks_denied);
    tiles.push(foolTile('🪙', 'Cold Shoulder', `${c.digger_name} refused ${ratePct(c.tasks_denied, c.tasks_fulfilled)}% of ${num(total)} requests.`, c));
  }
  if (superlatives.souls) tiles.push(foolTile('🪦', 'The Gravekeeper', `${superlatives.souls.digger_name}'s village buried ${num(superlatives.souls.villager_deaths)} souls.`, superlatives.souls));
  if (tiles.length) foolsEl.append(...tiles);
  else document.getElementById('section-fools').style.display = 'none';

  // ---- Champions (one record-holder card per reckoning) — triumphs only.
  // Death-count records (souls lost) live in the Hall of Fools; day-0 deaths are
  // already there as "Speedrun to Oblivion".
  const champEl = document.getElementById('champions');
  const s = superlatives;
  if (s.lineage) champEl.append(recordTile('longest lineage', num(s.lineage.gen), 'generations', s.lineage));
  if (s.unbroken) champEl.append(recordTile('the unbroken', num(s.unbroken.unbroken_days), 'days', s.unbroken));
  if (s.tiles) champEl.append(recordTile('most tiles clawed', num(s.tiles.blocks), 'tiles', s.tiles));
  if (s.discoveries) champEl.append(recordTile('most discoveries', num(s.discoveries.discoveries), 'found', s.discoveries));
  if (s.ritualist) champEl.append(recordTile('the lone ritualist', num(s.ritualist.astrolabe_uses), 'rituals', s.ritualist));
  if (s.hoard) champEl.append(recordTile('greatest hoard', num(s.hoard.gold), 'gold', s.hoard));
  if (s.generous_count) champEl.append(recordTile('most requests granted', num(s.generous_count.tasks_fulfilled), 'granted', s.generous_count));
  if (s.generous_rate) champEl.append(recordTile('most generous', String(ratePct(s.generous_rate.tasks_fulfilled, s.generous_rate.tasks_denied)), '% granted', s.generous_rate));

  // ---- Charts (Chart.js) — palette matches the site's clay/red accents ----
  const clay = '#a36936', red = '#8c2828', dim = 'rgba(255,255,255,0.35)', ink = 'rgba(255,255,255,0.75)';
  Chart.defaults.color = ink;
  Chart.defaults.borderColor = 'rgba(255,255,255,0.10)';
  Chart.defaults.font.family = "'Georgia', serif";

  new Chart(document.getElementById('chart-survival'), {
    type: 'line',
    data: {
      datasets: [{
        label: '% of runs still alive',
        data: charts.survival.map(([d, p]) => ({ x: d, y: p * 100 })),
        borderColor: clay, backgroundColor: clay, pointRadius: 0, fill: false, tension: 0.15,
      }],
    },
    options: { maintainAspectRatio: false, scales: { x: { type: 'linear', title: { display: true, text: 'day' } }, y: { min: 0, max: 100 } } },
  });

  new Chart(document.getElementById('chart-runlen'), {
    type: 'bar',
    data: {
      labels: charts.runLenHist.map(([b]) => `${b}–${b + 9}d`),
      datasets: [{ label: 'runs by length', data: charts.runLenHist.map(([, n]) => n), backgroundColor: clay }],
    },
    options: { maintainAspectRatio: false },
  });

  new Chart(document.getElementById('chart-causes'), {
    type: 'doughnut',
    data: {
      labels: causes.map((c) => CAUSE_LABELS[c.cause] ?? c.cause),
      datasets: [{
        data: causes.map((c) => c.n),
        backgroundColor: ['#a36936', '#8c2828', '#949ea8', '#855729', '#6b4a24', '#c2703f', '#4a3a2a', '#8a8a80', '#5c4632'],
      }],
    },
    options: { maintainAspectRatio: false },
  });

  // Stacked bar: which fate ends each generation.
  const gens = [...new Set(charts.causesByGen.map((r) => r.gen))].sort((a, z) => a - z);
  const genCauses = [...new Set(charts.causesByGen.map((r) => r.cause))];
  const genPalette = ['#a36936', '#8c2828', '#949ea8', '#855729', '#6b4a24', '#c2703f', '#4a3a2a', '#8a8a80', '#5c4632'];
  new Chart(document.getElementById('chart-causes-gen'), {
    type: 'bar',
    data: {
      labels: gens.map((g) => `Gen ${g}`),
      datasets: genCauses.map((cause, i) => ({
        label: CAUSE_LABELS[cause] ?? cause,
        backgroundColor: genPalette[i % genPalette.length],
        data: gens.map((g) => charts.causesByGen.find((r) => r.gen === g && r.cause === cause)?.n ?? 0),
      })),
    },
    options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } },
  });

  if (!charts.progression.length) {
    document.getElementById('chart-progression').closest('.chart-box').style.display = 'none';
  } else {
    new Chart(document.getElementById('chart-progression'), {
      type: 'line',
      data: {
        datasets: [
          { label: '75th percentile tiles', data: charts.progression.map(([d, , , p75]) => ({ x: d, y: p75 })), borderColor: dim, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(163,105,54,0.15)' },
          { label: 'median tiles', data: charts.progression.map(([d, , p50]) => ({ x: d, y: p50 })), borderColor: clay, pointRadius: 0 },
          { label: '25th percentile tiles', data: charts.progression.map(([d, p25]) => ({ x: d, y: p25 })), borderColor: dim, pointRadius: 0 },
        ],
      },
      options: { maintainAspectRatio: false, scales: { x: { type: 'linear', title: { display: true, text: 'day' } }, y: { title: { display: true, text: 'tiles dug' } } } },
    });
  }

  new Chart(document.getElementById('chart-tiles-hist'), {
    type: 'bar',
    data: {
      labels: charts.tilesHist.map(([b]) => num(b)),
      datasets: [{ label: 'runs by tiles dug', data: charts.tilesHist.map(([, n]) => n), backgroundColor: clay }],
    },
    options: { maintainAspectRatio: false },
  });

  new Chart(document.getElementById('chart-scatter'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'each dot is a shared run',
        data: charts.scatter.map((r) => ({ x: r.days, y: r.blocks })),
        backgroundColor: charts.scatter.map((r) => (r.cause === 'maw_breach' ? red : clay)),
      }],
    },
    options: { maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'days survived' } }, y: { title: { display: true, text: 'tiles dug' } } } },
  });
}

main();

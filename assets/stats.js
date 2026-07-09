// Renders /api/stats onto stats.html. All player-provided strings go through
// textContent (via el()) — never innerHTML. bigint aggregates (e.g. totals.souls)
// arrive as JSON strings (Postgres serialization) — always Number() them.
import { drawDigger } from './digger.js';

// A leaderboard name cell: a small digger canvas + the digger name. The canvas
// is drawn at 2× CSS pixels for crispness. cosmetics may be null/partial on old
// runs — drawDigger defaults every missing slot.
function diggerCell(name, cosmetics) {
  const td = document.createElement('td');
  const cv = document.createElement('canvas');
  const CSS = 28, PX = CSS * 2;
  cv.width = PX; cv.height = PX;
  cv.style.width = `${CSS}px`; cv.style.height = `${CSS}px`;
  cv.className = 'avatar-canvas';
  drawDigger(cv, cosmetics || {});
  const span = el('span', name); // el() = existing XSS-safe helper
  td.className = 'name-cell';
  td.append(cv, span);
  return td;
}

const CAUSE_LABELS = {
  maw_breach: 'The Maw breached the base',
  starvation: 'Starvation',
  dehydration: 'Dehydration',
  starvation_dehydration: 'Starvation & dehydration',
  starvation_away: 'Starved while away',
  dehydration_away: 'Dehydrated while away',
  starvation_dehydration_away: 'Starved & dehydrated while away',
  abandoned: 'Lost the will to continue',
  other: 'Unknown fate',
};

const num = (n) => Number(n).toLocaleString('en-US');
const metres = (tiles) => `${num(Math.round(Number(tiles) * 1.5))} m`;

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

// Like a plain leaderboard render, but the first column is a digger avatar + name. `cols` here
// excludes the digger column (added automatically as the first data column).
function renderBoardWithAvatars(table, rows, cols) {
  table.replaceChildren();
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  head.append(el('th', '#'), el('th', 'Digger'));
  for (const c of cols) head.append(el('th', c.label, c.num ? 'num' : ''));
  thead.append(head);
  table.append(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.append(el('td', String(i + 1)));
    tr.append(diggerCell(r.digger_name, r.cosmetics));
    for (const c of cols) tr.append(el('td', c.fmt(r), c.num ? 'num' : ''));
    tbody.append(tr);
  });
  table.append(tbody);
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
  const { totals, causes, boards, superlatives, charts } = data;

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
    heroTile('deepest anyone dared', metres(totals.deepest)),
    heroTile('longest a village held', `${num(totals.longest)} days`),
  );

  // Beat copy — derived from the data so the story stays true to the numbers.
  const runs = Number(totals.runs);
  document.getElementById('beat-shovel-copy').textContent =
    `${num(runs)} villages have taken up the shovel. Most never saw day ten. A rare few saw a hundred — none saw the end.`;
  const topCause = causes[0] ? (CAUSE_LABELS[causes[0].cause] ?? causes[0].cause) : 'the dark';
  document.getElementById('beat-fall-copy').textContent =
    `The most common fate is ${topCause.toLowerCase()}. You dig too greedily, or you simply forget to eat.`;

  // ---- Boards ----
  renderBoardWithAvatars(document.getElementById('board-lineage'), boards.lineage, [
    { label: 'Days', num: true, fmt: (r) => num(r.days) },
    { label: 'Depth', num: true, fmt: (r) => metres(r.depth) },
    { label: 'Gen', num: true, fmt: (r) => String(r.gen) },
    { label: 'Fate', fmt: (r) => CAUSE_LABELS[r.cause] ?? r.cause },
    { label: 'Date', fmt: (r) => String(r.date).slice(0, 10) },
  ]);

  renderBoardWithAvatars(document.getElementById('board-unbroken'), boards.unbroken, [
    { label: 'Days undying', num: true, fmt: (r) => num(r.days) },
    { label: 'Depth', num: true, fmt: (r) => metres(r.depth) },
    { label: 'Date', fmt: (r) => String(r.date).slice(0, 10) },
  ]);

  // ---- Hall of Fools ----
  function foolTile(medal, award, who) {
    const d = el('div', undefined, 'fool');
    d.append(el('div', medal, 'medal'), el('div', award, 'award'), el('div', who, 'who'));
    return d;
  }
  const foolsEl = document.getElementById('fools');
  const f = data.fools ?? {};
  const tiles = [];
  if (f.speedrun > 0) tiles.push(foolTile('🥇', 'Speedrun to Oblivion', `${num(f.speedrun)} villages died on day zero.`));
  if (f.hoarder) tiles.push(foolTile('💰', 'Hoarder of Nothing', `${f.hoarder.digger_name} lasted ${num(f.hoarder.days)} days holding not one gold.`));
  if (f.overconfident) tiles.push(foolTile('⚰️', 'The Overconfident', `${f.overconfident.digger_name} reached ${metres(f.overconfident.depth)} — dead by day ${num(f.overconfident.days)}.`));
  if (f.groundhog) tiles.push(foolTile('🔁', 'Groundhog Village', `${f.groundhog.digger_name} lost ${num(f.groundhog.mx)} generations in a single day.`));
  if (f.scratched) tiles.push(foolTile('🕳️', 'Scratched the Surface', `${f.scratched.digger_name} survived ${num(f.scratched.days)} days, only ${metres(f.scratched.depth)} deep.`));
  if (tiles.length) foolsEl.append(...tiles);
  else document.getElementById('section-fools').style.display = 'none';

  // ---- Superlatives ----
  const day0pct = superlatives.first_deaths
    ? Math.round((100 * superlatives.day0_deaths) / superlatives.first_deaths) : 0;
  document.getElementById('superlatives').append(
    heroTile('Day-0 Death Club', `${day0pct}% of first diggers`),
    heroTile('greatest hoard', `${num(superlatives.max_gold ?? 0)} gold`),
    heroTile('most souls lost in one village', num(superlatives.max_souls ?? 0)),
    heroTile('longest lineage', `${num(superlatives.max_gen ?? 0)} generations`),
  );

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
          { label: '75th percentile depth', data: charts.progression.map(([d, , , p75]) => ({ x: d, y: p75 * 1.5 })), borderColor: dim, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(163,105,54,0.15)' },
          { label: 'median depth', data: charts.progression.map(([d, , p50]) => ({ x: d, y: p50 * 1.5 })), borderColor: clay, pointRadius: 0 },
          { label: '25th percentile depth', data: charts.progression.map(([d, p25]) => ({ x: d, y: p25 * 1.5 })), borderColor: dim, pointRadius: 0 },
        ],
      },
      options: { maintainAspectRatio: false, scales: { x: { type: 'linear', title: { display: true, text: 'day' } }, y: { title: { display: true, text: 'depth (m)' } } } },
    });
  }

  new Chart(document.getElementById('chart-depth-hist'), {
    type: 'bar',
    data: {
      labels: charts.depthHist.map(([b]) => `${Math.round(b * 1.5)}m`),
      datasets: [{ label: 'runs by final depth', data: charts.depthHist.map(([, n]) => n), backgroundColor: clay }],
    },
    options: { maintainAspectRatio: false },
  });

  new Chart(document.getElementById('chart-scatter'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'each dot is a shared run',
        data: charts.scatter.map((r) => ({ x: r.days, y: r.depth * 1.5 })),
        backgroundColor: charts.scatter.map((r) => (r.cause === 'maw_breach' ? red : clay)),
      }],
    },
    options: { maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'days survived' } }, y: { title: { display: true, text: 'depth (m)' } } } },
  });
}

main();

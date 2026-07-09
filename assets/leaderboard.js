import { drawDigger } from './digger.js';

const num = (n) => Number(n).toLocaleString('en-US');
const metres = (t) => `${num(Math.round(Number(t) * 1.5))} m`;
const CAUSE_LABELS = { maw_breach: 'The Maw breached the base', starvation: 'Starvation', dehydration: 'Dehydration', starvation_dehydration: 'Starvation & dehydration', starvation_away: 'Starved while away', dehydration_away: 'Dehydrated while away', starvation_dehydration_away: 'Starved & dehydrated while away', abandoned: 'Lost the will to continue', other: 'Unknown fate' };

const params = new URLSearchParams(location.search);
const board = params.get('board') === 'unbroken' ? 'unbroken' : 'lineage';
let offset = 0;
const rows = [];

function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function nameCell(name, cosmetics) {
  const td = el('td', undefined, 'name-cell');
  const cv = document.createElement('canvas'); cv.width = 56; cv.height = 56; cv.style.width = '28px'; cv.style.height = '28px'; cv.className = 'avatar-canvas';
  drawDigger(cv, cosmetics || {});
  td.append(cv, el('span', name));
  return td;
}

function header() {
  const thead = document.createElement('thead'); const tr = document.createElement('tr');
  tr.append(el('th', '#'), el('th', 'Digger'), el('th', 'Days', 'num'), el('th', 'Depth', 'num'));
  if (board === 'lineage') tr.append(el('th', 'Gen', 'num'), el('th', 'Fate'));
  thead.append(tr); return thead;
}

function appendRows(newRows) {
  const table = document.getElementById('lb-table');
  if (!table.querySelector('thead')) table.append(header());
  let tbody = table.querySelector('tbody'); if (!tbody) { tbody = document.createElement('tbody'); table.append(tbody); }
  newRows.forEach((r) => {
    const i = rows.indexOf(r);
    const tr = document.createElement('tr');
    tr.append(el('td', String(i + 1)), nameCell(r.digger_name, r.cosmetics), el('td', num(r.days), 'num'), el('td', metres(r.depth), 'num'));
    if (board === 'lineage') tr.append(el('td', String(r.gen), 'num'), el('td', CAUSE_LABELS[r.cause] ?? r.cause));
    tbody.append(tr);
  });
}

async function loadMore() {
  try {
    const res = await fetch(`/api/leaderboard?board=${board}&offset=${offset}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const start = rows.length; rows.push(...data.rows); appendRows(rows.slice(start));
    offset += data.rows.length;
    document.getElementById('lb-more').style.display = data.rows.length === data.limit ? 'inline-block' : 'none';
  } catch (err) { console.error('leaderboard load failed:', err); document.getElementById('lb-error').style.display = 'block'; }
}

document.getElementById('lb-title').textContent = board === 'unbroken' ? 'The Unbroken' : 'Longest Lineages';
document.getElementById('lb-more').addEventListener('click', loadMore);
loadMore();

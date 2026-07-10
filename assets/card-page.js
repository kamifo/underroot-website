// Hydrates the standalone card page: draws the digger onto the card canvas from
// the inlined run JSON, and wires the share controls against the current URL.
import { drawDigger } from './digger.js';
import { shareTargets } from './format.js';

const dataEl = document.getElementById('run-data');
const run = dataEl ? JSON.parse(dataEl.textContent) : {};

const canvas = document.getElementById('card-canvas');
if (canvas) drawDigger(canvas, run.cosmetics || {});

const url = location.href;
const title = document.title;
const text = document.querySelector('meta[name="description"]')?.content ?? title;
const targets = shareTargets(url, title, text);

const shareRoot = document.getElementById('share');
if (shareRoot) {
  const btn = (label, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sbtn ${cls}`;
    b.textContent = label;
    return b;
  };
  const link = (label, href) => {
    const a = document.createElement('a');
    a.className = 'sbtn';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    return a;
  };

  // Copy link (primary)
  const copy = btn('Copy link', 'primary');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      const prev = copy.textContent;
      copy.textContent = 'Copied ✓';
      setTimeout(() => { copy.textContent = prev; }, 1600);
    } catch { /* clipboard blocked — no-op */ }
  });
  shareRoot.append(copy);

  // Native share (mobile) — only if supported
  if (navigator.share) {
    const nat = btn('Share…', '');
    nat.addEventListener('click', () => navigator.share({ title, text, url }).catch(() => {}));
    shareRoot.append(nat);
  }

  shareRoot.append(
    link('X', targets.x),
    link('WhatsApp', targets.whatsapp),
    link('Reddit', targets.reddit),
    link('Bluesky', targets.bluesky),
  );
}

// Shared, DOM-free formatters used by the stats page, the card modal, and the
// standalone card page. Single source of truth — do not re-copy these.

export const CAUSE_LABELS = {
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

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const num = (n) => Number(n).toLocaleString('en-US');
export const metres = (tiles) => `${num(Math.round(Number(tiles) * 1.5))} m`;
// Whole-number percentage of `part` within `part + other`; 0 when the total is 0
// (no divide-by-zero). Coerces inputs — Postgres bigint aggregates arrive as strings.
export const ratePct = (part, other) => {
  const p = Number(part), total = Number(part) + Number(other);
  return total > 0 ? Math.round((p / total) * 100) : 0;
};
export const roman = (n) => ROMAN[n] ?? String(n);
export const causeLabel = (c) => (c == null ? null : (CAUSE_LABELS[c] ?? c));

export function fmtDate(v) {
  const iso = String(v).slice(0, 10);
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Social share intent URLs. Discord has no intent URL (paste-to-unfurl instead).
export function shareTargets(url, title, text) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const msg = encodeURIComponent(`${text} ${url}`);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${u}`,
    whatsapp: `https://wa.me/?text=${msg}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
    bluesky: `https://bsky.app/intent/compose?text=${msg}`,
  };
}

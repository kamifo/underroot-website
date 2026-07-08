// Schema validation + sanitation for run submissions. Pure module, no I/O.
// Returns { ok: true, value } with a NORMALIZED copy, or { ok: false, errors }.

export const CAUSES = [
  'maw_breach',
  'starvation',
  'dehydration',
  'starvation_dehydration',
  'starvation_away',
  'dehydration_away',
  'starvation_dehydration_away',
  'abandoned',
  'other',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[a-z0-9_#]{1,32}$/i;
const NAME_MAX = 24;

const INT_FIELDS = {
  gen: [1, 50],
  days: [0, 3650],
  depth: [0, 10000],
  blocks: [0, 5_000_000],
  discoveries: [0, 500],
  villager_deaths: [0, 1_000_000],
  peak_population: [0, 100_000],
  wall_hp: [0, 100_000_000],
  machines_built: [0, 100],
  astrolabe_uses: [0, 100],
  tasks_fulfilled: [0, 100_000],
  tasks_denied: [0, 100_000],
};

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

export function sanitizeName(raw) {
  let s = String(raw ?? '');
  if (s.length > 256) s = s.slice(0, 256); // cheap pre-gate before regex work
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  s = [...s].slice(0, NAME_MAX).join(''); // code-point slice: never splits surrogate pairs
  return s.length > 0 ? s : 'Unnamed Digger';
}

export function validateRun(p) {
  const errors = [];
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    return { ok: false, errors: ['payload must be an object'] };
  }
  if (p.v !== 1) errors.push('unsupported version');
  if (typeof p.run_uuid !== 'string' || !UUID_RE.test(p.run_uuid)) errors.push('bad run_uuid');
  if (typeof p.game_version !== 'string' || !/^[0-9A-Za-z.+_-]{1,16}$/.test(p.game_version)) errors.push('bad game_version');
  if (!CAUSES.includes(p.cause)) errors.push('unknown cause');

  for (const [k, [lo, hi]] of Object.entries(INT_FIELDS)) {
    const v = p[k];
    if (!isInt(v) || v < lo || v > hi) errors.push(`bad ${k}`);
  }
  const pct = p.discovery_pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) errors.push('bad discovery_pct');

  // challenges: small list of plain ids
  const challenges = p.challenges ?? [];
  if (!Array.isArray(challenges) || challenges.length > 10 || challenges.some((c) => typeof c !== 'string' || !ID_RE.test(c))) {
    errors.push('bad challenges');
  }

  // peaks: material -> int (optional)
  const peaks = p.peaks ?? {};
  if (typeof peaks !== 'object' || peaks === null || Array.isArray(peaks) || Object.keys(peaks).length > 20) {
    errors.push('bad peaks');
  } else {
    for (const [mat, amt] of Object.entries(peaks)) {
      if (!ID_RE.test(mat) || !isInt(amt) || amt < 0 || amt > 10_000_000) errors.push(`bad peak ${mat}`);
    }
  }

  // lineage: [{gen, days, depth, cause}] (required, >= 1 entry: the fallen digger)
  const lineage = p.lineage ?? [];
  if (!Array.isArray(lineage) || lineage.length < 1 || lineage.length > 60) {
    errors.push('bad lineage');
  } else {
    for (const e of lineage) {
      if (typeof e !== 'object' || e === null) { errors.push('bad lineage entry'); break; }
      if (!isInt(e.gen) || e.gen < 1 || e.gen > 50 || !isInt(e.days) || e.days < 0 || e.days > 3650 ||
          !isInt(e.depth) || e.depth < 0 || e.depth > 10000 || !CAUSES.includes(e.cause)) {
        errors.push('bad lineage entry');
        break;
      }
    }
  }

  // history: [[day, depth, blocks, pop, souls]] (optional)
  const history = p.history ?? [];
  if (!Array.isArray(history) || history.length > 400) {
    errors.push('bad history');
  } else {
    for (const row of history) {
      if (!Array.isArray(row) || row.length !== 5 || row.some((n) => !isInt(n) || n < 0)) {
        errors.push('bad history row');
        break;
      }
    }
  }

  // cosmetics: slot -> id (optional)
  const cosmetics = p.cosmetics ?? {};
  if (typeof cosmetics !== 'object' || cosmetics === null || Array.isArray(cosmetics) || Object.keys(cosmetics).length > 16) {
    errors.push('bad cosmetics');
  } else {
    for (const [slot, id] of Object.entries(cosmetics)) {
      if (!ID_RE.test(slot) || typeof id !== 'string' || !ID_RE.test(id)) { errors.push('bad cosmetics'); break; }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      v: 1,
      run_uuid: p.run_uuid.toLowerCase(),
      game_version: p.game_version,
      digger_name: sanitizeName(p.digger_name),
      gen: p.gen, days: p.days, depth: p.depth, blocks: p.blocks,
      cause: p.cause,
      discoveries: p.discoveries, discovery_pct: pct,
      villager_deaths: p.villager_deaths, peak_population: p.peak_population,
      wall_hp: p.wall_hp, machines_built: p.machines_built,
      astrolabe_uses: p.astrolabe_uses,
      tasks_fulfilled: p.tasks_fulfilled, tasks_denied: p.tasks_denied,
      challenges: [...challenges],
      peaks: Object.fromEntries(Object.entries(peaks)),
      lineage: lineage.map((e) => ({ gen: e.gen, days: e.days, depth: e.depth, cause: e.cause })),
      history: history.map((row) => [...row]),
      cosmetics: Object.fromEntries(Object.entries(cosmetics)),
    },
  };
}

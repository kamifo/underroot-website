// Seeds N synthetic plausible runs via the local API so the stats page has
// something to render during development. Usage:
//   node scripts/seed-stats.js [count] [endpoint]
const COUNT = Number(process.argv[2] ?? 40);
const ENDPOINT = process.argv[3] ?? 'http://localhost:3000/api/submit-run';

const url = new URL(ENDPOINT);
const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
if (!isLocal && !process.argv.includes('--allow-remote')) {
  console.error(`Refusing to seed non-local endpoint ${url.origin} — this injects FAKE runs. Pass --allow-remote if you really mean it.`);
  process.exit(1);
}

const CAUSES = ['maw_breach', 'starvation', 'dehydration_away', 'starvation_dehydration_away', 'abandoned'];
const NAMES = ['Odin', 'Frigg', 'Baldr', 'Heimdall', 'Ullr', 'Eir', 'Vidar', 'Njord', 'Gefjon', 'Sif'];
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function fakeRun() {
  const days = rnd(0, 120);
  const gen = Math.min(rnd(1, 10), days * 4 + 8);
  const depth = Math.min(rnd(days * 2, days * 6 + 10), 340);
  const blocks = Math.min(rnd(days * 30, days * 350 + 200), days * 800 + 1000);
  const souls = rnd(0, days * 4);
  const pop = rnd(6, 350);

  const lineage = [];
  let d = 0;
  for (let g = 1; g <= gen; g++) {
    d = g === gen ? days : Math.min(days, d + rnd(0, Math.ceil((days / gen) * 2)));
    lineage.push({
      gen: g,
      days: d,
      depth: g === gen ? depth : Math.floor((depth * d) / Math.max(days, 1)),
      cause: CAUSES[rnd(0, CAUSES.length - 1)],
    });
  }
  // Plausibility requires the final lineage entry to EQUAL run gen/days/depth/cause.
  const cause = lineage[lineage.length - 1].cause;

  const history = [];
  for (let day = 1; day <= days; day++) {
    history.push([
      day,
      Math.floor((depth * day) / Math.max(days, 1)),
      Math.floor((blocks * day) / Math.max(days, 1)),
      Math.min(pop, 6 + day * 4),
      Math.floor((souls * day) / Math.max(days, 1)),
    ]);
  }
  return {
    v: 1,
    run_uuid: crypto.randomUUID(),
    game_version: '1.0',
    digger_name: NAMES[rnd(0, NAMES.length - 1)],
    gen, days, depth, blocks, cause,
    discoveries: rnd(0, 80), discovery_pct: rnd(0, 100),
    villager_deaths: souls, peak_population: pop,
    wall_hp: rnd(0, 200000), machines_built: rnd(0, 21),
    astrolabe_uses: rnd(0, 3), tasks_fulfilled: rnd(0, 200), tasks_denied: rnd(0, 80),
    challenges: [],
    peaks: { gold: rnd(0, 5000), coal: rnd(0, 400), iron: rnd(0, 100) },
    lineage, history,
    cosmetics: { headwear: 'head_bare', tunic_dye: 'slate' },
  };
}

let failed = 0;
let sampleUrl = null;
for (let i = 0; i < COUNT; i++) {
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeRun()),
    });
  } catch {
    console.error(`seed ${i}: cannot reach ${ENDPOINT} — is the dev server running?`);
    failed++;
    continue;
  }
  if (!r.ok) { failed++; console.error(`seed ${i}: HTTP ${r.status}`); }
  else { try { sampleUrl = (await r.json()).url ?? sampleUrl; } catch { /* older API */ } }
}
console.log(`seeded ${COUNT - failed}/${COUNT} runs -> ${ENDPOINT}`);
if (sampleUrl) console.log(`sample card: ${sampleUrl}`);
if (failed > 0) process.exit(1);

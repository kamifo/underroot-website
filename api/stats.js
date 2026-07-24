// GET /api/stats — everything the stats page renders, one cached JSON blob.
// All aggregates computed here server-side; raw rows never leave the server.
import { corsHeaders } from './_lib/ingest.js';
import { getSql } from './_lib/db.js';

const LEDGER_N = 50;         // rows in the browsable Ledger table
const HISTORY_SAMPLE = 2000; // newest N runs used for progression percentiles
const TASK_FLOOR = 50;       // min villager requests (fulfilled+denied) to qualify for the RATE tiles

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const sql = getSql();

    const [totals] = await sql`
      SELECT count(*)::int AS runs,
             coalesce(sum(villager_deaths), 0)::bigint AS souls,
             coalesce(sum(blocks), 0)::bigint AS blocks,
             coalesce(max(days), 0)::int AS longest,
             coalesce(sum(tasks_fulfilled), 0)::bigint AS tasks_granted,
             coalesce(sum(tasks_denied), 0)::bigint AS tasks_denied,
             coalesce(sum(astrolabe_uses), 0)::bigint AS astrolabe_rituals
      FROM runs WHERE NOT quarantined`;

    const causes = await sql`
      SELECT cause, count(*)::int AS n FROM runs
      WHERE NOT quarantined GROUP BY cause ORDER BY n DESC`;

    // One browsable table for the whole page, sorted client-side. Default order
    // is by generation (matches the Champions' "longest lineage" reckoning).
    const ledger = await sql`
      SELECT share_id, digger_name, gen, days, depth, blocks, discoveries, astrolabe_uses, cause,
             payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY gen DESC, days DESC LIMIT ${LEDGER_N}`;

    // Day-0 Death Club is a percentage of a group — no single holder.
    const [dayCounts] = await sql`
      SELECT
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days = 0)  AS day0_deaths,
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL) AS first_deaths`;

    // Record-holders: full rows (name + cosmetics + card context) so each tile
    // opens the digger's player card, exactly like a leaderboard row.
    const [hoard] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             (payload->'peaks'->>'gold')::int AS gold
      FROM runs WHERE NOT quarantined AND payload->'peaks' ? 'gold'
      ORDER BY (payload->'peaks'->>'gold')::int DESC LIMIT 1`;
    const [souls] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             villager_deaths
      FROM runs WHERE NOT quarantined
      ORDER BY villager_deaths DESC, received_at DESC LIMIT 1`;
    const [lineage] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY gen DESC LIMIT 1`;
    const [unbroken] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             first_death_days AS unbroken_days
      FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL
      ORDER BY first_death_days DESC LIMIT 1`;
    const [tiles] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY blocks DESC LIMIT 1`;
    const [discoveries] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             discoveries
      FROM runs WHERE NOT quarantined
      ORDER BY discoveries DESC LIMIT 1`;
    // Most rituals: the single run that dared the Astrolabe the most times, any
    // generation. Requires at least one ritual so a ritual-less run can't win.
    const [ritualsMost] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined AND astrolabe_uses > 0
      ORDER BY astrolabe_uses DESC, received_at DESC LIMIT 1`;
    // The lone ritualist: most Astrolabe rituals dared within a single-generation
    // lineage (gen = 1) — every ritual fired under the original digger, who never
    // fell to a successor. Requires at least one ritual.
    const [ritualist] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined AND gen = 1 AND astrolabe_uses > 0
      ORDER BY astrolabe_uses DESC, received_at DESC LIMIT 1`;

    // Task honours. Raw-count tiles reward volume; rate tiles reward the ratio but
    // require TASK_FLOOR total requests so a 1-of-1 run can't win.
    const [taskmaster] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             tasks_denied
      FROM runs WHERE NOT quarantined AND tasks_denied > 0
      ORDER BY tasks_denied DESC, received_at DESC LIMIT 1`;
    const [generousCount] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             tasks_fulfilled
      FROM runs WHERE NOT quarantined AND tasks_fulfilled > 0
      ORDER BY tasks_fulfilled DESC, received_at DESC LIMIT 1`;
    const [coldShoulder] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             tasks_fulfilled, tasks_denied
      FROM runs
      WHERE NOT quarantined AND (tasks_fulfilled + tasks_denied) >= ${TASK_FLOOR}
      ORDER BY tasks_denied::real / (tasks_fulfilled + tasks_denied) DESC, received_at DESC
      LIMIT 1`;
    const [generousRate] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date,
             tasks_fulfilled, tasks_denied
      FROM runs
      WHERE NOT quarantined AND (tasks_fulfilled + tasks_denied) >= ${TASK_FLOOR}
      ORDER BY tasks_fulfilled::real / (tasks_fulfilled + tasks_denied) DESC, received_at DESC
      LIMIT 1`;

    const superlatives = {
      day0_deaths: dayCounts.day0_deaths,
      first_deaths: dayCounts.first_deaths,
      hoard: hoard ?? null,              // { …, gold } | null (no run has a gold peak)
      souls: souls ?? null,              // { …, villager_deaths } | null
      lineage: lineage ?? null,          // { …, gen } | null
      unbroken: unbroken ?? null,        // { …, unbroken_days } | null
      tiles: tiles ?? null,              // { …, blocks } | null
      discoveries: discoveries ?? null,  // { …, discoveries } | null
      rituals_most: ritualsMost ?? null, // { …, astrolabe_uses } | null (uses>0)
      ritualist: ritualist ?? null,      // { …, astrolabe_uses } | null (gen 1, uses>0)
      generous_count: generousCount ?? null, // { …, tasks_fulfilled } | null
      generous_rate: generousRate ?? null,   // { …, tasks_fulfilled, tasks_denied } | null
    };

    // Survival curve: share of runs alive at day N, on a fixed grid.
    // One scan serves the day series (survival, runLenHist) and the tiles histogram.
    const dayRows = await sql`SELECT days, blocks FROM runs WHERE NOT quarantined`;
    const allDays = dayRows.map((r) => r.days);
    // reduce, not Math.max(...spread) — spread blows the call stack past ~130k rows.
    const maxDay = allDays.reduce((m, x) => (x > m ? x : m), 0);
    const survival = [];
    for (let d = 0; d <= maxDay; d += Math.max(1, Math.ceil(maxDay / 60))) {
      survival.push([d, allDays.length ? allDays.filter((x) => x >= d).length / allDays.length : 0]);
    }

    // Histograms.
    const histogram = (vals, bucket) => {
      const out = {};
      for (const v of vals) {
        const b = Math.floor(v / bucket) * bucket;
        out[b] = (out[b] ?? 0) + 1;
      }
      return Object.entries(out).map(([b, n]) => [Number(b), n]).sort((a, z) => a[0] - z[0]);
    };
    const runLenHist = histogram(allDays, 10);
    // Tiles dug spans a huge range (unlike depth, which saturates at the floor),
    // so bucket adaptively into ~12 bins rounded to 500.
    const blocksVals = dayRows.map((r) => r.blocks);
    const maxBlocks = blocksVals.reduce((m, x) => (x > m ? x : m), 0);
    const tilesBucket = Math.max(500, Math.ceil(maxBlocks / 12 / 500) * 500);
    const tilesHist = histogram(blocksVals, tilesBucket);

    // Tiles-dug progression percentiles from history curves (25/50/75 per day).
    // History rows are [day, depth, blocks, pop, souls] — index 2 is cumulative tiles.
    const histRows = await sql`
      SELECT payload->'history' AS history FROM runs
      WHERE NOT quarantined AND jsonb_array_length(payload->'history') > 0
      ORDER BY received_at DESC LIMIT ${HISTORY_SAMPLE}`;
    const byDay = new Map();
    for (const { history } of histRows) {
      for (const [day, , blocks] of history) {
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(blocks);
      }
    }
    const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))];
    const progression = [...byDay.entries()]
      .filter(([, v]) => v.length >= 3)
      .sort((a, z) => a[0] - z[0])
      .map(([day, curve]) => {
        curve.sort((a, z) => a - z);
        return [day, pct(curve, 0.25), pct(curve, 0.5), pct(curve, 0.75)];
      });

    // Tiles-vs-days scatter (cap the dots).
    const scatter = await sql`
      SELECT days, blocks, cause FROM runs WHERE NOT quarantined
      ORDER BY received_at DESC LIMIT 1000`;

    // Deaths by cause per generation, from every lineage entry across all runs.
    const causesByGen = await sql`
      SELECT (e->>'gen')::int AS gen, e->>'cause' AS cause, count(*)::int AS n
      FROM runs, jsonb_array_elements(payload->'lineage') AS e
      WHERE NOT quarantined AND (e->>'gen')::int <= 20
      GROUP BY 1, 2 ORDER BY 1`;

    // ---- Hall of Fools: dubious honours (each null when no run qualifies) ----
    // Each carries the card fields (share_id, cosmetics, gen, cause, date) so the
    // tile opens the digger's player card; received_at DESC breaks ties toward the
    // latest submission.
    const [hoarder] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined AND NOT (payload->'peaks' ? 'gold')
      ORDER BY days DESC, received_at DESC LIMIT 1`;
    const [overconfident] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined AND days <= 15
      ORDER BY depth DESC, received_at DESC LIMIT 1`;
    // Scratched the Surface: survived a long time (days >= 20) yet dug the fewest
    // tiles — all that time above ground and barely a hole to show for it. Keyed
    // on tiles (not depth): depth saturates at the 342 (513 m) world floor, so a
    // depth race crowned floor-huggers; tiles dug has no ceiling, so "least dug"
    // stays meaningful. Ties break toward the longest-lived slacker.
    const [scratched] = await sql`
      SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
             days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined AND days >= 20
      ORDER BY blocks ASC, days DESC, received_at DESC LIMIT 1`;
    const [groundhog] = await sql`
      SELECT share_id, digger_name, cosmetics, days, depth, blocks, astrolabe_uses, gen, cause, date, mx FROM (
        SELECT share_id, digger_name, payload->'challenges' AS challenges, payload->'cosmetics' AS cosmetics, coalesce(payload->>'harrow', '') AS harrow,
               days, depth, blocks, astrolabe_uses, gen, cause, received_at::date AS date, received_at, (
          SELECT max(cnt)::int FROM (
            SELECT count(*)::int AS cnt
            FROM jsonb_array_elements(payload->'lineage') AS e
            GROUP BY (e->>'days')
          ) g
        ) AS mx
        FROM runs WHERE NOT quarantined
      ) s WHERE mx >= 2 ORDER BY mx DESC, received_at DESC LIMIT 1`;

    const fools = {
      speedrun: superlatives.day0_deaths ?? 0,        // count; reuse existing superlative
      hoarder: hoarder ?? null,                        // { digger_name, days }
      overconfident: overconfident ?? null,            // { digger_name, depth, days }
      scratched: scratched ?? null,                    // { digger_name, days, depth }
      groundhog: groundhog ?? null,                    // { digger_name, mx }
      taskmaster: taskmaster ?? null,                  // { …, tasks_denied } | null
      coldshoulder: coldShoulder ?? null,              // { …, tasks_fulfilled, tasks_denied } | null
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      totals,
      causes,
      ledger,
      superlatives,
      fools,
      charts: { survival, runLenHist, tilesHist, progression, scatter, causesByGen },
    });
  } catch (err) {
    console.error('stats failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal error' });
  }
}

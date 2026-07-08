// GET /api/stats — everything the stats page renders, one cached JSON blob.
// All aggregates computed here server-side; raw rows never leave the server.
import { corsHeaders } from './_lib/ingest.js';
import { getSql } from './_lib/db.js';

const LEADER_N = 20;
const HISTORY_SAMPLE = 2000; // newest N runs used for progression percentiles

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
             coalesce(max(depth), 0)::int AS deepest
      FROM runs WHERE NOT quarantined`;

    const causes = await sql`
      SELECT cause, count(*)::int AS n FROM runs
      WHERE NOT quarantined GROUP BY cause ORDER BY n DESC`;

    const lineageBoard = await sql`
      SELECT digger_name, days, depth, gen, cause, blocks,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY days DESC, depth DESC LIMIT ${LEADER_N}`;

    const unbrokenBoard = await sql`
      SELECT digger_name, first_death_days AS days, first_death_depth AS depth,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
      FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL
      ORDER BY first_death_days DESC, first_death_depth DESC LIMIT ${LEADER_N}`;

    const [superlatives] = await sql`
      SELECT
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days = 0)  AS day0_deaths,
        (SELECT count(*)::int FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL) AS first_deaths,
        (SELECT max((payload->'peaks'->>'gold')::int) FROM runs WHERE NOT quarantined AND payload->'peaks' ? 'gold') AS max_gold,
        (SELECT max(villager_deaths) FROM runs WHERE NOT quarantined) AS max_souls,
        (SELECT max(gen)::int FROM runs WHERE NOT quarantined) AS max_gen`;

    // Survival curve: share of runs alive at day N, on a fixed grid.
    // One scan serves both the day series (survival, runLenHist) and depthHist.
    const dayDepthRows = await sql`SELECT days, depth FROM runs WHERE NOT quarantined`;
    const allDays = dayDepthRows.map((r) => r.days);
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
    const depthHist = histogram(dayDepthRows.map((r) => r.depth), 25);

    // Depth progression percentiles from history curves (25/50/75 per day).
    const histRows = await sql`
      SELECT payload->'history' AS history FROM runs
      WHERE NOT quarantined AND jsonb_array_length(payload->'history') > 0
      ORDER BY received_at DESC LIMIT ${HISTORY_SAMPLE}`;
    const byDay = new Map();
    for (const { history } of histRows) {
      for (const [day, depth] of history) {
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(depth);
      }
    }
    const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))];
    const progression = [...byDay.entries()]
      .filter(([, v]) => v.length >= 3)
      .sort((a, z) => a[0] - z[0])
      .map(([day, depths]) => {
        depths.sort((a, z) => a - z);
        return [day, pct(depths, 0.25), pct(depths, 0.5), pct(depths, 0.75)];
      });

    // Depth-vs-days scatter (cap the dots).
    const scatter = await sql`
      SELECT days, depth, cause FROM runs WHERE NOT quarantined
      ORDER BY received_at DESC LIMIT 1000`;

    // Deaths by cause per generation, from every lineage entry across all runs.
    const causesByGen = await sql`
      SELECT (e->>'gen')::int AS gen, e->>'cause' AS cause, count(*)::int AS n
      FROM runs, jsonb_array_elements(payload->'lineage') AS e
      WHERE NOT quarantined AND (e->>'gen')::int <= 20
      GROUP BY 1, 2 ORDER BY 1`;

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      totals,
      causes,
      boards: { lineage: lineageBoard, unbroken: unbrokenBoard },
      superlatives,
      charts: { survival, runLenHist, depthHist, progression, scatter, causesByGen },
    });
  } catch (err) {
    console.error('stats failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal error' });
  }
}

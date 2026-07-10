// GET /api/stats — everything the stats page renders, one cached JSON blob.
// All aggregates computed here server-side; raw rows never leave the server.
import { corsHeaders } from './_lib/ingest.js';
import { getSql } from './_lib/db.js';

const LEDGER_N = 50;         // rows in the browsable Ledger table
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
             coalesce(max(days), 0)::int AS longest
      FROM runs WHERE NOT quarantined`;

    const causes = await sql`
      SELECT cause, count(*)::int AS n FROM runs
      WHERE NOT quarantined GROUP BY cause ORDER BY n DESC`;

    // One browsable table for the whole page, sorted client-side. Default order
    // is by generation (matches the Champions' "longest lineage" reckoning).
    const ledger = await sql`
      SELECT share_id, digger_name, gen, days, depth, blocks, discoveries, cause,
             payload->'cosmetics' AS cosmetics, received_at::date AS date
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
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             (payload->'peaks'->>'gold')::int AS gold
      FROM runs WHERE NOT quarantined AND payload->'peaks' ? 'gold'
      ORDER BY (payload->'peaks'->>'gold')::int DESC LIMIT 1`;
    const [souls] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             villager_deaths
      FROM runs WHERE NOT quarantined
      ORDER BY villager_deaths DESC LIMIT 1`;
    const [lineage] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date
      FROM runs WHERE NOT quarantined
      ORDER BY gen DESC LIMIT 1`;
    const [unbroken] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             first_death_days AS unbroken_days
      FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL
      ORDER BY first_death_days DESC LIMIT 1`;
    const [tiles] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             blocks
      FROM runs WHERE NOT quarantined
      ORDER BY blocks DESC LIMIT 1`;
    const [discoveries] = await sql`
      SELECT share_id, digger_name, payload->'cosmetics' AS cosmetics,
             days, depth, gen, cause, received_at::date AS date,
             discoveries
      FROM runs WHERE NOT quarantined
      ORDER BY discoveries DESC LIMIT 1`;

    const superlatives = {
      day0_deaths: dayCounts.day0_deaths,
      first_deaths: dayCounts.first_deaths,
      hoard: hoard ?? null,              // { …, gold } | null (no run has a gold peak)
      souls: souls ?? null,              // { …, villager_deaths } | null
      lineage: lineage ?? null,          // { …, gen } | null
      unbroken: unbroken ?? null,        // { …, unbroken_days } | null
      tiles: tiles ?? null,              // { …, blocks } | null
      discoveries: discoveries ?? null,  // { …, discoveries } | null
    };

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

    // ---- Hall of Fools: dubious honours (each null when no run qualifies) ----
    const [hoarder] = await sql`
      SELECT digger_name, days FROM runs
      WHERE NOT quarantined AND NOT (payload->'peaks' ? 'gold')
      ORDER BY days DESC LIMIT 1`;
    const [overconfident] = await sql`
      SELECT digger_name, depth, days FROM runs
      WHERE NOT quarantined AND days <= 15
      ORDER BY depth DESC LIMIT 1`;
    const [scratched] = await sql`
      SELECT digger_name, days, depth FROM runs
      WHERE NOT quarantined AND days >= 20
      ORDER BY depth ASC, days DESC LIMIT 1`;
    const [groundhog] = await sql`
      SELECT digger_name, mx FROM (
        SELECT digger_name, (
          SELECT max(cnt)::int FROM (
            SELECT count(*)::int AS cnt
            FROM jsonb_array_elements(payload->'lineage') AS e
            GROUP BY (e->>'days')
          ) g
        ) AS mx
        FROM runs WHERE NOT quarantined
      ) s WHERE mx >= 2 ORDER BY mx DESC LIMIT 1`;

    const fools = {
      speedrun: superlatives.day0_deaths ?? 0,        // count; reuse existing superlative
      hoarder: hoarder ?? null,                        // { digger_name, days }
      overconfident: overconfident ?? null,            // { digger_name, depth, days }
      scratched: scratched ?? null,                    // { digger_name, days, depth }
      groundhog: groundhog ?? null,                    // { digger_name, mx }
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      totals,
      causes,
      ledger,
      superlatives,
      fools,
      charts: { survival, runLenHist, depthHist, progression, scatter, causesByGen },
    });
  } catch (err) {
    console.error('stats failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal error' });
  }
}

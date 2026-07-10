// api/leaderboard.js
// GET /api/leaderboard?board=lineage|unbroken&offset=<n> — one page (50 rows) of
// a full board, same ordering as /api/stats' embedded top-20, for "View all".
import { corsHeaders } from './_lib/ingest.js';
import { getSql } from './_lib/db.js';

const PAGE = 50;
const MAX_OFFSET = 100000;

export function parseLeaderboardQuery(q) {
  const board = q?.board === 'unbroken' ? 'unbroken' : 'lineage';
  let offset = Number.parseInt(q?.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.min(offset, MAX_OFFSET);
  return { board, offset, limit: PAGE };
}

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const { board, offset, limit } = parseLeaderboardQuery(req.query ?? {});
    const sql = getSql();
    const rows = board === 'unbroken'
      ? await sql`
          SELECT share_id, digger_name, first_death_days AS days, first_death_depth AS depth,
                 payload->'cosmetics' AS cosmetics, received_at::date AS date
          FROM runs WHERE NOT quarantined AND first_death_days IS NOT NULL
          ORDER BY first_death_days DESC, first_death_depth DESC
          OFFSET ${offset} LIMIT ${limit}`
      : await sql`
          SELECT share_id, digger_name, days, depth, gen, cause, blocks,
                 payload->'cosmetics' AS cosmetics, received_at::date AS date
          FROM runs WHERE NOT quarantined
          ORDER BY days DESC, depth DESC
          OFFSET ${offset} LIMIT ${limit}`;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ board, offset, limit, rows });
  } catch (err) {
    console.error('leaderboard failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal error' });
  }
}

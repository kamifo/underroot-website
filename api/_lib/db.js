// Thin DB layer — all SQL lives here. Uses Neon's serverless driver
// (HTTP-based, no connection pool to manage in functions).
import { neon } from '@neondatabase/serverless';

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return neon(url);
}

// Idempotent by run_uuid: a later death in the same run replaces the row.
// Returns the row's share_id. share_id is intentionally excluded from the
// INSERT column list and the DO UPDATE SET list, so a first insert gets the
// DB's default-generated id, and a re-POST of the same run_uuid keeps its
// existing (stable) share_id rather than being reassigned.
export async function upsertRun(sql, run, meta) {
  const rows = await sql`
    INSERT INTO runs (
      run_uuid, quarantined, quarantine_reasons, submitter_ip_hash, game_version,
      digger_name, gen, days, depth, blocks, cause,
      discoveries, discovery_pct, villager_deaths, peak_population,
      wall_hp, machines_built, astrolabe_uses, tasks_fulfilled, tasks_denied,
      first_death_days, first_death_depth, payload
    ) VALUES (
      ${run.run_uuid}, ${meta.quarantined}, ${meta.reasons}, ${meta.ipHash}, ${run.game_version},
      ${run.digger_name}, ${run.gen}, ${run.days}, ${run.depth}, ${run.blocks}, ${run.cause},
      ${run.discoveries}, ${run.discovery_pct}, ${run.villager_deaths}, ${run.peak_population},
      ${run.wall_hp}, ${run.machines_built}, ${run.astrolabe_uses}, ${run.tasks_fulfilled}, ${run.tasks_denied},
      ${meta.firstDeathDays}, ${meta.firstDeathDepth},
      ${JSON.stringify({ challenges: run.challenges, peaks: run.peaks, lineage: run.lineage, history: run.history, cosmetics: run.cosmetics })}
    )
    ON CONFLICT (run_uuid) DO UPDATE SET
      received_at = now(),
      quarantined = EXCLUDED.quarantined,
      quarantine_reasons = EXCLUDED.quarantine_reasons,
      game_version = EXCLUDED.game_version,
      digger_name = EXCLUDED.digger_name,
      gen = EXCLUDED.gen, days = EXCLUDED.days, depth = EXCLUDED.depth,
      blocks = EXCLUDED.blocks, cause = EXCLUDED.cause,
      discoveries = EXCLUDED.discoveries, discovery_pct = EXCLUDED.discovery_pct,
      villager_deaths = EXCLUDED.villager_deaths, peak_population = EXCLUDED.peak_population,
      wall_hp = EXCLUDED.wall_hp, machines_built = EXCLUDED.machines_built,
      astrolabe_uses = EXCLUDED.astrolabe_uses,
      tasks_fulfilled = EXCLUDED.tasks_fulfilled, tasks_denied = EXCLUDED.tasks_denied,
      first_death_days = EXCLUDED.first_death_days, first_death_depth = EXCLUDED.first_death_depth,
      payload = EXCLUDED.payload
    RETURNING share_id
  `;
  return rows[0].share_id;
}

export async function submissionsInLastHour(sql, ipHash) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM runs
    WHERE submitter_ip_hash = ${ipHash} AND received_at > now() - interval '1 hour'
  `;
  return rows[0].n;
}

// One run's public card data, by its share_id. Only non-quarantined runs are
// viewable. `gold` is null for runs with no gold peak (caller omits that row).
export async function getRunByShareId(sql, id) {
  const rows = await sql`
    SELECT digger_name, gen, days, depth, cause,
           villager_deaths, blocks, discoveries, peak_population, astrolabe_uses,
           payload->'cosmetics' AS cosmetics,
           (payload->'peaks'->>'gold')::int AS gold,
           received_at::date AS date
    FROM runs
    WHERE share_id = ${id} AND NOT quarantined
    LIMIT 1`;
  return rows[0] ?? null;
}

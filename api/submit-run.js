// POST /api/submit-run — receives one run summary from the game.
// Pipeline: size cap -> schema validation -> plausibility -> rate limit -> upsert.
// Implausible runs are stored quarantined but still get a 200 (no forger feedback).
import { validateRun } from './_lib/validate.js';
import { checkPlausibility } from './_lib/plausibility.js';
import { deriveFirstDeath, corsHeaders, hashIp } from './_lib/ingest.js';
import { getSql, upsertRun, submissionsInLastHour } from './_lib/db.js';

const BODY_CAP = 16 * 1024;
const RATE_PER_HOUR = 10;

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try {
    body = req.body; // lazy getter — throws on malformed JSON
  } catch {
    return res.status(400).json({ error: 'malformed JSON' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'JSON object required' });
  }
  // Byte-accurate cap (UTF-16 .length undercounts multi-byte payloads ~3x).
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > BODY_CAP) {
    return res.status(413).json({ error: 'payload too large' });
  }

  try {
    const v = validateRun(body);
    if (!v.ok) {
      // Schema failures are hard rejects — a legitimate game build never sends these.
      return res.status(422).json({ error: 'invalid payload' });
    }
    const run = v.value;

    const ip = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
    // No fallback salt: a missing IP_SALT must fail loudly (hashIp throws), not
    // silently degrade to a guessable constant.
    const ipHash = hashIp(ip, process.env.IP_SALT);

    const sql = getSql();
    // Check-then-act race accepted: concurrent bursts can slip past the cap by a
    // few rows, which is harmless at this scale — not worth an atomic guard.
    if ((await submissionsInLastHour(sql, ipHash)) >= RATE_PER_HOUR) {
      return res.status(429).json({ error: 'rate limited' });
    }

    const { plausible, reasons } = checkPlausibility(run);
    const { first_death_days, first_death_depth } = deriveFirstDeath(run.lineage);

    await upsertRun(sql, run, {
      quarantined: !plausible,
      reasons,
      ipHash,
      firstDeathDays: first_death_days,
      firstDeathDepth: first_death_depth,
    });

    // Same response either way — quarantine is invisible to the client.
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('submit-run failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal error' });
  }
}

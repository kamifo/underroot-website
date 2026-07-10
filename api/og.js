// GET /api/og?id=<share_id> -> image/png. The per-run unfurl image. Never 500s
// a crawler: any failure (bad id, DB down, raster error) returns the static
// fallback so a shared link always yields a branded preview.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corsHeaders } from './_lib/ingest.js';
import { getSql, getRunByShareId } from './_lib/db.js';
import { buildOgSvg } from './_lib/og-card.js';
import { renderPng } from './_lib/rasterize.js';

const FALLBACK = readFileSync(fileURLToPath(new URL('./_lib/og-fallback.png', import.meta.url)));
const isShareId = (s) => /^[0-9a-f]{12}$/.test(s);

function sendFallback(res) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).end(FALLBACK);
}

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const id = String(req.query?.id ?? '');
  try {
    const run = isShareId(id) ? await getRunByShareId(getSql(), id) : null;
    if (!run) return sendFallback(res);
    const png = await renderPng(buildOgSvg(run));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).end(png);
  } catch (err) {
    console.error('og failed:', err instanceof Error ? err.message : err);
    return sendFallback(res);
  }
}

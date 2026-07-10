// GET /r/:id (rewritten to /api/card?id=:id) -> text/html. Server-renders the
// run card with per-run OG meta and inlines the run JSON. 404 (themed) when the
// id is unknown or the run is quarantined.
import { getSql, getRunByShareId } from './_lib/db.js';
import { renderCardHtml, renderNotFoundHtml } from './_lib/card-html.js';
import { originFromReq } from './_lib/ingest.js';

const isShareId = (s) => /^[0-9a-f]{12}$/.test(s);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const id = String(req.query?.id ?? '');
  const origin = originFromReq(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const run = isShareId(id) ? await getRunByShareId(getSql(), id) : null;
    if (!run) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send(renderNotFoundHtml(origin));
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(renderCardHtml(run, { origin, id }));
  } catch (err) {
    console.error('card failed:', err instanceof Error ? err.message : err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send(renderNotFoundHtml(origin));
  }
}

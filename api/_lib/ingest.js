// Ingest helpers shared by the API routes. Pure module (crypto only).
import { createHash } from 'node:crypto';

// lineage[0] = the original digger's death — feeds the Original Digger board.
export function deriveFirstDeath(lineage) {
  if (!Array.isArray(lineage) || lineage.length === 0) {
    return { first_death_days: null, first_death_depth: null };
  }
  return { first_death_days: lineage[0].days, first_death_depth: lineage[0].depth };
}

// CORS is a courtesy, not security (validation is the gate) — but keep an
// allowlist so random sites don't embed the endpoint.
const ORIGIN_ALLOW = [
  /^https:\/\/(www\.)?underroot\.se$/,
  /^https:\/\/[a-z0-9-]+\.itch\.zone$/,      // itch.io game embeds
  /^https:\/\/[a-z0-9-]+\.ssl\.hwcdn\.net$/, // itch.io CDN embeds
  /^https:\/\/underroot-playtest[a-z0-9-]*\.vercel\.app$/,  // playtest deploys (scoped to our project)
  /^http:\/\/localhost(:\d+)?$/,             // local dev / Godot editor
];

export function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // Unconditional: GET responses are edge-cached (s-maxage). Without Vary
    // on every response, a cached response computed for one Origin would be
    // replayed to a different Origin.
    'Vary': 'Origin',
  };
  if (origin && ORIGIN_ALLOW.some((re) => re.test(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function hashIp(ip, salt) {
  if (!salt) throw new Error('hashIp: salt is required (set IP_SALT)');
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

// Absolute origin for building shareable/OG-image URLs. Prefers an explicit
// SITE_ORIGIN, else reconstructs from the (first) forwarded proto + host.
export function originFromReq(req) {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/+$/, '');
  const h = req.headers ?? {};
  const first = (v, fallback) => { const s = (v ?? '').split(',')[0].trim(); return s || fallback; };
  const proto = first(h['x-forwarded-proto'], 'https');
  const host = first(h['x-forwarded-host'] ?? h.host, 'underroot.se');
  return `${proto}://${host}`;
}

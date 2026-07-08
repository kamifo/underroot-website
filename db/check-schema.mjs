// One-off schema sanity check: node db/check-schema.mjs
// Reads .env.development.local, confirms the runs table + indexes exist.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
if (!process.env.DATABASE_URL) {
  console.error('parse failed; first 3 non-comment lines:',
    env.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).slice(0, 3).map((l) => l.slice(0, 30)));
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'runs' ORDER BY ordinal_position`;
console.log('runs columns:', cols.length, '-', cols.map((c) => c.column_name).join(','));
const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'runs'`;
console.log('indexes:', idx.map((i) => i.indexname).join(', '));

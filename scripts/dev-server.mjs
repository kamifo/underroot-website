// Dev server wrapper: loads .env.development.local into the environment and
// spawns `vercel dev` — the CLI does not auto-load that file for this
// non-framework project, so every local API session needs this dance.
// Usage: node scripts/dev-server.mjs [port]
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.argv[2] ?? '3000';

const env = { ...process.env };
const envFile = readFileSync(join(root, '.env.development.local'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const child = spawn('vercel', ['dev', '--listen', port, '--yes'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));

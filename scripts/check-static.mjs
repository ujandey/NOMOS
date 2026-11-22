// Verifies that `npm run build:static` produced a bundle that cannot call the paid mission endpoint
// and that the static-host security headers were copied into dist/.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const assets = new URL('../dist/assets/', import.meta.url);
const scripts = readdirSync(assets).filter(name => name.endsWith('.js'));
const offenders = scripts.filter(name => readFileSync(new URL(name, assets), 'utf8').includes('/api/mission/parse'));
if (!scripts.length || offenders.length) {
  console.error('Static build still references the mission endpoint:', offenders.join(', ') || '(no scripts built)');
  process.exit(1);
}
const headers = new URL('../dist/_headers', import.meta.url);
if (!existsSync(headers) || !readFileSync(headers, 'utf8').includes('Content-Security-Policy')) {
  console.error('dist/_headers with a Content-Security-Policy is missing.');
  process.exit(1);
}
console.log(`Static build verified: ${scripts.length} scripts, offline parser only, security headers present.`);

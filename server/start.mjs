import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missionMiddleware } from './mission.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Build NOMOS with npm run build before starting.');
const mime = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
}));

/** Same policy as public/_headers, which static hosts apply to the built files. */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; " +
    "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
// Vite fingerprints everything under /assets, so those files never change at a given URL.
const cachePolicy = location => location.startsWith('assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache';

const host = process.env.NOMOS_HOST || '127.0.0.1';
const mission = missionMiddleware({ ...process.env, NOMOS_HOST: host });
const port = Number(process.env.PORT || 4173);

createServer((request, response) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
  void mission(request, response, () => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
      const location = relative(root, file);
      if (location === '..' || location.startsWith('..' + sep) || isAbsolute(location) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404, { 'Cache-Control': 'no-store' }).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': mime.get(extname(file)) || 'application/octet-stream', 'Cache-Control': cachePolicy(location) });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(400).end('Invalid request');
    }
  });
}).listen(port, host, () => {
  console.log('NOMOS running at http://' + host + ':' + port);
  console.log(mission.config.enabled
    ? `Model-assisted mission parsing enabled: ${mission.config.perMinute}/min per client, ${mission.config.perDay}/day total.`
    : `Model-assisted mission parsing disabled (${mission.config.reason}). The offline parser is used.`);
});

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missionMiddleware } from './mission.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Build NOMOS with npm run build before starting.');
const mime = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png',
}));
const mission = missionMiddleware(process.env);
const port = Number(process.env.PORT || 4173);
const host = process.env.NOMOS_HOST || '127.0.0.1';

createServer((request, response) => {
  void mission(request, response, () => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
      const location = relative(root, file);
      if (location.startsWith('..') || isAbsolute(location) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': mime.get(extname(file)) || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(400).end('Invalid request');
    }
  });
}).listen(port, host, () => console.log('NOMOS running at http://' + host + ':' + port));

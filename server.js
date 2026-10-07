import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const allowed = new Set(['index.html', 'style.css', 'app.js', 'firebase-config.js', 'pagination.js', 'workspace.js']);
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
const port = Number(process.env.PORT || 5500);
http.createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const body = await readFile(fileURLToPath(new URL(name, root)));
    response.writeHead(200, { 'Content-Type': `${types[name.split('.').pop()]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(500); response.end('Could not read file'); }
}).listen(port, '127.0.0.1', () => console.log(`Open http://localhost:${port}`));

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.yml':'text/yaml; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.xml':'application/xml', '.txt':'text/plain', '.wasm':'application/wasm' };
export function serveStatic({ rootDir = '_site', port = 3000, host = '127.0.0.1' } = {}) {
  const root = resolve(rootDir);
  async function headersFor(path) {
    const headers = {};
    let text = '';try { text = await readFile(join(root, '_headers'), 'utf8'); } catch { return headers; }
    let applies = false;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!/^\s/.test(line)) {
        const pattern = line.trim();applies = pattern === '/*' || (pattern.endsWith('*') ? path.startsWith(pattern.slice(0,-1)) : path === pattern);
      } else if (applies) {
        const split = line.indexOf(':');if(split > 0) headers[line.slice(0,split).trim()] = line.slice(split+1).trim();
      }
    }
    return headers;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`), path = decodeURIComponent(url.pathname);
      let file = resolve(root, '.' + path);
      if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403);res.end();return; }
      try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch {}
      const body = await readFile(file), suffix = '.' + file.split('.').at(-1);
      res.writeHead(200, { 'Content-Type':mime[suffix] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store', ...await headersFor(path.endsWith('/') ? path : path + (file.endsWith('index.html') ? '/' : '')) });res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8' });
      try { res.end(await readFile(join(root, '404.html'))); } catch { res.end('Sayfa bulunamadı.'); }
    }
  });
  server.listen(port, host);return server;
}

// Minimal static file server for the design prototype (`npm run proto`).
// Usage: node scripts/serve-static.mjs <dir> <port>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const [dir = 'design/prototype', portArg = '5180'] = process.argv.slice(2);
const root = resolve(dir);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    statSync(file);
  } catch {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(Number(portArg), () => {
  console.log(`Serving ${dir} on http://localhost:${portArg}`);
});

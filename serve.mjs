/** Tiny static server: node serve.mjs [dir] [port] */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs';
import { dirname, resolve, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || 'public');
const port = Number(process.argv[3] || process.env.PORT || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  stat(file, (err, info) => {
    let target = file;
    if (!err && info.isDirectory()) target = join(file, 'index.html');
    readFile(target, (readErr, body) => {
      if (readErr) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[target.slice(target.lastIndexOf('.'))] || 'application/octet-stream',
        'cache-control': 'no-cache',
      }).end(body);
    });
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`serving ${dirname(root)} → ${root} on http://0.0.0.0:${port}`);
});

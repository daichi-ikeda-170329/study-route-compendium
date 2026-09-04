/**
 * 検査用の静的配信サーバー。Node 標準だけで動く。
 *
 *   node build/serve.mjs [ポート] [配信するディレクトリ]
 *
 * Playwright を file:// で走らせると、絶対パスのリンク（/english/ など）が
 * 解決できず、localStorage の扱いも本番と変わる。**HTTP 経由で確かめる**ために置く。
 * 既定の配信元はリポジトリ直下だが、公開物の検査では dist/ を渡す。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4173;
const BASE = path.resolve(ROOT, process.argv[3] || '.');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  // BASE の外へ出るパスは配信しない
  const file = path.resolve(BASE, `.${p}`);
  if (!file.startsWith(BASE + path.sep) && file !== BASE) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      const notFound = path.join(BASE, '404.html');
      if (fs.existsSync(notFound)) {
        res.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(fs.readFileSync(notFound));
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}/ で ${path.relative(ROOT, BASE) || '.'} を配信中`);
});

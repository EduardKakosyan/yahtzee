/**
 * Prove the app works when hosted under a sub-path (GitHub Pages: /yahtzee/).
 * Spins up its own server on a temp port with a temp doc-root so it needs nothing
 * else running. Asserts: relative asset resolution, service worker installs, the
 * manifest URL stays under the sub-path, and a reload mid-turn resumes.
 *
 *   node scripts/subpath.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs';
import { readdir, symlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const PUBLIC = resolve('public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
};

const root = await mkdtemp(join(tmpdir(), 'yahtzee-subpath-'));
await symlink(PUBLIC, join(root, 'yahtzee'));

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  readFile(join(root, path), (err, body) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream',
      'cache-control': 'no-cache',
    }).end(body);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://localhost:${port}/yahtzee/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const issues = [];
page.on('pageerror', (e) => issues.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') issues.push('CONSOLE ' + m.text()); });
page.on('requestfailed', (r) => issues.push('FAILED ' + r.url()));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.hostname === 'localhost' && u.port !== String(port)) issues.push('OFFSITE ' + r.url());
});

await page.goto(base);
await page.waitForTimeout(600);
const ok = [];
const fail = [];
const want = (label, cond) => (cond ? ok : fail).push(label);

want('setup visible at sub-path root', await page.getByTestId('setup').isVisible());
// every asset the document references must resolve under /yahtzee/
const urls = await page.evaluate(() => [...document.querySelectorAll('link[href], script[src]')].map((e) => e.href || e.src));
want('all document URLs under the sub-path', urls.length > 0 && urls.every((u) => u.startsWith(base)));
want('no root-absolute URLs in markup', !/(href|src)="\/[^/]/.test(await page.content()));

await page.getByLabel('Player name', { exact: true }).fill('Ana');
await page.getByTestId('add-player').click();
await page.getByTestId('start-game').click();
want('game starts', await page.getByTestId('game').isVisible());
await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
await page.getByTestId('roll').click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
want('Yahtzee previews 50 under a sub-path',
  (await page.getByTestId('score-yahtzee').getByTestId('score-value').textContent()) === '50');
want('service worker registered', await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length > 0)));
const manifestHref = await page.evaluate(() => document.querySelector('link[rel=manifest]')?.href || '');
want('manifest resolves under the sub-path', manifestHref.startsWith(base));

// a reload (Safari reclaiming the page) must land back on the same turn
await page.reload();
await page.waitForTimeout(400);
want('resume after reload keeps the turn',
  (await page.getByTestId('current-player').textContent()) === 'Ana'
  && (await page.getByTestId('rolls-left').textContent()) === '2');

const listed = await readdir(join(root, 'yahtzee'));
want('doc-root served the built output', listed.includes('index.html') && listed.includes('app.js'));

await rm(root, { recursive: true, force: true });
server.close();
await browser.close();

console.log(`sub-path hosting at ${base}`);
for (const l of ok) console.log('  ok   ' + l);
for (const l of fail) console.log('  FAIL ' + l);
if (issues.length) { console.log('  issues:', [...new Set(issues)]); fail.push('console/page errors'); }
console.log(fail.length ? `\n${fail.length} SUB-PATH FAILURES` : '\nsub-path hosting is clean');
process.exit(fail.length ? 1 : 0);

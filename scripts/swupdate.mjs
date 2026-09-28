/**
 * Update path: a rebuild must take over on the next launch, and a client that was
 * offline must keep working on the old build rather than being trapped. Serves a
 * private copy of public/, swaps the build under a connected client, and watches
 * what it ends up running.
 *
 *   node scripts/swupdate.mjs
 */
import { get } from 'node:http';
import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const src = resolve('public');
const root = await mkdtemp(join(tmpdir(), 'yahtzee-swu-'));
await cp(join(src, '.'), root, { recursive: true });

// reuse the project's own static server rather than a throwaway one
const port = await new Promise((done) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); });
});
const child = spawn(process.execPath, ['serve.mjs', root, String(port)], {
  cwd: resolve('.'), stdio: ['ignore', 'ignore', 'inherit'],
});
const waitUp = async () => {
  for (let i = 0; i < 40; i++) {
    const up = await new Promise((done) => {
      const req = get(`http://localhost:${port}/`, (res) => { res.resume(); done(res.statusCode === 200); });
      req.on('error', () => done(false));
    });
    if (up) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('static server never came up');
};
await waitUp();
const url = `http://localhost:${port}/`;

const v1 = (await readFile(join(root, 'sw.js'), 'utf8')).match(/VERSION = '([^']+)'/)[1];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const ok = [];
const bad = [];
const want = (label, cond) => (cond ? ok : bad).push(label);

await page.goto(url);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10_000 });
want('first build cached under its own key',
  (await page.evaluate(() => caches.keys())).some((k) => k.includes(v1)));

// a player is mid-game when the builder ships a new version
await page.getByLabel('Player name', { exact: true }).fill('Ana');
await page.getByTestId('add-player').click();
await page.getByTestId('start-game').click();
await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
await page.getByTestId('roll').click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));

await writeFile(join(root, 'sw.js'),
  (await readFile(join(root, 'sw.js'), 'utf8')).replace(/VERSION = '[^']+'/, "VERSION = 'deadbeefcafe'"));

// offline first: the stale build must still play, not dead-end
await ctx.setOffline(true);
await page.reload();
want('offline reload still plays the cached build',
  (await page.getByTestId('current-player').textContent()) === 'Ana');
await ctx.setOffline(false);

// next launch: the new build takes over and the old cache goes away
await page.reload();
await page.waitForTimeout(2500);
await page.reload();
const caches2 = await page.evaluate(() => caches.keys());
want('new build took over on the next launch', caches2.some((k) => k.includes('deadbeefcafe')));
want('stale build cache evicted', !caches2.some((k) => k.includes(v1)));
want('service worker still registered',
  !!(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.active || null))));
want('game state survived the update',
  (await page.getByTestId('current-player').textContent()) === 'Ana');

// a fresh install of the new build must be self-sufficient offline
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage();
await p2.goto(url);
await p2.evaluate(() => navigator.serviceWorker.ready);
await p2.reload();
await p2.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10_000 }).catch(() => {});
await ctx2.setOffline(true);
await p2.reload();
want('fresh install plays with no connection', await p2.getByTestId('setup').isVisible());

await ctx.close();
await ctx2.close();
await browser.close();
child.kill();
await rm(root, { recursive: true, force: true });

for (const l of ok) console.log('  ok   ' + l);
for (const l of bad) console.log('  FAIL ' + l);
console.log(bad.length ? `\n${bad.length} SW-UPDATE FAILURES` : '\nservice worker updates are clean');
process.exit(bad.length ? 1 : 0);

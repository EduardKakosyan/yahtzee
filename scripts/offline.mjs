import http from 'node:http';
import { chromium } from '@playwright/test';
const TARGET = process.env.APP_URL || 'http://localhost:3000';
const up = new URL(TARGET);
const server = http.createServer((req, res) => {
  const fwd = http.request({ hostname: up.hostname, port: up.port, path: req.url, method: req.method,
    headers: { ...req.headers, host: up.host } }, (u) => { res.writeHead(u.statusCode, u.headers); u.pipe(res); });
  fwd.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(fwd);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${port}/`);
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
console.log('controller active');
// play a while, then reload offline mid-turn and keep playing
await page.getByLabel('Player name', { exact: true }).fill('Ana');
await page.getByTestId('add-player').click();
await page.getByTestId('start-game').click();
await page.evaluate(() => { window.__yahtzeeDice = [4, 4, 4, 1, 2]; });
await page.getByTestId('roll').click();
await page.waitForTimeout(300);
await ctx.setOffline(true);
await page.reload();
console.log('offline reload — current:', await page.getByTestId('current-player').textContent(), 'dice:', await page.getByTestId('die').evaluateAll(e => e.map(x => x.getAttribute('data-value'))), 'rolls:', await page.getByTestId('rolls-left').textContent());
await page.evaluate(() => { window.__yahtzeeDice = [6, 6]; });
await page.getByTestId('roll').click();
await page.waitForTimeout(300);
console.log('offline roll dice:', await page.getByTestId('die').evaluateAll(e => e.map(x => x.getAttribute('data-value'))));
await page.getByTestId('score-chance').click();
console.log('offline recorded total:', await page.getByTestId('total').textContent());
await ctx.setOffline(false);
// "new build takes over": reload again with SW still active
await page.reload();
await page.waitForTimeout(500);
console.log('after coming back online, setup reachable:', await page.getByTestId('game').isVisible());
console.log('errors', errs);
await ctx.close();

/* ── the same cold start, but real-dice mode chosen on the one online visit ── */
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errs.push('PAGEERROR(table) ' + e.message));
await p2.goto(`http://localhost:${port}/`);
await p2.evaluate(async () => { await navigator.serviceWorker.ready; });
await p2.reload();
await p2.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
await p2.getByTestId('dice-table').click();          // choose the mode while still online
for (const n of ['Ana', 'Ben']) {
  await p2.getByLabel('Player name', { exact: true }).fill(n);
  await p2.getByTestId('add-player').click();
}
await ctx2.setOffline(true);
await p2.reload();                                    // cold, offline launch
console.log('offline table mode — dice pref kept:',
  await p2.locator('#dice-table').getAttribute('aria-checked'), 'keypad visible:',
  await p2.locator('#keypad').isVisible().catch(() => false));
await p2.getByTestId('start-game').click();
for (const f of [4, 4, 4, 4, 5]) await p2.locator(`[data-testid="entry-key"][data-face="${f}"]`).click();
const boxesOffline = await p2.locator('button[data-testid^="score-"]:not([disabled])').count();
await p2.getByTestId('score-four-kind').click();
await p2.waitForTimeout(200);
const t = await p2.evaluate(() => ({
  pill: document.querySelector('#entry-count').textContent,
  board: [...document.querySelectorAll('[data-testid=scoreboard-total]')].map((e) => e.textContent).join(','),
  next: document.querySelector('[data-testid=current-player]').textContent,
}));
console.log(`offline real-dice entry ✓ boxes=${boxesOffline} recorded=${t.board} next=${t.next} pill=${t.pill}`);
if (boxesOffline !== 13 || t.board !== '21,0' || t.next !== 'Ben' || t.pill !== '0 of 5') {
  throw new Error('offline real-dice play is broken');
}
await ctx2.setOffline(false);
await ctx2.close();
console.log('errors', errs);
await browser.close();
server.close();

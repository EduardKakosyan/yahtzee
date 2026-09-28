import http from 'node:http';
import { chromium } from '@playwright/test';
const TARGET = process.env.APP_URL || 'http://localhost:3210';
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
await browser.close();
server.close();

import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/');
for (const n of ['Ana', 'Ben']) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
await page.getByTestId('start-game').click();
await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
await page.getByTestId('roll').click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
await page.getByTestId('score-yahtzee').click();
await page.waitForTimeout(250);
console.log('on next player screen:', JSON.stringify(await page.evaluate(() => ({
  text: document.querySelector('#undo').textContent.replace(/\s+/g,' ').trim(),
  aria: document.querySelector('#undo').getAttribute('aria-label'),
  w: Math.round(document.querySelector('#undo').getBoundingClientRect().width),
  h: Math.round(document.querySelector('#undo').getBoundingClientRect().height),
}))));
// Ana rolls (window closes) then records again -> undo disappears once she rolls
await page.getByTestId('roll').click(); await page.waitForTimeout(200);
console.log('after a roll, hidden:', await page.evaluate(() => document.querySelector('#undo').classList.contains('invisible')));
await b.close();

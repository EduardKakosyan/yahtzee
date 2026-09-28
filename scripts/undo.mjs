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
await page.waitForTimeout(300);
const t = await page.evaluate(() => ({ current: document.querySelector('[data-testid=current-player]').textContent,
  undoVisible: !document.querySelector('#undo').classList.contains('invisible') }));
console.log('after Ana records -> now playing:', t.current, '| Undo visible on Ben screen:', t.undoVisible);
if (t.undoVisible) {
  await page.getByTestId('undo').click({ force: true }).catch(async () => { await page.evaluate(() => document.querySelector('#undo').click()); });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ current: document.querySelector('[data-testid=current-player]').textContent,
    anaTotal: document.querySelectorAll('[data-testid=scoreboard-total]')[0].textContent,
    yahState: document.querySelector('[data-testid=score-yahtzee]').dataset.state,
    dice: [...document.querySelectorAll('[data-testid=die]')].map(d => d.getAttribute('data-value') || '_').join(',') }));
  console.log('AFTER Ben taps Undo:', JSON.stringify(r), '->', r.anaTotal === '50' ? 'SAFE (own-turn only)' : 'BUG: Ben erased Ana\'s Yahtzee');
}
await b.close();

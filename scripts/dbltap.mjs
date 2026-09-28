import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const b = await chromium.launch();
for (const how of ['dblclick', 'fast-double']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/');
  for (const n of ['Ana', 'Ben']) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  await page.getByTestId('start-game').click();
  await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
  if (how === 'dblclick') await page.getByTestId('score-yahtzee').dblclick();
  else { const h = page.getByTestId('score-yahtzee'); await h.dispatchEvent('click'); await h.dispatchEvent('click'); }
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    current: document.querySelector('[data-testid=current-player]').textContent,
    anaTotal: document.querySelectorAll('[data-testid=scoreboard-total]')[0].textContent,
    anaRecorded: document.querySelectorAll('.box[data-state=recorded]').length,
  }));
  console.log(`${how}: current=${r.current} AnaBoardTotal=${r.anaTotal} (expect 50 = exactly one box) errs? ${r.anaTotal === '50'}`);
  await ctx.close();
}
await b.close();

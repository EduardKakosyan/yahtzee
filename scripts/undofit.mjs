import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const NAMES = ['Christopher16', 'XxXxXxXxXxXxXxXx', 'Ann-Marie O’Neil', 'José Fernández'];
const b = await chromium.launch();
for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/');
  for (const n of NAMES) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  await page.getByTestId('start-game').click();
  await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
  await page.getByTestId('score-yahtzee').click();
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const head = document.querySelector('.card-head').getBoundingClientRect();
    const btn = document.querySelector('#undo').getBoundingClientRect();
    const title = document.querySelector('#card-title').getBoundingClientRect();
    return { docW: document.documentElement.scrollWidth, innerW: innerWidth,
      headRight: Math.round(head.right), btnRight: Math.round(btn.right), overlap: Math.round(title.right - btn.left),
      btn: { w: Math.round(btn.width), h: Math.round(btn.height) }, text: document.querySelector('#undo').textContent.replace(/\s+/g,' ').trim() };
  });
  console.log(`${vp.width}x${vp.height}: "${r.text}" btn=${r.btn.w}x${r.btn.h} btnRight=${r.btnRight}/${r.innerW} docW=${r.docW} titleOverlapsBtn=${r.overlap > 0}`);
  await ctx.close();
}
await b.close();

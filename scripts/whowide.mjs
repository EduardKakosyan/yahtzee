import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const NAMES = ['Christopher16', 'XxXxXxXxXxXxXxXx', 'Ann-Marie O’Neil', 'José Fernández'];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/');
for (const n of NAMES) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
await page.getByTestId('start-game').click();
await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
await page.getByTestId('roll').click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
await page.getByTestId('score-yahtzee').click();
await page.waitForTimeout(250);
console.log(await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 0.5 && r.width > 0) out.push(`${el.tagName}.${(el.className||'').toString().split(' ').slice(0,2).join('.')} right=${Math.round(r.right)} w=${Math.round(r.width)} "${(el.textContent||'').trim().slice(0,28)}"`);
  }
  return { docW: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth, offenders: out.slice(0, 8) };
}));
await b.close();

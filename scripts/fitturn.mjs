/**
 * Vertical/horizontal fit across the roster sizes and phones the contract suite
 * never reaches. Fails loudly, so a layout tweak that pushes something off screen
 * or past the viewport shows up here rather than on a real phone.
 *
 *   node scripts/fitturn.mjs            # 3 and 8 players, both phones
 */
import pkg from '/workspace/project/node_modules/@playwright/test/index.js';
const { chromium } = pkg;

const URL = process.env.SHOT_URL || 'http://localhost:3000/';
const SHORT = ['Ana', 'Ben', 'Chloé'];
// 16 chars is the input's maxlength; mixed scripts catch unbreakable-name overflow.
const LONG = ['Christopher16', 'XxXxXxXxXxXxXxXx', 'WWWWWWWWWWWWWWWW', 'Ann-Marie O’Neil',
  'José Fernández', "D'Artagnan III", 'Björk Guðmunds', 'MxmbayaNdlovu8'];
const VIEWPORTS = [{ width: 375, height: 667 }, { width: 390, height: 844 }];
const browser = await chromium.launch();
let failures = 0;

const measure = (page) => page.evaluate(() => {
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  const spill = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > innerWidth + 0.5) {
      spill.push(`${el.tagName}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')}@${Math.round(r.right - innerWidth)}`);
    }
  }
  return {
    innerW: innerWidth, innerH: innerHeight,
    docW: document.documentElement.scrollWidth,
    spill: spill.slice(0, 4),
    cta: box('#start-game'), turn: box('.turn'), felt: box('.felt'),
    card: box('#card'), totals: box('.totals'), board: box('#scoreboard'),
    roll: box('[data-testid=roll]'),
    undoShown: !!document.querySelector('#undo') && !document.querySelector('#undo').classList.contains('invisible'),
  };
});

const check = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${detail}`);
};

for (const vp of VIEWPORTS) {
  for (const names of [SHORT, LONG]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL pageerror', e.message); });
    await page.goto(URL);
    for (const n of names) {
      await page.getByLabel('Player name', { exact: true }).fill(n);
      await page.getByTestId('add-player').click();
    }
    const setup = await measure(page);
    check(`setup ${vp.width}x${vp.height} n=${names.length}: Start in reach`,
      setup.cta.bottom <= setup.innerH, `cta.bottom=${setup.cta.bottom}/${setup.innerH}`);
    check(`setup ${vp.width}x${vp.height} n=${names.length}: no horizontal spill`,
      setup.docW <= setup.innerW && setup.spill.length === 0, `docW=${setup.docW}/${setup.innerW} ${setup.spill}`);

    await page.getByTestId('start-game').click();
    await page.evaluate(() => { window.__yahtzeeDice = [2, 2, 3, 3, 5]; });
    await page.getByTestId('roll').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')]
      .every((d) => d.getAttribute('data-value')));
    const mid = await measure(page);
    check(`turn ${vp.width}x${vp.height} n=${names.length}: whole turn above the fold`,
      mid.totals.bottom <= mid.innerH, `totals.bottom=${mid.totals.bottom}/${mid.innerH}`);
    check(`turn ${vp.width}x${vp.height} n=${names.length}: roll button in thumb reach`,
      mid.roll.bottom <= mid.innerH && mid.roll.top >= 0, `roll=${mid.roll.top}..${mid.roll.bottom}`);
    check(`turn ${vp.width}x${vp.height} n=${names.length}: no horizontal spill`,
      mid.docW <= mid.innerW && mid.spill.length === 0, `docW=${mid.docW}/${mid.innerW} ${mid.spill}`);

    // record once so the undo button appears, then re-measure: the widest it ever gets
    await page.locator('button[data-testid^="score-"]:not([disabled])').first().click();
    await page.waitForTimeout(250);
    const after = await measure(page);
    check(`undo ${vp.width}x${vp.height} n=${names.length}: shown and no spill`,
      after.undoShown && after.docW <= after.innerW && after.spill.length === 0,
      `shown=${after.undoShown} docW=${after.docW}/${after.innerW} ${after.spill}`);
    await ctx.close();
  }
}
await browser.close();
console.log(failures ? `\n${failures} FIT FAILURES` : '\nall fit checks pass');
process.exit(failures ? 1 : 0);

/** Worst-case names: input maxlength is 16. Board/final rows must not push width. */
import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const NAMES = ['Christopher16', 'XxXxXxXxXxXxXxXx', 'WWWWWWWWWWWWWWWW', 'iiiiiiiiiiiiiiii',
  'Ann-Marie O’Neil', 'José Fernández', "D'Artagnan III", 'Björk Guðmunds'];
const CATS = ['ones','twos','threes','fours','fives','sixes','three-kind','four-kind','full-house','small-straight','large-straight','yahtzee','chance'];
const b = await chromium.launch();
for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:3000/');
  for (const n of NAMES) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  const added = await page.getByTestId('player-chip').count();
  const chipsW = await page.evaluate(() => {
    const doc = document.documentElement;
    return [...document.querySelectorAll('[data-testid=player-chip]')].map(c => { const b = c.getBoundingClientRect(); return { over: Math.round(b.right - innerWidth) }; });
  });
  await page.getByTestId('start-game').click();
  // play 3 rounds to populate the board
  for (let t = 0; t < 3 * added; t++) {
    await page.evaluate(() => { window.__yahtzeeDice = [3, 3, 3, 4, 5]; });
    await page.getByTestId('roll').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
    await page.locator('button[data-testid^="score-"]:not([disabled])').first().click();
  }
  const board = await page.evaluate(() => {
    const doc = document.documentElement;
    const bad = [];
    for (const el of document.querySelectorAll('[data-testid=scoreboard-row] *')) {
      const b = el.getBoundingClientRect();
      if (b.right > innerWidth + 0.5) bad.push(el.className + ':' + Math.round(b.right - innerWidth));
    }
    return { docW: doc.scrollWidth, innerW: innerWidth, bad: bad.slice(0, 4),
      nameOverflow: [...document.querySelectorAll('[data-testid=scoreboard-name]')].map(e => { const b = e.getBoundingClientRect(); const p = e.parentElement.getBoundingClientRect(); return Math.round(b.right - p.right); }) };
  });
  // long name in the turn banner too
  const turn = await page.evaluate(() => { const e = document.querySelector('[data-testid=current-player]'); const b = e.getBoundingClientRect(); return { right: Math.round(b.right), innerW: innerWidth, h: Math.round(b.height) }; });
  console.log(`${vp.width}x${vp.height}: added=${added} chipOverflows=${JSON.stringify(chipsW.map(c=>c.over).filter(n=>n>0))} docW=${board.docW}/${board.innerW} boardBad=${JSON.stringify(board.bad)} nameRightOverflow=${JSON.stringify(board.nameOverflow)} turn=${JSON.stringify(turn)} errs=${errs.length}`);
  await ctx.close();
}
await b.close();

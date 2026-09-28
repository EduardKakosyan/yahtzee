/**
 * Audit the layout extremes the contract suite never reaches: 8 players (widest
 * scoreboard + longest final standings) and an 8-player game-over, on both phones
 * in both themes. Catches overflow / tap-target / contrast regressions in the
 * standings, which is where a passed-around phone actually lives.
 */
import { test, expect } from '@playwright/test';
import { collectVisual } from '../checks/visual';

const NAMES = ['Ana', 'Ben', 'Chloé', 'Dev', 'Mari', 'Sam', 'Tomas', 'Yuki'];
const DICE = [[6,6,6,1,2],[5,5,5,1,2],[4,4,4,1,2],[3,3,3,1,2],[2,2,2,1,3],[1,1,1,2,3],[3,3,3,4,5],[2,2,2,2,5],[2,2,3,3,3],[1,2,3,4,6],[2,3,4,5,6],[5,5,5,5,5],[6,6,5,4,1]];

test('8-player standings stay clean in both themes and both phones', async ({ browser }) => {
  test.setTimeout(600_000);
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      for (const state of (process.env.STATES ? process.env.STATES.split(',') : ['turn', 'over']) as ('turn'|'over')[]) {
        const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
        const page = await ctx.newPage();
        await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        for (const n of NAMES) {
          await page.getByLabel('Player name', { exact: true }).fill(n);
          await page.getByTestId('add-player').click();
        }
        await page.getByTestId('start-game').click();
        if (state === 'over') {
          // finish the game for everyone: always score the first open legal box
          for (let round = 0; round < 13; round++) {
            for (let seat = 0; seat < NAMES.length; seat++) {
              await page.evaluate((v) => { (window as any).__yahtzeeDice = v; }, DICE[round]);
              await page.getByTestId('roll').click();
              await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
              const enabled = page.locator('button[data-testid^="score-"]:not([disabled])');
              await enabled.first().click();
            }
          }
          await expect(page.getByTestId('game-over')).toBeVisible();
          await expect(page.locator('[data-testid="final-row"]')).toHaveCount(NAMES.length);
          await page.waitForTimeout(400);
        } else {
          await page.evaluate(() => { (window as any).__yahtzeeDice = [2, 2, 3, 3, 5]; });
          await page.getByTestId('roll').click();
          await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
        }
        await page.waitForTimeout(250);
        const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
        const geo = await page.evaluate(() => {
          const w = document.documentElement;
          const rows = document.querySelectorAll('[data-testid="scoreboard-row"], [data-testid="final-row"]').length;
          return { docW: w.scrollWidth, innerW: innerWidth, docH: w.scrollHeight, rows };
        });
        const flags: string[] = [];
        if (rep.text.length) flags.push('CONTRAST ' + JSON.stringify(rep.text.slice(0, 4)));
        if (rep.tap.length) flags.push('TAP ' + JSON.stringify(rep.tap.slice(0, 4)));
        if (rep.overflow.length) flags.push('OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 4)));
        if (rep.coverage.length) flags.push('COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 4)));
        console.log(`\n[8p ${vp.width}x${vp.height} ${theme}] ${state} ${JSON.stringify(geo)}\n  ` + (flags.length ? flags.join('\n  ') : 'CLEAN'));
        await page.screenshot({ path: `shots/8p-${vp.width}-${theme}-${state}.png`, fullPage: true });
        await ctx.close();
      }
    }
  }
});

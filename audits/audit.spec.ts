import { test } from '@playwright/test';
import { collectVisual } from '../checks/visual';

const CATS = ['ones','twos','threes','fours','fives','sixes','three-kind','four-kind','full-house','small-straight','large-straight','yahtzee','chance'];
const ANA = [[6,6,6,1,2],[5,5,5,1,2],[4,4,4,1,2],[3,3,3,1,2],[2,2,2,1,3],[1,1,1,2,3],[3,3,3,4,5],[2,2,2,2,5],[2,2,3,3,3],[1,2,3,4,6],[2,3,4,5,6],[5,5,5,5,5],[6,6,5,4,1]];

const STATES = process.env.STATES ? process.env.STATES.split(',') : ['setup','turn-start','mid-turn','game-over'];

test('audit states in both themes and both phones', async ({ browser }) => {
  test.setTimeout(600_000);
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      for (const state of STATES) {
        const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
        const page = await ctx.newPage();
        await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        const names = state === 'game-over' ? ['Ana'] : ['Ana', 'Ben', 'Chloé'];
        for (const n of names) {
          await page.getByLabel('Player name', { exact: true }).fill(n);
          await page.getByTestId('add-player').click();
        }
        if (state !== 'setup') {
          await page.getByTestId('start-game').click();
          if (state === 'mid-turn') {
            await page.evaluate(() => { (window as any).__yahtzeeDice = [2, 2, 3, 3, 5]; });
            await page.getByTestId('roll').click();
            await page.waitForTimeout(450);
            await page.getByTestId('die').nth(0).click();
            await page.getByTestId('die').nth(1).click();
          }
          if (state === 'game-over') {
            for (let i = 0; i < 13; i++) {
              await page.evaluate((v) => {
                const w = window as any;
                w.__yahtzeeDice = (w.__yahtzeeDice || []).concat(v);
              }, ANA[i]);
              await page.getByTestId('roll').click();
              await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
              await page.getByTestId('score-' + CATS[i]).click();
            }
            await page.waitForTimeout(500);
          }
        }
        await page.waitForTimeout(250);
        const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
        const m = await page.evaluate(() => {
          const box = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; };
          const px = (sel: string, prop: string) => { const e = document.querySelector(sel) as HTMLElement | null; return e ? Math.round(parseFloat(getComputedStyle(e)[prop as any])) : 0; };
          return {
            innerH: innerHeight, scrollH: document.documentElement.scrollHeight,
            turn: box('.turn'), felt: box('.felt'), roll: box('[data-testid=roll]'),
            card: box('#card'), totals: box('.totals'), board: box('#scoreboard'),
            namePx: px('.turn-name', 'fontSize'), totalPx: px('#total', 'fontSize'),
            boxH: px('.box', 'height'), boxNamePx: px('.box-name', 'fontSize'),
            diePx: px('.die', 'width'), valuePx: px('.score-value', 'fontSize'),
          };
        });
        const flags: string[] = [];
        if (rep.text.length) flags.push('CONTRAST ' + JSON.stringify(rep.text.slice(0, 5)));
        if (rep.tap.length) flags.push('TAP ' + JSON.stringify(rep.tap.slice(0, 5)));
        if (rep.overflow.length) flags.push('OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 3)));
        if (rep.coverage.length) flags.push('COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 5)));
        console.log(`\n[${vp.width}x${vp.height} ${theme}] ${state}\n  ` + JSON.stringify(m) + '\n  ' + (flags.length ? flags.join('\n  ') : 'CLEAN'));
        await ctx.close();
      }
    }
  }
});

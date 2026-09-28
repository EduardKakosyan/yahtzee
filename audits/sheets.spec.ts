/**
 * Both bottom sheets — "How to play" and the glance standings ("The table") —
 * audited with the same contrast / tap-target / overflow / coverage tooling the
 * contract uses, in both themes on both phones. The contract suite never opens a
 * sheet, so this is the only thing keeping them honest.
 */
import { test, expect } from '@playwright/test';
import { collectVisual } from '../checks/visual';

const NAMES = ['Ana', 'Ben', 'Chloé', 'Dev'];
const DICE = [[6,6,6,6,6],[4,4,5,5,3],[1,2,3,4,5],[2,2,2,6,6]];

test('how-to sheet is clean in both themes and both phones', async ({ browser }) => {
  test.setTimeout(300_000);
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
      await page.goto('/');
      await page.locator('#how-setup').click();
      await page.waitForTimeout(300);
      const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
      const flags = [rep.text.length && 'CONTRAST ' + JSON.stringify(rep.text.slice(0, 4)),
        rep.tap.length && 'TAP ' + JSON.stringify(rep.tap.slice(0, 4)),
        rep.overflow.length && 'OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 3)),
        rep.coverage.length && 'COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 4))].filter(Boolean);
      console.log(`setup sheet [${vp.width} ${theme}]: ` + (flags.length ? '\n  ' + flags.join('\n  ') : 'CLEAN'));
      expect(flags, `how-to sheet ${vp.width} ${theme}`).toEqual([]);
      await page.locator('#how-close').click();
      await ctx.close();
    }
  }
});

test('glance standings sheet is clean in both themes and both phones', async ({ browser }) => {
  test.setTimeout(300_000);
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
      await page.goto('/');
      for (const n of NAMES) {
        await page.getByLabel('Player name', { exact: true }).fill(n);
        await page.getByTestId('add-player').click();
      }
      await page.getByTestId('start-game').click();
      for (let i = 0; i < 4; i++) {
        await page.evaluate((v) => { (window as any).__yahtzeeDice = v; }, DICE[i]);
        await page.getByTestId('roll').click();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
        await page.locator('button[data-testid^="score-"]:not([disabled])').first().click();
      }
      await page.locator('#table-game').click();
      await page.waitForTimeout(300);
      const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
      const flags = [rep.text.length && 'CONTRAST ' + JSON.stringify(rep.text.slice(0, 4)),
        rep.tap.length && 'TAP ' + JSON.stringify(rep.tap.slice(0, 4)),
        rep.overflow.length && 'OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 3)),
        rep.coverage.length && 'COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 4))].filter(Boolean);
      console.log(`table sheet [${vp.width} ${theme}]: ` + (flags.length ? '\n  ' + flags.join('\n  ') : 'CLEAN'));
      expect(flags, `table sheet ${vp.width} ${theme}`).toEqual([]);
      await page.locator('#table-close').click();
      await ctx.close();
    }
  }
});

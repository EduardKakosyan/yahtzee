/**
 * Real-dice mode audited with the same contrast / tap-target / overflow / coverage
 * tooling the contract uses. The contract suite only ever plays on the phone, so
 * the keypad, the five slots and the dice-mode sheet are measured only here.
 */
import { test, expect } from '@playwright/test';
import { collectVisual } from '../checks/visual';

const NAMES = ['Ana', 'Ben', 'Chloé'];
const FACES = [4, 4, 4, 4, 5];

async function openAsTable(page) {
  await page.getByTestId('dice-table').click();
  for (const n of NAMES) {
    await page.getByLabel('Player name', { exact: true }).fill(n);
    await page.getByTestId('add-player').click();
  }
}

test('real-dice states are clean in both themes and both phones', async ({ browser }) => {
  test.setTimeout(600_000);
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
      await page.goto('/');

      const scan = async (label: string) => {
        await page.waitForTimeout(260);
        const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
        const geo = await page.evaluate(() => {
          const h = (s: string) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
          const w = (s: string) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : 0; };
          return {
            docH: document.documentElement.scrollHeight, innerH: innerHeight, docW: document.documentElement.scrollWidth,
            key: h('.key'), keyW: w('.key'), slot: h('.slot'), tool: h('#entry-clear'), box: h('.box'),
            cardBottom: Math.round(document.querySelector('#card')?.getBoundingClientRect().bottom ?? 0),
            count: document.querySelector('#entry-count')?.textContent,
          };
        });
        const flags = [
          rep.text.length && 'CONTRAST ' + JSON.stringify(rep.text.slice(0, 5)),
          rep.tap.length && 'TAP ' + JSON.stringify(rep.tap.slice(0, 5)),
          rep.overflow.length && 'OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 3)),
          rep.coverage.length && 'COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 4)),
        ].filter(Boolean);
        console.log(`\n[rd ${vp.width}x${vp.height} ${theme}] ${label} ${JSON.stringify(geo)}\n  ` + (flags.length ? flags.join('\n  ') : 'CLEAN'));
        expect(flags, `${label} at ${vp.width}x${vp.height} ${theme}`).toEqual([]);
        await page.screenshot({ path: `shots/rd-${vp.width}-${theme}-${label}.png`, fullPage: true });
      };

      await openAsTable(page);
      await scan('setup');

      await page.getByTestId('start-game').click();
      await scan('empty');

      // four of five in: nothing recordable, keypad still fully tappable
      for (const f of [4, 4, 4, 5]) await page.locator(`[data-testid="entry-key"][data-face="${f}"]`).click();
      await scan('4-of-5');

      await page.locator('[data-testid="entry-key"][data-face="4"]').click();
      await scan('5-of-5');

      // one die selected (mid-correction) — the pending ring must not break anything
      await page.locator('[data-testid="entry-slot"]').nth(0).click();
      await scan('correcting');

      // a recorded box with Undo still live on the next player's turn
      await page.locator('[data-testid="entry-key"][data-face="2"]').click();
      await page.locator('button[data-testid^="score-"]:not([disabled])').first().click();
      await page.waitForTimeout(300);
      await scan('undo-window');

      // the dice-mode sheet itself
      await page.locator('#dice-game').click();
      await page.waitForTimeout(250);
      await scan('mode-sheet');
      await page.locator('#dice-sheet-close').click();

      await ctx.close();
    }
  }
});

test('real-dice mode with eight players stays clean', async ({ browser }) => {
  test.setTimeout(600_000);
  const eight = ['Ana', 'Ben', 'Chloé', 'Dev', 'Mari', 'Sam', 'Tomas', 'Yuki'];
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
      await page.goto('/');
      await page.getByTestId('dice-table').click();
      for (const n of eight) {
        await page.getByLabel('Player name', { exact: true }).fill(n);
        await page.getByTestId('add-player').click();
      }
      await page.getByTestId('start-game').click();
      for (const f of FACES) await page.locator(`[data-testid="entry-key"][data-face="${f}"]`).click();
      await page.waitForTimeout(300);
      const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
      const flags = [
        rep.text.length && 'CONTRAST ' + JSON.stringify(rep.text.slice(0, 4)),
        rep.tap.length && 'TAP ' + JSON.stringify(rep.tap.slice(0, 4)),
        rep.overflow.length && 'OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 4)),
        rep.coverage.length && 'COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 4)),
      ].filter(Boolean);
      console.log(`[rd8p ${vp.width}x${vp.height} ${theme}]: ` + (flags.length ? '\n  ' + flags.join('\n  ') : 'CLEAN'));
      expect(flags, `8-player real-dice at ${vp.width} ${theme}`).toEqual([]);
      await ctx.close();
    }
  }
});

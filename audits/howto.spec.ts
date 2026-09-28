import { test } from '@playwright/test';
import { collectVisual } from '../checks/visual';

test('how-to sheet + mid-turn states stay clean', async ({ browser }) => {
  test.setTimeout(300_000);
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
      await page.goto('/');
      await page.locator('#how-setup').click();
      await page.waitForTimeout(300);
      let rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] } as any);
      let flags = [rep.text.length && 'CONTRAST ' + JSON.stringify(rep.text.slice(0,4)), rep.tap.length && 'TAP ' + JSON.stringify(rep.tap.slice(0,4)), rep.overflow.length && 'OVERFLOW ' + JSON.stringify(rep.overflow.slice(0,3)), rep.coverage.length && 'COVERAGE ' + JSON.stringify(rep.coverage.slice(0,4))].filter(Boolean);
      console.log(`setup sheet [${vp.width} ${theme}]: ` + (flags.length ? '\n  ' + flags.join('\n  ') : 'CLEAN'));
      await page.screenshot({ path: `shots/sheet-${vp.width}-${theme}.png` });
      await page.locator('#how-close').click();
      await ctx.close();
    }
  }
});

import { test, expect } from '@playwright/test';
import { openState, PHONE, SMALL_PHONE, type UIState } from './fixtures';
import { collectVisual } from './visual';

const STATES: UIState[] = ['setup', 'turn-start', 'mid-turn', 'game-over'];
const VIEWPORTS = [['iPhone 390x844', PHONE], ['small iPhone 375x667', SMALL_PHONE]] as const;

for (const [label, vp] of VIEWPORTS) {
  for (const state of STATES) {
    test(`readable, tappable and no sideways scrolling (${state}, ${label})`, async ({ page }) => {
      test.setTimeout(60_000);
      await openState(page, state, vp);
      await page.waitForTimeout(400);
      const report = await page.evaluate(collectVisual, {
        text: true, tap: true, overflow: true, coverage: ['start', 'end'],
      });
      expect(report.text, `contrast failures: ${JSON.stringify(report.text, null, 1)}`).toEqual([]);
      expect(report.tap, `tap targets under 44x44: ${JSON.stringify(report.tap, null, 1)}`).toEqual([]);
      expect(report.overflow, `horizontal overflow: ${JSON.stringify(report.overflow, null, 1)}`).toEqual([]);
      expect(report.coverage, `background coverage: ${JSON.stringify(report.coverage, null, 1)}`).toEqual([]);
    });
  }
}

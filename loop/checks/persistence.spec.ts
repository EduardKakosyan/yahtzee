import { test, expect } from '@playwright/test';
import { startGame, roll, scoreButton, diceValues, scoreValue } from './fixtures';

test('reloading the page mid-turn (or Safari reopening it) resumes exactly where the table was', async ({ page }) => {
  await startGame(page, ['Ana', 'Ben']);
  await roll(page, [4, 4, 4, 1, 2]);
  await scoreButton(page, 'fours').click();
  await expect(page.getByTestId('current-player')).toHaveText('Ben');

  await roll(page, [5, 5, 2, 3, 6]);
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('die').nth(1).click();

  await page.reload();
  await expect(page.getByTestId('game')).toBeVisible();
  await expect(page.getByTestId('current-player')).toHaveText('Ben');
  await expect(page.getByTestId('rolls-left')).toHaveText('2');
  expect(await diceValues(page)).toEqual(['5', '5', '2', '3', '6']);
  await expect(page.getByTestId('die').nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('die').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('die').nth(2)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('scoreboard-row').nth(0).getByTestId('scoreboard-total')).toHaveText('12');

  await roll(page, [5, 5, 5], [5, 5, 5, 5, 5]);
  await expect(scoreValue(page, 'yahtzee')).toHaveText('50');
});

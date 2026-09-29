import { test, expect } from '@playwright/test';
import { startGame, roll, diceValues, scoreButton, CATEGORIES } from './fixtures';

test('a turn has three rolls; held dice keep their value; the roll button stops at zero', async ({ page }) => {
  await startGame(page, ['Ana']);
  const dice = page.getByTestId('die');
  const rollsLeft = page.getByTestId('rolls-left');
  await expect(dice).toHaveCount(5);
  await expect(rollsLeft).toHaveText('3');

  // Before the first roll, dice cannot be held.
  await dice.nth(0).click();
  await expect(dice.nth(0)).toHaveAttribute('aria-pressed', 'false');

  await roll(page, [1, 2, 3, 4, 5]);
  await expect(rollsLeft).toHaveText('2');
  await dice.nth(0).click();
  await dice.nth(1).click();
  await expect(dice.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(dice.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(dice.nth(2)).toHaveAttribute('aria-pressed', 'false');

  await roll(page, [6, 6, 6], [1, 2, 6, 6, 6]);
  await expect(rollsLeft).toHaveText('1');

  await dice.nth(0).click();
  await expect(dice.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await roll(page, [4, 5, 5, 5], [4, 2, 5, 5, 5]);
  await expect(rollsLeft).toHaveText('0');
  await expect(page.getByTestId('roll')).toBeDisabled();
});

test('scoring needs a roll first; a recorded box cannot be used again; the next turn starts fresh', async ({ page }) => {
  await startGame(page, ['Ana']);
  for (const c of CATEGORIES) await expect(scoreButton(page, c)).toBeDisabled();

  await roll(page, [3, 3, 3, 5, 2]);
  await page.getByTestId('die').nth(0).click();
  await scoreButton(page, 'threes').click();

  await expect(scoreButton(page, 'threes')).toHaveAttribute('data-state', 'recorded');
  await expect(scoreButton(page, 'threes').getByTestId('score-value')).toHaveText('9');
  await expect(page.getByTestId('rolls-left')).toHaveText('3');
  await expect(page.getByTestId('round')).toContainText('Round 2 of 13');
  expect(await diceValues(page)).toEqual(['', '', '', '', '']);
  for (let i = 0; i < 5; i++) await expect(page.getByTestId('die').nth(i)).toHaveAttribute('aria-pressed', 'false');
  for (const c of CATEGORIES) await expect(scoreButton(page, c)).toBeDisabled();

  await roll(page, [3, 3, 1, 1, 1]);
  await expect(scoreButton(page, 'threes')).toBeDisabled();
  await expect(scoreButton(page, 'threes').getByTestId('score-value')).toHaveText('9');
  await expect(scoreButton(page, 'ones')).toBeEnabled();
});

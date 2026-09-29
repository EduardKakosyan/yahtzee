import { test, expect, type Page } from '@playwright/test';
import { startGame, roll, scoreValue, scoreButton, scoreFor, CATEGORIES } from './fixtures';

async function expectPotentials(page: Page, dice: number[]) {
  for (const c of CATEGORIES) {
    await expect(scoreButton(page, c), `${c} should be open`).toHaveAttribute('data-state', 'open');
    await expect(scoreValue(page, c), `${c} for ${dice.join(',')}`).toHaveText(String(scoreFor(c, dice)));
  }
}

test('every open box shows what the roll would score: upper section, three of a kind, full house, small straight', async ({ page }) => {
  await startGame(page, ['Ana']);
  await roll(page, [3, 3, 3, 5, 2]);
  await expectPotentials(page, [3, 3, 3, 5, 2]);
  await roll(page, [2, 2, 3, 3, 3]);
  await expectPotentials(page, [2, 2, 3, 3, 3]);
  await roll(page, [1, 2, 3, 4, 6]);
  await expectPotentials(page, [1, 2, 3, 4, 6]);
});

test('large straight, four of a kind, a small straight with a pair, and a Yahtzee (which is not a full house)', async ({ page }) => {
  await startGame(page, ['Ana']);
  await roll(page, [2, 3, 4, 5, 6]);
  await expectPotentials(page, [2, 3, 4, 5, 6]);
  await roll(page, [5, 5, 5, 5, 1]);
  await expectPotentials(page, [5, 5, 5, 5, 1]);
  await roll(page, [3, 4, 5, 6, 3]);
  await expectPotentials(page, [3, 4, 5, 6, 3]);
  await scoreButton(page, 'chance').click();

  await roll(page, [6, 6, 6, 6, 6]);
  for (const c of CATEGORIES.filter((c) => c !== 'chance')) {
    await expect(scoreValue(page, c)).toHaveText(String(scoreFor(c, [6, 6, 6, 6, 6])));
  }
  await expect(scoreValue(page, 'full-house')).toHaveText('0');
  await expect(scoreValue(page, 'yahtzee')).toHaveText('50');
});

test('the upper bonus: 35 once the upper section reaches 63, and the totals add up', async ({ page }) => {
  await startGame(page, ['Ana']);
  const plan: [number[], (typeof CATEGORIES)[number]][] = [
    [[6, 6, 6, 1, 2], 'sixes'], [[5, 5, 5, 1, 2], 'fives'], [[4, 4, 4, 1, 2], 'fours'],
    [[3, 3, 3, 1, 2], 'threes'], [[2, 2, 2, 1, 3], 'twos'],
  ];
  for (const [d, c] of plan) { await roll(page, d); await scoreButton(page, c).click(); }
  await expect(page.getByTestId('upper-subtotal')).toHaveText('60');
  await expect(page.getByTestId('upper-bonus')).toHaveText('0');

  await roll(page, [1, 1, 1, 2, 3]);
  await scoreButton(page, 'ones').click();
  await expect(page.getByTestId('upper-subtotal')).toHaveText('63');
  await expect(page.getByTestId('upper-bonus')).toHaveText('35');
  await expect(page.getByTestId('total')).toHaveText('98');
  await expect(page.getByTestId('scoreboard-row').nth(0).getByTestId('scoreboard-total')).toHaveText('98');
});

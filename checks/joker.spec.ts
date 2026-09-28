import { test, expect } from '@playwright/test';
import { startGame, roll, scoreButton, scoreValue, CATEGORIES, type Category } from './fixtures';

async function expectOnlyEnabled(page: import('@playwright/test').Page, allowed: Category[]) {
  for (const c of CATEGORIES) {
    const b = scoreButton(page, c);
    if (allowed.includes(c)) await expect(b, `${c} should be allowed`).toBeEnabled();
    else await expect(b, `${c} should not be allowed`).toBeDisabled();
  }
}

test('a second Yahtzee earns a 100 bonus and must go in its upper box when that box is open', async ({ page }) => {
  await startGame(page, ['Ana']);
  await roll(page, [2, 2, 2, 2, 2]);
  await scoreButton(page, 'yahtzee').click();
  await expect(scoreValue(page, 'yahtzee')).toHaveText('50');
  await expect(page.getByTestId('yahtzee-bonus')).toHaveText('0');

  await roll(page, [4, 4, 4, 4, 4]);
  await expectOnlyEnabled(page, ['fours']);
  await expect(scoreValue(page, 'fours')).toHaveText('20');
  await scoreButton(page, 'fours').click();
  await expect(page.getByTestId('yahtzee-bonus')).toHaveText('100');
  await expect(page.getByTestId('total')).toHaveText('170');
});

test('Joker: with the upper box filled, a Yahtzee scores any open lower box at full value (full house 25, straights 30 and 40)', async ({ page }) => {
  await startGame(page, ['Ana']);
  await roll(page, [2, 2, 2, 2, 2]);
  await scoreButton(page, 'yahtzee').click();
  await roll(page, [3, 3, 3, 1, 2]);
  await scoreButton(page, 'threes').click();

  await roll(page, [3, 3, 3, 3, 3]);
  await expectOnlyEnabled(page, ['three-kind', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'chance']);
  await expect(scoreValue(page, 'full-house')).toHaveText('25');
  await expect(scoreValue(page, 'small-straight')).toHaveText('30');
  await expect(scoreValue(page, 'large-straight')).toHaveText('40');
  await expect(scoreValue(page, 'three-kind')).toHaveText('15');
  await expect(scoreValue(page, 'four-kind')).toHaveText('15');
  await expect(scoreValue(page, 'chance')).toHaveText('15');
  await scoreButton(page, 'large-straight').click();
  await expect(scoreValue(page, 'large-straight')).toHaveText('40');
  await expect(page.getByTestId('yahtzee-bonus')).toHaveText('100');
});

test('a Yahtzee box scored 0 earns no bonus, but the Joker placement rule still applies', async ({ page }) => {
  await startGame(page, ['Ana']);
  await roll(page, [1, 2, 3, 4, 6]);
  await scoreButton(page, 'yahtzee').click();
  await expect(scoreValue(page, 'yahtzee')).toHaveText('0');

  await roll(page, [5, 5, 5, 5, 5]);
  await expectOnlyEnabled(page, ['fives']);
  await scoreButton(page, 'fives').click();
  await expect(scoreValue(page, 'fives')).toHaveText('25');
  await expect(page.getByTestId('yahtzee-bonus')).toHaveText('0');
});

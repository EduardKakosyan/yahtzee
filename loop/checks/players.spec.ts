import { test, expect } from '@playwright/test';
import { addPlayers, PHONE, roll, scoreButton } from './fixtures';

test('the first visit shows the player setup; players are added in order, by button or Enter', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByTestId('game')).toBeHidden();
  await expect(page.getByTestId('start-game')).toBeDisabled();

  await addPlayers(page, ['Ana', 'Ben']);
  const input = page.getByLabel('Player name', { exact: true });
  await input.fill('Chloé');
  await input.press('Enter');
  await expect(page.getByTestId('player-chip')).toHaveCount(3);
  await expect(page.getByTestId('player-chip').nth(0)).toContainText('Ana');
  await expect(page.getByTestId('player-chip').nth(1)).toContainText('Ben');
  await expect(page.getByTestId('player-chip').nth(2)).toContainText('Chloé');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('start-game')).toBeEnabled();
});

test('blank and duplicate names are not added, a player can be removed, and at most 8 can play', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await addPlayers(page, ['Ana', '   ', 'ana', 'Ben']);
  await expect(page.getByTestId('player-chip')).toHaveCount(2);

  await page.getByTestId('player-chip').nth(0).getByTestId('remove-player').click();
  await expect(page.getByTestId('player-chip')).toHaveCount(1);
  await expect(page.getByTestId('player-chip').nth(0)).toContainText('Ben');

  await addPlayers(page, ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  await expect(page.getByTestId('player-chip')).toHaveCount(8);
  await expect(page.getByTestId('add-player')).toBeDisabled();
});

test('turns pass around the table in seating order, round by round', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await addPlayers(page, ['Ana', 'Ben', 'Chloé']);
  await page.getByTestId('start-game').click();

  const current = page.getByTestId('current-player');
  const round = page.getByTestId('round');
  await expect(current).toHaveText('Ana');
  await expect(round).toContainText('Round 1 of 13');

  await roll(page, [1, 1, 2, 3, 4]);
  await scoreButton(page, 'ones').click();
  await expect(current).toHaveText('Ben');
  await expect(round).toContainText('Round 1 of 13');

  await roll(page, [6, 6, 6, 2, 3]);
  await scoreButton(page, 'sixes').click();
  await expect(current).toHaveText('Chloé');

  await roll(page, [5, 5, 1, 2, 3]);
  await scoreButton(page, 'fives').click();
  await expect(current).toHaveText('Ana');
  await expect(round).toContainText('Round 2 of 13');

  // Ana's own card still has her score; the scoreboard shows everyone's totals.
  await expect(scoreButton(page, 'ones')).toHaveAttribute('data-state', 'recorded');
  await expect(scoreButton(page, 'ones').getByTestId('score-value')).toHaveText('2');
  const rows = page.getByTestId('scoreboard-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByTestId('scoreboard-name')).toHaveText('Ana');
  await expect(rows.nth(0).getByTestId('scoreboard-total')).toHaveText('2');
  await expect(rows.nth(1).getByTestId('scoreboard-total')).toHaveText('18');
  await expect(rows.nth(2).getByTestId('scoreboard-total')).toHaveText('10');
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');
});

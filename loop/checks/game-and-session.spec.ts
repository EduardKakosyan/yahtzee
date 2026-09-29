import { test, expect } from '@playwright/test';
import { startGame, playRounds, ANA, BEN, planTotal, roll, scoreButton } from './fixtures';

test('a full two-player game ends after 13 rounds with the winner and final standings; "Play again" keeps the players, rotates who starts, and tallies the session', async ({ page }) => {
  test.setTimeout(120_000);
  const names = ['Ana', 'Ben'];
  await startGame(page, names);
  await playRounds(page, names, [ANA, BEN], 13);

  const anaTotal = planTotal(ANA);
  const benTotal = planTotal(BEN);
  expect(anaTotal).toBe(296);
  expect(benTotal).toBe(62);

  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible();
  await expect(page.getByTestId('winner')).toContainText('Ana');
  await expect(page.getByTestId('winner')).not.toContainText('Ben');
  const rows = page.getByTestId('final-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByTestId('final-name')).toHaveText('Ana');
  await expect(rows.nth(0).getByTestId('final-total')).toHaveText(String(anaTotal));
  await expect(rows.nth(1).getByTestId('final-name')).toHaveText('Ben');
  await expect(rows.nth(1).getByTestId('final-total')).toHaveText(String(benTotal));

  await expect(page.getByTestId('games-played')).toContainText('1');
  const session = page.getByTestId('session-row');
  await expect(session).toHaveCount(2);
  await expect(session.nth(0).getByTestId('session-name')).toHaveText('Ana');
  await expect(session.nth(0).getByTestId('session-wins')).toHaveText('1');
  await expect(session.nth(0).getByTestId('session-points')).toHaveText(String(anaTotal));
  await expect(session.nth(1).getByTestId('session-wins')).toHaveText('0');
  await expect(session.nth(1).getByTestId('session-points')).toHaveText(String(benTotal));

  // Next game: same players, Ben starts, clean scorecards.
  await page.getByTestId('play-again').click();
  await expect(over).toBeHidden();
  await expect(page.getByTestId('current-player')).toHaveText('Ben');
  await expect(page.getByTestId('round')).toContainText('Round 1 of 13');
  await expect(page.getByTestId('scoreboard-row')).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(page.getByTestId('scoreboard-row').nth(i).getByTestId('scoreboard-total')).toHaveText('0');
  }
  await expect(scoreButton(page, 'sixes')).toHaveAttribute('data-state', 'open');
  await roll(page, [6, 6, 1, 2, 3]);
  await scoreButton(page, 'sixes').click();
  await expect(page.getByTestId('current-player')).toHaveText('Ana');
});

test('a tie names every tied player as a winner and counts a win for each', async ({ page }) => {
  test.setTimeout(120_000);
  const names = ['Ana', 'Ben'];
  await startGame(page, names);
  await playRounds(page, names, [ANA, ANA], 13);
  await expect(page.getByTestId('game-over')).toBeVisible();
  await expect(page.getByTestId('winner')).toContainText('Ana');
  await expect(page.getByTestId('winner')).toContainText('Ben');
  const session = page.getByTestId('session-row');
  await expect(session.nth(0).getByTestId('session-wins')).toHaveText('1');
  await expect(session.nth(1).getByTestId('session-wins')).toHaveText('1');
});

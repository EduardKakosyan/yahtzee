import { test, expect } from '@playwright/test';
import { newGame, rollDice, record, sessionFromGame, mergeSession, CATEGORIES } from '../src/rules.js';

const KEY = 'yahtzee.state.v1';
async function saved(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
}
async function setup(page, table = false) {
  await page.goto('./');
  await page.getByLabel('Player name', { exact: true }).fill('Ana');
  await page.getByTestId('add-player').click();
  await page.getByLabel('Player name', { exact: true }).fill('Ben');
  await page.getByTestId('add-player').click();
  if (table) await page.locator('#dice-table').click();
  await page.getByTestId('start-game').click();
}
async function roll(page) {
  await page.evaluate(() => { window.__yahtzeeDice = [1, 2, 3, 4, 5]; });
  await page.getByTestId('roll').click();
}
async function options(page) {
  await page.locator('#game-options').click();
  await expect(page.locator('#game-options-sheet')).toBeVisible();
}
async function action(page, id) {
  await options(page);
  await page.locator(id).click();
  await page.locator('#game-confirm-accept').click();
}

test('reset is available on a phone, confirms, persists and preserves players and preferences', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, true);
  for (const face of [1, 2, 3, 4, 5]) await page.locator(`.key[data-face="${face}"]`).click();
  await page.getByTestId('score-chance').click();
  const before = await saved(page);
  await options(page);
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(page.locator('#game-options-close')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#option-undo')).toBeFocused();
  await page.locator('#option-reset').click();
  await expect(page.locator('#game-confirm-cancel')).toBeFocused();
  await page.locator('#game-confirm-cancel').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-options')).toBeFocused();
  expect(await saved(page)).toEqual(before);
  await action(page, '#option-reset');
  await expect(page.getByTestId('current-player')).toHaveText('Ana');
  await expect(page.locator('#entry-count')).toHaveText('0 of 5');
  await page.reload();
  const s = await saved(page);
  expect(s.game.turnNumber).toBe(0);
  expect(s.game.history).toEqual([]);
  expect(s.players).toEqual(['Ana', 'Ben']);
  expect(s.game.players[0].card.chance).toBeNull();
  await expect(page.locator('#dice')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('menu undoes several turns after the next player rolls and after reload', async ({ page }) => {
  await setup(page);
  await roll(page);
  await page.getByTestId('die').first().click();
  await page.getByTestId('score-chance').click();
  await roll(page);
  await page.getByTestId('score-ones').click();
  await roll(page);
  await page.reload();
  await action(page, '#option-undo');
  await expect(page.getByTestId('current-player')).toHaveText('Ben');
  await expect(page.getByTestId('score-ones')).toHaveAttribute('data-state', 'open');
  await action(page, '#option-undo');
  await expect(page.getByTestId('current-player')).toHaveText('Ana');
  await expect(page.getByTestId('die').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rolls-left')).toHaveText('2');
  await expect(page.getByTestId('score-chance')).toBeEnabled();
  expect((await saved(page)).game.turnNumber).toBe(0);
  await options(page);
  await expect(page.locator('#option-undo')).toBeDisabled();
});

test('restart current turn and change players are safe and confirmed', async ({ page }) => {
  await setup(page);
  await roll(page);
  await page.getByTestId('score-chance').click();
  await roll(page);
  await action(page, '#option-restart-turn');
  await expect(page.getByTestId('current-player')).toHaveText('Ben');
  await expect(page.getByTestId('rolls-left')).toHaveText('3');
  expect((await saved(page)).game.players[0].card.chance).toBe(15);
  await options(page);
  await expect(page.locator('#option-restart-turn')).toBeDisabled();
  await page.locator('#option-players').click();
  await page.locator('#game-confirm-accept').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByTestId('player-chip')).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('setup')).toBeVisible();
});

test('undo and reset a completed game correct the tally without losing earlier games', async ({ page }) => {
  const complete = () => {
    const g = newGame(['Ana', 'Ben']);
    for (const cat of CATEGORIES) for (let p = 0; p < 2; p++) {
      let i = 0;
      rollDice(g, () => [1, 2, 3, 4, 5][i++]);
      record(g, cat);
    }
    return g;
  };
  const earlier = sessionFromGame(complete());
  const g = complete();
  const total = mergeSession(structuredClone(earlier), g);
  await page.goto('./');
  await page.evaluate(({ key, g, total }) => {
    localStorage.setItem(key, JSON.stringify({ schema: 1, screen: 'over', players: ['Ana', 'Ben'], game: g, session: total }));
  }, { key: KEY, g, total });
  await page.reload();
  await expect(page.getByTestId('games-played')).toHaveText('2');
  await page.locator('#game-options-over').click();
  await page.locator('#option-undo').click();
  await page.locator('#game-confirm-accept').click();
  expect((await saved(page)).session.players).toEqual(earlier.players);
  expect((await saved(page)).session.gamesPlayed).toBe(1);
  await page.reload();
  await expect(page.getByTestId('current-player')).toHaveText('Ben');
  await page.getByTestId('score-chance').click();
  await expect(page.getByTestId('games-played')).toHaveText('2');
  expect((await saved(page)).session).toEqual(total);
  await page.locator('#game-options-over').click();
  await page.locator('#option-reset').click();
  await page.locator('#game-confirm-accept').click();
  expect((await saved(page)).session.players).toEqual(earlier.players);
  expect((await saved(page)).session.gamesPlayed).toBe(1);
  await expect(page.getByTestId('round')).toHaveText('Round 1 of 13');
});

test('undo restores real dice entry, and switching from phone to table remains usable', async ({ page }) => {
  await setup(page);
  await roll(page);
  await page.locator('#dice-game').click();
  await page.locator('#dice-sheet-table').click();
  await page.locator('#dice-sheet-close').click();
  await expect(page.locator('#entry-count')).toHaveText('5 of 5');
  await page.getByTestId('score-chance').click();
  await page.locator('.key[data-face="6"]').click();
  await action(page, '#option-undo');
  await expect(page.locator('#entry-count')).toHaveText('5 of 5');
  await expect(page.getByTestId('score-chance')).toBeEnabled();
  await page.getByTestId('score-chance').click();
  await expect(page.getByTestId('current-player')).toHaveText('Ben');
});

test('Game menu fits both phone sizes with readable labels and touch targets', async ({ page }, testInfo) => {
  await setup(page);
  await roll(page);
  await page.getByTestId('score-chance').click();
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 844 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await options(page);
      await page.locator('#game-options-sheet .sheet').evaluate((sheet) => Promise.all(sheet.getAnimations().map((a) => a.finished)));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const boxes = await page.locator('#game-options-sheet button:visible').evaluateAll((buttons) => buttons.map((b) => {
        const rect = b.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, bottom: rect.bottom };
      }));
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        expect(box.bottom).toBeLessThanOrEqual(width === 375 ? 667 : 844);
      }
      await page.screenshot({ path: testInfo.outputPath(`game-options-${width}-${theme}.png`) });
      await page.locator('#game-options-close').click();
    }
  }
});

/**
 * Session boundaries the contract suite does not assert: the evening tally only
 * survives for the same roster, "Play again" rotates who starts, and changing the
 * player list really does start a fresh evening (brief: "Changing the player list
 * starts a new session").
 *
 *   node scripts/session-reset.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.env.SHOT_URL || 'http://localhost:3000/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const ok = [];
const bad = [];
const want = (label, cond) => (cond ? ok : bad).push(label);

const addPlayers = async (names) => {
  for (const n of names) {
    await page.getByLabel('Player name', { exact: true }).fill(n);
    await page.getByTestId('add-player').click();
  }
};
/** Finish the current game for whoever is seated, scoring the first legal box. */
const finishGame = async () => {
  for (let t = 0; t < 13 * 8 && !(await page.getByTestId('game-over').isVisible()); t++) {
    await page.evaluate(() => { window.__yahtzeeDice = [1, 2, 3, 4, 5]; });
    await page.getByTestId('roll').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')]
      .every((d) => d.getAttribute('data-value')));
    await page.locator('button[data-testid^="score-"]:not([disabled])').first().click();
  }
  await page.waitForTimeout(250);
};

await page.goto(URL);
await addPlayers(['Ana']);
await page.getByTestId('start-game').click();
await finishGame();
want('first game counts as one game', (await page.getByTestId('games-played').textContent()) === '1');

await page.getByTestId('play-again').click();
await page.waitForTimeout(250);
want('Play again with one player keeps Ana starting',
  (await page.getByTestId('current-player').textContent()) === 'Ana');
await finishGame();
want('second game increments the evening tally',
  (await page.getByTestId('games-played').textContent()) === '2');

// back to setup: the same roster still sees tonight's tally
await page.getByTestId('change-players').click();
await page.waitForTimeout(300);
want('same roster still shows the evening tally', await page.locator('#evening').isVisible());

// add a player -> fresh evening
await addPlayers(['Ben']);
await page.waitForTimeout(250);
want('changing the roster starts a new session (tally hidden)',
  !(await page.locator('#evening').isVisible()));
await page.getByTestId('start-game').click();
await page.waitForTimeout(250);
want('new roster starts at seat 1 rather than a rotated index',
  (await page.getByTestId('current-player').textContent()) === 'Ana');
await finishGame();
want('new roster finishes with a fresh tally of one game',
  (await page.getByTestId('games-played').textContent()) === '1');
const wins = await page.locator('[data-testid=session-wins]').allTextContents();
want('a tie credits both players with a win', wins.length === 2 && wins.every((w) => w === wins[0]));

await browser.close();
for (const l of ok) console.log('  ok   ' + l);
for (const l of bad) console.log('  FAIL ' + l);
console.log(bad.length ? `\n${bad.length} SESSION FAILURES` : '\nsession boundaries are clean');
process.exit(bad.length ? 1 : 0);

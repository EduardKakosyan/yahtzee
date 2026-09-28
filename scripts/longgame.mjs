/** Plays three whole games with three players using fair random dice, choosing a random
 *  legal box each turn, then re-checks every score against the official rules. */
import { chromium } from '@playwright/test';
import { CATEGORIES, UPPER, scoreFor, allowedBoxes, potential, jokerRule, upperSubtotal, upperBonus, grandTotal } from '../src/rules.js';

const BASE = process.env.SHOT_URL || 'http://localhost:3210/';
const NAMES = ['Ana', 'Ben', 'Chloé'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

await page.goto(BASE);
for (const n of NAMES) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
await page.getByTestId('start-game').click();

const recorded = Object.fromEntries(NAMES.map((n) => [n, {}]));
let turn = 0;

async function oneTurn() {
  const dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
  await page.evaluate((v) => { window.__yahtzeeDice = v; }, dice);
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')), null, { timeout: 5000 });
  const shown = await page.getByTestId('die').evaluateAll((e) => e.map((x) => Number(x.getAttribute('data-value'))));
  if (JSON.stringify(shown) !== JSON.stringify(dice)) throw new Error(`dice mismatch ${shown} vs ${dice}`);
  const card = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('yahtzee.state.v1'));
    return s.game.players[s.game.turnIndex].card;
  });
  const pickable = await page.locator('.box:not([disabled])').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('score-', '')));
  const want = allowedBoxes(card, dice);
  if (JSON.stringify(pickable) !== JSON.stringify(want)) throw new Error(`allowed mismatch ${pickable} vs ${want} dice ${dice}`);
  const cat = want[Math.floor(Math.random() * want.length)];
  const expect = potential(card, cat, dice);
  const shownValue = await page.getByTestId(`score-${cat}`).getByTestId('score-value').textContent();
  if (Number(shownValue) !== expect) throw new Error(`potential mismatch ${cat}: ${shownValue} vs ${expect} (dice ${dice})`);
  const who = await page.getByTestId('current-player').textContent();
  await page.getByTestId(`score-${cat}`).click();
  recorded[who][cat] = expect;
  turn += 1;
}

for (let game = 0; game < 3; game++) {
  for (let i = 0; i < 13 * NAMES.length; i++) await oneTurn();
  await page.waitForTimeout(500);
  const over = await page.getByTestId('game-over').isVisible();
  if (!over) throw new Error(`game ${game + 1} did not finish`);
  const winner = await page.getByTestId('winner').textContent();
  const games = await page.getByTestId('games-played').textContent();
  const finals = await page.getByTestId('final-row').evaluateAll((els) => els.map((e) => [e.querySelector('[data-testid=final-name]').textContent, Number(e.querySelector('[data-testid=final-total]').textContent)]));
  const session = await page.getByTestId('session-row').evaluateAll((els) => els.map((e) => [e.querySelector('[data-testid=session-name]').textContent, Number(e.querySelector('[data-testid=session-wins]').textContent), Number(e.querySelector('[data-testid=session-points]').textContent)]));
  // recompute from what we recorded
  const totals = NAMES.map((n) => {
    const card = { yahtzeeBonus: 0 };
    CATEGORIES.forEach((k) => { card[k] = recorded[n][k]; });
    return grandTotal(card);
  });
  const expectedOrder = NAMES.map((n, i) => [n, totals[i]]).sort((a, b) => b[1] - a[1] || NAMES.indexOf(a[0]) - NAMES.indexOf(b[0]));
  if (JSON.stringify(finals) !== JSON.stringify(expectedOrder)) throw new Error(`standings mismatch ${JSON.stringify(finals)} vs ${JSON.stringify(expectedOrder)}`);
  const best = Math.max(...totals);
  const expectWinner = NAMES.filter((_, i) => totals[i] === best).join(' & ');
  if (winner !== expectWinner) throw new Error(`winner mismatch ${winner} vs ${expectWinner}`);
  if (Number(games) !== game + 1) throw new Error(`games-played ${games} vs ${game + 1}`);
  const pointsOk = session.every((row, i) => row[2] >= totals[i]);
  if (!pointsOk) throw new Error('session points went backwards');
  const starter = await (async () => {
    await page.getByTestId('play-again').click();
    await page.waitForTimeout(200);
    return page.getByTestId('current-player').textContent();
  })();
  const wantStarter = NAMES[(game + 1) % NAMES.length];
  if (starter !== wantStarter) throw new Error(`starter rotation: ${starter} vs ${wantStarter}`);
  const cleared = await page.getByTestId('scoreboard-total').allTextContents();
  if (cleared.some((t) => t !== '0')) throw new Error('scorecards not cleared after play again');
  console.log(`game ${game + 1} ✓ winner=${winner} totals=${totals.join('/')} games=${games} session=${JSON.stringify(session)} → next starter ${starter}`);
  NAMES.forEach((n) => CATEGORIES.forEach((k) => { recorded[n][k] = null; }));
}
console.log('errors:', errs);
await browser.close();

import { chromium } from '@playwright/test';
import { CATEGORIES, allowedBoxes, potential, grandTotal, scoreFor, UPPER, LOWER } from '../src/rules.js';
const BASE = process.env.SHOT_URL || 'http://localhost:3000/';
const browser = await chromium.launch();

async function fullGame(page) {
  // keeps playing from wherever the game currently is until it finishes
  while (!(await page.getByTestId('game-over').isVisible())) {
      const dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
      await page.evaluate((v) => { window.__yahtzeeDice = v; }, dice);
      await page.getByTestId('roll').click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
      const card = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('yahtzee.state.v1')); return s.game.players[s.game.turnIndex].card; });
      await page.getByTestId(`score-${allowedBoxes(card, dice)[0]}`).click();
      await page.waitForTimeout(10);
  }
}

// ---- one player, full game, undo then redo
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByLabel('Player name', { exact: true }).fill('Solo');
  await page.getByTestId('add-player').click();
  await page.getByTestId('start-game').click();
  await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
  await page.getByTestId('roll').click();
  await page.getByTestId('score-yahtzee').click();
  await page.waitForTimeout(150);
  console.log('undo visible after record (before rolling):', await page.locator('#undo').isVisible());
  // Undo must bring the whole turn back, not just unwrite the box: same faces,
  // same holds, same rolls left. (Two-player game, so the turn is Ana's again.)
  await page.locator('#undo').click();
  const back = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('yahtzee.state.v1')).game;
    return { state: document.querySelector('[data-testid=score-yahtzee]').dataset.state,
      value: document.querySelector('[data-testid=score-yahtzee] [data-testid=score-value]').textContent,
      current: document.querySelector('[data-testid=current-player]').textContent,
      dice: g.dice.join(','), rolls: g.rollsLeft, rolled: g.rolledCount,
      diceShown: [...document.querySelectorAll('[data-testid=die]')].map((d) => d.getAttribute('data-value')).join(',') };
  });
  const ok = back.state === 'open' && back.dice === '6,6,6,6,6' && back.diceShown === '6,6,6,6,6'
    && back.rolls === 2 && back.rolled === 1 && back.current === 'Solo';
  console.log('after undo:', JSON.stringify(back), '-> turn restored exactly:', ok);
  if (!ok) throw new Error('undo did not restore the turn');
  // the window closes as soon as this player touches the turn again
  await page.getByTestId('die').nth(0).click();
  await page.waitForTimeout(120);
  console.log('undo hidden after a tap:', await page.locator('#undo').evaluate((e) => e.classList.contains('invisible')));
  await page.getByTestId('die').nth(0).click();
  await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
  await page.getByTestId('roll').click();
  await page.getByTestId('score-yahtzee').click();
  await page.waitForTimeout(150);
  console.log('re-recorded', await page.getByTestId('score-yahtzee').getAttribute('data-state'),
    await page.getByTestId('score-yahtzee').getByTestId('score-value').textContent(),
    'total', await page.getByTestId('total').textContent());
  await ctx.close();
}

// ---- 8 players, whole game (104 turns) + reload in the middle
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE);
  const names = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  for (const n of names) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  console.log('8 players: add-player disabled =', await page.getByTestId('add-player').isDisabled());
  await page.getByTestId('start-game').click();
  const t0 = Date.now();
  // 3 rounds, then reload mid-turn
  for (let r = 0; r < 3; r++) {
    for (const n of names) {
      const dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
      await page.evaluate((v) => { window.__yahtzeeDice = v; }, dice);
      await page.getByTestId('roll').click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
      const card = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('yahtzee.state.v1')); return s.game.players[s.game.turnIndex].card; });
      await page.getByTestId(`score-${allowedBoxes(card, dice)[0]}`).click();
    }
  }
  const dice = [2, 2, 4, 5, 5];
  await page.evaluate((v) => { window.__yahtzeeDice = v; }, dice);
  await page.getByTestId('roll').click();
  await page.getByTestId('die').nth(0).click();
  const before = {
    player: await page.getByTestId('current-player').textContent(),
    round: await page.getByTestId('round').textContent(),
    rolls: await page.getByTestId('rolls-left').textContent(),
    totals: await page.getByTestId('scoreboard-total').allTextContents(),
  };
  await page.reload();
  const after = {
    player: await page.getByTestId('current-player').textContent(),
    round: await page.getByTestId('round').textContent(),
    rolls: await page.getByTestId('rolls-left').textContent(),
    totals: await page.getByTestId('scoreboard-total').allTextContents(),
    dice: await page.getByTestId('die').evaluateAll((e) => e.map((x) => x.getAttribute('data-value'))),
    held: await page.getByTestId('die').evaluateAll((e) => e.map((x) => x.getAttribute('aria-pressed'))),
  };
  const same = JSON.stringify({ p: before.player, r: before.round, l: before.rolls, t: before.totals })
    === JSON.stringify({ p: after.player, r: after.round, l: after.rolls, t: after.totals });
  console.log('8 players: resume after reload identical =', same, 'dice', after.dice.join(','), 'held0', after.held[0]);
  await fullGame(page);
  await page.waitForTimeout(400);
  console.log('8 players: game over =', await page.getByTestId('game-over').isVisible(),
    'winner =', await page.getByTestId('winner').textContent(),
    'rows =', await page.getByTestId('final-row').count(),
    `(${((Date.now() - t0) / 1000).toFixed(0)}s)`, 'errors', errs);
  await ctx.close();
}

// ---- reduced motion: dice must settle fast
for (const rm of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: rm ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByLabel('Player name', { exact: true }).fill('Ana');
  await page.getByTestId('add-player').click();
  await page.getByTestId('start-game').click();
  await page.evaluate(() => { window.__yahtzeeDice = [1, 2, 3, 4, 6]; });
  const t0 = Date.now();
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
  const settle = Date.now() - t0;
  await page.waitForTimeout(420);
  const animating = await page.evaluate(() => document.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
  console.log(`reducedMotion=${rm}: data-value present after ${settle}ms, animations still running at +400ms: ${animating}`);
  await ctx.close();
}
await browser.close();

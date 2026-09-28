/**
 * Plays WHOLE games in real-dice mode — the phone never rolls, it only transcribes what
 * the table rolled — with 3 and 8 players, and re-checks every box value, Joker
 * restriction, bonus, winner, rotation and session tally against src/rules.js.
 * Also asserts the real-dice-specific promises: nothing is recordable before 5/5 faces,
 * the order faces are tapped in does not matter, Undo puts the turn back exactly as it
 * was, and switching modes mid-game never moves a score.
 */
import { chromium } from '@playwright/test';
import { CATEGORIES, allowedBoxes, potential, grandTotal } from '../src/rules.js';

const BASE = process.env.SHOT_URL || 'http://localhost:3000/';
const browser = await chromium.launch();
const errs = [];

const die = () => 1 + Math.floor(Math.random() * 6);
const roll5 = () => Array.from({ length: 5 }, die);
const shuffled = (a) => a.map((v, i) => [Math.random(), i, v]).sort((x, y) => x[0] - y[0]).map((t) => t[2]);

async function newPage(vp = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(BASE);
  return { ctx, page };
}

const key = (page, face) => page.locator(`[data-testid="entry-key"][data-face="${face}"]`);
const enter = async (page, faces) => { for (const f of faces) await key(page, f).click(); };
const pill = (page) => page.locator('#entry-count').textContent();
const enabledBoxes = (page) => page.locator('.box:not([disabled])')
  .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('score-', '')));
const cardOf = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('yahtzee.state.v1'));
  return s.game.players[s.game.turnIndex].card;
});

/* ── the invariants that only exist in real-dice mode ── */
async function assertNotRecordable(page, faces) {
  const before = await enabledBoxes(page);
  if (before.length) throw new Error(`boxes selectable with ${faces.length}/5 faces: ${before}`);
  const openVals = await page.locator('.box[data-state="open"] [data-testid="score-value"]')
    .evaluateAll((els) => els.map((e) => e.textContent.trim()));
  if (openVals.some((v) => v !== '–')) {
    throw new Error(`open box showed a value with ${faces.length}/5 faces: ${openVals.join(',')}`);
  }
}

async function playGame(page, names, recorded, opts = {}) {
  for (let turn = 0; turn < 13 * names.length; turn++) {
    const dice = roll5();
    // the order faces are tapped in must not matter: shuffle them
    const order = opts.strictOrder ? dice : shuffled(dice);
    await assertNotRecordable(page, []);
    for (let i = 0; i < order.length; i++) {
      await key(page, order[i]).click();
      if (i < order.length - 1) await assertNotRecordable(page, order.slice(0, i + 1));
    }
    if (await pill(page) !== '5 of 5') throw new Error(`pill after five taps: ${await pill(page)}`);

    const card = await cardOf(page);
    const want = allowedBoxes(card, dice);
    const pickable = await enabledBoxes(page);
    if (JSON.stringify(pickable) !== JSON.stringify(want)) {
      throw new Error(`allowed mismatch ${pickable} vs ${want} for dice ${dice} (entry order ${order})`);
    }
    for (const cat of CATEGORIES) {
      if (card[cat] != null) continue;
      const shown = await page.locator(`[data-testid="score-${cat}"] [data-testid="score-value"]`).textContent();
      const expect = potential(card, cat, dice);
      if (Number(shown) !== expect) throw new Error(`value mismatch ${cat}: ${shown} vs ${expect} (dice ${dice})`);
    }

    const who = await page.getByTestId('current-player').textContent();
    const cat = want[Math.floor(Math.random() * want.length)];
    const value = potential(card, cat, dice);

    // half the time, mis-tap a box then Undo it: the turn must come back byte-for-byte
    if (opts.undoTrail && turn % 3 === 1) {
      const wrong = want.find((c) => c !== cat) ?? cat;
      await page.getByTestId(`score-${wrong}`).click();
      await page.waitForTimeout(60);
      const undone = await page.locator('#undo');
      await undone.click();
      await page.waitForTimeout(60);
      const back = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('yahtzee.state.v1')).game;
        return { dice: s.dice.join(','), entry: s.entry.join(','), rolls: s.rollsLeft, rolled: s.rolledCount, turn: s.turnIndex };
      });
      const sortedEntry = [...JSON.parse(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('yahtzee.state.v1')).game.entry)))].sort((a, b) => a - b);
      if (sortedEntry.join(',') !== [...dice].sort((a, b) => a - b).join(',')) {
        throw new Error(`undo lost the entry: ${sortedEntry} vs ${dice}`);
      }
      if (back.rolled !== 1 || back.rolls !== 0) throw new Error(`undo lost the turn state: ${JSON.stringify(back)}`);
      if (JSON.stringify(await enabledBoxes(page)) !== JSON.stringify(want)) {
        throw new Error('undo did not restore which boxes are open');
      }
    }

    await page.getByTestId(`score-${cat}`).click();
    recorded[who][cat] = value;
    if (turn < 13 * names.length - 1) {
      const p = await pill(page);
      const whoNext = await page.getByTestId('current-player').textContent();
      if (whoNext === who && names.length > 1) throw new Error('turn did not pass');
      if (p !== '0 of 5') throw new Error(`next turn started with ${p} faces in`);
      if ((await enabledBoxes(page)).length) throw new Error('new turn began with a recordable box');
    }
  }
  await page.waitForTimeout(500);
}

function expectedTotals(names, recorded) {
  return names.map((n) => {
    const card = { yahtzeeBonus: 0 };
    CATEGORIES.forEach((k) => { card[k] = recorded[n][k]; });
    return grandTotal(card);
  });
}

async function checkOver(page, names, recorded, gameNo, sessionWins, sessionPoints) {
  if (!(await page.getByTestId('game-over').isVisible())) throw new Error(`game ${gameNo} did not finish`);
  const totals = expectedTotals(names, recorded);
  const finals = await page.getByTestId('final-row').evaluateAll((els) => els.map((e) => [
    e.querySelector('[data-testid=final-name]').textContent,
    Number(e.querySelector('[data-testid=final-total]').textContent),
  ]));
  const wantOrder = names.map((n, i) => [n, totals[i]])
    .sort((a, b) => b[1] - a[1] || names.indexOf(a[0]) - names.indexOf(b[0]));
  if (JSON.stringify(finals) !== JSON.stringify(wantOrder)) {
    throw new Error(`standings ${JSON.stringify(finals)} vs ${JSON.stringify(wantOrder)}`);
  }
  const best = Math.max(...totals);
  const wantWinner = names.filter((_, i) => totals[i] === best).join(' & ');
  const winner = await page.getByTestId('winner').textContent();
  if (winner !== wantWinner) throw new Error(`winner ${winner} vs ${wantWinner}`);
  const games = await page.getByTestId('games-played').textContent();
  if (Number(games) !== gameNo) throw new Error(`games-played ${games} vs ${gameNo}`);
  const session = await page.getByTestId('session-row').evaluateAll((els) => els.map((e) => [
    e.querySelector('[data-testid=session-name]').textContent,
    Number(e.querySelector('[data-testid=session-wins]').textContent),
    Number(e.querySelector('[data-testid=session-points]').textContent),
  ]));
  names.forEach((n, i) => {
    sessionWins[i] += totals[i] === best ? 1 : 0;
    sessionPoints[i] += totals[i];
  });
  const wantSession = names.map((n, i) => [n, sessionWins[i], sessionPoints[i]]);
  if (JSON.stringify(session) !== JSON.stringify(wantSession)) {
    throw new Error(`session ${JSON.stringify(session)} vs ${JSON.stringify(wantSession)}`);
  }
  return { winner, totals };
}

/* ───────────── game 1+: three players, two games in a row (rotation + tally) ───────────── */
{
  const names = ['Ana', 'Ben', 'Chloé'];
  const { ctx, page } = await newPage();
  await page.getByTestId('dice-table').click();
  if (await page.locator('#dice-table').getAttribute('aria-checked') !== 'true') throw new Error('setup radio not checked');
  for (const n of names) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  await page.getByTestId('start-game').click();
  if (await page.getByTestId('roll').isVisible()) throw new Error('roll button visible in real-dice mode');
  if (await page.getByTestId('die').first().isVisible()) throw new Error('phone dice visible in real-dice mode');
  const recorded = Object.fromEntries(names.map((n) => [n, {}]));
  const wins = [0, 0, 0];
  const pts = [0, 0, 0];
  for (let g = 1; g <= 2; g++) {
    const t0 = Date.now();
    await playGame(page, names, recorded, { undoTrail: g === 1, strictOrder: g === 2 });
    const over = await checkOver(page, names, recorded, g, wins, pts);
    console.log(`3p game ${g} ✓ winner=${over.winner} totals=${over.totals.join('/')} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    names.forEach((n) => CATEGORIES.forEach((k) => { recorded[n][k] = null; }));
    {
      await page.getByTestId('play-again').click();
      await page.waitForTimeout(200);
      const want = names[g % names.length];
      const got = await page.getByTestId('current-player').textContent();
      if (got !== want) throw new Error(`rotation: ${got} vs ${want}`);
      if ((await page.getByTestId('scoreboard-total').allTextContents()).some((t) => t !== '0')) {
        throw new Error('cards not cleared on play again');
      }
      if (await pill(page) !== '0 of 5') throw new Error('entry survived into the new game');
    }
  }
  // the pref survives a reload, and so does the game
  await playPartialAndCheckResume(page, names);
  await ctx.close();
}

async function playPartialAndCheckResume(page, names) {
  const dice = [4, 4, 4, 6, 2];
  await enter(page, dice);
  await page.locator('[data-testid=entry-slot]').nth(4).click();   // change the last die
  await key(page, 6).click();                                       // 6 replaces the 2
  const card = await cardOf(page);
  const want = allowedBoxes(card, [4, 4, 4, 6, 6]);
  if (JSON.stringify(await enabledBoxes(page)) !== JSON.stringify(want)) throw new Error('allowed after edit mismatch');
  const before = await page.evaluate(() => localStorage.getItem('yahtzee.state.v1'));
  await page.reload();
  const after = await page.evaluate(() => localStorage.getItem('yahtzee.state.v1'));
  if (JSON.parse(before).game.entry.join() !== JSON.parse(after).game.entry.join()) {
    throw new Error('entry did not survive reload');
  }
  if (await pill(page) !== '5 of 5') throw new Error('pill wrong after reload');
  if (await page.locator('#dice-phone').getAttribute('aria-checked') !== 'false') throw new Error('dice pref lost on reload');
  console.log('3p resume mid-entry ✓ (5 of 5 after reload, edited face kept)');
}

/* ───────────── 8 players: one whole game in real-dice mode ───────────── */
{
  const names = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const { ctx, page } = await newPage();
  await page.getByTestId('dice-table').click();
  for (const n of names) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  await page.getByTestId('start-game').click();
  const recorded = Object.fromEntries(names.map((n) => [n, {}]));
  const wins = Array(8).fill(0);
  const pts = Array(8).fill(0);
  const t0 = Date.now();
  await playGame(page, names, recorded, {});
  const r = await checkOver(page, names, recorded, 1, wins, pts);
  console.log(`8p game ✓ winner=${r.winner} totals=${r.totals.join('/')} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  await page.getByTestId('play-again').click();
  await page.waitForTimeout(200);
  if ((await page.getByTestId('current-player').textContent()) !== names[1]) throw new Error('8p rotation');
  await ctx.close();
}

/* ───────────── switching modes mid-game must never move a score ───────────── */
{
  const { ctx, page } = await newPage();
  await page.getByTestId('dice-table').click();
  for (const n of ['Ana', 'Ben']) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  await page.getByTestId('start-game').click();
  await enter(page, [6, 6, 3, 3, 3]);                       // a full house
  await page.getByTestId('score-full-house').click();        // 25 for Ana
  await page.waitForTimeout(150);
  const boardBefore = await page.getByTestId('scoreboard-total').allTextContents();

  // mid-turn of Ben's turn, switch to the phone and back
  await page.locator('#dice-game').click();
  await page.locator('#dice-sheet-phone').click();
  await page.locator('#dice-sheet-close').click();
  const phoneState = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('yahtzee.state.v1')).game;
    return { rolls: g.rollsLeft, rolled: g.rolledCount, entry: g.entry.join(','), dice: g.dice.join(',') };
  });
  const boardMid = await page.getByTestId('scoreboard-total').allTextContents();
  if (boardMid.join() !== boardBefore.join()) throw new Error('mode switch moved a score');
  if (!await page.getByTestId('roll').isVisible()) throw new Error('phone tray missing after switch');
  await page.evaluate(() => { window.__yahtzeeDice = [1, 2, 3, 4, 5]; });
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every((d) => d.getAttribute('data-value')));
  await page.getByTestId('score-large-straight').click();    // 40 for Ben, on the phone

  await page.locator('#dice-game').click();
  await page.locator('#dice-sheet-table').click();
  await page.locator('#dice-sheet-close').click();
  if (await page.getByTestId('roll').isVisible()) throw new Error('table tray missing after switch back');
  const boardAfter = await page.getByTestId('scoreboard-total').allTextContents();
  if (boardAfter.join() !== '25,40') throw new Error(`scores wrong after switching: ${boardAfter}`);
  if (await pill(page) !== '0 of 5') throw new Error('entry not reset for the new turn');
  console.log(`mode switch mid-game ✓ board=${boardAfter} phone-roll scored 40, phone state at switch=${JSON.stringify(phoneState)}`);
  await ctx.close();
}

console.log('errors:', errs.length ? errs : 'none');
await browser.close();
if (errs.length) process.exit(1);

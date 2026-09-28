/** Real-world interaction hazards a camp table actually produces. */
import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const b = await chromium.launch();
const errs = [];
const mk = async (vp = { width: 390, height: 844 }) => {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:3000/');
  return { ctx, page };
};
const addPlayers = async (page, names) => {
  for (const n of names) { await page.getByLabel('Player name', { exact: true }).fill(n); await page.getByTestId('add-player').click(); }
  await page.getByTestId('start-game').click();
};

// 1) Excited double-tap on a score box: must record exactly one box, once.
{
  const { ctx, page } = await mk();
  await addPlayers(page, ['Ana', 'Ben']);
  await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
  await page.getByTestId('score-yahtzee').dblclick();
  await page.waitForTimeout(400);
  // the card on screen is the NEXT player's, so check the board and the stored cards
  const st = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('yahtzee.state.v1')).game;
    return {
      current: document.querySelector('[data-testid=current-player]').textContent,
      board: [...document.querySelectorAll('[data-testid=scoreboard-total]')].map((e) => e.textContent).join(','),
      anaYahtzee: g.players[0].card.yahtzee, benYahtzee: g.players[1].card.yahtzee,
      filled: g.players[0].card.chance === null && g.players[0].card.yahtzee !== null,
      rolls: document.querySelector('[data-testid=rolls-left]').textContent,
    };
  });
  const oneBox = st.anaYahtzee === 50 && st.benYahtzee === null && st.current === 'Ben' && st.board === '50,0';
  console.log('double-tap record:', JSON.stringify(st), '-> exactly one box, once:', oneBox);
  if (!oneBox) throw new Error('double-tap recorded twice');
  await ctx.close();
}

// 1b) Undo is attributed: recording hands the turn over, so the next player is the
//     one who sees this button while it still reverts the previous player's box.
{
  const { ctx, page } = await mk();
  await addPlayers(page, ['Ana', 'Ben']);
  await page.evaluate(() => { window.__yahtzeeDice = [6, 6, 6, 6, 6]; });
  await page.getByTestId('roll').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
  await page.getByTestId('score-yahtzee').click();
  await page.waitForTimeout(300);
  const u = await page.evaluate(() => ({
    current: document.querySelector('[data-testid=current-player]').textContent,
    text: document.querySelector('#undo').textContent.replace(/\s+/g, ' ').trim(),
    aria: document.querySelector('#undo').getAttribute('aria-label'),
    hidden: document.querySelector('#undo').classList.contains('invisible'),
  }));
  console.log('undo on next player screen:', JSON.stringify(u), '-> attributed:', /Ana/.test(u.text) && !u.hidden);
  // the window stays open across the hand-over and closes only when Ben touches it
  await page.reload(); await page.waitForTimeout(250);
  console.log('  window survives a reload:', await page.evaluate(() => !document.querySelector('#undo').classList.contains('invisible')));
  await page.getByTestId('roll').click(); await page.waitForTimeout(200);
  console.log('  window closes on next roll:', await page.evaluate(() => document.querySelector('#undo').classList.contains('invisible')));
  await ctx.close();
}

// 2) Tapping dice after the final roll (rolls-left = 0, must score)
{
  const { ctx, page } = await mk();
  await addPlayers(page, ['Ana']);
  for (let i = 0; i < 3; i++) { await page.getByTestId('roll').click(); await page.waitForTimeout(120); }
  const before = await page.getByTestId('rolls-left').textContent();
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('die').nth(0).click();
  const after = await page.evaluate(() => ({
    rolls: document.querySelector('[data-testid=rolls-left]').textContent,
    held: [...document.querySelectorAll('[data-testid=die]')].map(d => d.getAttribute('aria-pressed')).join(','),
    rollDisabled: document.querySelector('[data-testid=roll]').disabled,
    values: [...document.querySelectorAll('[data-testid=die]')].map(d => d.getAttribute('data-value')).join(','),
  }));
  console.log(`post-final-roll taps: rollsLeft ${before}->${after.rolls} rollDisabled=${after.rollDisabled}`);
  // reload and confirm the state is still coherent, and scoring still possible
  await page.reload(); await page.waitForTimeout(300);
  const resumed = await page.evaluate(() => ({ rolls: document.querySelector('[data-testid=rolls-left]').textContent,
    values: [...document.querySelectorAll('[data-testid=die]')].map(d => d.getAttribute('data-value')).join(','),
    enabled: document.querySelectorAll('button[data-testid^="score-"]:not([disabled])').length }));
  console.log('  after reload:', JSON.stringify(resumed), '-> can still score:', resumed.enabled > 0);
  await ctx.close();
}

// 3) Lock the phone on the winner screen: reload, then Play again must rotate correctly.
{
  const { ctx, page } = await mk();
  const CATS = ['ones','twos','threes','fours','fives','sixes','three-kind','four-kind','full-house','small-straight','large-straight','yahtzee','chance'];
  const D = [[6,6,6,1,2],[5,5,1,1,1],[4,1,1,1,1],[3,1,1,1,1],[2,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,2,3,4,1],[1,2,3,4,5],[1,1,1,1,1],[6,6,6,6,6]];
  await addPlayers(page, ['Ana', 'Ben', 'Chloé']);
  for (let r = 0; r < 13; r++) for (let p = 0; p < 3; p++) {
    const dice = p === 0 ? D[r] : [1,1,2,2,3];
    const cat = p === 0 ? CATS[r] : CATS[(r + p) % 13];
    await page.evaluate((v) => { window.__yahtzeeDice = v; }, dice);
    await page.getByTestId('roll').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')));
    const box = page.getByTestId('score-' + cat);
    if (await box.evaluate(e => e.disabled)) {
      await page.locator('button[data-testid^="score-"]:not([disabled])').first().click();
    } else await box.click();
  }
  await page.waitForTimeout(300);
  const g1 = await page.evaluate(() => ({ over: document.querySelector('[data-testid=game-over]') !== null && !document.querySelector('[data-testid=game-over]').hidden,
    games: document.querySelector('[data-testid=games-played]').textContent,
    wins: [...document.querySelectorAll('[data-testid=session-wins]')].map(e => e.textContent).join(','),
    pts: [...document.querySelectorAll('[data-testid=session-points]')].map(e => e.textContent).join(',') }));
  await page.reload(); await page.waitForTimeout(400);
  const g2 = await page.evaluate(() => ({ over: !document.querySelector('[data-testid=game-over]').hidden,
    games: document.querySelector('[data-testid=games-played]').textContent,
    wins: [...document.querySelectorAll('[data-testid=session-wins]')].map(e => e.textContent).join(','),
    pts: [...document.querySelectorAll('[data-testid=session-points]')].map(e => e.textContent).join(',') }));
  console.log('game over:', JSON.stringify(g1));
  console.log('after reload:', JSON.stringify(g2), '-> tally survived:', g1.games === g2.games && g1.wins === g2.wins && g1.pts === g2.pts);
  await page.getByTestId('play-again').click(); await page.waitForTimeout(300);
  const g3 = await page.evaluate(() => ({ starter: document.querySelector('[data-testid=current-player]').textContent,
    round: document.querySelector('[data-testid=round]').textContent,
    open: document.querySelectorAll('button[data-testid^="score-"][data-state="recorded"]').length }));
  console.log('play again after reload:', JSON.stringify(g3), '-> starter Ben, 13 rounds, card clear:', g3.starter === 'Ben' && g3.round.includes('Round 1') && g3.open === 0);
  await ctx.close();
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();

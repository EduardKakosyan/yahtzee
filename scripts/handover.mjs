/**
 * The hand-over banner and the Undo label, checked the way the operator reads them.
 *
 *  - The banner used to sit at the bottom, right on the Sixes box. It must now
 *    intersect NOTHING the next player needs to take their turn: the turn banner,
 *    the dice/keypad/roll, and every score box. Asserted while it is on screen, in
 *    both dice modes, at both phones.
 *  - Undo must say what it will undo ("Undo Eduard's Full house (25)") and the text
 *    must not be clipped by the button, with 16-character names and 8 players.
 *
 *   node scripts/handover.mjs
 */
import pkg from '/workspace/project/node_modules/@playwright/test/index.js';
import { collectVisual } from '../checks/visual.ts';
const { chromium } = pkg;
const URL = process.env.SHOT_URL || 'http://localhost:3000/';
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 375, height: 667 }];
const NAMES = ['Ana', 'Ben', 'Chloé'];
const browser = await chromium.launch();
let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL ' + m); };

/** Everything the next player needs in order to take their turn. */
/* Everything the next player needs in order to take their turn. The dice row is
   deliberately NOT in the list: covering the dice the previous player just scored is
   the whole idea, and the roll button / keypad / boxes all sit outside it. The probe
   asserts separately that the note stays inside the felt tray. */
const NEEDED = '#current-player, #round, #keypad, #keys, #roll-row, #roll, #rolls-left, #entry-bar, #entry-last, #entry-clear, #card, .box, #totals-strip, #scoreboard, #undo';

async function collisions(page) {
  return page.evaluate((sel) => {
    const toast = document.querySelector('#handover');
    if (!toast || !toast.textContent || !toast.classList.contains('show')) return null;
    const t = toast.getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const ox = Math.max(0, Math.min(t.right, r.right) - Math.max(t.left, r.left));
      const oy = Math.max(0, Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top));
      if (ox > 1 && oy > 1) {
        out.push({ el: el.getAttribute('data-testid') || el.id || el.className, area: Math.round(ox * oy / (r.width * r.height) * 100) + '%' });
      }
    }
    const felt = document.querySelector('#screen-game .felt').getBoundingClientRect();
    const inside = t.left >= felt.left - 0.5 && t.right <= felt.right + 0.5
      && t.top >= felt.top - 0.5 && t.bottom <= felt.bottom + 0.5;
    const covered = [];
    for (const el of document.querySelectorAll('#dice, #slots')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      covered.push(el.id);
      if (t.top > r.top + 1 || t.bottom < r.bottom - 1) covered.push(el.id + ':overflowing');
    }
    return { text: toast.textContent, box: [Math.round(t.top), Math.round(t.bottom)], insideFelt: inside, covers: covered, hits: out };
  }, NEEDED);
}

for (const mode of ['phone', 'table']) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(URL);
    if (mode === 'table') await page.getByTestId('dice-table').click();
    for (const n of NAMES) {
      await page.getByLabel('Player name', { exact: true }).fill(n);
      await page.getByTestId('add-player').click();
    }
    await page.getByTestId('start-game').click();
    if (mode === 'phone') {
      await page.evaluate(() => { window.__yahtzeeDice = [3, 3, 3, 4, 5]; });
      await page.getByTestId('roll').click();
    } else {
      for (const f of [3, 3, 3, 4, 5]) await page.locator(`[data-testid="entry-key"][data-face="${f}"]`).click();
    }
    await page.waitForTimeout(360);
    await page.locator('[data-testid="score-three-kind"]').click();
    // the scorecard must already show the recorded 18 in Ana's card, and the box locked
    await page.waitForTimeout(60);
    await page.waitForTimeout(90);
    const c = await collisions(page);
    const tag = `${vp.width}x${vp.height} ${mode}`;
    console.log(`\n[${tag}] banner ${JSON.stringify(c)}`);
    if (!c) fail(`${tag}: the hand-over banner never showed after recording a box`);
    else if (c.hits.length) fail(`${tag}: the banner covers what the next player needs — ${JSON.stringify(c.hits)}`);
    else if (!c.insideFelt) fail(`${tag}: the banner is outside the felt tray: ${JSON.stringify(c.box)}`);
    else if (c.covers.length !== 1) fail(`${tag}: the banner spills past the spent dice row — ${JSON.stringify(c.covers)}`);
    if (c && !/pass to Ben/.test(c.text)) fail(`${tag}: banner text is "${c.text}"`);

    // contrast, tap targets and overflow while the note is actually on screen —
    // this is the state the contract suite's screenshots never catch
    const rep = await page.evaluate(collectVisual, { text: true, tap: true, overflow: true, coverage: ['start', 'end'] });
    const flags = [rep.text.length && 'CONTRAST ' + JSON.stringify(rep.text.slice(0, 3)),
      rep.tap.length && 'TAP ' + JSON.stringify(rep.tap.slice(0, 3)),
      rep.overflow.length && 'OVERFLOW ' + JSON.stringify(rep.overflow.slice(0, 3)),
      rep.coverage.length && 'COVERAGE ' + JSON.stringify(rep.coverage.slice(0, 3))].filter(Boolean);
    if (flags.length) fail(`${tag}: ${flags.join(' | ')}`);
    const note = await page.evaluate(() => {
      const t = document.querySelector('#handover');
      return { font: getComputedStyle(t).fontSize, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), fits: t.scrollHeight <= t.clientHeight + 1 };
    });
    if (!note.fits) fail(`${tag}: the hand-over note's own text does not fit (${JSON.stringify(note)})`);
    console.log(`[${tag}] note ${note.font}px x ${note.lines} line(s), visual audit clean`);

    // the Undo label must name the box and the owner, and must not be clipped
    const undo = await page.evaluate(() => {
      const b = document.querySelector('#undo');
      const txt = b.querySelector('.undo-txt');
      return { visible: !b.classList.contains('invisible'), text: txt.textContent.trim(),
        clipped: txt.scrollWidth > txt.clientWidth + 1, aria: b.getAttribute('aria-label'),
        w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) };
    });
    console.log(`[${tag}] undo ${JSON.stringify(undo)}`);
    if (!undo.visible) fail(`${tag}: Undo is not offered on the next player's turn`);
    if (!/^Undo (Ana’s|your) 3 of a kind \(18\)$/.test(undo.text)) fail(`${tag}: Undo reads "${undo.text}"`);
    if (undo.clipped) fail(`${tag}: the Undo label is clipped ("${undo.text}")`);
    if (undo.h < 44) fail(`${tag}: Undo is ${undo.h}px tall`);
    const spill = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 0.5; })
      .map((e) => (e.className || e.tagName) + ''));
    if (spill.length) fail(`${tag}: horizontal spill ${JSON.stringify(spill.slice(0, 3))}`);
    // …and it must step aside the instant the next player starts working
    if (mode === 'phone') { await page.getByTestId('roll').click(); }
    else { await page.locator('[data-testid="entry-key"][data-face="2"]').click(); }
    await page.waitForTimeout(90);
    const still = await page.evaluate(() => {
      const t = document.querySelector('#handover');
      const r = t.getBoundingClientRect();
      return { shown: t.classList.contains('show'), text: t.textContent, h: Math.round(r.height) };
    });
    if (still.shown || still.text) fail(`${tag}: the banner is still up after the next player acted — ${JSON.stringify(still)}`);
    await page.screenshot({ path: `shots/handover-${tag.replace(/ /g, '-')}.png` });
    await ctx.close();
  }
}

/* long names + 8 players: the label has to survive the worst case */
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto(URL);
  const eight = ['Christopher16', 'XxXxXxXxXxXxXxXx', 'WWWWWWWWWWWWWWWW', 'Ann-Marie O’Neil',
    'José Fernández', "D'Artagnan III", 'Björk Guðmunds', 'MxmbayaNdlovu8'];
  for (const n of eight) {
    await page.getByLabel('Player name', { exact: true }).fill(n);
    await page.getByTestId('add-player').click();
  }
  await page.getByTestId('start-game').click();
  await page.evaluate(() => { window.__yahtzeeDice = [1, 2, 3, 4, 5]; });
  await page.getByTestId('roll').click();
  await page.waitForTimeout(360);
  await page.locator('[data-testid="score-small-straight"]').click();
  await page.waitForTimeout(120);
  const undo = await page.evaluate(() => {
    const b = document.querySelector('#undo');
    const txt = b.querySelector('.undo-txt');
    const head = document.querySelector('.card-head').getBoundingClientRect();
    return { text: txt.textContent.trim(), clipped: txt.scrollWidth > txt.clientWidth + 1,
      w: Math.round(b.getBoundingClientRect().width), headW: Math.round(head.width) };
  });
  console.log(`\n[${vp.width} 8p] undo ${JSON.stringify(undo)}`);
  if (!/^Undo (Christopher16’s|your) Small straight \(30\)$/.test(undo.text)) fail(`${vp.width} 8p: Undo reads "${undo.text}"`);
  if (undo.clipped) fail(`${vp.width} 8p: the Undo label is clipped — "${undo.text}"`);
  const spill = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 0.5; })
    .map((e) => (e.className || e.tagName) + ''));
  if (spill.length) fail(`${vp.width} 8p: horizontal spill ${JSON.stringify(spill.slice(0, 3))}`);
  const c = await collisions(page);
  if (c && c.hits.length) fail(`${vp.width} 8p: banner covers ${JSON.stringify(c.hits)}`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\nHAND-OVER PROBE: ${failures} FAILURE(S)` : '\nHAND-OVER PROBE: the banner covers nothing needed to play, and Undo names the box');
process.exit(failures ? 1 : 0);

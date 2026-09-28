import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.SHOT_URL || 'http://localhost:3000/';
const CATS = ['ones','twos','threes','fours','fives','sixes','three-kind','four-kind','full-house','small-straight','large-straight','yahtzee','chance'];
const ANA = [[6,6,6,1,2],[5,5,5,1,2],[4,4,4,1,2],[3,3,3,1,2],[2,2,2,1,3],[1,1,1,2,3],[3,3,3,4,5],[2,2,2,2,5],[2,2,3,3,3],[1,2,3,4,6],[2,3,4,5,6],[5,5,5,5,5],[6,6,5,4,1]];
const BEN = Array.from({length:13},()=>[1,2,3,4,6]);
const out = new URL('../shots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const sizes = [['lg', {width:390,height:844}], ['sm', {width:375,height:667}]];
const themes = ['light', 'dark'];

async function shoot(page, name) {
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  console.log('shot', name);
}

async function play(page, dice, cat) {
  await page.evaluate(v => { window.__yahtzeeDice = (window.__yahtzeeDice||[]).concat(v); }, dice);
  await page.getByTestId('roll').click();
  await page.getByTestId('die').first().evaluateAll(els => els.forEach(e => e.getAttribute('data-value')));
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d => d.getAttribute('data-value')), null, {timeout:5000});
  await page.getByTestId('score-' + cat).click();
}

for (const [tag, vp] of sizes) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // setup with 3 players
    for (const n of ['Ana','Ben','Chloé']) {
      await page.getByLabel('Player name', {exact:true}).fill(n);
      await page.getByTestId('add-player').click();
    }
    await shoot(page, `${tag}-${theme}-1-setup`);
    await page.getByTestId('start-game').click();
    await shoot(page, `${tag}-${theme}-2-turn-start`);
    await page.evaluate(() => { window.__yahtzeeDice = [2,2,3,3,5]; });
    await page.getByTestId('roll').click();
    await page.waitForTimeout(500);
    await page.getByTestId('die').nth(0).click();
    await page.getByTestId('die').nth(1).click();
    await shoot(page, `${tag}-${theme}-3-midturn`);
    // how to play sheet
    await page.getByTestId('roll').click();
    await page.locator('#how-game').click();
    await page.waitForTimeout(350);
    await shoot(page, `${tag}-${theme}-4-howto`);
    await page.locator('#how-close').click();
    await page.getByTestId('score-full-house').click().catch(()=>{});
    // 2-player game to the end
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE);
    await page.reload();
    for (const n of ['Ana','Ben']) {
      await page.getByLabel('Player name', {exact:true}).fill(n);
      await page.getByTestId('add-player').click();
    }
    await page.getByTestId('start-game').click();
    for (let r = 0; r < 13; r++) {
      await play(page, ANA[r], CATS[r]);
      await play(page, BEN[r], CATS[r]);
    }
    await page.waitForTimeout(700);
    await shoot(page, `${tag}-${theme}-5-gameover`);
    await ctx.close();
  }
}
await browser.close();

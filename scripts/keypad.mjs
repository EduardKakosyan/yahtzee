/**
 * The operator's blocker: a per-face count badge used to sit on the top-right pip,
 * so the 4 key showed three pips and the 6 key showed five. CSS reasoning can miss
 * that, so this probe LOOKS at the rendered keys:
 *
 *  1. geometry — every pip box must be clear of the label strip and inside the key;
 *     each key must carry the right number of pips and the right digit.
 *  2. pixels — screenshot the keypad, threshold the dark pips out of the cream face,
 *     count connected components and match their centres to the expected pip grid.
 *     That is what a person at the table actually sees, so it is the real test.
 *
 * Both phone sizes, both themes, with zero counts and with counts showing.
 *
 *   node scripts/keypad.mjs        # SHOT_URL defaults to http://localhost:3000/
 */
import pkg from '/workspace/project/node_modules/@playwright/test/index.js';
import { mkdirSync } from 'node:fs';
import { PNG } from './png.mjs';

const { chromium } = pkg;
const URL = process.env.SHOT_URL || 'http://localhost:3000/';
const NAMES = ['Ana', 'Ben', 'Chloé'];
/** Pip centres in % of the face box, as [from-top, from-left]. */
const EXPECT = {
  1: [[50, 50]],
  2: [[22, 22], [78, 78]],
  3: [[22, 22], [50, 50], [78, 78]],
  4: [[22, 22], [22, 78], [78, 22], [78, 78]],
  5: [[22, 22], [22, 78], [50, 50], [78, 22], [78, 78]],
  6: [[22, 22], [22, 50], [22, 78], [78, 22], [78, 50], [78, 78]],
};
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 375, height: 667 }];
const SHOT_DIR = 'shots/keypad';
const browser = await chromium.launch();
let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };

/**
 * Count dark blobs (pips) inside `box`. `origin` is the screenshot's own top-left
 * in page coordinates. Pips are the only dark thing on a cream face.
 */
function blobs(png, origin, box, scale) {
  const x0 = Math.round((box.x - origin.x) * scale);
  const y0 = Math.round((box.y - origin.y) * scale);
  const w = Math.round(box.w * scale);
  const h = Math.round(box.h * scale);
  const lum = (x, y) => {
    const i = ((y0 + y) * png.width + (x0 + x)) * 4;
    return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
  };
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dark[y * w + x] = lum(x, y) < 140 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let i = 0; i < dark.length; i++) {
    if (!dark[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) {
      const p = stack.pop();
      const px = p % w, py = (p - px) / w;
      n++; sx += px; sy += py;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= dark.length || !dark[q] || seen[q]) continue;
        if ((q === p - 1 && px === 0) || (q === p + 1 && px === w - 1)) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    // a pip is ~9 CSS px -> ~300 device px² at 2x; anything much smaller is noise
    if (n < 60 * scale) continue;
    out.push({
      cx: box.x + (sx / n) / scale, cy: box.y + (sy / n) / scale,
      w: (maxX - minX + 1) / scale, h: (maxY - minY + 1) / scale, px: n,
    });
  }
  return out;
}

mkdirSync(SHOT_DIR, { recursive: true });

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: theme, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
    await page.goto(URL);
    await page.getByTestId('dice-table').click();
    for (const n of NAMES) {
      await page.getByLabel('Player name', { exact: true }).fill(n);
      await page.getByTestId('add-player').click();
    }
    await page.getByTestId('start-game').click();
    await page.waitForTimeout(250);

    const tag = `${vp.width}-${theme}`;
    for (const phase of ['empty', 'counted']) {
      if (phase === 'counted') for (const f of [4, 4, 4, 4, 5]) await page.locator(`[data-testid="entry-key"][data-face="${f}"]`).click();
      await page.waitForTimeout(220);

      // scroll the row fully into view FIRST: an element screenshot scrolls the page
      // itself, which would desync the geometry measured before it.
      await page.locator('.keys').evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(120);

      const geo = await page.evaluate(() => {
        return [...document.querySelectorAll('[data-testid="entry-key"]')].map((k) => {
          const r = k.getBoundingClientRect();
          const face = k.querySelector('.kface').getBoundingClientRect();
          const label = k.querySelector('.klabel').getBoundingClientRect();
          const sq = k.querySelector('.kface-sq').getBoundingClientRect();
          const pips = [...k.querySelectorAll('.kface .pip')].map((p) => {
            const b = p.getBoundingClientRect();
            return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, bottom: b.bottom };
          });
          return {
            face: +k.dataset.face, count: k.dataset.count,
            num: k.querySelector('.knum').textContent.trim(),
            countText: k.querySelector('.kcount').textContent.trim(),
            key: { x: r.x, y: r.y, w: r.width, h: r.height },
            faceBox: { x: face.x, y: face.y, w: face.width, h: face.height },
            sq: { x: sq.x, y: sq.y, w: sq.width, h: sq.height },
            pipW: pips.length ? pips[0].w : 0,
            centres: pips,
            label: { x: label.x, y: label.y, w: label.width, h: label.height },
            pips,
          };
        });
      });

      console.log(`\n[${tag} ${phase}]`);
      if (geo.length !== 6) fail(`${tag} ${phase}: expected 6 keys, saw ${geo.length}`);

      for (const k of geo) {
        const want = EXPECT[k.face];
        if (k.pips.length !== want.length) {
          fail(`${tag} ${phase}: key ${k.face} shows ${k.pips.length} pips in the DOM, must show ${want.length}`);
        }
        if (k.num !== String(k.face)) fail(`${tag} ${phase}: key ${k.face} is labelled "${k.num}"`);
        for (const p of k.pips) {
          if (p.bottom > k.label.y + 0.5) fail(`${tag} ${phase}: key ${k.face}: a pip overlaps the number/count strip`);
          if (p.x < k.key.x - 0.5 || p.x > k.key.x + k.key.w + 0.5
            || p.y < k.key.y - 0.5 || p.bottom > k.key.y + k.key.h + 0.5) fail(`${tag} ${phase}: key ${k.face}: a pip escapes the key`);
        }
        if (k.count === '0' && k.countText !== '') fail(`${tag} ${phase}: key ${k.face} shows "${k.countText}" at count 0`);
        if (k.count !== '0' && k.countText !== `×${k.count}`) fail(`${tag} ${phase}: key ${k.face} count text "${k.countText}" != ×${k.count}`);
        if (Math.abs(k.sq.w - k.sq.h) > 1) fail(`${tag} ${phase}: key ${k.face}: the pip area is ${Math.round(k.sq.w)}x${Math.round(k.sq.h)}, not square`);
        for (let i = 0; i < k.centres.length; i++) {
          for (let j = i + 1; j < k.centres.length; j++) {
            const d = Math.hypot(k.centres[i].x - k.centres[j].x, k.centres[i].y - k.centres[j].y);
            if (d < k.pipW + 3) fail(`${tag} ${phase}: key ${k.face}: two pips are ${d.toFixed(1)}px apart (pip ${k.pipW}px) — they read as one blob`);
          }
        }
        if (k.label.y < k.key.y || k.label.y + k.label.h > k.key.y + k.key.h + 0.6) fail(`${tag} ${phase}: key ${k.face}: the strip is clipped by the key`);
        if (k.label.x < k.key.x - 0.5 || k.label.x + k.label.w > k.key.x + k.key.w + 0.5) fail(`${tag} ${phase}: key ${k.face}: the strip spills sideways`);
      }

      // pixel pass: one screenshot of the whole row, one crop per face area
      const rowShot = `${SHOT_DIR}/${tag}-${phase}-row.png`;
      await page.locator('.keys').screenshot({ path: rowShot });
      const row = PNG.read(rowShot);
      const rowBox = await page.locator('.keys').boundingBox();
      const scale = row.width / rowBox.width;
      for (const k of geo) {
        const found = blobs(row, rowBox, k.sq, scale);
        const want = EXPECT[k.face];
        const rel = found.map((b) => [
          ((b.cx - k.sq.x) / k.sq.w) * 100,
          ((b.cy - k.sq.y) / k.sq.h) * 100,
        ]);
        const dump = JSON.stringify(rel.map((r) => r.map((v) => Math.round(v))));
        if (found.length !== want.length) {
          fail(`${tag} ${phase}: key ${k.face} PAINTS ${found.length} pips, must paint ${want.length} — ${dump}`);
          continue;
        }
        for (const [ey, ex] of want) {
          if (!rel.some(([rx, ry]) => Math.abs(rx - ex) < 10 && Math.abs(ry - ey) < 10)) {
            fail(`${tag} ${phase}: key ${k.face} paints no pip at top ${ey}/left ${ex} — painted ${dump}`);
          }
        }
        for (const [rx, ry] of rel) {
          if (!want.some(([ey, ex]) => Math.abs(rx - ex) < 10 && Math.abs(ry - ey) < 10)) {
            fail(`${tag} ${phase}: key ${k.face} paints an EXTRA pip at top ${Math.round(ry)}/left ${Math.round(rx)}`);
          }
        }
        for (const b of found) {
          if (b.h > k.sq.h * 0.6) fail(`${tag} ${phase}: key ${k.face}: dark region ${Math.round(b.w)}x${Math.round(b.h)} is not a pip`);
        }
      }
      const line = geo.map((k) => `${k.face}:${k.pips.length}${k.count !== '0' ? `x${k.count}` : ''}`).join(' ');
      console.log(`  faces ${line} · key ${Math.round(geo[0].key.w)}x${Math.round(geo[0].key.h)} · pip area ${Math.round(geo[0].sq.w)}² · strip ${Math.round(geo[0].label.h)}px`);
      if (geo[0].key.h < 44) fail(`${tag} ${phase}: key height ${Math.round(geo[0].key.h)} < 44`);
      if (geo[0].key.w < 44) fail(`${tag} ${phase}: key width ${Math.round(geo[0].key.w)} < 44`);
      const spill = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 0.5; })
        .map((e) => e.className || e.tagName));
      if (spill.length) fail(`${tag} ${phase}: horizontal spill ${JSON.stringify(spill.slice(0, 3))}`);
      await page.screenshot({ path: `${SHOT_DIR}/${tag}-${phase}-full.png`, fullPage: true });
    }
    // the five slots must read as real dice, not as numbered boxes
    const slotInfo = await page.evaluate(() => [...document.querySelectorAll('[data-testid="entry-slot"]')].map((s) => {
      const b = s.getBoundingClientRect();
      const die = s.querySelector('.die');
      const r = die.getBoundingClientRect();
      return { filled: s.dataset.filled, painted: getComputedStyle(die).display !== 'none', w: r.width, h: r.height, key: { x: b.x, y: b.y, w: b.width, h: b.height } };
    }));
    for (const s of slotInfo) {
      if (s.key.w < 44 || s.key.h < 44) fail(`${tag}: an entry slot is ${Math.round(s.key.w)}x${Math.round(s.key.h)} < 44`);
      if (s.filled === 'true' && (!s.painted || s.w < 20)) fail(`${tag}: a filled slot paints no die face (${s.w}x${s.h})`);
    }
    console.log(`  slots ${slotInfo.map((s) => `${s.filled === 'true' ? '▪' : '▫'}${Math.round(s.key.w)}`).join('')}`);
    {
      const shot = `${SHOT_DIR}/${tag}-slots.png`;
      await page.locator('#slots').screenshot({ path: shot });
      const img = PNG.read(shot);
      const box = await page.locator('#slots').boundingBox();
      const sc = img.width / box.width;
      const faces = await page.evaluate(() => [...document.querySelectorAll('[data-testid="entry-slot"]')].map((s) => {
        const d = s.querySelector('.die').getBoundingClientRect();
        return { v: s.querySelector('.die').dataset.value || '', x: d.x, y: d.y, w: d.width, h: d.height };
      }));
      for (const f of faces) {
        if (!f.v) continue;
        // crop inside the die's rounded corners: outside them the dark tray hole
        // shows through and would count as one more dark region
        const found = blobs(img, box, { x: f.x + 4, y: f.y + 4, w: f.w - 8, h: f.h - 8 }, sc);
        if (found.length !== EXPECT[+f.v].length) {
          fail(`${tag}: the slot showing ${f.v} paints ${found.length} separate pips in ${Math.round(f.w)}px — they are merging`);
        }
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log(failures ? `\nKEYPAD PROBE: ${failures} FAILURE(S)` : '\nKEYPAD PROBE: every key paints its true face — both phones, both themes, counted and uncounted');
process.exit(failures ? 1 : 0);

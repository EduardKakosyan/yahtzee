/**
 * Draws the app icons with Canvas in headless Chromium and writes PNGs into public/icons.
 * Usage: node scripts/gen-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');

const DRAW = `
(function () {
  var ctx = window.__ctx, S = window.__S;
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  var PAD = window.__PAD || 1;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  if (PAD !== 1) { ctx.translate(S / 2, S / 2); ctx.scale(PAD, PAD); ctx.translate(-S / 2, -S / 2); }

  // warm tin base
  rr(0, 0, S, S, S * 0.223);
  var bg = ctx.createLinearGradient(0, 0, S * 0.4, S);
  bg.addColorStop(0, '#f8efdd');
  bg.addColorStop(1, '#e3d2ac');
  ctx.fillStyle = bg;
  ctx.fill();

  // stitched border
  ctx.save();
  ctx.setLineDash([S * 0.022, S * 0.019]);
  ctx.lineWidth = S * 0.012;
  ctx.strokeStyle = 'rgba(162,54,10,0.5)';
  rr(S * 0.045, S * 0.045, S * 0.91, S * 0.91, S * 0.175);
  ctx.stroke();
  ctx.restore();

  // campfire ember glow, low right
  var glow = ctx.createRadialGradient(S * 0.86, S * 0.9, 0, S * 0.86, S * 0.9, S * 0.7);
  glow.addColorStop(0, 'rgba(226,87,27,0.5)');
  glow.addColorStop(0.6, 'rgba(226,87,27,0.12)');
  glow.addColorStop(1, 'rgba(226,87,27,0)');
  ctx.fillStyle = glow;
  rr(0, 0, S, S, S * 0.223);
  ctx.fill();

  // tilted log
  ctx.save();
  ctx.translate(S * 0.5, S * 0.855);
  ctx.rotate(-0.13);
  rr(-S * 0.33, -S * 0.045, S * 0.66, S * 0.09, S * 0.045);
  ctx.fillStyle = '#7a4a1c';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(S * 0.33, 0, S * 0.045, 0, 6.2832);
  ctx.fillStyle = '#c08a4a';
  ctx.fill();
  ctx.restore();

  // flame behind the die
  ctx.save();
  ctx.translate(S * 0.8, S * 0.68);
  ctx.scale(S / 512, S / 512);
  ctx.beginPath();
  ctx.moveTo(0, -150);
  ctx.bezierCurveTo(70, -70, 84, 4, 46, 72);
  ctx.bezierCurveTo(22, 112, -30, 116, -54, 74);
  ctx.bezierCurveTo(-80, 30, -40, -8, -16, -52);
  ctx.bezierCurveTo(-24, -22, -8, -6, 4, -18);
  ctx.bezierCurveTo(18, -34, 14, -100, 0, -150);
  ctx.closePath();
  var fg = ctx.createLinearGradient(0, -150, 0, 110);
  fg.addColorStop(0, '#ffdc84');
  fg.addColorStop(0.45, '#ff9c3b');
  fg.addColorStop(1, '#d7420f');
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.restore();

  // hero die
  var D = S * 0.6;
  ctx.save();
  ctx.translate(S * 0.45, S * 0.5);
  ctx.rotate(-0.11);
  ctx.save();
  ctx.translate(S * 0.014, S * 0.026);
  rr(-D / 2, -D / 2, D, D, D * 0.2);
  ctx.fillStyle = 'rgba(60,32,8,0.28)';
  ctx.fill();
  ctx.restore();
  rr(-D / 2, -D / 2, D, D, D * 0.2);
  var dg = ctx.createLinearGradient(-D / 2, -D / 2, D / 2, D / 2);
  dg.addColorStop(0, '#fffcf3');
  dg.addColorStop(1, '#e0cfae');
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.lineWidth = D * 0.022;
  ctx.strokeStyle = 'rgba(90,54,14,0.4)';
  ctx.stroke();

  function pip(x, y, rad, stops) {
    var g = ctx.createRadialGradient(x - rad * 0.34, y - rad * 0.34, rad * 0.12, x, y, rad);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 6.2832);
    ctx.fillStyle = g;
    ctx.fill();
  }
  var spots = [[-0.285, -0.285], [0.285, -0.285], [0, 0], [-0.285, 0.285], [0.285, 0.285]];
  spots.forEach(function (sp, i) {
    var dark = [[0, '#5c4630'], [1, '#1c1206']];
    var gold = [[0, '#ffdb95'], [0.55, '#f0a52c'], [1, '#a2360a']];
    pip(sp[0] * D, sp[1] * D, D * 0.108, i === 2 ? gold : dark);
  });
  ctx.restore();

  // checkmark on the ember
  ctx.save();
  ctx.translate(S * 0.865, S * 0.9);
  ctx.scale(S / 512, S / 512);
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffd479';
  ctx.beginPath();
  ctx.moveTo(-26, 2);
  ctx.lineTo(-6, 24);
  ctx.lineTo(30, -22);
  ctx.stroke();
  ctx.restore();

  // rim
  rr(0, 0, S, S, S * 0.223);
  ctx.lineWidth = S * 0.014;
  ctx.strokeStyle = 'rgba(122,76,26,0.45)';
  ctx.stroke();
  ctx.restore();
})();
`;

const sizes = [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
  ['maskable-512.png', 512],
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

mkdirSync(outDir, { recursive: true });
for (const [name, size] of sizes) {
  const dataUrl = await page.evaluate(async ({ code, size, pad }) => {
    const c = document.getElementById('c');
    c.width = size;
    c.height = size;
    window.__ctx = c.getContext('2d');
    window.__S = size;
    window.__PAD = pad;
    new Function(code)();
    return c.toDataURL('image/png');
  }, { code: DRAW, size, pad: name.startsWith('maskable') ? 0.78 : 1 });
  writeFileSync(resolve(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', name, `${size}px`);
}
await browser.close();

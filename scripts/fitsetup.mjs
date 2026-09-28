/** Where does the setup CTA land as the roster grows, on each phone? */
import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const NAMES = ['Ana', 'Ben', 'Chloé', 'Dev', 'Mari', 'Sam', 'Tomas', 'Yuki'];
const b = await chromium.launch();
for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/');
  for (const n of NAMES) {
    await page.getByLabel('Player name', { exact: true }).fill(n);
    await page.getByTestId('add-player').click();
  }
  const m = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
    };
    return { innerH: innerHeight, docH: document.documentElement.scrollHeight, cta: r('#start-game'), chips: r('#chips') };
  });
  console.log(`${vp.width}x${vp.height}: CTA ${m.cta.top}..${m.cta.bottom} of ${m.innerH} -> above fold: ${m.cta.bottom <= m.innerH} (doc ${m.docH})`);
  await ctx.close();
}
await b.close();

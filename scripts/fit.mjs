import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const b = await chromium.launch();
for (const vp of [{width:375,height:667},{width:390,height:844}]) {
  for (const theme of ['light','dark']) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: theme });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('yahtzee.theme.v1', t), theme);
    await page.goto('http://localhost:3000/');
    for (const n of ['Ana','Ben','Chloé']) {
      await page.getByLabel('Player name', { exact: true }).fill(n);
      await page.getByTestId('add-player').click();
    }
    await page.getByTestId('start-game').click();
    await page.evaluate(() => { window.__yahtzeeDice = [2,2,3,3,5]; });
    await page.getByTestId('roll').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=die]')].every(d=>d.getAttribute('data-value')));
    await page.getByTestId('die').nth(0).click();
    const m = await page.evaluate(() => {
      const bb = (s) => { const e=document.querySelector(s); if(!e) return '0'; const r=e.getBoundingClientRect(); return `${Math.round(r.top)}..${Math.round(r.bottom)}`; };
      const rowY = [...document.querySelectorAll('.tot')].map(e => Math.round(e.getBoundingClientRect().top));
      return { innerH: innerHeight, oneRow: new Set(rowY).size === 1, totalsBottom: Math.round(document.querySelector('.totals').getBoundingClientRect().bottom),
        turn: bb('.turn'), felt: bb('.felt'), card: bb('#card'), totals: bb('.totals'), board: bb('#scoreboard'),
        totLabelPx: Math.round(parseFloat(getComputedStyle(document.querySelector('.tot-label')).fontSize)),
        totText: document.querySelector('.totals').textContent.replace(/\s+/g,' ') };
    });
    console.log(`${vp.width}x${vp.height} ${theme}: oneRow=${m.oneRow} totalsBottom=${m.totalsBottom}/${m.innerH} label=${m.totLabelPx}px turn=${m.turn} felt=${m.felt} card=${m.card} totals=${m.totals} board=${m.board}`);
    console.log(`   chips: ${m.totText}`);
    await page.screenshot({ path: `shots/fit-${vp.width}-${theme}.png`, fullPage: true });
    await ctx.close();
  }
}
await b.close();

import pkg from '/workspace/project/node_modules/@playwright/test/index.js'; const { chromium } = pkg;
const b = await chromium.launch();
for (const vp of [{width:375,height:667},{width:390,height:844}]) {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/');
  for (const n of ['Ana','Ben','Chloé']) {
    await page.getByLabel('Player name', { exact: true }).fill(n);
    await page.getByTestId('add-player').click();
  }
  const m = await page.evaluate(() => {
    const r = (s) => { const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return `${Math.round(b.top)}..${Math.round(b.bottom)}`; };
    const tools = [...document.querySelectorAll('.setup-tools .btn')].map(e => { const b=e.getBoundingClientRect(); return `${e.id}:${Math.round(b.top)}..${Math.round(b.bottom)}`; });
    return { innerH: innerHeight, docH: document.documentElement.scrollHeight, brand: r('.brand'), form: r('.add-form'),
      chips: r('#chips'), cta: r('#start-game'), tools };
  });
  console.log(vp.width+'x'+vp.height, JSON.stringify(m));
  await ctx.close();
}
await b.close();

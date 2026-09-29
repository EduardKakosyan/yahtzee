import { test, expect } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PHONE, addPlayers, roll } from './fixtures';

test('it can be added to the iPhone home screen: manifest, icons and apple-touch-icon are present and relative', async ({ page, request }) => {
  await page.goto('/');
  const info = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
    touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    absolute: Array.from(document.querySelectorAll('link[href],script[src],img[src],source[src],use[href],image[href]'))
      .map((e) => e.getAttribute('src') ?? e.getAttribute('href') ?? '')
      .filter((u) => u.startsWith('/') || /^https?:/i.test(u)),
  }));
  expect(info.manifest, 'a <link rel="manifest">').not.toBeNull();
  expect(info.touch, 'a <link rel="apple-touch-icon">').not.toBeNull();
  expect(info.viewport).toContain('width=device-width');
  expect(info.absolute, 'every URL in the page must be relative (the app is hosted under a sub-path)').toEqual([]);

  const base = page.url();
  const touch = await request.get(new URL(info.touch!, base).toString());
  expect(touch.ok(), 'apple-touch-icon loads').toBe(true);

  const manifestUrl = new URL(info.manifest!, base).toString();
  const res = await request.get(manifestUrl);
  expect(res.ok(), 'manifest loads').toBe(true);
  const m = await res.json();
  expect(typeof m.name === 'string' && m.name.length > 0, 'manifest name').toBe(true);
  expect(m.display, 'manifest display').toBe('standalone');
  for (const key of ['start_url', 'scope']) {
    if (m[key] !== undefined) expect(String(m[key]).startsWith('/') || /^https?:/i.test(String(m[key])), `${key} must be relative`).toBe(false);
  }
  const sizes = (m.icons ?? []).map((i: { sizes?: string }) => i.sizes ?? '');
  expect(sizes.some((s: string) => s.includes('192x192')), '192x192 icon').toBe(true);
  expect(sizes.some((s: string) => s.includes('512x512')), '512x512 icon').toBe(true);
  for (const icon of m.icons ?? []) {
    expect(String(icon.src).startsWith('/'), 'icon src must be relative').toBe(false);
    const r = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(r.ok(), `icon ${icon.src} loads`).toBe(true);
  }
});

/** A localhost pass-through to APP_URL: service workers need a secure origin, and localhost is one. */
async function localhostProxy(target: string): Promise<{ url: string; close: () => Promise<void> }> {
  const upstream = new URL(target);
  const server = http.createServer((req, res) => {
    const fwd = http.request(
      { hostname: upstream.hostname, port: upstream.port || 80, path: req.url, method: req.method,
        headers: { ...req.headers, host: upstream.host } },
      (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
    );
    fwd.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(fwd);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return { url: `http://localhost:${port}/`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('after one visit it works with no connection: reload offline, start a game and roll', async ({ browser }, testInfo) => {
  // GitHub Pages is https. The evaluator reaches the demo over plain http by host name, where
  // service workers are not allowed, so this check visits it through a localhost pass-through.
  const proxy = await localhostProxy(String(testInfo.project.use.baseURL ?? process.env.APP_URL));
  const context = await browser.newContext({ viewport: PHONE });
  try {
    const page = await context.newPage();
    await page.goto(proxy.url);
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('no service worker support');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('setup')).toBeVisible();
    await addPlayers(page, ['Ana']);
    await page.getByTestId('start-game').click();
    await roll(page, [6, 6, 6, 6, 6]);
    await expect(page.getByTestId('score-yahtzee').getByTestId('score-value')).toHaveText('50');
  } finally {
    await context.close();
    await proxy.close();
  }
});

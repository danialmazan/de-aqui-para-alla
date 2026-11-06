// Review round 3 screenshots: opening view (zoom, dot brightness, the ⓘ),
// the Ctrl/⌘ wheel hint, the day picker after a click (no focus ring) and the
// Tu lugar heading with "Busca otro lugar". Needs a dev server (BENCH_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const OUT = 'docs/review3';
mkdirSync(OUT, { recursive: true });
const sizes = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] ${e.message}`));
  await page.goto(`${BASE}?perf`);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);
  console.log(size, (await page.locator('.perf').innerText()).replace(/\n/g, ' | '));
  await page.goto(BASE);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/${size}-hero.png` });
  if (size === 'desktop') {
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${size}-wheel-hint.png` });
    console.log(size, 'hint opacity', await page.locator('.maplibregl-cooperative-gesture-screen').evaluate((e) => getComputedStyle(e).opacity));
    await page.waitForTimeout(2500);
    console.log(size, 'hint opacity later', await page.locator('.maplibregl-cooperative-gesture-screen').evaluate((e) => getComputedStyle(e).opacity));
    await page.evaluate(() => scrollTo(0, 0));
  }
  await page.locator('.day-pick select').click();
  await page.waitForTimeout(200);
  console.log(size, 'select outline after click', await page.locator('.day-pick select').evaluate((e) => getComputedStyle(e).outlineStyle));
  await page.locator('.day-pick select').evaluate((e) => e.blur());
  await page.locator('.dock').screenshot({ path: `${OUT}/${size}-dock.png` });
  await page.locator('#tu-lugar .section-head').scrollIntoViewIfNeeded();
  await page.locator('#tu-lugar .section-head').screenshot({ path: `${OUT}/${size}-tulugar-head.png` });
  await page.locator('.find-other').click();
  await page.waitForTimeout(1200);
  console.log(size, 'find-other focused', await page.evaluate(() => document.activeElement?.id), Math.round(await page.evaluate(() => scrollY)));
  await ctx.close();
}
await browser.close();

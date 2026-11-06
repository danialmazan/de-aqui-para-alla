// Review-round screenshots (feedback after Stage 3): desktop, tablet-width
// desktop and phone, with and without a place. Needs a dev server (BENCH_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const OUT = 'docs/review1';
mkdirSync(OUT, { recursive: true });
const sizes = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  narrow: { viewport: { width: 861, height: 720 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const ready = (page) => page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${size}] ${m.text()}`); });
  await page.goto(`${BASE}?perf`);
  await ready(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${size}-start.png` });
  console.log(size, 'start', (await page.locator('.perf').innerText()).replace(/\n/g, ' | '));
  await page.goto(`${BASE}?lugar=08019&dia=verano-finde&perf`);
  await ready(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${size}-barcelona.png` });
  if (size === 'mobile') {
    await page.locator('.sheet-handle').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${size}-barcelona-open.png` });
  } else {
    await page.locator('.dock-toggle').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${size}-barcelona-dock-full.png` });
  }
  await page.goto(`${BASE}?lugar=28079&dia=nochebuena&perf`);
  await ready(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${size}-madrid-nochebuena.png` });
  console.log(size, 'nochebuena', (await page.locator('.perf').innerText()).replace(/\n/g, ' | '));
  await page.evaluate(() => window.scrollTo(0, 260));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${size}-compact-bar.png` });
  await page.locator('#tu-lugar').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('#tu-lugar').screenshot({ path: `${OUT}/${size}-tu-lugar.png` });
  await page.locator('#como-leer').screenshot({ path: `${OUT}/${size}-methods.png` });
  await ctx.close();
}
await browser.close();

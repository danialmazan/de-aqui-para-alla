// Stage 3 review screenshots: whole page at phone and desktop sizes, the phone
// sheet expanded with a place, and the English page. Needs the dev server on :5191.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5191/de-aqui-para-alla/';
const OUT = 'docs/stage3';
mkdirSync(OUT, { recursive: true });
const sizes = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const ready = (page) => page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] ${e.message}`));
  await page.goto(`${BASE}?lugar=28065`);
  await ready(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/hero-getafe-${size}.png` });
  if (size === 'mobile') {
    await page.locator('.sheet-handle').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/hero-getafe-sheet-open-mobile.png` });
    await page.locator('.sheet-handle').click();
  }
  await page.locator('#tu-lugar').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('#tu-lugar').screenshot({ path: `${OUT}/tu-lugar-getafe-${size}.png` });
  await page.locator('#como-leer').screenshot({ path: `${OUT}/methods-${size}.png` });
  await page.goto(`${BASE}en/`);
  await ready(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/hero-en-${size}.png` });
  await ctx.close();
}
await browser.close();

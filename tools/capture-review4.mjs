// Review round 4 screenshots: the pulse chart compared with a Saturday, La
// carrera (per resident and total) and Días raros, at desktop and phone sizes.
// Needs a dev server (BENCH_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const OUT = 'docs/review4';
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
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${size}] console: ${m.text()}`); });
  await page.goto(BASE);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => { document.querySelector('.dock .play')?.click(); }); // pause at 05:00-ish
  await page.locator('.cmp-pick select').selectOption('sabado');
  await page.locator('.tl-heartbeat').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.locator('.tl-heartbeat').screenshot({ path: `${OUT}/${size}-pulse-compare.png` });
  console.log(size, 'delta:', await page.locator('.cmp-delta').innerText());
  await page.locator('.race-hour').fill('8');
  await page.locator('#carrera').scrollIntoViewIfNeeded();
  await page.locator('#carrera .ranking li').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.locator('#carrera').screenshot({ path: `${OUT}/${size}-race-res.png` });
  console.log(size, 'race 08 res:', (await page.locator('#carrera .ranking').innerText()).replace(/\n/g, ' '));
  await page.locator('#carrera .segmented button').nth(1).click();
  await page.waitForTimeout(900);
  await page.locator('#carrera .race-card').screenshot({ path: `${OUT}/${size}-race-total.png` });
  await page.locator('#dias-raros').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('#dias-raros').screenshot({ path: `${OUT}/${size}-odd.png` });
  console.log(size, 'odd:', (await page.locator('.odd-figure').allInnerTexts()).map((x) => x.replace(/\n/g, ' ')).join(' | '));
  console.log(size, 'page height', await page.evaluate(() => document.documentElement.scrollHeight), 'scrollW', await page.evaluate(() => document.documentElement.scrollWidth));
  await page.locator('#carrera .rk-pick').first().click();
  await page.waitForTimeout(1500);
  console.log(size, 'picked place in URL:', new URL(page.url()).search);
  await ctx.close();
}
await browser.close();

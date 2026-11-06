// Review round 5 screenshots: Tu lugar cards with the page-day pill, the pulse
// comparison and its reset, La carrera (destinations / origins, total / per
// resident, its own day), and the pill taking you to the map's day picker.
// Needs a dev server (BENCH_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const OUT = 'docs/review5';
mkdirSync(OUT, { recursive: true });
const sizes = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const rows = async (page) => (await page.locator('#carrera .ranking').innerText()).replace(/\n/g, ' ');
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${size}] console: ${m.text()}`); });
  await page.goto(BASE);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => { document.querySelector('.dock .play')?.click(); });
  await page.locator('.tl-heartbeat .cmp-pick select').selectOption('sabado');
  await page.locator('.tl-grid').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.locator('.tl-grid').screenshot({ path: `${OUT}/${size}-tu-lugar-cards.png` });
  console.log(size, 'delta:', await page.locator('.cmp-delta').innerText());

  await page.locator('.race-hour').fill('8');
  await page.locator('#carrera').scrollIntoViewIfNeeded();
  await page.locator('#carrera .ranking li').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.locator('#carrera').screenshot({ path: `${OUT}/${size}-race-in-total.png` });
  console.log(size, 'in total 08:', await rows(page));
  await page.locator('#carrera').getByRole('button', { name: /Por habitante/ }).click();
  await page.waitForTimeout(900);
  console.log(size, 'in res 08:', await rows(page));
  await page.locator('#carrera').getByRole('button', { name: /Orígenes/ }).click();
  await page.waitForTimeout(900);
  await page.locator('#carrera .race-card').screenshot({ path: `${OUT}/${size}-race-out-res.png` });
  console.log(size, 'out res 08:', await rows(page));
  await page.locator('#carrera').getByRole('button', { name: /^Total/ }).click();
  await page.waitForTimeout(900);
  console.log(size, 'out total 08:', await rows(page));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.locator('#carrera select').selectOption('domingo');
  await page.waitForTimeout(900);
  console.log(size, 'scroll moved by', (await page.evaluate(() => window.scrollY)) - y0, 'url', new URL(page.url()).search);
  await page.locator('#carrera .race-card').screenshot({ path: `${OUT}/${size}-race-own-day.png` });

  await page.locator('.tl-heartbeat .day-pill').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${size}-pill-to-picker.png` });
  console.log(size, 'after pill: scrollY', await page.evaluate(() => window.scrollY), 'focused', await page.evaluate(() => document.activeElement?.id));
  console.log(size, 'page height', await page.evaluate(() => document.documentElement.scrollHeight), 'scrollW', await page.evaluate(() => document.documentElement.scrollWidth));
  await ctx.close();
}
await browser.close();

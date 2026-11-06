// Review round 2 screenshots: Tu lugar (aligned numbers, pulse readout while
// scrubbing), section 02 with its sources, the footer and the top bar's search
// button, at desktop and phone sizes. Needs a dev server (BENCH_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const OUT = 'docs/review2';
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
  await page.goto(BASE);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${size}-bar-find.png`, clip: { x: 0, y: 0, width: opts.viewport.width, height: 70 } });
  await page.locator('#tu-lugar').scrollIntoViewIfNeeded();
  const hb = page.locator('.heartbeat');
  await hb.scrollIntoViewIfNeeded();
  const box = await hb.boundingBox();
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.locator('.tl-heartbeat').screenshot({ path: `${OUT}/${size}-pulse-scrub.png` });
  console.log(size, 'scrub', await page.locator('.hb-key').innerText());
  await page.mouse.up();
  await page.waitForTimeout(1300);
  console.log(size, 'after', await page.locator('.hb-key').innerText());
  await page.locator('#tu-lugar .kpis').screenshot({ path: `${OUT}/${size}-kpis.png` });
  await page.locator('#como-leer').screenshot({ path: `${OUT}/${size}-methods.png` });
  await page.locator('.footer').screenshot({ path: `${OUT}/${size}-footer.png` });
  await page.locator('.compact-bar .find-pill').click();
  await page.waitForTimeout(1200);
  console.log(size, 'focused', await page.evaluate(() => document.activeElement?.id), Math.round(await page.evaluate(() => scrollY)));
  await ctx.close();
}
await browser.close();

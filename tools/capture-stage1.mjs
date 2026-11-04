// Captures the Stage 1 review screenshots (specimen + engine spike) at phone
// and desktop sizes into docs/stage1/. Needs the dev server on :5191.
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5191/de-aqui-para-alla/';
const sizes = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}specimen.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/stage1/specimen-${name}.png`, fullPage: true });
  await page.goto(`${BASE}?perf`);
  await page.waitForFunction(() => document.querySelector('.perf')?.textContent?.includes('arcos'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `docs/stage1/map-${name}.png` });
  await ctx.close();
}
await browser.close();

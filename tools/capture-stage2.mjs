// Captures Stage 2 review screenshots of the living map (Madrid opening view,
// all of Spain, and a special day) at phone and desktop sizes into docs/stage2/,
// and logs frame times. Needs the dev server on :5191.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5191/de-aqui-para-alla/';
const OUT = 'docs/stage2';
mkdirSync(OUT, { recursive: true });
const sizes = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const views = {
  madrid: '?perf',
  espana: '?perf&vista=espana',
  nochebuena: '?perf&dia=nochebuena',
};
const perf = {};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] ${e.message}`));
  for (const [view, query] of Object.entries(views)) {
    await page.goto(`${BASE}${query}`);
    await page.waitForFunction(() => document.querySelector('.perf')?.textContent?.includes('arcos'), null, { timeout: 30000 });
    await page.waitForTimeout(4000);
    perf[`${size}-${view}`] = await page.evaluate(() => ({
      p50: document.documentElement.dataset.p50FrameMs,
      p95: document.documentElement.dataset.p95FrameMs,
      text: document.querySelector('.perf')?.textContent,
    }));
    await page.screenshot({ path: `${OUT}/map-${view}-${size}.png` });
  }
  await ctx.close();
}
await browser.close();
writeFileSync('reports/performance-stage2.json', JSON.stringify(perf, null, 2));
console.log(perf);

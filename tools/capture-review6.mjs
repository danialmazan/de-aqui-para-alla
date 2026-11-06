// Review round 6: dock clock/play alignment, the map reset button, the place
// card fitting its top 5, Tu lugar's two-row grid and toggles, the pulse
// chart's axis on phones, and 02 + 03 side by side. Needs a dev server (BENCH_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const OUT = 'docs/review6';
mkdirSync(OUT, { recursive: true });
const sizes = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1440, height: 760 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const centre = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return Math.round((r.top + r.height / 2) * 10) / 10;
}, sel);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${size}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${size}] console: ${m.text()} @ ${m.location().url}:${m.location().lineNumber}`); });
  await page.goto(`${BASE}?lugar=19171`);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => { document.querySelector('.dock .play')?.click(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${size}-hero-place.png` });
  console.log(size, 'play centre', await centre(page, '.dock .play'), 'clock centre', await centre(page, '.dock .clock-time'));
  console.log(size, 'place card', await page.evaluate(() => {
    const c = document.querySelector('.hero .place-card');
    return c ? { scroll: c.scrollHeight, client: c.clientHeight } : 'none';
  }));
  if (size === 'mobile') {
    await page.locator('.dock .place-row').screenshot({ path: `${OUT}/${size}-place-row.png` });
    console.log(size, 'search row', await page.evaluate(() => {
      const s = document.querySelector('.search-row .search-pill')?.getBoundingClientRect();
      const b = document.querySelector('.search-row .map-reset')?.getBoundingClientRect();
      return { search: [Math.round(s.left), Math.round(s.right)], reset: b && [Math.round(b.left), Math.round(b.right)] };
    }));
  }
  await page.locator('.map-reset').click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${size}-hero-reset.png` });
  console.log(size, 'after reset url', new URL(page.url()).search, 'view row', await page.evaluate(() => {
    const s = document.querySelector('.hero .search-pill')?.getBoundingClientRect();
    const v = document.querySelector('.view-row')?.getBoundingClientRect();
    return v ? { searchW: Math.round(s.width), rowW: Math.round(v.width) } : 'none';
  }));

  await page.goto(`${BASE}?lugar=19171&sentido=llegan`);
  await page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30000 });
  await page.locator('.tl-grid').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.locator('.tl-grid').screenshot({ path: `${OUT}/${size}-tu-lugar.png` });
  console.log(size, 'toggle rows', await page.evaluate(() => [...document.querySelectorAll('.card-toggles .segmented')].map((e) => Math.round(e.getBoundingClientRect().top))));
  console.log(size, 'distance note', await page.locator('.tl-distance .card-note').innerText());
  console.log(size, 'axis inside card', await page.evaluate(() => {
    const card = document.querySelector('.tl-heartbeat').getBoundingClientRect();
    const left = Math.min(...[...document.querySelectorAll('.hb-tick')].map((e) => e.getBoundingClientRect().left));
    return { cardLeft: Math.round(card.left), tickLeft: Math.round(left) };
  }));
  await page.locator('.pair').scrollIntoViewIfNeeded();
  await page.locator('#carrera .ranking li').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.locator('.pair').screenshot({ path: `${OUT}/${size}-race-odd.png` });
  console.log(size, 'race toggles rows', await page.evaluate(() => [...document.querySelectorAll('.race-toggles .segmented')].map((e) => Math.round(e.getBoundingClientRect().top))));
  console.log(size, 'page height', await page.evaluate(() => document.documentElement.scrollHeight), 'scrollW', await page.evaluate(() => document.documentElement.scrollWidth));
  await ctx.close();
}
await browser.close();

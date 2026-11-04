// Exercises search and place mode at phone and desktop sizes: types a name,
// picks the first hit, switches to "Llegan", and captures each step into
// docs/stage2/. Also checks a grouped zone and a URL that opens a place directly.
// Needs the dev server on :5191.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5191/de-aqui-para-alla/';
const OUT = 'docs/stage2';
mkdirSync(OUT, { recursive: true });
const sizes = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const ready = (page) => page.waitForFunction(() => document.querySelector('.perf')?.textContent?.includes('arcos'), null, { timeout: 30000 });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failures = 0;
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { failures++; console.error(`[${size}] ${e.message}`); });
  await page.goto(`${BASE}?perf`);
  await ready(page);

  await page.getByRole('combobox', { name: /Busca/ }).fill('getafe');
  const first = page.getByRole('option').first();
  await first.waitFor();
  console.log(size, 'first hit:', await first.innerText());
  await page.getByRole('combobox', { name: /Busca/ }).press('Enter');
  await page.locator('.place-card').waitFor();
  await page.waitForTimeout(2500);
  console.log(size, 'card:', (await page.locator('.pc-kpis').innerText()).replace(/\s+/g, ' '));
  console.log(size, 'url:', page.url());
  await page.screenshot({ path: `${OUT}/place-getafe-salen-${size}.png` });

  await page.getByRole('button', { name: /Llegan/ }).click();
  await page.waitForTimeout(1500);
  console.log(size, 'top llegan:', (await page.locator('.bars').innerText()).split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/place-getafe-llegan-${size}.png` });

  // A municipality inside a grouped zone, found by its own name.
  await page.getByRole('combobox', { name: /Busca/ }).fill('valdemorillo');
  await page.getByRole('option').first().waitFor();
  console.log(size, 'grouped hit:', (await page.getByRole('option').first().innerText()).replace(/\n/g, ' · '));

  // Opening a shared URL directly.
  await page.goto(`${BASE}?perf&lugar=08019&dia=nochebuena`);
  await ready(page);
  await page.locator('.place-card').waitFor();
  await page.waitForTimeout(2500);
  console.log(size, 'shared url card:', await page.locator('.pc-name').innerText());
  await page.screenshot({ path: `${OUT}/place-barcelona-nochebuena-${size}.png` });

  await page.getByRole('button', { name: /España/ }).click();
  await page.waitForTimeout(1800);
  console.log(size, 'after close url:', page.url());
  await ctx.close();
}
await browser.close();
if (failures) process.exit(1);

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ready = (page: Page) => page.locator('#tu-lugar .kpi-card').first().waitFor({ timeout: 30_000 });
const search = (page: Page) => page.getByRole('combobox', { name: /Busca|Find/ });

test('loads with no errors and no serious accessibility issues', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#tu-lugar h2')).toContainText('Madrid');
  const axe = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
  expect(errors).toEqual([]);
});

test('search opens a place; Tu lugar and the URL follow', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await search(page).fill('getafe');
  await page.getByRole('option').first().waitFor();
  await search(page).press('Enter');
  await expect(page).toHaveURL(/lugar=28065/);
  await expect(page.locator('#tu-lugar h2')).toContainText('Getafe');
  await page.locator('#tu-lugar').getByRole('button', { name: 'Llegan' }).click();
  await expect(page).toHaveURL(/sentido=llegan/);
  await expect(page.locator('#tu-lugar .card-title').first()).toHaveText('De dónde vienen');
});

test('a shared link restores place, direction and day', async ({ page }) => {
  await page.goto('./?lugar=08019&sentido=llegan&dia=sabado');
  await ready(page);
  await expect(page.locator('#tu-lugar h2')).toContainText('Barcelona');
  await expect(page.locator('#tu-lugar').getByRole('button', { name: 'Llegan' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hero-note')).toContainText('sábado normal');
});

test('reduced motion: nothing autoplays', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('./');
  await ready(page);
  const t1 = await page.locator('.clock-time').innerText();
  await page.waitForTimeout(3000);
  expect(await page.locator('.clock-time').innerText()).toBe(t1);
  expect(t1).toBe('08:00');
  await ctx.close();
});

test('English page', async ({ page }) => {
  await page.goto('./en/');
  await ready(page);
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  await expect(page.locator('#tu-lugar h2')).toHaveText('How Madrid moves');
  await expect(search(page)).toHaveAttribute('placeholder', 'Find your town or city');
});

test('no horizontal scroll at 320 px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.goto('./');
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('a data failure shows a retry', async ({ page }) => {
  await page.route('**/data/release.json', (r) => r.fulfill({ status: 500, body: 'no' }));
  await page.goto('./');
  await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

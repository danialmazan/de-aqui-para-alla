// Sharing previews (1200×630 JPEG, one per language) rendered from the real
// map: all of Spain at 08:00 on a normal weekday, with the title and a one-line
// tagline. Writes public/social-es.jpg and public/social-en.jpg.
// Needs a dev server (BENCH_URL).
import { chromium } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5173/de-aqui-para-alla/';
const TAGLINE = {
  es: ['Cómo se mueve España, hora a hora', 'Viajes entre municipios en un día laborable · datos abiertos del Ministerio de Transportes'],
  en: ['How Spain moves, hour by hour', 'Trips between municipalities on a weekday · Ministry of Transport open data'],
};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const lang of ['es', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${lang === 'en' ? 'en/' : ''}?vista=espana&core=0.55&gain=2.4&radius=4.6&halo=1.3`);
  await page.locator('.dock').waitFor({ timeout: 30000 });
  await page.waitForTimeout(5000);
  const [title, sub] = TAGLINE[lang];
  await page.evaluate(({ title, sub }) => {
    const css = document.createElement('style');
    css.textContent = `
      .dock, .search-row, .view-row, .lang-float, .hero-next, .hero-note, .maplibregl-control-container, .compact-bar { display: none !important; }
      .hero { height: 630px !important; min-height: 0 !important; --next-h: 0px !important; }
      .hero .map { bottom: 0 !important; }
      .hero-head { top: 44px !important; left: 52px !important; width: 500px !important; }
      .hero-wordmark { width: 440px !important; }
      .social-tag { margin: 22px 0 0; font-family: var(--serif); font-size: 32px; line-height: 1.12; letter-spacing: -0.03em; color: var(--ink); }
      .social-sub { margin: 14px 0 0; font-size: 17px; line-height: 1.45; color: var(--muted); max-width: 400px; }
      .social-fade { position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(90deg, rgba(7,14,21,0.92) 0%, rgba(7,14,21,0.6) 34%, rgba(7,14,21,0) 52%); }
      .social-url { position: absolute; left: 52px; bottom: 40px; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; color: var(--muted); }`;
    document.head.append(css);
    const hero = document.querySelector('.hero');
    const fade = document.createElement('div');
    fade.className = 'social-fade';
    hero.querySelector('.labels').after(fade);
    const head = document.querySelector('.hero-head');
    head.insertAdjacentHTML('beforeend', `<p class="social-tag"></p><p class="social-sub"></p>`);
    head.querySelector('.social-tag').textContent = title;
    head.querySelector('.social-sub').textContent = sub;
    hero.insertAdjacentHTML('beforeend', '<p class="social-url">danielalmazan.com/de-aqui-para-alla</p>');
    window.scrollTo(0, 0);
    window.__map.fitBounds(window.__spain, { padding: { left: 500, right: 24, top: 24, bottom: 24 }, animate: false });
  }, { title, sub });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `public/social-${lang}-v1.jpg`, type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('wrote', `public/social-${lang}-v1.jpg`);
  await ctx.close();
}
await browser.close();

// Stage 1 engine benchmark: frame times of the flow layer across particle
// budgets, viewports and CPU throttling. Needs the dev server running:
//   npm run dev -- --port 5191   then   node tools/bench-engine.mjs
// Writes reports/performance-engine-spike.json.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:5191/de-aqui-para-alla/';
const SETTLE_MS = 2500;
const MEASURE_MS = 6000;

const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const scenarios = [];
for (const vp of Object.keys(viewports))
  for (const cpu of [1, 4])
    for (const [dots, km] of [[12000, 25], [30000, 25], [80000, 0]])
      scenarios.push({ vp, cpu, dots, km });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const results = [];
for (const s of scenarios) {
  const context = await browser.newContext({ viewport: { width: viewports[s.vp].width, height: viewports[s.vp].height }, ...viewports[s.vp] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: s.cpu });
  await page.goto(`${BASE}?perf&dots=${s.dots}&km=${s.km}`);
  await page.waitForFunction(() => window.__dapa?.map?.loaded() && document.querySelector('.perf')?.textContent?.includes('arcos'), null, { timeout: 30000 });
  await page.waitForTimeout(SETTLE_MS);
  const frames = await page.evaluate((ms) => new Promise((resolve) => {
    const dts = [];
    let last = 0;
    const end = performance.now() + ms;
    const tick = (t) => {
      if (last) dts.push(t - last);
      last = t;
      if (t < end) requestAnimationFrame(tick); else resolve(dts);
    };
    requestAnimationFrame(tick);
  }), MEASURE_MS);
  const info = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', stats: document.querySelector('.perf').textContent.split('\n')[1] };
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(2);
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const row = { ...s, fps: +(1000 / mean).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), frames: frames.length, ...info };
  results.push(row);
  console.log(`${s.vp.padEnd(7)} cpu×${s.cpu} budget ${String(s.dots).padStart(5)} km≥${s.km}: ${row.fps} fps p50 ${row.p50} p95 ${row.p95} | ${info.stats}`);
  await context.close();
}
await browser.close();
mkdirSync('reports', { recursive: true });
writeFileSync('reports/performance-engine-spike.json', JSON.stringify({ generated_at: new Date().toISOString(), note: 'Headless Chromium on the development Mac (Apple M1). CPU throttling emulates slower phones for main-thread work only; GPU is the M1. Real-phone numbers come from the LAN test.', results }, null, 2));

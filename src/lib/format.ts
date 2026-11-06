// Number and date formatting. Displayed trip counts are estimates, so they are
// rounded to two significant figures and shown with "≈" (plan §2).

import type { Lang } from './copy.ts';

const locale = (lang: Lang) => (lang === 'es' ? 'es-ES' : 'en-GB');
// 'always' groups 4-digit numbers too (es-ES skips them by default); TS's Intl types lag behind.

/** Two significant figures; millions in words ("3,4 millones" / "3.4 million"). */
export function approx(v: number, lang: Lang = 'es') {
  if (v >= 1e6) {
    const m = Math.round(v / 1e5) / 10;
    const n = m.toLocaleString(locale(lang));
    return lang === 'es' ? `${n} ${m === 1 ? 'millón' : 'millones'}` : `${n} million`;
  }
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1);
  // es-ES leaves 4-digit numbers ungrouped by default; group them like the rest.
  return (Math.round(v / p) * p).toLocaleString(locale(lang), { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
}

/** Tiles: millions as "3,4 M" so the figure fits on one line. */
export function approxShort(v: number, lang: Lang = 'es') {
  if (v < 1e6) return approx(v, lang);
  return `${(Math.round(v / 1e5) / 10).toLocaleString(locale(lang), { minimumFractionDigits: 1 })} M`;
}

/** "58 %" in Spanish (RAE spacing), "58%" in English. */
export function percent(share: number, lang: Lang = 'es') {
  const n = Math.round(share * 100).toLocaleString(locale(lang));
  return lang === 'es' ? `${n}\u00a0%` : `${n}%`; // no break before the sign
}

/** A change as "+18 %" / "−15 %" (true minus sign). */
export function signedPercent(change: number, lang: Lang = 'es') {
  const r = Math.round(change * 100);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${percent(Math.abs(r) / 100, lang)}`;
}

export function formatHour(h: number) {
  return `${String(Math.floor(h) % 24).padStart(2, '0')}:00`;
}

export function formatDate(iso: string, lang: Lang = 'es') {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatInt(v: number, lang: Lang = 'es') {
  return Math.round(v).toLocaleString(locale(lang), { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
}

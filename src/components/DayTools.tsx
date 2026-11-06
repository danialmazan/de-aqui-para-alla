// Small day helpers shared by the cards below the map.
//  - DayPill: the page's day, shown on a card; tapping it goes up to the map's
//    day picker (the one control that sets the day for the whole page).
//  - DaySelect: an in-card day picker (typical days, then special days).
//  - ResetButton: circle-and-arrow button beside an in-card picker.

import { LANG, t } from '../lib/copy.ts';
import type { Manifest } from '../lib/data.ts';
import { REDUCED } from '../lib/hooks.ts';
import { useData, useView } from '../lib/state.ts';

export const DAY_PICKER_ID = 'dia-pagina';

/** Scroll to the map and hand focus to its day picker, with a brief flash. */
export function goToDayPicker() {
  const map = document.getElementById('mapa');
  const pick = document.getElementById(DAY_PICKER_ID) as HTMLSelectElement | null;
  if (!map || !pick) return;
  map.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  window.setTimeout(() => {
    pick.focus({ preventScroll: true });
    const box = pick.closest<HTMLElement>('.day-pick') ?? pick;
    box.classList.remove('flash');
    void box.offsetWidth; // restart the animation
    box.classList.add('flash');
  }, REDUCED ? 0 : 650);
}

export function DayPill() {
  const { manifest } = useData();
  const { day } = useView();
  if (!manifest) return null;
  const name = t.dayName(day, manifest.keys[day]?.label[LANG] ?? day);
  return (
    <button type="button" className="day-pill" onClick={goToDayPicker} aria-label={t.dayPill.aria(name)} title={t.dayPill.title}>
      {name}
    </button>
  );
}

export function DaySelect({ manifest, value, onChange, label, none, skip, has }: {
  manifest: Manifest; value: string; onChange: (k: string) => void; label: string;
  /** An extra first option with value '' (e.g. "no other day"). */
  none?: string;
  /** A key to leave out (e.g. the day being compared). */
  skip?: string;
  /** Only keys with data. */
  has?: (k: string) => boolean;
}) {
  const entries = Object.entries(manifest.keys).filter(([k]) => k !== skip && (!has || has(k)));
  const group = (kind: 'typical' | 'special') => entries.filter(([, d]) => d.kind === kind)
    .map(([k, d]) => <option key={k} value={k}>{t.dayName(k, d.label[LANG])}</option>);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {none !== undefined && <option value="">{none}</option>}
      <optgroup label={t.dock.typicalDays}>{group('typical')}</optgroup>
      <optgroup label={t.dock.specialDays}>{group('special')}</optgroup>
    </select>
  );
}

export function ResetButton({ label, active, onReset, className = '' }: {
  label: string; active: boolean; onReset: () => void; className?: string;
}) {
  return (
    <button type="button" className={`reset-btn ${className}`} onClick={onReset} disabled={!active} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 12a6.5 6.5 0 1 0 2.1-4.8" />
        <path d="M5 3.8v4.1h4.1" />
      </svg>
    </button>
  );
}

// The map's time panel: play/pause, the clock, the day's profile as a scrubber,
// the day picker and the legend.
//
// Desktop: a floating panel that can be minimised to clock + day + profile
// (it minimises itself when a place opens, so it never hides the place card).
// Phone: a bottom sheet. Collapsed it shows the clock, day, profile and the
// place; expanded (up to half the screen) the place's top partners, the legend
// and a link to the full story further down the page.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clock } from '../lib/clock.ts';
import { LANG, t } from '../lib/copy.ts';
import type { Manifest } from '../lib/data.ts';
import { formatHour, formatInt } from '../lib/format.ts';
import { REDUCED, useClockHour, usePlaying } from '../lib/hooks.ts';
import { Icon } from './Controls.tsx';

/** Direction key: each dot starts amber where trips leave and turns aqua where they arrive. */
function FlowKey() {
  const n = 7;
  return (
    <p className="flow-key">
      <span className="fk-run">
        <span>{t.legend.leave}</span>
        <svg viewBox={`0 0 ${n * 12} 12`} aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <circle key={i} cx={6 + i * 12} cy={6} r={3}
              fill={`color-mix(in oklab, var(--alla) ${(i / (n - 1)) * 100}%, var(--aqui))`} />
          ))}
        </svg>
        <span>{t.legend.arrive}</span>
      </span>
      <span className="fk-run"><i className="fk-halo" aria-hidden="true" />{t.legend.near}</span>
    </p>
  );
}

export function Dock({ manifest, dayKey, onDay, unit, mobile, placeOpen, placeRow, placeDetail }: {
  manifest: Manifest; dayKey: string; onDay: (k: string) => void;
  unit: number | null; mobile: boolean; placeOpen: boolean;
  placeRow?: ReactNode; placeDetail?: ReactNode;
}) {
  const hour = useClockHour();
  const playing = usePlaying();
  const [open, setOpen] = useState(false); // phone sheet
  const [full, setFull] = useState(!placeOpen); // desktop panel
  const ref = useRef<HTMLElement>(null);
  const profile = manifest.keys[dayKey]?.totals.hourly ?? new Array(24).fill(0);
  const path = useMemo(() => {
    const max = Math.max(1, ...profile);
    return profile.map((v, h) => `${h === 0 ? 'M' : 'L'}${(h + 0.5) * (100 / 24)},${40 - (v / max) * 36}`).join(' ');
  }, [profile]);
  const entries = Object.entries(manifest.keys);

  // A place card needs the room: minimise when one opens, restore when it closes.
  useEffect(() => { setFull(!placeOpen); }, [placeOpen]);

  // The sheet folds away once the page scrolls on, so its summary and the
  // full story below never show at the same time.
  useEffect(() => {
    if (!mobile || !open) return;
    const onScroll = () => { if (window.scrollY > window.innerHeight * 0.2) setOpen(false); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mobile, open]);

  // The sheet's height, so map furniture (the ⓘ credit) can sit just above it.
  useEffect(() => {
    const el = ref.current;
    const hero = el?.closest<HTMLElement>('.hero');
    if (!el || !hero || !mobile) return;
    const ro = new ResizeObserver(() => hero.style.setProperty('--dock-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); hero.style.removeProperty('--dock-h'); };
  }, [mobile]);

  const fullStory = () => {
    setOpen(false);
    document.getElementById('tu-lugar')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  };

  const expanded = mobile ? open : full;
  const cls = ['dock', mobile ? 'sheet' : 'panel', expanded ? 'is-open' : 'is-min'].join(' ');

  return (
    <section ref={ref} className={cls} aria-label={t.dock.region}>
      {mobile && (
        <button className="sheet-handle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden="true" />
          <span className="sr-only">{open ? t.dock.less : t.dock.more}</span>
        </button>
      )}
      <button className="play" aria-label={playing ? t.dock.pause : t.dock.play} aria-pressed={playing}
        onClick={() => clock.setPlaying(!playing)}>
        {playing
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
      </button>
      <div className="clock">
        <span className="num clock-time">{formatHour(hour)}</span>
        <span className="clock-label">{t.dock.clockLabel}</span>
      </div>
      <div className="scrub">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <path d={`${path} L${23.5 * (100 / 24)},40 L${0.5 * (100 / 24)},40 Z`} className="scrub-area" />
          <line x1={(hour / 24) * 100} x2={(hour / 24) * 100} y1="0" y2="40" className="scrub-head" />
        </svg>
        <input type="range" min={0} max={23} step={1} value={Math.floor(hour)}
          aria-label={t.dock.pickHour} aria-valuetext={formatHour(hour)}
          onChange={(e) => clock.seek(Number(e.target.value))} />
        <div className="ticks" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      </div>
      {!mobile && (
        <button className="dock-toggle" aria-expanded={full} onClick={() => setFull(!full)}
          aria-label={full ? t.dock.minimise : t.dock.maximise} title={full ? t.dock.minimise : t.dock.maximise}>
          <Icon name="chevron" />
        </button>
      )}
      <label className="day-pick">
        <span className="sr-only">{t.dock.day}</span>
        <select value={dayKey} onChange={(e) => onDay(e.target.value)}>
          <optgroup label={t.dock.typicalDays}>
            {entries.filter(([, d]) => d.kind === 'typical').map(([k, d]) => <option key={k} value={k}>{d.label[LANG]}</option>)}
          </optgroup>
          <optgroup label={t.dock.specialDays}>
            {entries.filter(([, d]) => d.kind === 'special').map(([k, d]) => <option key={k} value={k}>{t.dayName(k, d.label[LANG])}</option>)}
          </optgroup>
        </select>
      </label>
      {placeRow && <div className="dock-place">{placeRow}</div>}
      {expanded && (
        <div className="dock-more">
          {placeDetail}
          {placeDetail && (
            <button className="chip-btn full-story" onClick={fullStory}>
              {t.dock.fullStory} <Icon name="chevron" />
            </button>
          )}
          <FlowKey />
          <p className="unit">
            {unit !== null && <>{t.legend.unit(formatInt(unit, LANG))}{' '}</>}
            {t.legend.lines} {t.legend.halos} {t.legend.honesty}
          </p>
        </div>
      )}
    </section>
  );
}

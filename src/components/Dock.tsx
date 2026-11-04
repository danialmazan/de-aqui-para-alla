// The map's time panel: play/pause, the big clock and the day's profile as a
// scrubber, the day picker and the legend. On phones it is a bottom sheet:
// collapsed it shows the clock and the place; expanded, everything else.

import { useMemo, useState, type ReactNode } from 'react';
import type { FlowStats } from '../map/FlowLayer.ts';
import { SPACING_PX } from '../map/flowMath.ts';
import { clock } from '../lib/clock.ts';
import { LANG, t } from '../lib/copy.ts';
import type { Manifest } from '../lib/data.ts';
import { approx, formatHour, formatInt } from '../lib/format.ts';
import { useClockHour, usePlaying } from '../lib/hooks.ts';

/** Direction key: each dot starts amber where trips leave and turns aqua where they arrive. */
function FlowKey() {
  const n = 7;
  return (
    <p className="flow-key">
      <span className="fk-end"><i style={{ background: 'var(--aqui)' }} />{t.legend.leave}</span>
      <svg viewBox={`0 0 ${n * 12} 12`} aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <circle key={i} cx={6 + i * 12} cy={6} r={2.4}
            fill={`color-mix(in oklab, var(--alla) ${(i / (n - 1)) * 100}%, var(--aqui))`} />
        ))}
      </svg>
      <span className="fk-end"><i style={{ background: 'var(--alla)' }} />{t.legend.arrive}</span>
      <span className="fk-end fk-halo"><i style={{ background: 'var(--dentro)' }} />{t.legend.near}</span>
    </p>
  );
}

export function Dock({ manifest, dayKey, onDay, stats, level, mobile, placeRow, placeDetail }: {
  manifest: Manifest; dayKey: string; onDay: (k: string) => void;
  stats: FlowStats | null; level: 'area' | 'zone'; mobile: boolean;
  placeRow?: ReactNode; placeDetail?: ReactNode;
}) {
  const hour = useClockHour();
  const playing = usePlaying();
  const [open, setOpen] = useState(false);
  const profile = manifest.keys[dayKey]?.totals.hourly ?? new Array(24).fill(0);
  const path = useMemo(() => {
    const max = Math.max(1, ...profile);
    return profile.map((v, h) => `${h === 0 ? 'M' : 'L'}${(h + 0.5) * (100 / 24)},${40 - (v / max) * 36}`).join(' ');
  }, [profile]);
  const entries = Object.entries(manifest.keys);
  const showMore = !mobile || open;

  return (
    <section className={mobile ? 'dock sheet' : 'dock'} aria-label={t.dock.region} data-open={showMore}>
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
      {placeRow && <div className="dock-place">{placeRow}</div>}
      {showMore && (
        <div className="dock-more">
          {placeDetail}
          <label className="day-pick">
            <span className="sr-only">{t.dock.day}</span>
            <select value={dayKey} onChange={(e) => onDay(e.target.value)}>
              <optgroup label={t.dock.typicalDays}>
                {entries.filter(([, d]) => d.kind === 'typical').map(([k, d]) => <option key={k} value={k}>{d.label[LANG]}</option>)}
              </optgroup>
              <optgroup label={t.dock.specialDays}>
                {entries.filter(([, d]) => d.kind === 'special').map(([k, d]) => <option key={k} value={k}>{d.label[LANG]}</option>)}
              </optgroup>
            </select>
          </label>
          <FlowKey />
          {stats && (
            <p className="unit">
              {t.legend.unit(SPACING_PX, formatInt(stats.unit, LANG))}{' '}
              {t.legend.arcs(approx(stats.drawnDay, LANG), level === 'area')}{' '}
              {t.legend.halos(approx(stats.haloDay, LANG))}{' '}
              {t.legend.honesty}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

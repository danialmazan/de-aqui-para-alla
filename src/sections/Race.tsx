// 02 / La carrera: across all of Spain (not the selected place), the
// municipalities receiving the most trips from other municipalities, or sending
// the most, hour by hour. Trips inside a municipality never count. Bars reorder
// as the shared clock runs. "Total" (the default) is the big cities; "per
// resident" surfaces campuses, business parks, airports and beaches.
// The card has its own day (it starts as the page's day and the ↺ button
// brings it back), so changing it never reshapes the rest of the page.

import { useEffect, useRef, useState } from 'react';
import { Ranking } from '../components/charts.tsx';
import { Segmented } from '../components/Controls.tsx';
import { DaySelect, ResetButton } from '../components/DayTools.tsx';
import { clock } from '../lib/clock.ts';
import { LANG, t } from '../lib/copy.ts';
import { loadRace, type Race as RaceData } from '../lib/data.ts';
import { approx, formatHour, formatInt } from '../lib/format.ts';
import { REDUCED, usePlaying, useWholeHour } from '../lib/hooks.ts';
import { setView, useData, useView } from '../lib/state.ts';

type Mode = 'total' | 'res';
type Side = 'in' | 'out';
const SHOWN = 10;

export function Race() {
  const { zones, manifest } = useData();
  const { day: pageDay } = useView();
  const [race, setRace] = useState<RaceData | null>(null);
  const [mode, setMode] = useState<Mode>('total');
  const [side, setSide] = useState<Side>('in');
  // The card's own day: a pick holds until the page's day changes.
  const [pick, setPick] = useState<{ page: string; day: string } | null>(null);
  const key = pick?.page === pageDay ? pick.day : pageDay;
  const hour = useWholeHour();
  const playing = usePlaying();
  const ref = useRef<HTMLElement>(null);

  // Fetched once the section is close to the screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      loadRace().then(setRace).catch(() => {});
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const k = race?.keys[key]?.[side];
  const rows = zones && race && k
    ? k.zone.map((z, i) => {
      const v = k.h[i][hour];
      const pop = zones.zones.pop[z];
      return { id: z, value: mode === 'total' ? v : pop >= race.min_pop ? (1000 * v) / pop : -1 };
    }).filter((r) => r.value >= 0).sort((a, b) => b.value - a.value || a.id - b.id).slice(0, SHOWN)
    : [];

  const open = (z: number) => {
    setView({ place: z });
    document.getElementById('mapa')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  };
  const copy = t.race[side];

  return (
    <section ref={ref} className="section race" id="carrera" aria-labelledby="race-title">
      <header className="section-head">
        <p className="eyebrow">{t.race.eyebrow}</p>
        <h2 id="race-title" className="section-title">{t.race.title}</h2>
        <p className="section-note">{t.race.note}</p>
      </header>

      <article className="card race-card">
        <div className="race-controls">
          <button className="play small" aria-label={playing ? t.dock.pause : t.dock.play} aria-pressed={playing}
            onClick={() => clock.setPlaying(!playing)}>
            {playing
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
          </button>
          <span className="num race-time" aria-live="off">{formatHour(hour)}</span>
          <input className="race-hour" type="range" min={0} max={23} step={1} value={hour}
            aria-label={t.dock.pickHour} aria-valuetext={formatHour(hour)}
            onChange={(e) => clock.seek(Number(e.target.value))} />
          {manifest && (
            <div className="race-day day-row">
              <DaySelect manifest={manifest} value={key} label={t.race.day}
                onChange={(d) => setPick(d === pageDay ? null : { page: pageDay, day: d })} />
              <ResetButton label={t.race.reset} active={key !== pageDay} onReset={() => setPick(null)} />
            </div>
          )}
        </div>
        <div className="race-toggles">
          <Segmented<Side> label={t.race.side} value={side} onChange={setSide}
            options={[{ value: 'in', label: t.race.in.label, tone: 'alla' }, { value: 'out', label: t.race.out.label, tone: 'aqui' }]} />
          <Segmented<Mode> label={t.race.mode} value={mode} onChange={setMode}
            options={[{ value: 'total', label: t.race.total }, { value: 'res', label: t.race.perRes }]} />
        </div>
        <h3 className="card-title">{copy.title}</h3>
        <p className="card-note">
          {mode === 'res' && race ? copy.perResNote(formatInt(race.min_pop, LANG)) : copy.totalNote}
        </p>
        {zones && rows.length > 0 ? (
          <Ranking rows={rows} name={(z) => zones.zones.name[z].replace(' (agrupación)', '')}
            label={copy.list(formatHour(hour), t.dayVs(key))}
            format={(v) => approx(v, LANG)}
            onPick={open} pickLabel={t.race.pick} />
        ) : (
          <div className="race-loading" style={{ height: SHOWN * 34 }} aria-busy="true" />
        )}
        <p className="card-note">{mode === 'res' ? `${t.race.unitPerRes} · ` : ''}{t.race.pickNote}</p>
      </article>
    </section>
  );
}

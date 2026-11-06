// 02 / La carrera: the places receiving the most trips from elsewhere in Spain,
// hour by hour, on the chosen day. Bars reorder as the shared clock runs. "Per
// resident" (the default) surfaces campuses, business parks, airports and
// beaches; "total" is the big cities. Tap a place to open it on the map.

import { useEffect, useRef, useState } from 'react';
import { Ranking } from '../components/charts.tsx';
import { Segmented } from '../components/Controls.tsx';
import { clock } from '../lib/clock.ts';
import { LANG, t } from '../lib/copy.ts';
import { loadRace, type Race as RaceData } from '../lib/data.ts';
import { approx, formatHour, formatInt } from '../lib/format.ts';
import { REDUCED, usePlaying, useWholeHour } from '../lib/hooks.ts';
import { setView, useData, useView } from '../lib/state.ts';

type Mode = 'res' | 'total';
const SHOWN = 10;

export function Race() {
  const { zones, manifest } = useData();
  const { day: key } = useView();
  const [race, setRace] = useState<RaceData | null>(null);
  const [mode, setMode] = useState<Mode>('res');
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

  const day = manifest?.keys[key];
  const k = race?.keys[key];
  const rows = zones && race && k
    ? k.zone.map((z, i) => {
      const v = k.h[i][hour];
      const pop = zones.zones.pop[z];
      return { id: z, value: mode === 'total' ? v : pop >= race.min_pop ? (1000 * v) / pop : -1 };
    }).filter((r) => r.value >= 0).sort((a, b) => b.value - a.value || a.id - b.id).slice(0, SHOWN)
    : [];

  const pick = (z: number) => {
    setView({ place: z });
    document.getElementById('mapa')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  };

  return (
    <section ref={ref} className="section race" id="carrera" aria-labelledby="race-title">
      <header className="section-head">
        <p className="eyebrow">{t.race.eyebrow}</p>
        <h2 id="race-title" className="section-title">{t.race.title}</h2>
        <p className="section-note">{t.race.note(t.dayVs(key))}</p>
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
            <label className="race-day">
              <span className="sr-only">{t.dock.day}</span>
              <select value={key} onChange={(e) => setView({ day: e.target.value })}>
                {Object.entries(manifest.keys).map(([k2, d]) => <option key={k2} value={k2}>{t.dayName(k2, d.label[LANG])}</option>)}
              </select>
            </label>
          )}
        </div>
        <Segmented<Mode> label={t.race.mode} value={mode} onChange={setMode}
          options={[{ value: 'res', label: t.race.perRes }, { value: 'total', label: t.race.total }]} />
        <p className="card-note">
          {mode === 'res' && race ? t.race.perResNote(formatInt(race.min_pop, LANG)) : t.race.totalNote}
        </p>
        {zones && day && rows.length > 0 ? (
          <Ranking rows={rows} name={(z) => zones.zones.name[z].replace(' (agrupación)', '')}
            label={t.race.list(formatHour(hour))}
            format={(v) => approx(v, LANG)}
            onPick={pick} pickLabel={t.race.pick} />
        ) : (
          <div className="race-loading" style={{ height: SHOWN * 34 }} aria-busy="true" />
        )}
        <p className="card-note">{mode === 'res' ? `${t.race.unitPerRes} · ` : ''}{t.race.pickNote}</p>
      </article>
    </section>
  );
}

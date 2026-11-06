// 03 / Días raros: the four special days as small multiples of national trips
// per hour, each against its matching typical day (the manifest's `compare`).
// The hour that differs most is marked and named; a button opens that day on
// the map.

import { LANG, t } from '../lib/copy.ts';
import { formatDate, formatHour, signedPercent } from '../lib/format.ts';
import { REDUCED } from '../lib/hooks.ts';
import { setView, useData } from '../lib/state.ts';

const W = 300;
const H = 110;
const P = { l: 4, r: 4, t: 18, b: 18 };

function DayShape({ day, base, mark, label }: { day: number[]; base: number[]; mark: number; label: string }) {
  const max = Math.max(1, ...day, ...base);
  const step = (W - P.l - P.r) / 24;
  const x = (h: number) => P.l + (h + 0.5) * step;
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const line = (v: number[]) => v.map((n, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(n).toFixed(1)}`).join('');
  const more = day[mark] >= base[mark];
  return (
    <svg className="odd-shape" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path d={`${line(base)}L${x(23)},${H - P.b}L${x(0)},${H - P.b}Z`} className="odd-base-area" />
      <path d={line(base)} className="odd-base" />
      <path d={line(day)} className="odd-day" />
      <line x1={x(mark)} x2={x(mark)} y1={Math.min(y(day[mark]), y(base[mark]))} y2={Math.max(y(day[mark]), y(base[mark]))}
        className={more ? 'odd-gap more' : 'odd-gap less'} />
      <circle cx={x(mark)} cy={y(day[mark])} r={4} className={more ? 'odd-dot more' : 'odd-dot less'} />
      {[0, 6, 12, 18, 23].map((h) => (
        <text key={h} x={x(h)} y={H - 4} className="odd-tick" textAnchor="middle">{formatHour(h).slice(0, 2)}</text>
      ))}
    </svg>
  );
}

export function OddDays() {
  const { manifest } = useData();
  if (!manifest) return null;
  const days = Object.entries(manifest.keys).filter(([, d]) => d.kind === 'special' && d.compare && manifest.keys[d.compare]);

  const open = (k: string) => {
    setView({ day: k });
    document.getElementById('mapa')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  };

  return (
    <section className="section odd" id="dias-raros" aria-labelledby="odd-title">
      <header className="section-head">
        <p className="eyebrow">{t.odd.eyebrow}</p>
        <h2 id="odd-title" className="section-title">{t.odd.title}</h2>
        <p className="section-note">{t.odd.note}</p>
      </header>
      <div className="odd-grid">
        {days.map(([k, d]) => {
          const c = d.compare!;
          const day = d.totals.hourly;
          const base = manifest.keys[c].totals.hourly;
          const change = day.map((v, h) => (base[h] > 0 ? v / base[h] - 1 : 0));
          const mark = change.reduce((m, v, h) => (Math.abs(v) > Math.abs(change[m]) ? h : m), 0);
          const total = day.reduce((a, b) => a + b, 0) / base.reduce((a, b) => a + b, 0) - 1;
          const name = t.dayName(k, d.label[LANG]);
          return (
            <article key={k} className="card odd-card">
              <header>
                <h3 className="card-title">{name}</h3>
                {d.date && <p className="card-note">{formatDate(d.date, LANG)}</p>}
              </header>
              <p className="odd-figure">
                <span className={`num odd-big ${change[mark] >= 0 ? 'more' : 'less'}`}>{signedPercent(change[mark], LANG)}</span>
                <span className="odd-at">{t.odd.at(formatHour(mark))}<br />{t.odd.vs(t.dayVs(c))}</span>
              </p>
              <DayShape day={day} base={base} mark={mark} label={t.odd.chart(name, t.dayVs(c))} />
              <p className="odd-key" aria-hidden="true">
                <span><i className="odd-key-day" />{name}</span>
                <span><i className="odd-key-base" />{t.odd.typical}</span>
              </p>
              <p className="odd-story">{t.odd.stories[k]}</p>
              <p className="card-note">{t.odd.total(signedPercent(total, LANG), t.dayVs(c))}</p>
              <button className="chip-btn ghost" onClick={() => open(k)}>{t.odd.show}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

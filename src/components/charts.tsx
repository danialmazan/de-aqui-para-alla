// Tu lugar's charts. Plain SVG/HTML with the family's timings: bars and ranks
// glide over 600 ms, numbers count; everything is instant under reduced motion.

import { useMemo } from 'react';
import { LANG } from '../lib/copy.ts';
import { approx, approxShort, formatHour, percent } from '../lib/format.ts';
import { useAnimatedNumber, useClockHour } from '../lib/hooks.ts';

export function CountUp({ value, short = false }: { value: number; short?: boolean }) {
  const v = useAnimatedNumber(value);
  return <>{short ? approxShort(v, LANG) : approx(v, LANG)}</>;
}

/** Ten dots: how many of every 10 trips stay inside. */
export function TenDots({ inside, label }: { inside: number; label: string }) {
  return (
    <div className="ten" role="img" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < inside ? 'in' : 'out'} />)}
    </div>
  );
}

const ROW = 40;

/**
 * A ranking whose rows glide to their new positions (each row is placed with a
 * transform, so a change of order animates by itself).
 */
export function Ranking({ rows, name, label }: {
  rows: { id: number; value: number }[]; name: (id: number) => string; label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const order = useMemo(() => [...rows].sort((a, b) => a.id - b.id), [rows]); // stable DOM order
  const rank = new Map(rows.map((r, i) => [r.id, i]));
  return (
    <ol className="ranking" aria-label={label} style={{ height: rows.length * ROW }}>
      {order.map((r) => (
        <RankRow key={r.id} y={(rank.get(r.id) ?? 0) * ROW} name={name(r.id)} value={r.value} share={r.value / max} pos={(rank.get(r.id) ?? 0) + 1} />
      ))}
    </ol>
  );
}

function RankRow({ y, name, value, share, pos }: { y: number; name: string; value: number; share: number; pos: number }) {
  const v = useAnimatedNumber(value);
  return (
    <li style={{ transform: `translateY(${y}px)` }} aria-posinset={pos}>
      <span className="rk-pos num">{pos}</span>
      <span className="rk-name">{name}</span>
      <span className="rk-track"><span className="rk-fill" style={{ transform: `scaleX(${share})` }} /></span>
      <span className="rk-val num">{approx(v, LANG)}</span>
    </li>
  );
}

/** Departures (amber) and arrivals (aqua) per hour, with the clock's playhead. */
export function Heartbeat({ out, inn, labels }: { out: number[]; inn: number[]; labels: { out: string; in: string } }) {
  const W = 600;
  const H = 180;
  const P = { l: 44, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...out, ...inn);
  const x = (h: number) => P.l + (h + 0.5) * ((W - P.l - P.r) / 24);
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const line = (vals: number[]) => vals.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map((k) => k * max);
  return (
    <svg className="heartbeat" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels.out} / ${labels.in}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="hb-grid" />
          <text x={P.l - 6} y={y(v) + 4} className="hb-tick" textAnchor="end">{approxShort(v, LANG)}</text>
        </g>
      ))}
      {[0, 6, 12, 18, 23].map((h) => (
        <text key={h} x={x(h)} y={H - 6} className="hb-tick" textAnchor="middle">{formatHour(h).slice(0, 2)}</text>
      ))}
      <path d={line(inn)} className="hb-in" />
      <path d={line(out)} className="hb-out" />
      <Playhead x={x} top={P.t} bottom={H - P.b} />
    </svg>
  );
}

function Playhead({ x, top, bottom }: { x: (h: number) => number; top: number; bottom: number }) {
  const hour = useClockHour();
  const px = x(hour - 0.5);
  return <line x1={px} x2={px} y1={top} y2={bottom} className="hb-head" />;
}

/** Distance bands: trips starting here that stay inside vs go elsewhere. */
export function Bands({ dentro, fuera, names, inside, outside }: {
  dentro: number[]; fuera: number[]; names: string[]; inside: string; outside: string;
}) {
  const total = Math.max(1, dentro.reduce((a, b) => a + b, 0) + fuera.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...dentro.map((d, i) => d + fuera[i]));
  return (
    <div className="bands">
      <p className="bands-key">
        <span><i style={{ background: 'var(--dentro)' }} />{inside}</span>
        <span><i style={{ background: 'var(--aqui)' }} />{outside}</span>
      </p>
      <ul>
        {names.map((n, i) => (
          <li key={n}>
            <span className="bd-name">{n}</span>
            <span className="bd-track">
              <span className="bd-in" style={{ width: `${(dentro[i] / max) * 100}%` }} />
              <span className="bd-out" style={{ width: `${(fuera[i] / max) * 100}%` }} />
            </span>
            <span className="bd-val num">{percent((dentro[i] + fuera[i]) / total, LANG)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Purpose shares as simple bars. */
export function Purposes({ values, names, tone }: { values: number[]; names: string[]; tone: 'aqui' | 'alla' }) {
  const total = Math.max(1, values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...values);
  return (
    <ul className="purposes" data-tone={tone}>
      {names.map((n, i) => (
        <li key={n}>
          <span className="pu-name">{n}</span>
          <span className="pu-track"><span className="pu-fill" style={{ transform: `scaleX(${values[i] / max})` }} /></span>
          <span className="pu-val num">{percent(values[i] / total, LANG)}</span>
        </li>
      ))}
    </ul>
  );
}

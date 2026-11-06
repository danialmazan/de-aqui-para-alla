// Tu lugar's charts. Plain SVG/HTML with the family's timings: bars and ranks
// glide over 600 ms, numbers count; everything is instant under reduced motion.

import { useEffect, useMemo, useRef, useState } from 'react';
import { LANG } from '../lib/copy.ts';
import { approx, approxShort, formatHour, percent } from '../lib/format.ts';
import { useAnimatedNumber, useClockHour, useWholeHour } from '../lib/hooks.ts';
import { FitName } from './PlaceCard.tsx';

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

const ROW = 34;

/**
 * A ranking whose rows glide to their new positions (each row is placed with a
 * transform, so a change of order animates by itself).
 */
export function Ranking({ rows, name, label, format = (v) => approx(v, LANG), onPick, pickLabel }: {
  rows: { id: number; value: number }[]; name: (id: number) => string; label: string;
  format?: (v: number) => string;
  /** Rows become buttons (e.g. show the place on the map). */
  onPick?: (id: number) => void; pickLabel?: (name: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const order = useMemo(() => [...rows].sort((a, b) => a.id - b.id), [rows]); // stable DOM order
  const rank = new Map(rows.map((r, i) => [r.id, i]));
  return (
    <ol className="ranking" aria-label={label} style={{ height: rows.length * ROW }}>
      {order.map((r) => (
        <RankRow key={r.id} y={(rank.get(r.id) ?? 0) * ROW} name={name(r.id)} value={r.value} share={r.value / max}
          pos={(rank.get(r.id) ?? 0) + 1} format={format}
          onPick={onPick && (() => onPick(r.id))} pickLabel={pickLabel?.(name(r.id))} />
      ))}
    </ol>
  );
}

function RankRow({ y, name, value, share, pos, format, onPick, pickLabel }: {
  y: number; name: string; value: number; share: number; pos: number; format: (v: number) => string;
  onPick?: () => void; pickLabel?: string;
}) {
  const v = useAnimatedNumber(value);
  return (
    <li style={{ transform: `translateY(${y}px)` }} aria-posinset={pos} data-pick={!!onPick}>
      {onPick && <button className="rk-pick" onClick={onPick} aria-label={pickLabel} title={pickLabel} />}
      <span className="rk-pos num">{pos}</span>
      <FitName className="rk-name" text={name} />
      <span className="rk-track"><span className="rk-fill" style={{ transform: `scaleX(${share})` }} /></span>
      <span className="rk-val num">{format(v)}</span>
    </li>
  );
}

/**
 * Departures (amber) and arrivals (aqua) per hour, with the clock's playhead and
 * a readout of both values. Tap or drag across the chart (or use the arrow keys)
 * to read any hour; on release the line goes back to following the clock.
 */
export function Heartbeat({ out, inn, cmp, labels }: {
  out: number[]; inn: number[];
  /** Another day to draw underneath, dashed (same scale). */
  cmp?: { out: number[]; inn: number[]; name: string };
  labels: { out: string; in: string; at: (h: string) => string; scrub: string };
}) {
  const W = 600;
  const H = 180;
  const P = { l: 44, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...out, ...inn, ...(cmp ? [...cmp.out, ...cmp.inn] : []));
  const step = (W - P.l - P.r) / 24;
  const x = (h: number) => P.l + (h + 0.5) * step;
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const line = (vals: number[]) => vals.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map((k) => k * max);

  const clockHour = useWholeHour();
  const smooth = useClockHour();
  const [scrub, setScrub] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const hourAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    return Math.min(23, Math.max(0, Math.round((vx - P.l) / step - 0.5)));
  };
  const release = (delay: number) => {
    dragging.current = false;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setScrub(null), delay);
  };

  const h = scrub ?? clockHour;
  const px = scrub !== null ? x(scrub) : x(smooth - 0.5);
  const text = `${labels.out} ≈ ${approx(out[h], LANG)}, ${labels.in} ≈ ${approx(inn[h], LANG)}, ${labels.at(formatHour(h))}`
    + (cmp ? ` · ${cmp.name}: ${labels.out} ≈ ${approx(cmp.out[h], LANG)}, ${labels.in} ≈ ${approx(cmp.inn[h], LANG)}` : '');

  return (
    <>
      <p className="hb-key" aria-hidden="true">
        <span><i style={{ background: 'var(--aqui)' }} />{labels.out}<span className="num">≈ {approx(out[h], LANG)}</span>
          {cmp && <span className="hb-was num">({approx(cmp.out[h], LANG)})</span>}</span>
        <span><i style={{ background: 'var(--alla)' }} />{labels.in}<span className="num">≈ {approx(inn[h], LANG)}</span>
          {cmp && <span className="hb-was num">({approx(cmp.inn[h], LANG)})</span>}</span>
        {cmp && <span className="hb-was-key"><i />{cmp.name}</span>}
        <span className="hb-at">{labels.at(formatHour(h))}</span>
      </p>
      <svg ref={svg} className="heartbeat" viewBox={`0 0 ${W} ${H}`} data-scrub={scrub !== null}
        role="slider" tabIndex={0} aria-label={labels.scrub} aria-valuemin={0} aria-valuemax={23} aria-valuenow={h} aria-valuetext={text}
        onPointerDown={(e) => {
          clearTimeout(timer.current);
          dragging.current = true;
          svg.current?.setPointerCapture(e.pointerId);
          setScrub(hourAt(e.clientX));
        }}
        onPointerMove={(e) => { if (dragging.current) setScrub(hourAt(e.clientX)); }}
        onPointerUp={() => release(900)}
        onPointerCancel={() => release(0)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            clearTimeout(timer.current);
            setScrub(((scrub ?? clockHour) + (e.key === 'ArrowLeft' ? 23 : 1)) % 24);
          } else if (e.key === 'Escape') setScrub(null);
        }}
        onBlur={() => { if (!dragging.current) setScrub(null); }}>
        <rect className="hb-hit" x={0} y={0} width={W} height={H} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="hb-grid" />
            <text x={P.l - 6} y={y(v) + 4} className="hb-tick" textAnchor="end">{approxShort(v, LANG)}</text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((t) => (
          <text key={t} x={x(t)} y={H - 6} className="hb-tick" textAnchor="middle">{formatHour(t).slice(0, 2)}</text>
        ))}
        {cmp && (
          <>
            <path d={line(cmp.inn)} className="hb-in hb-cmp" />
            <path d={line(cmp.out)} className="hb-out hb-cmp" />
          </>
        )}
        <path d={line(inn)} className="hb-in" />
        <path d={line(out)} className="hb-out" />
        <line x1={px} x2={px} y1={P.t} y2={H - P.b} className="hb-head" />
        {scrub !== null && (
          <>
            <circle cx={x(scrub)} cy={y(inn[scrub])} r={5} className="hb-dot-in" />
            <circle cx={x(scrub)} cy={y(out[scrub])} r={5} className="hb-dot-out" />
          </>
        )}
      </svg>
    </>
  );
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

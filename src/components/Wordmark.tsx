// The title lockup (plan §4): the accents of "aquí" and "allá" become two
// glowing dots — amber for here (origin), aqua for there (destination) — joined
// by a dotted arc along which one particle travels every few seconds.
//
// The text is real SVG text (dotless ı, plain final a); after the web fonts load
// we measure the two glyphs with getExtentOfChar and place the dots over them.

import { useLayoutEffect, useRef, useState } from 'react';

type Layout = 'stacked' | 'inline';
type Point = { x: number; y: number };

const FONT_SIZE = 100; // SVG user units; the SVG scales to its CSS width
const ACCENT = 0.72;     // dot centre above the baseline, in em
const ITALIC_LEAN = 0.1; // horizontal shift of the italic á's accent, in em

export function Wordmark({ layout = 'stacked', animate = true, className }: { layout?: Layout; animate?: boolean; className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const aqui = useRef<SVGTSpanElement>(null);
  const alla = useRef<SVGTSpanElement>(null);
  const [geom, setGeom] = useState<{ here: Point; there: Point; width: number; height: number } | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const a = aqui.current;
      const b = alla.current;
      const s = svg.current;
      if (!a || !b || !s || cancelled) return;
      // "aquı": the dotless i is the last character; "alla": the final a.
      const i = a.getExtentOfChar(3);
      const last = b.getExtentOfChar(3);
      const box = s.querySelector<SVGGElement>('g.text')!.getBBox();
      // Accent dots sit a fixed height above each line's baseline (clear of the
      // x-height); the italic á leans right, so its dot follows the slant.
      const line1 = FONT_SIZE * 0.86;
      const line2 = layout === 'stacked' ? FONT_SIZE * 1.84 : line1;
      setGeom({
        here: { x: i.x + i.width / 2, y: line1 - ACCENT * FONT_SIZE },
        there: { x: last.x + last.width * 0.5 + ITALIC_LEAN * FONT_SIZE, y: line2 - ACCENT * FONT_SIZE },
        width: box.x + box.width + 12,
        height: box.y + box.height + 8,
      });
    };
    document.fonts.ready.then(measure);
    return () => { cancelled = true; };
  }, [layout]);

  const line2y = layout === 'stacked' ? FONT_SIZE * 1.84 : FONT_SIZE * 1.02;
  const line2x = layout === 'stacked' ? FONT_SIZE * 0.52 : undefined;

  let arc = '';
  if (geom) {
    const { here, there } = geom;
    const lift = layout === 'stacked' ? 0 : FONT_SIZE * 0.55;
    const cx = layout === 'stacked' ? Math.max(here.x, there.x) + FONT_SIZE * 0.6 : (here.x + there.x) / 2;
    const cy = layout === 'stacked' ? (here.y + there.y) / 2 - FONT_SIZE * 0.2 : Math.min(here.y, there.y) - lift;
    arc = `M${here.x},${here.y} Q${cx},${cy} ${there.x},${there.y}`;
  }

  return (
    <svg
      ref={svg}
      className={className}
      role="img"
      aria-label="De aquí para allá"
      viewBox={geom ? `0 0 ${geom.width} ${geom.height}` : `0 0 ${FONT_SIZE * 5.2} ${line2y + FONT_SIZE * 0.3}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="wm-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation={FONT_SIZE * 0.045} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="text" fill="var(--ink)" style={{ fontFamily: 'var(--serif)', fontSize: FONT_SIZE }}>
        <text x="0" y={FONT_SIZE * 0.86} style={{ fontWeight: 500, letterSpacing: '-0.04em', fontVariationSettings: '"opsz" 72' }}>
          De <tspan ref={aqui}>aquı</tspan>
          {layout === 'inline' && (
            <>
              {' '}<tspan fill="var(--muted)" style={{ fontStyle: 'italic', fontWeight: 400, fontSize: FONT_SIZE * 0.62 }}>para</tspan>{' '}
              <tspan ref={alla} style={{ fontStyle: 'italic' }}>alla</tspan>
            </>
          )}
        </text>
        {layout === 'stacked' && (
          <text x={line2x} y={line2y} style={{ fontWeight: 500, letterSpacing: '-0.04em', fontVariationSettings: '"opsz" 72' }}>
            <tspan fill="var(--muted)" style={{ fontStyle: 'italic', fontWeight: 400, fontSize: FONT_SIZE * 0.62 }}>para</tspan>{' '}
            <tspan ref={alla} style={{ fontStyle: 'italic' }}>alla</tspan>
          </text>
        )}
      </g>
      {geom && (
        <g aria-hidden="true">
          <path d={arc} fill="none" stroke="var(--muted)" strokeOpacity="0.55" strokeWidth={FONT_SIZE * 0.018}
            strokeLinecap="round" strokeDasharray={`0 ${FONT_SIZE * 0.07}`} />
          <circle cx={geom.here.x} cy={geom.here.y} r={FONT_SIZE * 0.075} fill="var(--aqui)" filter="url(#wm-glow)" />
          <circle cx={geom.there.x} cy={geom.there.y} r={FONT_SIZE * 0.09} fill="var(--alla)" filter="url(#wm-glow)" />
          {animate && !reduced && (
            <circle r={FONT_SIZE * 0.035} fill="var(--ink)" filter="url(#wm-glow)" opacity="0">
              <animateMotion path={arc} dur="8s" begin="0.4s" repeatCount="indefinite"
                keyPoints="0;1;1" keyTimes="0;0.22;1" calcMode="spline" keySplines="0.45 0 0.3 1;0 0 1 1" />
              <animate attributeName="opacity" dur="8s" begin="0.4s" repeatCount="indefinite"
                values="0;1;1;0;0" keyTimes="0;0.03;0.19;0.23;1" />
            </circle>
          )}
        </g>
      )}
    </svg>
  );
}

// Stage 1 design specimen: title lockup, mark, palette, type, controls and the
// dot-density legend, for sign-off before the real sections are built.

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/hanken-grotesk';
import './styles/tokens.css';
import './styles/specimen.css';
import { Wordmark } from './components/Wordmark.tsx';
import { Mark } from './components/Mark.tsx';
import { Icon, PlayButton, Segmented } from './components/Controls.tsx';
import { SPACING_PX } from './map/flowMath.ts';

const PALETTE: { token: string; hex: string; role: string }[] = [
  { token: '--night-0', hex: '#070E15', role: 'Página' },
  { token: '--night-1', hex: '#0C1822', role: 'Sección' },
  { token: '--night-2', hex: '#132331', role: 'Tarjeta' },
  { token: '--night-3', hex: '#1B3042', role: 'Pista de controles' },
  { token: '--line', hex: '#26405A', role: 'Líneas' },
  { token: '--land', hex: '#102030', role: 'Tierra (mapa)' },
  { token: '--ink', hex: '#F2ECDF', role: 'Texto' },
  { token: '--muted', hex: '#9AABB8', role: 'Texto secundario' },
  { token: '--faint', hex: '#6B7F8F', role: 'Marcas débiles' },
  { token: '--aqui', hex: '#FFB547', role: 'Aquí · salen' },
  { token: '--alla', hex: '#4FE0D0', role: 'Allá · llegan' },
  { token: '--dentro', hex: '#C7A6FF', role: 'Dentro de la zona' },
  { token: '--more', hex: '#FF7A5C', role: 'Más (diferencias)' },
  { token: '--less', hex: '#5AA9FF', role: 'Menos (diferencias)' },
  { token: '--focus', hex: '#FFD98A', role: 'Foco' },
];

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Three sample connections drawn with the map's exact encoding. */
function DensityLegend({ unit }: { unit: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const samples = [unit, unit * 4, unit * 16];
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio);
    const w = 260;
    const rowH = 34;
    c.width = w * dpr;
    c.height = rowH * samples.length * dpr;
    ctx.scale(dpr, dpr);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, rowH * samples.length);
      samples.forEach((v, row) => {
        const y = row * rowH + rowH / 2;
        ctx.strokeStyle = 'rgba(158,178,199,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        const spacing = (SPACING_PX * unit) / v;
        const offset = reduced ? 0 : ((t / 1000) * 45) % spacing;
        for (let x = offset; x < w; x += spacing) {
          const f = x / w;
          ctx.fillStyle = `rgb(${255 + (79 - 255) * f}, ${181 + (224 - 181) * f}, ${71 + (208 - 71) * f})`;
          ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
        }
      });
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [unit]);
  return (
    <figure className="legend">
      <canvas ref={canvas} style={{ width: 260, height: 34 * samples.length }} aria-hidden="true" />
      <ul>
        {samples.map((v) => <li key={v} className="num">{v.toLocaleString('es')} <span>viajes/hora</span></li>)}
      </ul>
      <figcaption>
        Más puntos, más viajes: la densidad es proporcional. Cada punto no es una persona ni sigue una carretera;
        todos se mueven a la misma velocidad.
      </figcaption>
    </figure>
  );
}

function Specimen() {
  const [dir, setDir] = useState<'salen' | 'llegan'>('salen');
  const [day, setDay] = useState<'laborable' | 'finde'>('laborable');
  const [playing, setPlaying] = useState(true);
  const ranking = [
    { name: 'Getafe', v: 41000 }, { name: 'Alcobendas', v: 33500 }, { name: 'Leganés', v: 29800 },
    { name: 'Pozuelo de Alarcón', v: 24100 }, { name: 'Alcorcón', v: 21900 },
  ];
  const max = ranking[0].v;
  return (
    <main className="specimen">
      <header className="sp-head">
        <p className="eyebrow">Especimen de diseño · Etapa 1</p>
        <p className="sp-intro">Identidad, color, tipografía y controles de <em>De aquí para allá</em>. Los datos de ejemplo son ilustrativos.</p>
      </header>

      <section>
        <h2 className="sp-h">01 / Título</h2>
        <div className="sp-grid two">
          <div className="sp-card tall"><p className="eyebrow">Móvil · apilado</p><Wordmark layout="stacked" className="wm wm-stacked" /></div>
          <div className="sp-card tall"><p className="eyebrow">Escritorio · en línea</p><Wordmark layout="inline" className="wm wm-inline" /></div>
        </div>
        <div className="compact-bar">
          <Mark size={28} tile={false} />
          <span className="cb-name">De aquí <em>para allá</em></span>
          <nav aria-label="Secciones"><a>Mapa</a><a>Tu lugar</a><a>Carrera</a><a>Dos Españas</a><a>El año</a><a>Descubre</a></nav>
          <button className="place-pill">Madrid <Icon name="close" /></button>
          <span className="lang"><b>ES</b> EN</span>
        </div>
      </section>

      <section>
        <h2 className="sp-h">02 / Símbolo</h2>
        <div className="sp-card marks">
          {[16, 32, 64, 128].map((s) => <figure key={s}><Mark size={s} /><figcaption>{s}px</figcaption></figure>)}
          <figure><Mark size={64} animate label="Cargando" /><figcaption>Carga</figcaption></figure>
          <figure className="favicon-real"><img src={`${import.meta.env.BASE_URL}favicon.svg`} width={32} height={32} alt="" /><figcaption>favicon.svg</figcaption></figure>
        </div>
      </section>

      <section>
        <h2 className="sp-h">03 / Color</h2>
        <div className="palette">
          {PALETTE.map((p) => (
            <div key={p.token} className="swatch">
              <span className="chip" style={{ background: p.hex }} />
              <span className="sw-role">{p.role}</span>
              <code>{p.token} {p.hex}</code>
              <span className="sw-contrast">{contrast(p.hex, '#070E15').toFixed(1)}:1 sobre la página</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="sp-h">04 / Tipografía</h2>
        <div className="sp-card type">
          <p className="eyebrow">01 / Tu lugar — eyebrow 11px · .14em</p>
          <h3 className="t-h2">¿A dónde va la gente que sale de Getafe?</h3>
          <p className="t-body">Cada día laborable salen de Getafe unos <strong>98.000 viajes</strong> hacia otros municipios. Newsreader para titulares y cifras; Hanken Grotesk para el texto y los controles, a 17px con interlineado amplio para leer bien sobre fondo oscuro.</p>
          <div className="t-numbers">
            <span className="num t-kpi">98.000</span>
            <span className="num t-clock">08:00</span>
            <span className="t-small">viajes que empiezan a esta hora</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="sp-h">05 / Controles</h2>
        <div className="sp-card controls">
          <button className="search-pill"><Icon name="search" /> Busca tu pueblo o ciudad</button>
          <div className="row">
            <PlayButton playing={playing} onToggle={() => setPlaying(!playing)} />
            <Segmented label="Sentido" value={dir} onChange={setDir}
              options={[{ value: 'salen', label: 'Salen', tone: 'aqui' }, { value: 'llegan', label: 'Llegan', tone: 'alla' }]} />
            <Segmented label="Tipo de día" value={day} onChange={setDay}
              options={[{ value: 'laborable', label: 'Laborable' }, { value: 'finde', label: 'Fin de semana' }]} />
          </div>
          <div className="row">
            <button className="chip-btn">Todo el año <Icon name="chevron" /></button>
            <button className="chip-btn ghost"><Icon name="sliders" /> Más filtros</button>
            <button className="chip-btn ghost">Volver a España</button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="sp-h">06 / Tarjetas, ranking y leyenda</h2>
        <div className="sp-grid three">
          <article className="kpi-card">
            <p className="eyebrow">Salen al día</p>
            <p className="num kpi-value" style={{ color: 'var(--aqui)' }}>98.000</p>
            <p className="kpi-note">Viajes a otros lugares · media de un laborable, jul 2024–jun 2025</p>
            <div className="ten" aria-label="6 de cada 10 se quedan dentro">
              {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < 6 ? 'in' : 'out'} />)}
            </div>
            <p className="kpi-note">De cada 10 viajes que empiezan aquí, 6 se quedan dentro</p>
          </article>
          <article className="sp-card">
            <p className="eyebrow">Destinos principales · 08:00</p>
            <ol className="bars">
              {ranking.map((r) => (
                <li key={r.name}>
                  <span className="bar-name">{r.name}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.v / max) * 100}%` }} /></span>
                  <span className="num bar-val">{r.v.toLocaleString('es')}</span>
                </li>
              ))}
            </ol>
          </article>
          <article className="sp-card"><p className="eyebrow">Leyenda del mapa</p><DensityLegend unit={50} /></article>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Specimen /></StrictMode>);

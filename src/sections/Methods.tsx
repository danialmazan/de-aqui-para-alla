// 04 / Cómo leer estos datos: folded until asked for, with the source and
// licence always visible at its foot. Then the footer.

import { useState } from 'react';
import { t } from '../lib/copy.ts';
import { Mark } from '../components/Mark.tsx';

export function Methods() {
  const [open, setOpen] = useState(false);
  return (
    <section className="section methods" id="como-leer" aria-labelledby="methods-title">
      <header className="section-head methods-head">
        <div>
          <p className="eyebrow">{t.methods.eyebrow}</p>
          <h2 id="methods-title" className="section-title">{t.methods.title}</h2>
        </div>
        <button className="icon-btn methods-toggle" aria-expanded={open} aria-controls="methods-body"
          aria-label={open ? t.methods.close : t.methods.open} title={open ? t.methods.close : t.methods.open}
          onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />{!open && <path d="M12 5v14" />}
          </svg>
        </button>
      </header>
      <dl className="methods-list" id="methods-body" hidden={!open}>
        {t.methods.items.map(([q, a]) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
      <div className="methods-source">
        <p>{t.footer.source}</p>
        <p>{t.footer.licence}</p>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <a className="footer-site" href="https://danielalmazan.com">danielalmazan.com</a>
      <p className="footer-credit">{t.footer.credit}</p>
      <a className="footer-home" href="#mapa" aria-label={`${t.title.a} ${t.title.b} · ${t.footer.top}`}>
        <Mark size={22} tile={false} />
        <span>{t.title.a} <em>{t.title.b}</em></span>
      </a>
    </footer>
  );
}

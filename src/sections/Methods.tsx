// 02 / Cómo leer estos datos, and the footer with source, licence and release.

import { t } from '../lib/copy.ts';
import { useData } from '../lib/state.ts';
import { Mark } from '../components/Mark.tsx';

export function Methods() {
  return (
    <section className="section methods" id="como-leer" aria-labelledby="methods-title">
      <header className="section-head">
        <p className="eyebrow">{t.methods.eyebrow}</p>
        <h2 id="methods-title" className="section-title">{t.methods.title}</h2>
      </header>
      <dl className="methods-list">
        {t.methods.items.map(([q, a]) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Footer() {
  const { manifest } = useData();
  return (
    <footer className="footer">
      <Mark size={28} tile={false} />
      <div>
        <p>{t.footer.source}</p>
        <p>{t.footer.licence}</p>
        <p>
          {t.footer.by} <a href="https://danielalmazan.com">danielalmazan.com</a>
          {manifest && <> · {t.footer.release(manifest.release)}</>}
        </p>
      </div>
    </footer>
  );
}

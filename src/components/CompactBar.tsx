// Once the map scrolls away, a slim bar keeps the name, the sections, the current
// place and the language switch at hand (family pattern: IntersectionObserver).

import { useEffect, useState } from 'react';
import { LANG, t } from '../lib/copy.ts';
import { setView, useData, useView } from '../lib/state.ts';
import { Icon } from './Controls.tsx';
import { Mark } from './Mark.tsx';
import { placeName } from './PlaceCard.tsx';

const BASE = import.meta.env.BASE_URL;

export function languageHref() {
  return `${LANG === 'es' ? `${BASE}en/` : BASE}${location.search}${location.hash}`;
}

export function CompactBar() {
  const [shown, setShown] = useState(false);
  const { zones } = useData();
  const { place } = useView();

  useEffect(() => {
    const hero = document.getElementById('mapa');
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setShown(e.intersectionRatio < 0.15), { threshold: [0, 0.15, 0.5] });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <nav className="compact-bar" data-shown={shown} aria-label={t.nav.map} aria-hidden={!shown} inert={!shown}>
      <a className="cb-home" href="#mapa">
        <Mark size={24} tile={false} />
        <span className="cb-name">{t.title.a} <em>{t.title.b}</em></span>
      </a>
      <span className="cb-links">
        <a href="#mapa">{t.nav.map}</a>
        <a href="#tu-lugar">{t.nav.place}</a>
        <a href="#como-leer">{t.nav.methods}</a>
      </span>
      {zones && place !== null && (
        <button className="place-pill" onClick={() => setView({ place: null })}>
          {placeName(zones, place)} <Icon name="close" /><span className="sr-only"> · {t.place.closeLabel}</span>
        </button>
      )}
      <a className="cb-lang" href={languageHref()} hrefLang={LANG === 'es' ? 'en' : 'es'} lang={LANG === 'es' ? 'en' : 'es'}>
        {t.langSwitch.other}<span className="sr-only"> · {t.langSwitch.otherName}</span>
      </a>
    </nav>
  );
}

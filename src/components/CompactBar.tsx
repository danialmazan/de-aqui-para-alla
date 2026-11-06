// Once the title scrolls out of sight, a slim bar keeps the name, the current
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

/** Back to the map with the search box ready to type in. */
export function findPlace() {
  document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => document.getElementById('buscar')?.focus({ preventScroll: true }), 450);
}

export function CompactBar() {
  const [shown, setShown] = useState(false);
  const { zones } = useData();
  const { place } = useView();

  useEffect(() => {
    const title = document.querySelector('.hero-title');
    if (!title) return;
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(title);
    return () => io.disconnect();
  }, []);

  return (
    <nav className="compact-bar" data-shown={shown} aria-label={t.nav.bar} aria-hidden={!shown} inert={!shown}>
      <a className="cb-home" href="#mapa">
        <Mark size={24} tile={false} />
        <span className="cb-name">{t.title.a} <em>{t.title.b}</em></span>
      </a>
      {zones && place !== null ? (
        <button className="place-pill" onClick={() => setView({ place: null })}>
          <span className="pp-name">{placeName(zones, place)}</span> <Icon name="close" /><span className="sr-only"> · {t.place.closeLabel}</span>
        </button>
      ) : (
        <button className="place-pill find-pill" onClick={findPlace}>
          <Icon name="search" /> {t.nav.find}
        </button>
      )}
      <a className="cb-lang" href={languageHref()} hrefLang={LANG === 'es' ? 'en' : 'es'} lang={LANG === 'es' ? 'en' : 'es'}>
        {t.langSwitch.other}<span className="sr-only"> · {t.langSwitch.otherName}</span>
      </a>
    </nav>
  );
}

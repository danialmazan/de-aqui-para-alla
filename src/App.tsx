// The page: the living map, Tu lugar, La carrera, Días raros, then how to read the data.
// Shared state (place, direction, day) lives in lib/state.ts and the URL.

import { useEffect } from 'react';
import { CompactBar, languageHref } from './components/CompactBar.tsx';
import { clock } from './lib/clock.ts';
import { LANG, t } from './lib/copy.ts';
import { REDUCED } from './lib/hooks.ts';
import { loadData, useData } from './lib/state.ts';
import { LivingMap } from './sections/LivingMap.tsx';
import { Footer, Methods } from './sections/Methods.tsx';
import { OddDays } from './sections/OddDays.tsx';
import { Race } from './sections/Race.tsx';
import { TuLugar } from './sections/TuLugar.tsx';

export function App() {
  const { error, manifest } = useData();

  useEffect(() => {
    document.documentElement.lang = LANG;
    document.title = `${t.title.a} ${t.title.b}`;
    loadData();
    if (REDUCED) clock.seek(8);
    return clock.start();
  }, []);

  return (
    <>
      <CompactBar />
      <a className="lang-float" href={languageHref()} hrefLang={LANG === 'es' ? 'en' : 'es'} lang={LANG === 'es' ? 'en' : 'es'}>
        {t.langSwitch.other}<span className="sr-only"> · {t.langSwitch.otherName}</span>
      </a>
      <main>
        <LivingMap />
        {error && !manifest && (
          <p className="load-error" role="alert">
            {t.error(error)} <button className="chip-btn" onClick={loadData}>{t.retry}</button>
          </p>
        )}
        <TuLugar />
        <Race />
        <OddDays />
        <Methods />
      </main>
      <Footer />
    </>
  );
}

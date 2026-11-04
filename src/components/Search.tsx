// Place search: an accessible combobox over every INE municipality. The index
// (≈60 KB gz) loads on first focus.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { loadSearch, type Zones } from '../lib/data.ts';
import { buildIndex, search, type Hit } from '../lib/search.ts';
import { Icon } from './Controls.tsx';
import { t } from '../lib/copy.ts';

export function Search({ zones, onPick }: { zones: Zones; onPick: (zone: number) => void }) {
  const [entries, setEntries] = useState<ReturnType<typeof buildIndex> | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const ensure = () => {
    if (entries || failed) return;
    loadSearch().then((ix) => setEntries(buildIndex(ix))).catch(() => setFailed(true));
  };
  const hits: Hit[] = useMemo(() => (entries ? search(entries, query, zones.zones.pop) : []), [entries, query, zones]);
  useEffect(() => setActive(0), [query]);

  const pick = (h: Hit) => {
    onPick(h.zone);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const show = open && query.trim().length >= 2;
  return (
    <div className="search">
      <label className="search-pill">
        <Icon name="search" />
        <span className="sr-only">{t.search.label}</span>
        <input
          ref={input}
          type="search"
          placeholder={t.search.label}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-activedescendant={show && hits[active] ? `${listId}-${active}` : undefined}
          value={query}
          onFocus={() => { ensure(); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
        />
      </label>
      {show && (
        <ul className="search-list" role="listbox" id={listId}>
          {!entries && !failed && <li className="search-empty">{t.search.loading}</li>}
          {failed && <li className="search-empty">{t.search.failed}</li>}
          {entries && hits.length === 0 && <li className="search-empty">{t.search.none}</li>}
          {hits.map((h, i) => {
            const zoneName = zones.zones.name[h.zone];
            return (
              <li
                key={`${h.zone}-${h.name}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(h); }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="hit-name">{h.name}</span>
                {zoneName !== h.name && <span className="hit-zone">{h.alias ? zoneName : t.search.inZone(zoneName)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

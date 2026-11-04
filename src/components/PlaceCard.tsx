// The selected place on the map: daily totals, top partners for the chosen
// direction, the Salen/Llegan switch and the way back to Spain. Grouped zones
// list their members. `PlaceRow` is the phone sheet's one-line version.

import { useEffect, useState } from 'react';
import { LANG, t } from '../lib/copy.ts';
import { isFull, loadSearch, type PlaceDay, type Zones } from '../lib/data.ts';
import { approx, approxShort } from '../lib/format.ts';
import type { Way } from '../lib/state.ts';
import { Icon, Segmented } from './Controls.tsx';

const sum = (h: number[]) => h.reduce((a, b) => a + b, 0);

export function placeName(zones: Zones, zone: number) {
  return zones.zones.name[zone].replace(' (agrupación)', '');
}

export function topPartners(day: PlaceDay, way: Way, n: number, hour: number | null = null) {
  const w = way === 'salen' ? day.out : day.in;
  const list = isFull(w)
    ? w.z.map((z, i) => ({ z, v: hour === null ? sum(w.h[i]) : w.h[i][hour] }))
    : w.z.map((z, i) => ({ z, v: w.day[i] }));
  return list.sort((a, b) => b.v - a.v).slice(0, n);
}

function WaySwitch({ way, onWay }: { way: Way; onWay: (w: Way) => void }) {
  return (
    <Segmented<Way> label={t.place.way} value={way} onChange={onWay}
      options={[{ value: 'salen', label: t.place.leave, tone: 'aqui' }, { value: 'llegan', label: t.place.arrive, tone: 'alla' }]} />
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="chip-btn ghost pc-close" onClick={onClose} aria-label={t.place.closeLabel}>
      <Icon name="close" /> {t.place.close}
    </button>
  );
}

export function PlaceRow({ zones, zone, way, onWay, onClose }: {
  zones: Zones; zone: number; way: Way; onWay: (w: Way) => void; onClose: () => void;
}) {
  return (
    <div className="place-row">
      <strong className="pr-name">{placeName(zones, zone)}</strong>
      <WaySwitch way={way} onWay={onWay} />
      <CloseButton onClose={onClose} />
    </div>
  );
}

export function PlaceCard({ zones, zone, day, way, onWay, onClose, special, compact = false }: {
  zones: Zones; zone: number; day: PlaceDay; way: Way; onWay: (w: Way) => void; onClose: () => void;
  special: boolean; compact?: boolean;
}) {
  const [members, setMembers] = useState<string[] | null>(null);
  const grouped = zones.zones.name[zone].endsWith('(agrupación)');

  useEffect(() => {
    setMembers(null);
    if (!grouped) return;
    loadSearch().then((ix) => setMembers(ix.name.filter((_, i) => ix.zone[i] === zone && ix.alias[i] === 0))).catch(() => {});
  }, [zone, grouped]);

  const out = sum(day.hours.out);
  const inn = sum(day.hours.in);
  const within = sum(day.hours.within);
  const top = topPartners(day, way, compact ? 3 : 5);
  const max = Math.max(1, ...top.map((x) => x.v));
  const tenths = out + within > 0 ? Math.round((within / (out + within)) * 10) : 0;

  return (
    <section className={compact ? 'place-card compact' : 'place-card'} aria-label={t.place.region(placeName(zones, zone))}>
      {!compact && (
        <header className="pc-head">
          <div>
            <p className="eyebrow">{t.place.eyebrow}</p>
            <h2 className="pc-name">{placeName(zones, zone)}</h2>
          </div>
          <CloseButton onClose={onClose} />
        </header>
      )}
      {grouped && (
        <details className="pc-members">
          <summary>{t.place.grouped(members ? String(members.length) : '…')}</summary>
          {members && <p>{members.join(', ')}</p>}
        </details>
      )}
      <dl className="pc-kpis">
        <div><dt><i style={{ background: 'var(--aqui)' }} />{t.place.leave}</dt><dd className="num">≈ {approxShort(out, LANG)}</dd></div>
        <div><dt><i style={{ background: 'var(--alla)' }} />{t.place.arrive}</dt><dd className="num">≈ {approxShort(inn, LANG)}</dd></div>
        <div><dt><i style={{ background: 'var(--dentro)' }} />{t.place.stay}</dt><dd className="num">≈ {approxShort(within, LANG)}</dd></div>
      </dl>
      {!compact && <p className="pc-note">{t.place.perDay} {t.place.tenths(tenths)}</p>}
      {!compact && <WaySwitch way={way} onWay={onWay} />}
      <p className="eyebrow pc-top-title">{way === 'salen' ? t.place.whereTo : t.place.whereFrom}</p>
      <ol className="bars">
        {top.map((x) => (
          <li key={x.z}>
            <span className="bar-name">{zones.zones.name[x.z]}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(x.v / max) * 100}%` }} /></span>
            <span className="num bar-val">{approx(x.v, LANG)}</span>
          </li>
        ))}
      </ol>
      {special && <p className="pc-note">{t.place.specialNote}</p>}
    </section>
  );
}

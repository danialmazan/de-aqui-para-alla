// 01 / Tu lugar: the selected place (Madrid until one is chosen) in numbers:
// totals, where people go or come from, the day's pulse, distance and purpose.
// Follows the map's place, direction and day.

import { useState } from 'react';
import { Bands, CountUp, Heartbeat, Purposes, Ranking, TenDots } from '../components/charts.tsx';
import { Segmented } from '../components/Controls.tsx';
import { placeName, topPartners } from '../components/PlaceCard.tsx';
import { LANG, t } from '../lib/copy.ts';
import { approx, formatHour } from '../lib/format.ts';
import { useWholeHour } from '../lib/hooks.ts';
import { setView, useData, useView, type Way } from '../lib/state.ts';

const sum = (h: number[]) => h.reduce((a, b) => a + b, 0);

export function TuLugar() {
  const { zones, placeData, manifest } = useData();
  const { place, way, day: key } = useView();
  const [scope, setScope] = useState<'day' | 'hour'>('day');
  const hour = useWholeHour();

  if (!zones || !placeData || !manifest) return <section className="section tu-lugar" id="tu-lugar" aria-busy="true" />;
  const zone = zones.zones.id.indexOf(placeData.id);
  const d = placeData.keys[key];
  if (!d) return null;
  const name = placeName(zones, zone);
  const special = manifest.keys[key]?.kind === 'special';
  const atHour = scope === 'hour' && !special;
  const out = sum(d.hours.out);
  const inn = sum(d.hours.in);
  const within = sum(d.hours.within);
  const tenths = out + within > 0 ? Math.round((within / (out + within)) * 10) : 0;
  const rows = topPartners(d, way, 10, atHour ? hour : null).map((r) => ({ id: r.z, value: r.v }));

  const toMap = () => {
    if (place === null) setView({ place: zone });
    document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="section tu-lugar" id="tu-lugar" aria-labelledby="tu-lugar-title">
      <header className="section-head">
        <p className="eyebrow">{t.tuLugar.eyebrow}</p>
        <h2 id="tu-lugar-title" className="section-title">{t.tuLugar.title(name)}</h2>
        {place === null && <p className="section-note">{t.tuLugar.defaultNote}</p>}
      </header>

      <div className="kpis">
        <article className="kpi-card">
          <p className="eyebrow">{t.tuLugar.kpiLeave}</p>
          <p className="num kpi-value" style={{ color: 'var(--aqui)' }}>≈ <CountUp value={out} short /></p>
          <p className="kpi-note">{t.tuLugar.kpiLeaveNote}</p>
        </article>
        <article className="kpi-card">
          <p className="eyebrow">{t.tuLugar.kpiArrive}</p>
          <p className="num kpi-value" style={{ color: 'var(--alla)' }}>≈ <CountUp value={inn} short /></p>
          <p className="kpi-note">{t.tuLugar.kpiArriveNote}</p>
        </article>
        <article className="kpi-card">
          <p className="eyebrow">{t.tuLugar.kpiStay}</p>
          <p className="num kpi-value" style={{ color: 'var(--dentro)' }}>≈ <CountUp value={within} short /></p>
          <TenDots inside={tenths} label={t.tuLugar.tenths(tenths)} />
          <p className="kpi-note">{t.tuLugar.tenths(tenths)}</p>
        </article>
      </div>

      <div className="tl-grid">
        <article className="card tl-ranking">
          <header className="card-head">
            <h3 className="card-title">{t.tuLugar.rankingTitle[way]}</h3>
            <Segmented<Way> label={t.place.way} value={way} onChange={(v) => setView({ way: v })}
              options={[{ value: 'salen', label: t.place.leave, tone: 'aqui' }, { value: 'llegan', label: t.place.arrive, tone: 'alla' }]} />
          </header>
          {!special && (
            <Segmented<'day' | 'hour'> label={t.tuLugar.rankingScope} value={scope} onChange={setScope}
              options={[{ value: 'day', label: t.tuLugar.allDay }, { value: 'hour', label: t.tuLugar.atHour(formatHour(hour)) }]} />
          )}
          <p className="card-note">{t.tuLugar.rankingNote(atHour ? formatHour(hour) : null)}</p>
          <Ranking rows={rows} name={(z) => zones.zones.name[z]} label={t.tuLugar.rankingTitle[way]} />
          {!atHour && <p className="card-note">{t.tuLugar.rest(approx(Math.max(0, (way === 'salen' ? out : inn) - sum(rows.map((r) => r.value))), LANG))}</p>}
          <button className="chip-btn" onClick={toMap}>{t.tuLugar.showOnMap}</button>
        </article>

        <article className="card tl-heartbeat">
          <h3 className="card-title">{t.tuLugar.heartbeatTitle}</h3>
          <p className="card-note">{t.tuLugar.heartbeatNote}</p>
          <p className="hb-key">
            <span><i style={{ background: 'var(--aqui)' }} />{t.place.leave}</span>
            <span><i style={{ background: 'var(--alla)' }} />{t.place.arrive}</span>
          </p>
          <Heartbeat out={d.hours.out} inn={d.hours.in} labels={{ out: t.place.leave, in: t.place.arrive }} />
        </article>

        {d.bands && d.purpose ? (
          <>
            <article className="card tl-distance">
              <h3 className="card-title">{t.tuLugar.distanceTitle}</h3>
              <p className="card-note">{t.tuLugar.distanceNote}</p>
              <Bands dentro={d.bands.dentro} fuera={d.bands.fuera} names={t.tuLugar.bands}
                inside={t.tuLugar.inside} outside={t.tuLugar.outside} />
            </article>
            <article className="card tl-purpose">
              <h3 className="card-title">{t.tuLugar.purposeTitle}</h3>
              <p className="card-note">{t.tuLugar.purposeNote[way]}</p>
              <Purposes values={way === 'salen' ? d.purpose.out : d.purpose.in} names={t.tuLugar.purposes}
                tone={way === 'salen' ? 'aqui' : 'alla'} />
              <p className="card-note">{t.tuLugar.estimated}</p>
            </article>
          </>
        ) : (
          <p className="card-note tl-nodetail">{t.tuLugar.noDetail}</p>
        )}
      </div>
    </section>
  );
}


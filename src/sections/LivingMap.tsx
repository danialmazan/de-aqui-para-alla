// The hero: the living map. Áreas below zoom 6.5, municipalities of the provinces
// in view above it, or one place and its partners when a place is selected.

import { useEffect, useRef, useState } from 'react';
import { Map as MlMap, addProtocol, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { basemapStyle } from '../map/basemap.ts';
import { FlowLayer, type FlowArc, type FlowHalo, type FlowStats } from '../map/FlowLayer.ts';
import { clock } from '../lib/clock.ts';
import { LANG, t } from '../lib/copy.ts';
import { isFull, loadNational, loadRegional, type Place, type Zones } from '../lib/data.ts';
import { formatDate } from '../lib/format.ts';
import { REDUCED, useMedia } from '../lib/hooks.ts';
import { startPerfSampler, type PerfSnapshot } from '../lib/perf.ts';
import { setView, useData, useView, type Way } from '../lib/state.ts';
import { Dock } from '../components/Dock.tsx';
import { PlaceCard, PlaceRow } from '../components/PlaceCard.tsx';
import { Search } from '../components/Search.tsx';
import { Wordmark } from '../components/Wordmark.tsx';

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const DOT_BUDGET = Number(params.get('dots')) || 30000;
const SHOW_PERF = params.has('perf');
const CORE = Number(params.get('core') ?? 0.35);
const GAIN = Number(params.get('gain') ?? 1.6);

/** Below this zoom the map shows áreas; above it, municipalities of the provinces in view. */
const AREA_MAX_ZOOM = 6.5;
const SPAIN_BOUNDS: [[number, number], [number, number]] = [[-13.4, 34.0], [4.4, 43.9]];
const MADRID_BOUNDS: [[number, number], [number, number]] = [[-4.25, 40.05], [-3.15, 40.8]];
const LABELS = 12;

let protocolAdded = false;
function ensurePmtiles() {
  if (protocolAdded) return;
  setWorkerUrl(mapWorkerUrl);
  addProtocol('pmtiles', new Protocol().tile);
  protocolAdded = true;
}

const sum = (h: number[]) => h.reduce((a, b) => a + b, 0);
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

/** Keep framed places clear of the title/search block, the left panel and the dock. */
function viewPadding() {
  return isPhone()
    ? { top: 170, bottom: 230, left: 16, right: 16 }
    : { top: 40, bottom: 190, left: 420, right: 40 };
}

type Bounds = [[number, number], [number, number]];

/** What the layer draws plus what the labels need. */
type Scene = {
  level: 'area' | 'zone';
  arcs: FlowArc[];
  halos: FlowHalo[];
  places: { name: string; lon: number; lat: number; day: number }[];
};

async function nationalScene(key: string, z: Zones): Promise<Scene> {
  const nat = await loadNational(key);
  const pos = (i: number): [number, number] => [z.areas.lon[nat.nodes.area[i]], z.areas.lat[nat.nodes.area[i]]];
  const halos = nat.nodes.area.map((_, i) => ({ at: pos(i), hours: nat.nodes.halo[i] }));
  const day = nat.nodes.halo.map(sum);
  const arcs = nat.arcs.o.map((o, i) => {
    const d = nat.arcs.d[i];
    const v = sum(nat.arcs.h[i]);
    day[o] += v;
    day[d] += v;
    return { o: pos(o), d: pos(d), hours: nat.arcs.h[i], from: o };
  });
  const places = nat.nodes.area.map((a, i) => ({ name: z.areas.name[a], lon: z.areas.lon[a], lat: z.areas.lat[a], day: day[i] }));
  return { level: 'area', arcs, halos, places };
}

async function regionalScene(key: string, provs: string[], z: Zones): Promise<Scene> {
  const files = await Promise.all(provs.map((p) => loadRegional(p, key)));
  const haloIndex = new Map<number, number>();
  const halos: FlowHalo[] = [];
  const day: number[] = [];
  const node = (zone: number, hours?: number[]) => {
    let i = haloIndex.get(zone);
    if (i === undefined) {
      i = halos.length;
      haloIndex.set(zone, i);
      halos.push({ at: [z.zones.lon[zone], z.zones.lat[zone]], hours: hours ?? new Array(24).fill(0) });
      day.push(hours ? sum(hours) : 0);
    }
    return i;
  };
  files.forEach((f) => f.halo.zone.forEach((zone, i) => node(zone, f.halo.h[i])));
  const seen = new Set<string>();
  const arcs: FlowArc[] = [];
  files.forEach((f) => f.arcs.o.forEach((o, i) => {
    const d = f.arcs.d[i];
    const id = `${o}>${d}`;
    if (seen.has(id)) return;
    seen.add(id);
    const from = node(o);
    const v = sum(f.arcs.h[i]);
    day[from] += v;
    day[node(d)] += v;
    arcs.push({ o: [z.zones.lon[o], z.zones.lat[o]], d: [z.zones.lon[d], z.zones.lat[d]], hours: f.arcs.h[i], from });
  }));
  const places = [...haloIndex.keys()].map((zone, i) => ({ name: z.zones.name[zone], lon: z.zones.lon[zone], lat: z.zones.lat[zone], day: day[i] }));
  return { level: 'zone', arcs, halos, places };
}

/**
 * One place: its partners for the chosen direction. The top ones carry dots with
 * their 24-hour values; further partners (and special days, which only have daily
 * totals) are faint lines. Trips that stay inside are the place's halo.
 */
function placeScene(p: Place, zone: number, key: string, way: Way, z: Zones): Scene & { bounds: Bounds } {
  const day = p.keys[key];
  const at = (q: number): [number, number] => [z.zones.lon[q], z.zones.lat[q]];
  const here = at(zone);
  const flat = (v: number) => new Array(24).fill(v / 24);
  const w = way === 'salen' ? day.out : day.in;
  const arcs: FlowArc[] = [];
  const places: Scene['places'] = [{ name: z.zones.name[zone], lon: here[0], lat: here[1], day: Infinity }];
  const add = (q: number, hours: number[], dots: boolean) => {
    arcs.push(way === 'salen' ? { o: here, d: at(q), hours, from: 0, dots } : { o: at(q), d: here, hours, from: 0, dots });
    places.push({ name: z.zones.name[q], lon: at(q)[0], lat: at(q)[1], day: sum(hours) });
  };
  if (isFull(w)) {
    w.z.forEach((q, i) => add(q, w.h[i], true));
    w.sz.forEach((q, i) => add(q, flat(w.sday[i]), false));
  } else {
    w.z.forEach((q, i) => add(q, flat(w.day[i]), false));
  }
  // Frame the place and its twelve biggest partners.
  const pts = [here, ...w.z.slice(0, 12).map(at)];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const bounds: Bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  return { level: 'zone', arcs, halos: [{ at: here, hours: day.hours.within }], places, bounds };
}

/** Provinces whose zone centroids fall in (or near) the visible bounds. */
function provincesInView(map: MlMap, z: Zones) {
  const b = map.getBounds();
  const padX = (b.getEast() - b.getWest()) * 0.15;
  const padY = (b.getNorth() - b.getSouth()) * 0.15;
  const set = new Set<string>();
  z.zones.prov.forEach((p, i) => {
    if (!/^\d/.test(p)) return;
    const lon = z.zones.lon[i];
    const lat = z.zones.lat[i];
    if (lon > b.getWest() - padX && lon < b.getEast() + padX && lat > b.getSouth() - padY && lat < b.getNorth() + padY) set.add(p);
  });
  return [...set].sort();
}

export function LivingMap() {
  const { manifest, zones, placeData, error } = useData();
  const { place: placeZone, way, day: key } = useView();
  const phone = useMedia('(max-width: 767px)');
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const layerRef = useRef<FlowLayer | null>(null);
  const [scope, setScope] = useState<{ level: 'area' | 'zone'; provs: string[] }>(
    params.get('vista') === 'espana' ? { level: 'area', provs: [] } : { level: 'zone', provs: ['05', '16', '19', '28', '40', '45'] });
  const [scene, setScene] = useState<Scene | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [stats, setStats] = useState<FlowStats | null>(null);
  const [perf, setPerf] = useState<PerfSnapshot | null>(null);
  const [labels, setLabels] = useState<{ name: string; x: number; y: number }[]>([]);
  const [zoomedOut, setZoomedOut] = useState(params.get('vista') === 'espana');
  const placeZoneRef = useRef<number | null>(null);
  placeZoneRef.current = placeZone;
  // The place file only counts once it is the selected place's (Tu lugar may hold Madrid's).
  const place = placeZone !== null && zones && placeData?.id === zones.zones.id[placeZone] ? placeData : null;

  useEffect(() => (SHOW_PERF ? startPerfSampler(setPerf) : undefined), []);

  // Map: created once zones are known.
  useEffect(() => {
    if (!zones || !container.current) return;
    ensurePmtiles();
    const tiles = new URL(`${BASE}tiles/base.pmtiles`, location.href).href;
    const map = new MlMap({
      container: container.current,
      style: basemapStyle(tiles),
      center: [-3.7, 40.4],
      zoom: 6,
      maxBounds: [[-25, 26], [12, 50]],
      minZoom: 3.5,
      maxZoom: 11,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    // Frame the opening view now and again on load (the container may not have its
    // size yet), unless a place (e.g. from a shared link) is already being framed.
    const frame = () => {
      if (placeZoneRef.current !== null) return;
      const cam = map.cameraForBounds((zoomedOut ? SPAIN_BOUNDS : MADRID_BOUNDS) as LngLatBoundsLike, { padding: viewPadding() });
      if (cam) map.jumpTo(cam);
    };
    frame();
    map.once('load', frame);
    const layer = new FlowLayer('flows', DOT_BUDGET);
    layer.getHour = () => clock.hour;
    layer.paused = REDUCED;
    layer.coreOpacity = CORE;
    layer.glowGain = GAIN;
    layer.onStats = setStats;
    mapRef.current = map;
    layerRef.current = layer;
    map.on('load', () => {
      map.addLayer(layer);
      const z = placeZoneRef.current;
      if (z !== null) map.setFilter('zone-selected', ['==', ['get', 'id'], zones.zones.id[z]]);
    });
    // Tap a zone to open it (the Canaries inset carries the same ids).
    const zoneIndex = new Map(zones.zones.id.map((id, i) => [id, i]));
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] })[0];
      const i = f ? zoneIndex.get(String(f.properties.id)) : undefined;
      if (i !== undefined) setView({ place: i });
    });
    map.on('mousemove', (e) => {
      map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] }).length ? 'pointer' : '';
    });
    map.on('moveend', () => {
      const level = map.getZoom() < AREA_MAX_ZOOM ? 'area' : 'zone';
      const provs = level === 'zone' ? provincesInView(map, zones) : [];
      setScope((s) => (s.level === level && s.provs.join() === provs.join() ? s : { level, provs }));
      setZoomedOut(map.getZoom() < 6);
    });
    // Off screen, the map needn't draw (the clock and the sections keep going).
    const io = new IntersectionObserver(([e]) => { layer.paused = REDUCED || !e.isIntersecting; if (e.isIntersecting) map.triggerRepaint(); });
    io.observe(container.current);
    if (SHOW_PERF) Object.assign(window, { __dapa: { map, layer } });
    return () => { io.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones]);

  // Selected place: outline it.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('zone-selected')) {
      map.setFilter('zone-selected', ['==', ['get', 'id'], placeZone === null || !zones ? '' : zones.zones.id[placeZone]]);
    }
  }, [placeZone, zones]);

  // …and frame it with its partners once its file arrives.
  const framed = useRef<string | null>(null);
  useEffect(() => {
    if (!place || placeZone === null || !zones) { framed.current = null; return; }
    if (framed.current === place.id) return;
    framed.current = place.id;
    const b = placeScene(place, placeZone, key, way, zones).bounds;
    const pad = viewPadding();
    if (!isPhone()) pad.left = 440;
    mapRef.current?.fitBounds(b, { padding: pad, maxZoom: 10, duration: REDUCED ? 0 : 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, placeZone, zones]);

  // Scene: the selected place, or the áreas/municipalities in view. A place's
  // scene ignores panning, so moving the map doesn't restart its dots.
  const placeSig = useRef('');
  useEffect(() => {
    if (!zones || !manifest) return;
    if (place && placeZone !== null) {
      const sig = `${place.id}|${key}|${way}`;
      if (sig !== placeSig.current) {
        placeSig.current = sig;
        setScene(placeScene(place, placeZone, key, way, zones));
      }
      return;
    }
    placeSig.current = '';
    let stale = false;
    (scope.level === 'area' ? nationalScene(key, zones) : regionalScene(key, scope.provs, zones))
      .then((s) => { if (!stale) { setScene(s); setSceneError(null); } })
      .catch((e) => setSceneError(String(e)));
    return () => { stale = true; };
  }, [key, scope, zones, manifest, place, placeZone, way]);

  useEffect(() => {
    if (scene) layerRef.current?.setFlows(scene.arcs, scene.halos);
  }, [scene]);

  // Labels: the busiest places in view, without collisions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !scene) return;
    const ranked = [...scene.places].sort((a, b) => b.day - a.day);
    const position = () => {
      const w = map.getContainer().clientWidth;
      const h = map.getContainer().clientHeight;
      const out: { name: string; x: number; y: number }[] = [];
      for (const p of ranked) {
        if (out.length >= LABELS) break;
        const { x, y } = map.project([p.lon, p.lat]);
        if (x < 0 || y < 0 || x > w || y > h) continue;
        if (out.some((o) => Math.abs(o.x - x) < 90 && Math.abs(o.y - y) < 22)) continue;
        out.push({ name: p.name, x, y });
      }
      setLabels(out);
    };
    position();
    map.on('move', position);
    return () => { map.off('move', position); };
  }, [scene]);

  const day = manifest?.keys[key];
  const fly = (to: 'spain' | 'madrid') => {
    mapRef.current?.fitBounds(to === 'spain' ? SPAIN_BOUNDS : MADRID_BOUNDS, { padding: viewPadding(), duration: REDUCED ? 0 : 1200 });
  };
  const closePlace = () => { setView({ place: null }); fly('spain'); };
  const onWay = (w: Way) => setView({ way: w });
  const placeDay = place?.keys[key];
  const special = day?.kind === 'special';
  const shownError = error ?? sceneError;

  return (
    <section className="hero" id="mapa" aria-label={t.nav.map}>
      <div ref={container} className="map" aria-label={t.hero.mapLabel} role="region" />
      <div className="labels" aria-hidden="true">
        {labels.map((l) => (
          <span key={l.name} style={{ transform: `translate(${l.x}px, ${l.y}px)` }}>{l.name}</span>
        ))}
      </div>

      <header className="hero-head">
        <h1 className="hero-title"><Wordmark layout="inline" className="hero-wordmark" /></h1>
        {day && (
          <p className="hero-note">
            {day.kind === 'typical'
              ? (() => { const [a, b, c] = t.hero.typical(day.label[LANG], day.n ?? 0, day.note?.[LANG] ?? ''); return <>{a}<strong>{b}</strong>{c}</>; })()
              : (() => { const [a, b] = t.hero.special(day.label[LANG], formatDate(day.date!, LANG)); return <><strong>{a}</strong>{b}</>; })()}
            {' '}{scope.level === 'area' ? t.hero.areas : t.hero.zones}
          </p>
        )}
        {zones && <Search zones={zones} onPick={(z) => setView({ place: z })} />}
        {!phone && zones && placeZone !== null && placeDay ? (
          <PlaceCard zones={zones} zone={placeZone} day={placeDay} way={way} onWay={onWay} onClose={closePlace} special={special} />
        ) : placeZone === null && (
          <button className="chip-btn view-btn" onClick={() => fly(zoomedOut ? 'madrid' : 'spain')}>
            {zoomedOut ? t.hero.toMadrid : t.hero.toSpain}
          </button>
        )}
      </header>

      {manifest && (
        <Dock manifest={manifest} dayKey={key} onDay={(d) => setView({ day: d })} stats={stats} level={scope.level} mobile={phone}
          placeRow={phone && zones && placeZone !== null
            ? <PlaceRow zones={zones} zone={placeZone} way={way} onWay={onWay} onClose={closePlace} /> : undefined}
          placeDetail={phone && zones && placeZone !== null && placeDay
            ? <PlaceCard compact zones={zones} zone={placeZone} day={placeDay} way={way} onWay={onWay} onClose={closePlace} special={special} /> : undefined} />
      )}

      {shownError && <p className="error" role="alert">{t.error(shownError)}</p>}
      {SHOW_PERF && (
        <pre className="perf" aria-live="off">
          {perf ? `${perf.fps.toFixed(0)} fps · p50 ${perf.p50.toFixed(1)} · p95 ${perf.p95.toFixed(1)} ms\n` : '…\n'}
          {stats ? `${stats.drawn}/${stats.arcs} arcos · ${stats.dots.toLocaleString('es')} puntos · U=${stats.unit}` : ''}
          {`\npresupuesto ${DOT_BUDGET.toLocaleString('es')} · dpr ${devicePixelRatio} · z ${stats?.layoutZoom.toFixed(1)}`}
        </pre>
      )}
    </section>
  );
}

// The hero: the living map. Áreas below zoom 7.5, municipalities of the provinces
// in view above it, or one place and its partners when a place is selected.

import { useEffect, useRef, useState } from 'react';
import { Map as MlMap, NavigationControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { basemapStyle } from '../map/basemap.ts';
import { FlowLayer, type FlowArc, type FlowHalo, type FlowStats } from '../map/FlowLayer.ts';
import { clock } from '../lib/clock.ts';
import { LANG, t } from '../lib/copy.ts';
import { isFull, loadNational, loadRegional, type Place, type Regional, type Zones } from '../lib/data.ts';
import { REDUCED, useMedia } from '../lib/hooks.ts';
import { startPerfSampler, type PerfSnapshot } from '../lib/perf.ts';
import { setView, useData, useView, type Way } from '../lib/state.ts';
import { Dock } from '../components/Dock.tsx';
import { Icon } from '../components/Controls.tsx';
import { PlaceCard, PlaceRow, isForeign, placeName } from '../components/PlaceCard.tsx';
import { Search } from '../components/Search.tsx';
import { ResetButton } from '../components/DayTools.tsx';
import { Wordmark } from '../components/Wordmark.tsx';

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
/** Dot budget: fixed with ?dots=N, otherwise it follows the map's area (?density=dots per px²). */
const DOT_BUDGET = Number(params.get('dots')) || 0;
const DENSITY = Number(params.get('density')) || 0.008;
const SHOW_PERF = params.has('perf');
// Dot and halo brightness. Phones get brighter, slightly bigger dots: small,
// often outdoor screens wash out the faint ones.
type Look = { core: number; gain: number; radius: number; halo: number };
const LOOK: Record<'desk' | 'phone', Look> = {
  desk: { core: 0.35, gain: 1.6, radius: 4.2, halo: 1 },
  phone: { core: 0.6, gain: 2.6, radius: 4.8, halo: 1.45 },
};
function lookFor(phone: boolean): Look {
  const l = LOOK[phone ? 'phone' : 'desk'];
  const n = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  return { core: n('core', l.core), gain: n('gain', l.gain), radius: n('radius', l.radius), halo: n('halo', l.halo) };
}
function applyLook(layer: FlowLayer, phone: boolean) {
  const l = lookFor(phone);
  layer.coreOpacity = l.core;
  layer.glowGain = l.gain;
  layer.dotRadius = l.radius;
  layer.haloGain = l.halo;
}

/**
 * Below this zoom the map shows áreas; above it, municipalities of the provinces
 * in view. Lower than this, thousands of short municipal links share the dots
 * and most get none, so the map reads as halos only.
 */
const AREA_MAX_ZOOM = 7.5;
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
const zero = () => new Array(24).fill(0);
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

/** Keep framed places clear of the title/search block, the left panel and the dock. */
/**
 * The opening view: Madrid and its ring of towns, a little wider than the
 * metro area, but still close enough for the municipal flows (zoom ≥ 7.6).
 */
function madridCamera(map: MlMap) {
  const cam = map.cameraForBounds(MADRID_BOUNDS, { padding: viewPadding() });
  if (cam?.zoom !== undefined) cam.zoom = Math.max(AREA_MAX_ZOOM + 0.1, cam.zoom - 0.6);
  return cam;
}

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
  // Only trips within Spain (France and Portugal are the only places abroad the data locates).
  const spain = nat.nodes.area.map((a) => !/^(FR|PT)/.test(z.areas.id[a]));
  const halos = nat.nodes.area.map((_, i) => ({ at: pos(i), hours: spain[i] ? nat.nodes.halo[i] : zero() }));
  const day = nat.nodes.halo.map((h, i) => (spain[i] ? sum(h) : 0));
  const arcs: FlowArc[] = [];
  nat.arcs.o.forEach((o, i) => {
    const d = nat.arcs.d[i];
    if (!spain[o] || !spain[d]) return;
    const v = sum(nat.arcs.h[i]);
    day[o] += v;
    day[d] += v;
    arcs.push({ o: pos(o), d: pos(d), hours: nat.arcs.h[i], from: o });
  });
  const places = nat.nodes.area.flatMap((a, i) => (spain[i] ? [{ name: z.areas.name[a], lon: z.areas.lon[a], lat: z.areas.lat[a], day: day[i] }] : []));
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
    if (seen.has(id) || isForeign(z, o) || isForeign(z, d)) return;
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
 * One place: its partners within Spain for the chosen direction. The top ones
 * carry dots with their 24-hour values; further partners are faint lines. Special
 * days only have daily totals in the place file, so their dots come from the
 * province's file (`regional`), which has hours for the bigger connections.
 * Trips that stay inside are the place's halo.
 */
function placeScene(p: Place, zone: number, key: string, way: Way, z: Zones, regional?: Regional): Scene & { bounds: Bounds } {
  const day = p.keys[key];
  const at = (q: number): [number, number] => [z.zones.lon[q], z.zones.lat[q]];
  const here = at(zone);
  const flat = (v: number) => new Array(24).fill(v / 24);
  const w = way === 'salen' ? day.out : day.in;
  const arcs: FlowArc[] = [];
  const places: Scene['places'] = [{ name: z.zones.name[zone], lon: here[0], lat: here[1], day: Infinity }];
  const seen = new Set<number>();
  const add = (q: number, hours: number[], dots: boolean) => {
    if (seen.has(q) || q === zone || isForeign(z, q)) return;
    seen.add(q);
    arcs.push(way === 'salen' ? { o: here, d: at(q), hours, from: 0, dots } : { o: at(q), d: here, hours, from: 0, dots });
    places.push({ name: z.zones.name[q], lon: at(q)[0], lat: at(q)[1], day: sum(hours) });
  };
  if (isFull(w)) {
    w.z.forEach((q, i) => add(q, w.h[i], true));
    w.sz.forEach((q, i) => add(q, flat(w.sday[i]), false));
  } else {
    regional?.arcs.o.forEach((o, i) => {
      const d = regional.arcs.d[i];
      if (way === 'salen' && o === zone) add(d, regional.arcs.h[i], true);
      if (way === 'llegan' && d === zone) add(o, regional.arcs.h[i], true);
    });
    w.z.forEach((q, i) => add(q, flat(w.day[i]), false));
  }
  // Frame the place and its twelve biggest partners.
  const pts = [here, ...w.z.filter((q) => !isForeign(z, q)).slice(0, 12).map(at)];
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
  useEffect(() => {
    if (!layerRef.current) return;
    applyLook(layerRef.current, phone);
    mapRef.current?.triggerRepaint();
  }, [phone]);

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
      // Scrolling the page never gets trapped by the map: zoom with Ctrl/⌘ + wheel,
      // the buttons, or two fingers.
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': t.map.ctrlZoom,
        'CooperativeGesturesHandler.MacHelpText': t.map.cmdZoom,
        'CooperativeGesturesHandler.MobileHelpText': t.map.twoFingers,
        'NavigationControl.ZoomIn': t.map.zoomIn,
        'NavigationControl.ZoomOut': t.map.zoomOut,
      },
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    if (!window.matchMedia('(pointer: coarse)').matches) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // Frame the opening view now and again on load (the container may not have its
    // size yet), unless a place (e.g. from a shared link) is already being framed.
    const frame = () => {
      if (placeZoneRef.current !== null) return;
      const cam = zoomedOut ? map.cameraForBounds(SPAIN_BOUNDS, { padding: viewPadding() }) : madridCamera(map);
      if (cam) map.jumpTo(cam);
    };
    frame();
    map.once('load', frame);
    const layer = new FlowLayer('flows', DOT_BUDGET);
    layer.density = DENSITY;
    layer.getHour = () => clock.hour;
    layer.paused = REDUCED;
    applyLook(layer, window.matchMedia('(max-width: 767px)').matches);
    layer.onStats = setStats;
    mapRef.current = map;
    layerRef.current = layer;
    map.on('load', () => {
      // The zoning credit starts folded into its ⓘ so it never sits under the panels.
      const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
      attrib?.classList.remove('maplibregl-compact-show');
      attrib?.removeAttribute('open');
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
      if (sig === placeSig.current) return;
      placeSig.current = sig;
      if (isFull(place.keys[key].out)) {
        setScene(placeScene(place, placeZone, key, way, zones));
        return;
      }
      // Lines first, then dots once the province's file arrives (unless the view moved on).
      setScene(placeScene(place, placeZone, key, way, zones));
      loadRegional(zones.zones.prov[placeZone], key)
        .then((r) => { if (placeSig.current === sig) setScene(placeScene(place, placeZone, key, way, zones, r)); })
        .catch(() => {});
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
    const map = mapRef.current;
    const cam = map && (to === 'spain' ? map.cameraForBounds(SPAIN_BOUNDS, { padding: viewPadding() }) : madridCamera(map));
    if (cam) map.flyTo({ ...cam, duration: REDUCED ? 0 : 1200 });
  };
  // Closing a place keeps the camera where it is; the reset button also flies
  // back to the opening view.
  const closePlace = () => setView({ place: null });
  const resetMap = () => { setView({ place: null }); fly('madrid'); };
  const resetBtn = <ResetButton className="map-reset" label={t.hero.reset} active onReset={resetMap} />;
  const onWay = (w: Way) => setView({ way: w });
  const placeDay = place?.keys[key];
  const special = day?.kind === 'special';
  const shownError = error ?? sceneError;
  const storyZone = placeZone ?? (zones && placeData ? zones.zones.id.indexOf(placeData.id) : -1);
  const storyName = zones && storyZone >= 0 ? placeName(zones, storyZone) : null;
  const showCard = !phone && zones && placeZone !== null && placeDay;

  return (
    <section className="hero" id="mapa" aria-label={t.nav.map} data-place={!!showCard}>
      <div ref={container} className="map" aria-label={t.hero.mapLabel} role="region" />
      <div className="labels" aria-hidden="true">
        {labels.map((l) => (
          <span key={l.name} style={{ transform: `translate(${l.x}px, ${l.y}px)` }}>{l.name}</span>
        ))}
      </div>

      <header className="hero-head">
        <h1 className="hero-title"><Wordmark layout="inline" className="hero-wordmark" /></h1>
        {day && !showCard && (
          <p className="hero-note">
            {(() => { const [a, b] = t.hero.day(key, day.label[LANG], day.n ?? 0); return <><strong>{a}</strong>{b}</>; })()}
          </p>
        )}
        <div className="search-row">
          {zones && <Search zones={zones} onPick={(z) => setView({ place: z })} />}
          {phone && resetBtn}
        </div>
        {(!phone || placeZone === null) && (
          <div className="view-row">
            <button className="chip-btn view-btn" onClick={() => fly(zoomedOut ? 'madrid' : 'spain')}>
              {zoomedOut ? t.hero.toMadrid : t.hero.toSpain}
            </button>
            {!phone && resetBtn}
          </div>
        )}
        {showCard && (
          <PlaceCard zones={zones} zone={placeZone} day={placeDay} way={way} onWay={onWay} onClose={closePlace} special={special} />
        )}
      </header>

      {manifest && (
        <Dock manifest={manifest} dayKey={key} onDay={(d) => setView({ day: d })} unit={stats?.unit ?? null} mobile={phone}
          placeOpen={placeZone !== null}
          placeRow={phone && zones && placeZone !== null
            ? <PlaceRow zones={zones} zone={placeZone} way={way} onWay={onWay} onClose={closePlace} /> : undefined}
          placeDetail={phone && zones && placeZone !== null && placeDay
            ? <PlaceCard compact zones={zones} zone={placeZone} day={placeDay} way={way} onWay={onWay} onClose={closePlace} special={special} /> : undefined} />
      )}

      {!phone && storyName && (
        <a className="hero-next" href="#tu-lugar">
          <span>{t.hero.next(storyName)}</span> <Icon name="chevron" />
        </a>
      )}

      {shownError && <p className="error" role="alert">{t.error(shownError)}</p>}
      {SHOW_PERF && (
        <pre className="perf" aria-live="off">
          {perf ? `${perf.fps.toFixed(0)} fps · p50 ${perf.p50.toFixed(1)} · p95 ${perf.p95.toFixed(1)} ms\n` : '…\n'}
          {stats ? `${stats.drawn}/${stats.arcs} arcos · ${stats.dots.toLocaleString('es')} puntos · U=${stats.unit}` : ''}
          {`\npresupuesto ${DOT_BUDGET ? DOT_BUDGET.toLocaleString('es') : `${DENSITY}/px²`} · dpr ${devicePixelRatio} · z ${stats?.layoutZoom.toFixed(1)}`}
        </pre>
      )}
    </section>
  );
}

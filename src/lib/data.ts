// Static data release (scripts/05_publish.R): a small pointer file names the
// content-hashed folder; everything else is fetched from there and cached.

import type { SearchIndex } from './search.ts';

const BASE = import.meta.env.BASE_URL;

type Text = { es: string; en: string };

export type DayKey = {
  kind: 'typical' | 'special';
  label: Text;
  note?: Text;
  n?: number;
  date?: string;
  compare?: string;
  totals: {
    trips: number;
    within_zone_share: number;
    inter_area_share: number;
    national_shipped_share_of_inter_area: number;
    hourly: number[];
  };
};

export type Manifest = {
  release: string;
  generated: string;
  source: { attribution: string; licence: string; url: string };
  keys: Record<string, DayKey>;
};

export type Zones = {
  zones: { id: string[]; name: string[]; lon: number[]; lat: number[]; prov: string[]; area: number[]; pop: number[] };
  areas: { id: string[]; name: string[]; lon: number[]; lat: number[] };
};

/** Área-level flows for one day key; node and arc indices refer to `nodes`. */
export type National = {
  nodes: { area: number[]; halo: number[][] };
  arcs: { o: number[]; d: number[]; h: number[][] };
  share: { all: number; inter_area: number; near: number; shipped: number };
};

/** Municipal flows touching one province; indices refer to zones. */
export type Regional = {
  prov: string;
  halo: { zone: number[]; h: number[][] };
  arcs: { o: number[]; d: number[]; h: number[][] };
};

type Hours = number[];

/** Typical day: partners drawn with dots (z, h) and as lines (sz, sday); rest = everyone else. */
export type PlaceWayFull = { z: number[]; h: Hours[]; sz: number[]; sday: number[]; rest: number };
/** Special day: top partners with daily totals only. */
export type PlaceWaySummary = { z: number[]; day: number[]; rest: number };

export type PlaceDay = {
  hours: { out: Hours; in: Hours; within: Hours };
  out: PlaceWayFull | PlaceWaySummary;
  in: PlaceWayFull | PlaceWaySummary;
  bands?: { dentro: number[]; fuera: number[] };
  purpose?: { out: number[]; in: number[] };
};

export type Place = { id: string; keys: Record<string, PlaceDay> };

/** La carrera: per day key, every place that reaches an hour's top `top`, with 24-hour arrivals. */
export type Race = { top: number; min_pop: number; keys: Record<string, { zone: number[]; h: number[][] }> };

export const isFull = (w: PlaceWayFull | PlaceWaySummary): w is PlaceWayFull => 'h' in w;

let root: Promise<string> | null = null;
const cache = new Map<string, Promise<unknown>>();

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} · ${url}`);
  return r.json() as Promise<T>;
}

function releaseRoot() {
  root ??= getJSON<{ release: string }>(`${BASE}data/release.json`).then((r) => `${BASE}data/${r.release}/`);
  return root;
}

export function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = releaseRoot().then((r) => getJSON<T>(r + path));
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const loadManifest = () => load<Manifest>('manifest.json');
export const loadZones = () => load<Zones>('zones.json');
export const loadNational = (key: string) => load<National>(`national/${key}.json`);
export const loadRegional = (prov: string, key: string) => load<Regional>(`regional/${prov}-${key}.json`);
export const loadPlace = (id: string) => load<Place>(`places/${id}.json`);
export const loadSearch = () => load<SearchIndex>('search.json');
export const loadRace = () => load<Race>('race.json');

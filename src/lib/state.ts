// Shared view state (place, direction, day) for the map and the sections below
// it, kept in the URL with Spanish parameter names (family pattern: lugar,
// sentido, dia). replaceState only: changing the view never floods history.

import { useSyncExternalStore } from 'react';
import { loadManifest, loadPlace, loadZones, type Manifest, type Place, type Zones } from './data.ts';

export type Way = 'salen' | 'llegan';

export type ViewState = {
  place: number | null; // zone index
  way: Way;
  day: string;
};

export type DataState = {
  manifest: Manifest | null;
  zones: Zones | null;
  /** File of the selected place, or Madrid's when none is selected (Tu lugar's default). */
  placeData: Place | null;
  error: string | null;
};

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };

const params = new URLSearchParams(location.search);
let view: ViewState = {
  place: null,
  way: params.get('sentido') === 'llegan' ? 'llegan' : 'salen',
  day: params.get('dia') ?? 'laborable',
};
let data: DataState = { manifest: null, zones: null, placeData: null, error: null };

export const DEFAULT_PLACE_ID = '28079'; // Madrid

function writeUrl() {
  const u = new URLSearchParams(location.search);
  const set = (k: string, v: string | null) => (v ? u.set(k, v) : u.delete(k));
  set('lugar', view.place === null || !data.zones ? null : data.zones.zones.id[view.place]);
  set('sentido', view.place === null || view.way === 'salen' ? null : view.way);
  set('dia', view.day === 'laborable' ? null : view.day);
  const qs = u.toString().replace(/=(&|$)/g, '$1'); // flags such as ?perf stay bare
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

let placeRequest = 0;
function refreshPlace() {
  const z = data.zones;
  if (!z) return;
  const id = view.place === null ? DEFAULT_PLACE_ID : z.zones.id[view.place];
  if (data.placeData?.id === id) return;
  const req = ++placeRequest;
  loadPlace(id)
    .then((p) => { if (req === placeRequest) { data = { ...data, placeData: p }; emit(); } })
    .catch((e) => { data = { ...data, error: String(e) }; emit(); });
}

export function setView(patch: Partial<ViewState>) {
  view = { ...view, ...patch };
  writeUrl();
  refreshPlace();
  emit();
}

export function loadData() {
  data = { ...data, error: null };
  emit();
  Promise.all([loadManifest(), loadZones()])
    .then(([manifest, zones]) => {
      const lugar = zones.zones.id.indexOf(params.get('lugar') ?? '');
      if (lugar >= 0) view = { ...view, place: lugar };
      if (!manifest.keys[view.day]) view = { ...view, day: 'laborable' };
      data = { ...data, manifest, zones };
      refreshPlace();
      emit();
    })
    .catch((e) => { data = { ...data, error: String(e) }; emit(); });
}

export const useView = () => useSyncExternalStore(subscribe, () => view);
export const useData = () => useSyncExternalStore(subscribe, () => data);
export const getView = () => view;

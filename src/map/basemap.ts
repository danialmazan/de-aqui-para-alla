// Our own static basemap: official MITMA zoning tiled into one PMTiles file.
// No roads and no external tile servers (roads would suggest routes; plan §6).

import type { StyleSpecification } from 'maplibre-gl';

export const NIGHT = {
  page: '#070E15',
  land: '#102030',
  neighbour: '#0B1722',
  zoneEdge: '#1E3448',
  province: '#2A4560',
  inset: '#3A5670',
};

export function basemapStyle(tilesUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: 'vector', url: `pmtiles://${tilesUrl}`, attribution: 'Zonificación: MITMA' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': NIGHT.page } },
      { id: 'neighbours', type: 'fill', source: 'base', 'source-layer': 'countries', paint: { 'fill-color': NIGHT.neighbour } },
      {
        id: 'zones-fill', type: 'fill', source: 'base', 'source-layer': 'zones',
        filter: ['in', ['get', 'kind'], ['literal', ['municipio', 'agrupacion']]],
        paint: { 'fill-color': NIGHT.land },
      },
      {
        id: 'zones-edge', type: 'line', source: 'base', 'source-layer': 'zones',
        filter: ['in', ['get', 'kind'], ['literal', ['municipio', 'agrupacion']]],
        paint: {
          'line-color': NIGHT.zoneEdge,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.15, 7, 0.5, 10, 0.9],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 7, 0.9],
        },
      },
      {
        id: 'provinces', type: 'line', source: 'base', 'source-layer': 'provinces',
        paint: { 'line-color': NIGHT.province, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 9, 1.4] },
      },
      {
        id: 'zone-selected', type: 'line', source: 'base', 'source-layer': 'zones',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#FFD98A', 'line-width': 1.6, 'line-opacity': 0.9 },
      },
      {
        id: 'inset', type: 'line', source: 'base', 'source-layer': 'inset',
        paint: { 'line-color': NIGHT.inset, 'line-width': 1, 'line-dasharray': [3, 3] },
      },
    ],
  };
}

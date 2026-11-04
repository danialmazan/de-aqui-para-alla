# Stage 1 — feasibility spikes and design specimen

Date: 3 Nov 2026.

Everything runs locally: no remote, nothing pushed or deployed. Raw OD files were streamed and never stored.

## What exists now

| Piece | Files | How to run |
|---|---|---|
| Source fetch with provenance lock | `scripts/00_sources.R` → `data/raw/`, `data/sources.lock.json` (73 files, 49 MB, SHA-256 + Last-Modified) | `Rscript scripts/00_sources.R` |
| Streaming helpers | `scripts/lib_stream.R` (DuckDB `read_csv` over HTTPS) | — |
| Data spike | `scripts/spike_stream_day.R` → `reports/spike-data.json`, `public/spike/areas-weekday.json` | `npm run data:spike` |
| Basemap | `scripts/04_geo.R` → `public/tiles/base.pmtiles` (5.7 MB, z3–10) | `Rscript --vanilla scripts/04_geo.R` |
| Flow engine | `src/map/FlowLayer.ts` (MapLibre custom WebGL2 layer), `src/map/flowMath.ts` (tested) | `npm run dev` → `/de-aqui-para-alla/?perf` |
| Design specimen | `specimen.html`, `src/components/{Wordmark,Mark,Controls}.tsx`, `src/styles/tokens.css` | `/de-aqui-para-alla/specimen.html` |
| Benchmarks | `tools/bench-engine.mjs` → `reports/performance-engine-spike.json`; `tools/capture-stage1.mjs` → `docs/stage1/*.png` | dev server on :5191 first |

## Data spike: 16 Oct 2024 (Wed) and 19 Oct 2024 (Sat), municipal level

| Measure | Weekday | Weekend |
|---|---|---|
| Raw rows streamed | 14.05 M | 13.62 M |
| Stream and aggregate time | **16.9 s** | 17.2 s |
| Estimated trips | 148.3 M | 129.0 M |
| Trips within the same zone | **58.4 %** | 57.2 % |
| `externo` (rest of world) | 0.02 % | 0.02 % |
| OD pairs | 357 k | 375 k |
| Interzonal pairs ≥ 5 / ≥ 100 / ≥ 1,000 trips/day | 198 k / 41 k / 10 k | 225 k / 42 k / 9 k |
| Partners per origin (≥ 5 trips/day): median / p90 / p99 / max | 58 / 132 / 328 / 1,644 | 65 / 151 / 371 / 1,677 |
| Trips between áreas (GAU) | 31.0 M (21 %) | 29.7 M |
| …of which ≥ 25 km apart | **10.6 M (7 % of all trips)** | 11.3 M |
| Top 600 área arcs: share of all trips between áreas | 28 % | 27 % |
| Interim parquet per day | 39 MB | 39 MB |

Peak memory was 1.6 GB.

**Checks:**
- Municipality → GAU mapping: 0 conflicts. Áreas can be derived additively from municipal flows.
- Plausibility against the official totals: October 2024 averaged 141.2 M trips/day; Wednesday is above that and Saturday below. The exact month-level reconciliation runs in Stage 2.

**Implications:**
- **Full run.** 360 days × 17 s ≈ 1.7 h sequentially, or under 1 h with 2–3 days in parallel.
  - Interim data must be rolled up monthly and the daily files deleted: 360 × 39 MB would be 14 GB, which equals all the free disk.
- **Honesty point for the copy.** Most trips are short and stay inside their zone.
  - The national arcs (between áreas ≥ 25 km apart) represent about 7 % of trips.
  - The map must say so ("los arcos muestran los viajes entre áreas; la mayoría de viajes son cortos y se quedan dentro"), and halos carry the within-zone majority.
- **Coverage of the national view.** Even 600 arcs cover only about 28 % of trips between áreas. The legend should state the share shown, for example "las 600 conexiones más grandes, que suman el 28 % de estos viajes".

## Engine spike

Measurement setup:
- Headless Chromium on the Apple M1 (ANGLE Metal).
- 6 s per run, frame times measured with `requestAnimationFrame`.
- Real área data from the spike day.

| Viewport | CPU | Budget | Arcs | Dots | U | fps | p95 |
|---|---|---|---|---|---|---|---|
| desktop 1440×900 @2× | 1× | 12 k | 363 | 11.1 k | 100 | 60 | 16.8 ms |
| desktop | 4× | 30 k | 363 | 22.0 k | 50 | 60 | 16.7 ms |
| desktop | 4× | 80 k (no 25 km rule) | 1,500 | 36.8 k | 50 | 60 | 16.7 ms |
| mobile 390×844 @3× | 1× | 30 k | 363 | 22.5 k | 20 | 60 | 16.7 ms |
| mobile | 4× | 80 k (no 25 km rule) | 1,500 | **74.5 k** | 10 | 60 | 16.8 ms |

Bench note: these runs used 12 px dot spacing. It is now 24 px, so the same budgets give fewer dots.

**WebKit (Safari engine), 390×844 @3×:** renders correctly, no GL errors, 22.5 k dots.

**Limits of these numbers:**
- The GPU is always the M1, and frames are capped at 60 fps, so headroom is hidden.
- **Real-phone numbers are still missing.**
- The iOS Simulator needs a full Xcode install, which this Mac doesn't have. Install Xcode, then run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
- Fastest real-device check: run `npm run dev:lan`, then open `http://<this-Mac's-IP>:5173/de-aqui-para-alla/?perf` on your phone.

## Basemap spike

- Official municipal zoning, reprojected, with provinces dissolved and France/Portugal outlines.
- The Canary Islands are shifted by (+5.0°, +6.6°) into a dashed inset between Portugal and Morocco.
- 5.7 MB of PMTiles, read with HTTP range requests (`206`). No external tiles and no roads.

GDAL notes:
- GDAL 3.8's `COORDINATE_PRECISION` write option silently wraps geometries in GeometryCollections, so it is not used.
- Repair uses `valid_structure` with collapsed parts dropped.

## Findings that change or refine the plan

1. **MapLibre is 6.16, not 5.**
   - The worker must be wired with `?worker&url` plus `setWorkerUrl` (same as `tu_rincon`).
   - There is no default export.
2. **The R `duckdb` package must be installed as a macOS binary.** The CRAN source build fails to link.
3. **Dot spacing widened from 12 to 24 px** and dots shrunk to 2.6 px radius. At 12 px, flows above about 2U merged into solid lines.
4. **Additive blending was replaced** with premultiplied "over" blending. Dense corridors had blown out to white.
5. **Mobile needs its own tier** (Stage 2): portrait framing that uses the full height, smaller dots, and the perf overlay kept off the title.

## Decisions I need from you

**A. Saturation of the linear encoding.** Even at 24 px spacing, dots touch at about 4U, so the eye cannot tell 4U from 16U (see the specimen legend). Proposal:
- Above about 4U, a connection's dots spread sideways into a **ribbon** whose width grows with v.
- Dots per area stay constant, so the **total dot count stays exactly proportional to trips**.
- Big corridors read as wider streams instead of identical solid lines.
- Alternative: accept the saturation and let colour and brightness alone carry it.

**B. What "pause" stops.**
- My default: pause freezes the **clock** (the hour and its values), while dots keep flowing at that hour so the map stays alive. Reduced motion freezes everything.
- Alternative: pause also freezes the dots.

**C. A real-phone run** before Stage 2's engine tuning, if you can open the LAN URL.

## Next (Stage 2, after your go-ahead)

- Full 360-day stream in the background, with monthly rollups and reconciliation against the official monthly totals.
- `03_rollup.R`, `05_publish.R` and `07_validate.R`.
- The real hero map: national, regional and place levels; search; Salen/Llegan; day type; periods; halos; legend with the share shown; mobile framing.

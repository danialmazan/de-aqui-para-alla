# De aquí para allá

Cómo nos movemos por España, hora a hora. / How Spain moves, hour by hour.

An interactive, mobile-first map of estimated trips between places in Spain, built
from the Ministry of Transport's open mobility data (anonymised mobile-phone
records, «Basado en datos abiertos MITMA»). It shows typical days (normal
weekday, Saturday, Sunday, summer) averaged over clean days of Jul 2024 – Feb 2025,
plus four special days. See `docs/DECISIONS.md`.

Status: **Stage 3 (MVP: living map, Tu lugar, methods; Spanish and English)**.
Local development only; nothing is published.

## Run

    npm install
    npm run dev            # http://127.0.0.1:5173/de-aqui-para-alla/  (English: /de-aqui-para-alla/en/)
                           # ?perf shows frame times; ?lugar=28065&sentido=llegan&dia=sabado opens a view
    npm run check          # tsc + vitest
    npm run test:e2e       # Playwright + axe, desktop and phone (starts the dev server on :5191 if needed)

## Data

R 4.5 with `renv` (`renv::restore()`), DuckDB streaming straight from
https://movilidad-opendata.mitma.es — raw daily OD files are never stored.

    npm run data:sources    # small official inputs + data/sources.lock.json
    npm run data:calendar   # typical and special days -> data/calendar.json
    npm run data:stream     # stream those days into data/interim/days/ (resumable; shard with: Rscript scripts/02_stream_days.R <i> <n>)
    Rscript --vanilla scripts/04_geo.R   # basemap PMTiles (needs tippecanoe)
    npm run data:rollup     # exact per-key sums in data/rollup/; the daily folders can then be deleted
    npm run data:publish    # public/data/<release>/ (content-hashed, reproducible)
    npm run data:validate   # reports/VALIDATION.md; fails on any check

Licence: Licencia de datos abiertos del MITMA — attribution «Basado en datos
abiertos MITMA»; no endorsement implied.

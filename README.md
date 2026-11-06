# De aquí para allá

Cómo nos movemos por España, hora a hora. / How Spain moves, hour by hour.

An interactive, mobile-first map of estimated trips between places in Spain, built
from the Ministry of Transport's open mobility data (anonymised mobile-phone
records, «Basado en datos abiertos MITMA»). It shows typical days (normal
weekday, Saturday, Sunday, summer) averaged over clean days of Jul 2024 – Feb 2025,
plus four special days. See `docs/DECISIONS.md`.

Live at https://danielalmazan.com/de-aqui-para-alla/ (English: `/en/`).

## Publish

Pushing to `main` runs `.github/workflows/pages.yml`: type-check, unit tests,
build, then deploy to GitHub Pages. The committed data release in
`public/data/` is what ships; rebuild it with `npm run data:publish` (needs the
local rollup) and commit the new `public/data/<release>/` folder.

Sharing previews: `/` and `/en/` each carry their own title, description and
1200×630 image (`public/social-es-v1.jpg`, `public/social-en-v1.jpg`, made by
`node tools/make-social.mjs` against the dev server). Bump the `-v1` suffix
when the image changes, so WhatsApp and others fetch the new one.

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

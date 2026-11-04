# Stage 1 data spike: stream one weekday and one weekend day, then measure the
# numbers the plan's sizing depends on. Writes reports/spike-data.json and a
# small sample of área-level arcs for the engine spike.

suppressPackageStartupMessages({
  library(jsonlite)
  library(sf)
})
source("scripts/lib_stream.R")

DAYS <- c(weekday = "2024-10-16", weekend = "2024-10-19")
OUT <- "data/interim/spike"
RAW <- "data/raw/zonificacion"

con <- open_duck()
timings <- do.call(rbind, lapply(DAYS, function(d) {
  message("streaming ", d)
  stream_day(con, d, OUT)
}))
print(timings)

q <- function(sql) dbGetQuery(con, sql)
pq <- function(day, name) sprintf("'%s/day=%s/%s.parquet'", OUT, gsub("-", "", day), name)
file_mb <- function(day, name) file.size(sprintf("%s/day=%s/%s.parquet", OUT, gsub("-", "", day), name)) / 1e6

# --- Relation table: is municipio_mitma -> gau_mitma a function? -------------
rel <- read.csv(file.path(RAW, "relacion_ine_zonificacionMitma.csv"), sep = "|", colClasses = "character")
muni_gau <- unique(rel[, c("municipio_mitma", "gau_mitma")])
gau_conflicts <- sum(duplicated(muni_gau$municipio_mitma))
dbWriteTable(con, "muni_gau", muni_gau, overwrite = TRUE)

# --- Centroids (official), reprojected to WGS84 ---------------------------------
read_centroids <- function(path) {
  x <- st_transform(st_read(path, quiet = TRUE), 4326)
  xy <- st_coordinates(x)
  data.frame(id = x$ID, lon = round(xy[, 1], 5), lat = round(xy[, 2], 5))
}
muni_c <- read_centroids(file.path(RAW, "zonificacion_municipios/zonificacion_municipios_centroides.shp"))
gau_c <- read_centroids(file.path(RAW, "zonificacion_GAU/zonificacion_gaus_centroides.shp"))
gau_names <- read.csv(file.path(RAW, "zonificacion_GAU/nombres_gaus.csv"), sep = "|", colClasses = "character")
dbWriteTable(con, "gau_c", gau_c, overwrite = TRUE)

measure <- function(day) {
  od <- pq(day, "od_hour")
  base <- q(sprintf("
    SELECT count(*) AS rows_od_hour,
           count(DISTINCT o || '>' || d) AS pairs,
           sum(trips) AS trips,
           sum(trips) FILTER (WHERE o = d) AS intra_trips,
           sum(trips) FILTER (WHERE o = 'externo' OR d = 'externo') AS externo_trips
    FROM read_parquet(%s)", od))
  bp_rows <- q(sprintf("SELECT count(*) AS n FROM read_parquet(%s)", pq(day, "od_band_purpose")))$n

  pair_daily <- sprintf("(SELECT o, d, sum(trips) AS t FROM read_parquet(%s) WHERE o <> d GROUP BY ALL)", od)
  pairs_thr <- q(sprintf("
    SELECT count(*) FILTER (WHERE t >= 5) AS ge5,
           count(*) FILTER (WHERE t >= 100) AS ge100,
           count(*) FILTER (WHERE t >= 1000) AS ge1000
    FROM %s", pair_daily))
  partners <- q(sprintf("
    SELECT quantile_cont(n, [0.5, 0.9, 0.99]) AS q, max(n) AS mx
    FROM (SELECT o, count(*) AS n FROM %s WHERE t >= 5 GROUP BY o)", pair_daily))

  # Área (GAU) level: aggregate, drop intra-area, distance >= 25 km.
  area <- q(sprintf("
    WITH a AS (
      SELECT go.gau_mitma AS o, gd.gau_mitma AS d, h, sum(trips) AS trips
      FROM read_parquet(%s) x
      JOIN muni_gau go ON go.municipio_mitma = x.o
      JOIN muni_gau gd ON gd.municipio_mitma = x.d
      GROUP BY ALL),
    pairs AS (
      SELECT a.o, a.d, sum(trips) AS t,
             6371 * 2 * asin(sqrt(pow(sin(radians(cd.lat - co.lat) / 2), 2) +
               cos(radians(co.lat)) * cos(radians(cd.lat)) * pow(sin(radians(cd.lon - co.lon) / 2), 2))) AS km
      FROM a JOIN gau_c co ON co.id = a.o JOIN gau_c cd ON cd.id = a.d
      WHERE a.o <> a.d GROUP BY a.o, a.d, co.lat, co.lon, cd.lat, cd.lon)
    SELECT count(*) AS area_pairs,
           count(*) FILTER (WHERE km >= 25) AS area_pairs_25km,
           sum(t) AS inter_area_trips,
           sum(t) FILTER (WHERE km >= 25) AS trips_25km
    FROM pairs", od))
  top600 <- q(sprintf("
    WITH a AS (
      SELECT go.gau_mitma AS o, gd.gau_mitma AS d, sum(trips) AS t
      FROM read_parquet(%s) x
      JOIN muni_gau go ON go.municipio_mitma = x.o
      JOIN muni_gau gd ON gd.municipio_mitma = x.d
      WHERE go.gau_mitma <> gd.gau_mitma GROUP BY ALL)
    SELECT sum(t) AS t600 FROM (SELECT t FROM a ORDER BY t DESC LIMIT 600)", od))
  hourly <- q(sprintf("SELECT h, sum(trips) AS trips FROM read_parquet(%s) GROUP BY h ORDER BY h", od))
  list(
    od_hour_rows = base$rows_od_hour,
    od_band_purpose_rows = bp_rows,
    parquet_mb = list(od_hour = round(file_mb(day, "od_hour"), 1), od_band_purpose = round(file_mb(day, "od_band_purpose"), 1)),
    distinct_pairs = base$pairs,
    total_trips = round(base$trips),
    intrazonal_share = round(base$intra_trips / base$trips, 3),
    externo_share = round(base$externo_trips / base$trips, 4),
    interzonal_pairs = as.list(pairs_thr),
    partners_per_origin_ge5 = list(p50 = partners$q[[1]][1], p90 = partners$q[[1]][2], p99 = partners$q[[1]][3], max = partners$mx),
    area = as.list(area),
    top600_area_share_of_inter_area = round(top600$t600 / area$inter_area_trips, 3),
    hourly_profile = round(hourly$trips)
  )
}

spike <- list(
  generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  days = DAYS,
  timings = timings,
  muni_to_gau_conflicts = gau_conflicts,
  zones = list(municipal_centroids = nrow(muni_c), gau_centroids = nrow(gau_c)),
  weekday = measure(DAYS[["weekday"]]),
  weekend = measure(DAYS[["weekend"]])
)
dir.create("reports", showWarnings = FALSE)
write_json(spike, "reports/spike-data.json", auto_unbox = TRUE, pretty = TRUE, digits = NA)

# --- Sample área arcs (weekday) for the engine spike ---------------------------
arcs <- q(sprintf("
  WITH a AS (
    SELECT go.gau_mitma AS o, gd.gau_mitma AS d, h, sum(trips) AS trips
    FROM read_parquet(%s) x
    JOIN muni_gau go ON go.municipio_mitma = x.o
    JOIN muni_gau gd ON gd.municipio_mitma = x.d
    WHERE go.gau_mitma <> gd.gau_mitma GROUP BY ALL),
  tot AS (SELECT o, d, sum(trips) AS t FROM a GROUP BY ALL ORDER BY t DESC LIMIT 1500)
  SELECT a.o, a.d, a.h, a.trips FROM a JOIN tot USING (o, d)", pq(DAYS[["weekday"]], "od_hour")))
keys <- unique(arcs[, c("o", "d")])
hours <- lapply(seq_len(nrow(keys)), function(i) {
  sel <- arcs[arcs$o == keys$o[i] & arcs$d == keys$d[i], ]
  v <- numeric(24); v[sel$h + 1] <- sel$trips
  round(v)
})
used <- unique(c(keys$o, keys$d))
nodes <- merge(gau_c[gau_c$id %in% used, ], gau_names, by.x = "id", by.y = "ID", all.x = TRUE)
dir.create("public/spike", recursive = TRUE, showWarnings = FALSE)
write_json(list(
  note = "Spike sample: área-level (GAU) interzonal flows, 2024-10-16 (Wednesday), top 1500 pairs.",
  nodes = lapply(seq_len(nrow(nodes)), function(i) list(id = nodes$id[i], name = nodes$name[i], lon = nodes$lon[i], lat = nodes$lat[i])),
  arcs = lapply(seq_len(nrow(keys)), function(i) list(o = keys$o[i], d = keys$d[i], h = hours[[i]]))
), "public/spike/areas-weekday.json", auto_unbox = TRUE, digits = NA)
dbDisconnect(con, shutdown = TRUE)
message("done")

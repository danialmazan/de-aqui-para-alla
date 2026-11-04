# Publish the static data release the site reads (public/data/<release>/).
#
#   manifest.json            day keys (typical + special), labels, days used, totals
#   zones.json               municipal zones + áreas (display coordinates, Canaries shifted)
#   national/<key>.json      área-level arcs with 24-hour vectors, plus per-área halos
#   regional/<prov>-<key>.json  municipal arcs touching a province, plus halos
#   places/<zone>.json       one place, every day key: partners both ways, hourly totals,
#                            distance bands and purpose (typical days); a short summary for special days
#   search.json              every INE municipality name -> its zone
#
# Values are average trips starting in each hour on the typical day (or on the
# special day itself). Which arcs are *drawn* is decided on screen (docs/DECISIONS.md);
# here we only pick which connections ship.

suppressPackageStartupMessages({
  library(jsonlite)
  library(data.table)
  library(sf)
  library(digest)
})
source("scripts/lib_stream.R")

IN <- "data/interim/days"
RAW <- "data/raw/zonificacion"
OUT_ROOT <- "public/data"
NEAR_KM <- 30                         # national: closer áreas fold into the origin's halo
NATIONAL_BANDS <- list(c(30, 80, 350), c(80, 200, 350), c(200, Inf, 300))  # km from, km to, arcs
REGIONAL_TOP <- 800
PLACE_ANIMATED <- 40                  # partners drawn with dots (24-hour values)
PLACE_STATIC <- 300                   # further partners drawn as faint lines (daily totals)
SPECIAL_TOP <- 10                     # special days: top partners each way, daily totals only
PURPOSES <- c("trabajo", "casa", "frecuente", "ocasional")
MIN_DAILY <- 5                        # connections under 5 trips/day are never shipped
H <- sprintf("h%d", 0:23)

cal <- fromJSON(Sys.getenv("CALENDAR", "data/calendar.json"), simplifyVector = FALSE)
geo <- fromJSON("data/geo/display.json")
shift <- geo$canary_shift

# --- Zones and áreas -------------------------------------------------------------
cent <- as.data.table(geo$centroids)
setnames(cent, c("lon", "lat"), c("x", "y"))
names_m <- as.data.table(read.csv(file.path(RAW, "zonificacion_municipios/nombres_municipios.csv"), sep = "|",
                                  colClasses = "character", encoding = "UTF-8"))[, .(ID, name)]
pop <- fread(file.path(RAW, "zonificacion_municipios/poblacion_municipios.csv"), sep = "|",
             header = FALSE, col.names = c("ID", "pop"), colClasses = c("character", "numeric"))
rel <- unique(fread(file.path(RAW, "relacion_ine_zonificacionMitma.csv"), sep = "|",
                    colClasses = "character")[, .(ID = municipio_mitma, area = gau_mitma)])
stopifnot(!anyDuplicated(rel$ID))

# "Rozas de Madrid, Las" -> "Las Rozas de Madrid"; "Hospitalet de Llobregat, L'" -> "L'Hospitalet…".
pretty_name <- function(x) {
  x <- sub(" agregacion de municipios$", " (agrupación)", x)
  x <- sub("^(.*), (L')$", "\\2\\1", x)
  sub("^(.*), (La|Las|El|Los|Lo|A|O|As|Os|Es|Sa|Ses|Les|Els|Al)( \\(agrupación\\))?$", "\\2 \\1\\3", x)
}
zones <- merge(cent, names_m, by.x = "id", by.y = "ID", all.x = TRUE)
zones <- merge(zones, pop, by.x = "id", by.y = "ID", all.x = TRUE)
zones <- merge(zones, rel, by.x = "id", by.y = "ID", all.x = TRUE)
zones[, foreign := !grepl("^[0-9]", id)]
zones[, prov := substr(id, 1, 2)]                    # INE province, or FR/PT
zones[is.na(area), area := id]                       # France/Portugal: identity
zones[, name := pretty_name(fifelse(is.na(name), id, name))]
setorder(zones, id)
zones[, idx := .I - 1L]

read_pts <- function(path) {
  x <- st_transform(st_read(path, quiet = TRUE), 4326)
  xy <- st_coordinates(x)
  data.table(id = x$ID, lon = xy[, 1], lat = xy[, 2])
}
gau <- read_pts(file.path(RAW, "zonificacion_GAU/zonificacion_gaus_centroides.shp"))
gau_names <- fread(file.path(RAW, "zonificacion_GAU/nombres_gaus.csv"), sep = "|", colClasses = "character")
areas <- data.table(id = sort(unique(zones$area)))
areas <- merge(areas, gau, by = "id", all.x = TRUE)
areas <- merge(areas, gau_names[, .(id = ID, name)], by = "id", all.x = TRUE)
# Áreas without a GAU centroid (France/Portugal) use the zone centroid.
miss <- is.na(areas$lon)
areas[miss, c("lon", "lat") := zones[match(areas$id[miss], zones$id), .(x, y)]]
nm <- is.na(areas$name)
areas[nm, name := zones$name[match(areas$id[nm], zones$id)]]
areas[, name := pretty_name(name)]
canary <- areas$lat < 30 & areas$lon < -12
areas[, `:=`(x = lon, y = lat)]
areas[canary, `:=`(x = lon + shift[1], y = lat + shift[2])]
setorder(areas, id)
areas[, idx := .I - 1L]
zones[, area_idx := areas$idx[match(area, areas$id)]]

# --- DuckDB ------------------------------------------------------------------------
con <- open_duck(threads = 6, memory = "8GB")
q <- function(sql) as.data.table(dbGetQuery(con, sql))
dbWriteTable(con, "zones", zones[, .(id, prov, area)], overwrite = TRUE)
dbWriteTable(con, "areas", areas[, .(id, lon, lat)], overwrite = TRUE)

hours_sql <- paste(sprintf("sum(t) FILTER (WHERE h = %d) AS h%d", 0:23, 0:23), collapse = ", ")
hav_sql <- "2 * 6371 * asin(sqrt(pow(sin(radians(b.lat - a.lat) / 2), 2) +
  cos(radians(a.lat)) * cos(radians(b.lat)) * pow(sin(radians(b.lon - a.lon) / 2), 2)))"

# Average over the key's days (sum / number of days). Exact decimal sums keep the
# release byte-identical between runs, whatever order DuckDB's threads add in.
load_key <- function(days) {
  files <- sprintf("'%s/day=%s/od_hour.parquet'", IN, gsub("-", "", days))
  stopifnot(all(file.exists(gsub("'", "", files))))
  dbExecute(con, sprintf("CREATE OR REPLACE TABLE od AS
    SELECT o, d, h, CAST(sum(CAST(trips AS DECIMAL(18, 3))) / %d AS DECIMAL(18, 4)) AS t
    FROM read_parquet([%s]) GROUP BY ALL",
    length(days), paste(files, collapse = ",")))
}

# Hourly values: one decimal below 10 trips, whole trips above (keeps files small).
# Daily distance band × destination activity, averaged over the key's days.
load_band_purpose <- function(days) {
  files <- sprintf("'%s/day=%s/od_band_purpose.parquet'", IN, gsub("-", "", days))
  dbExecute(con, sprintf("CREATE OR REPLACE TABLE bp AS
    SELECT o, d, band, purpose, CAST(sum(CAST(trips AS DECIMAL(18, 3))) / %d AS DECIMAL(18, 4)) AS t
    FROM read_parquet([%s]) GROUP BY ALL",
    length(days), paste(files, collapse = ",")))
}

hmat <- function(dt) {
  m <- as.matrix(dt[, ..H])
  ifelse(m < 10, round(m, 1), round(m))
}
fill0 <- function(dt) { for (h in H) set(dt, which(is.na(dt[[h]])), h, 0); dt }

write_obj <- function(x, path) {
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  writeLines(toJSON(x, auto_unbox = TRUE, digits = NA, na = "null"), path)
}

publish_key <- function(key, out) {
  totals <- q("SELECT sum(t) AS all_trips,
                      sum(t) FILTER (WHERE o = d) AS within_zone,
                      sum(t) FILTER (WHERE o = 'externo' OR d = 'externo') AS externo FROM od")

  # --- National: área pairs ---------------------------------------------------------
  dbExecute(con, "CREATE OR REPLACE TABLE od_area AS
    SELECT za.area AS o, zb.area AS d, h, sum(t) AS t
    FROM od JOIN zones za ON za.id = od.o JOIN zones zb ON zb.id = od.d GROUP BY ALL")
  nat <- fill0(q(sprintf("
    WITH p AS (SELECT o, d, %s, sum(t) AS day FROM od_area GROUP BY o, d)
    SELECT p.*, CASE WHEN p.o = p.d THEN 0 ELSE %s END AS km
    FROM p JOIN areas a ON a.id = p.o JOIN areas b ON b.id = p.d", hours_sql, hav_sql)))
  setorder(nat, o, d)  # fixed summation order for the halos below

  within <- nat[o == d]
  inter <- nat[o != d]
  near <- inter[km < NEAR_KM]
  cand <- inter[km >= NEAR_KM & day >= MIN_DAILY]
  pick <- rbindlist(lapply(NATIONAL_BANDS, function(b) {
    head(cand[km >= b[1] & km < b[2]][order(-day, o, d)], b[3])
  }))

  # Halo per área: trips inside the área plus trips to áreas closer than NEAR_KM (by origin).
  halo_src <- rbind(within, near)[, lapply(.SD, sum), by = o, .SDcols = H]
  used <- sort(unique(c(pick$o, pick$d, halo_src$o)))
  nodes <- areas[match(used, id)]
  halo <- halo_src[match(used, o)]
  halo[is.na(o), (H) := 0]
  write_obj(list(
    key = key, level = "area",
    nodes = list(area = I(nodes$idx), halo = hmat(halo)),
    arcs = list(o = I(match(pick$o, used) - 1L), d = I(match(pick$d, used) - 1L), h = hmat(pick)),
    share = list(
      all = round(totals$all_trips),
      inter_area = round(sum(inter$day)),
      near = round(sum(near$day)),
      shipped = round(sum(pick$day)))
  ), file.path(out, "national", paste0(key, ".json")))

  # --- Regional: municipal arcs touching each province --------------------------------
  dbExecute(con, sprintf("CREATE OR REPLACE TABLE pairs AS
    SELECT od.o, od.d, za.prov AS po, zb.prov AS pd, %s, sum(t) AS day
    FROM od JOIN zones za ON za.id = od.o JOIN zones zb ON zb.id = od.d
    GROUP BY od.o, od.d, za.prov, zb.prov", hours_sql))
  reg <- fill0(q(sprintf("
    WITH touch AS (
      SELECT *, po AS p FROM pairs WHERE o <> d
      UNION ALL SELECT *, pd AS p FROM pairs WHERE o <> d AND pd <> po),
    ranked AS (SELECT *, row_number() OVER (PARTITION BY p ORDER BY day DESC, o, d) AS r
               FROM touch WHERE day >= %d)
    SELECT * FROM ranked WHERE r <= %d", MIN_DAILY, REGIONAL_TOP)))
  self <- fill0(q("SELECT * FROM pairs WHERE o = d"))
  provs <- sort(unique(zones[foreign == FALSE, prov]))
  for (pv in provs) {
    a <- reg[p == pv][order(-day, o, d)]
    w <- self[po == pv][order(o)]
    write_obj(list(
      key = key, level = "zone", prov = pv,
      halo = list(zone = I(zones$idx[match(w$o, zones$id)]), h = hmat(w)),
      arcs = list(o = I(zones$idx[match(a$o, zones$id)]), d = I(zones$idx[match(a$d, zones$id)]), h = hmat(a))
    ), file.path(out, "regional", sprintf("%s-%s.json", pv, key)))
  }

  # --- Places: partners both ways --------------------------------------------------------
  special <- key %in% names(cal$special)
  ranked <- fill0(q(sprintf("
    WITH dir AS (
      SELECT o AS place, d AS partner, 'out' AS way, %s, day FROM pairs WHERE o <> d
      UNION ALL SELECT d, o, 'in', %s, day FROM pairs WHERE o <> d)
    SELECT *, row_number() OVER (PARTITION BY place, way ORDER BY day DESC, partner) AS r
    FROM dir WHERE day >= %d QUALIFY r <= %d",
    paste(H, collapse = ", "), paste(H, collapse = ", "), MIN_DAILY,
    if (special) SPECIAL_TOP else PLACE_ANIMATED + PLACE_STATIC)))
  ranked <- ranked[place %in% zones[foreign == FALSE, id]]
  ranked[, partner := zones$idx[match(partner, zones$id)]]
  hourly <- fill0(q(sprintf("
    SELECT z AS place, kind, %s FROM (
      SELECT o AS z, CASE WHEN o = d THEN 'within' ELSE 'out' END AS kind, h, t FROM od
      UNION ALL SELECT d, 'in', h, t FROM od WHERE o <> d)
    GROUP BY z, kind", hours_sql)))
  extra <- list()
  if (!special) {
    bands <- q("SELECT o AS place, band, sum(t) FILTER (WHERE o = d) AS dentro,
                       sum(t) FILTER (WHERE o <> d) AS fuera FROM bp GROUP BY o, band")
    purpose <- q("SELECT o AS place, 'out' AS way, purpose, sum(t) AS t FROM bp WHERE o <> d GROUP BY ALL
                  UNION ALL SELECT d, 'in', purpose, sum(t) FROM bp WHERE o <> d GROUP BY ALL")
    extra <- list(bands = bands, purpose = purpose)
  }
  place_parts[[key]] <<- list(special = special, ranked = ranked, hourly = hourly, extra = extra)

  list(
    trips = round(totals$all_trips),
    within_zone_share = round(totals$within_zone / totals$all_trips, 4),
    externo_share = round(totals$externo / totals$all_trips, 4),
    inter_area_share = round(sum(inter$day) / totals$all_trips, 4),
    national_shipped_share_of_inter_area = round(sum(pick$day) / sum(inter$day), 4),
    hourly = round(q("SELECT h, sum(t) AS t FROM od GROUP BY h ORDER BY h")$t)
  )
}

# --- Run every key into a staging folder, then content-hash it ----------------------
stage <- file.path(OUT_ROOT, "_staging")
unlink(stage, recursive = TRUE)
dir.create(stage, recursive = TRUE)

keys <- list()
place_parts <- list()
for (k in names(cal$typical)) {
  t <- cal$typical[[k]]
  message("typical ", k, " (", t$n, " days)")
  load_key(unlist(t$days))
  load_band_purpose(unlist(t$days))
  keys[[k]] <- list(kind = "typical", label = t$label, note = t$note, days = unlist(t$days), n = t$n,
                    totals = publish_key(k, stage))
}
for (k in names(cal$special)) {
  s <- cal$special[[k]]
  message("special ", k, " (", s$date, ")")
  load_key(s$date)
  keys[[k]] <- list(kind = "special", label = s$label, date = s$date, compare = s$compare,
                    totals = publish_key(k, stage))
}

write_obj(list(
  zones = list(id = zones$id, name = zones$name, lon = round(zones$x, 4), lat = round(zones$y, 4),
               prov = zones$prov, area = zones$area_idx, pop = round(zones$pop)),
  areas = list(id = areas$id, name = areas$name, lon = round(areas$x, 4), lat = round(areas$y, 4))
), file.path(stage, "zones.json"))

# --- One file per place, holding every day key -----------------------------------------
message("places")
r0 <- function(x) ifelse(x < 10, round(x, 1), round(x))
vec <- function(dt, k) {
  x <- if (nrow(dt)) dt[kind == k] else dt
  if (nrow(x)) I(hmat(x)[1, ]) else I(rep(0, 24))
}
split_by <- function(dt) if (nrow(dt)) split(dt, by = "place", keep.by = FALSE) else list()
parts <- lapply(place_parts, function(pp) list(
  special = pp$special,
  ranked = split_by(pp$ranked), hourly = split_by(pp$hourly),
  bands = if (length(pp$extra)) split_by(pp$extra$bands) else NULL,
  purpose = if (length(pp$extra)) split_by(pp$extra$purpose) else NULL))
way_obj <- function(rk, dirn, special, total) {
  x <- rk[way == dirn][order(r)]
  if (special) return(list(z = I(x$partner), day = I(r0(x$day)), rest = r0(total - sum(x$day))))
  a <- x[r <= PLACE_ANIMATED]
  b <- x[r > PLACE_ANIMATED]
  list(z = I(a$partner), h = if (nrow(a)) hmat(a) else I(list()),
       sz = I(b$partner), sday = I(r0(b$day)),
       rest = r0(total - sum(x$day)))
}
for (pid in zones[foreign == FALSE, id]) {
  out <- list()
  for (k in names(parts)) {
    pp <- parts[[k]]
    hr <- pp$hourly[[pid]] %||% data.table()
    h <- list(out = vec(hr, "out"), `in` = vec(hr, "in"), within = vec(hr, "within"))
    rk <- pp$ranked[[pid]] %||% data.table(way = character(), r = integer(), partner = integer(), day = numeric())
    o <- list(
      hours = h,
      out = way_obj(rk, "out", pp$special, sum(h$out)),
      `in` = way_obj(rk, "in", pp$special, sum(h$`in`)))
    if (!pp$special) {
      bd <- pp$bands[[pid]] %||% data.table(band = integer(), dentro = numeric(), fuera = numeric())
      o$bands <- list(dentro = I(r0(vapply(0:3, function(b) sum(bd[band == b, dentro], na.rm = TRUE), 0))),
                      fuera = I(r0(vapply(0:3, function(b) sum(bd[band == b, fuera], na.rm = TRUE), 0))))
      pu <- pp$purpose[[pid]] %||% data.table(way = character(), purpose = character(), t = numeric())
      o$purpose <- lapply(c(out = "out", `in` = "in"), function(w)
        I(r0(vapply(PURPOSES, function(x) sum(pu[way == w & purpose == x, t]), 0, USE.NAMES = FALSE))))
    }
    out[[k]] <- o
  }
  write_obj(list(id = pid, keys = out), file.path(stage, "places", paste0(pid, ".json")))
}

# --- Search: every INE municipality -> its zone ------------------------------------------
ine <- as.data.table(readxl::read_excel("data/raw/ine/diccionario25.xlsx", skip = 1))
ine[, ine := paste0(CPRO, CMUN)]
rel_ine <- unique(fread(file.path(RAW, "relacion_ine_zonificacionMitma.csv"), sep = "|",
                        colClasses = "character")[, .(ine = municipio_ine, zone = municipio_mitma)])
ine <- merge(ine, rel_ine, by = "ine")
ine[, name := pretty_name(NOMBRE)]
# Older or Castilian names people still type.
ALIASES <- c("La Coruña" = "15030", "Gerona" = "17079", "Lérida" = "25120", "Orense" = "32054",
             "Castellón" = "12040", "Palma de Mallorca" = "07040", "San Sebastián" = "20069",
             "Vitoria" = "01059", "Bilbo" = "48020", "Iruña" = "31201")
alias <- data.table(name = names(ALIASES), ine = unname(ALIASES))
alias <- merge(alias, ine[, .(ine, zone)], by = "ine")
alias[, alias := TRUE]
ine[, alias := FALSE]
srch <- rbind(ine[, .(name, zone, alias)], alias[, .(name, zone, alias)])
srch <- srch[zone %in% zones$id]
write_obj(list(name = srch$name, zone = I(zones$idx[match(srch$zone, zones$id)]), alias = I(as.integer(srch$alias))),
          file.path(stage, "search.json"))
message(sprintf("search: %d names", nrow(srch)))

files <- sort(list.files(stage, recursive = TRUE))
release <- substr(digest(paste(vapply(file.path(stage, files), digest, "", file = TRUE), collapse = "")), 1, 10)
write_obj(list(
  release = release,
  generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  source = list(
    name = "Estudio de movilidad con Big Data (MITMS), estudios básicos v2, nivel municipal",
    url = "https://www.transportes.gob.es/ministerio/proyectos-singulares/estudios-de-movilidad-con-big-data",
    licence = "Licencia de datos abiertos del MITMA",
    attribution = "Basado en datos abiertos MITMA"),
  units = "viajes que empiezan en cada hora; media de los días de cada día tipo",
  missing_days = c("2024-11-09", "2024-11-10", "2024-11-26", "2025-04-28", "2025-04-29"),
  rules = list(near_km = NEAR_KM, national_bands = NATIONAL_BANDS, regional_top = REGIONAL_TOP,
               min_daily = MIN_DAILY, place_animated = PLACE_ANIMATED, place_static = PLACE_STATIC,
               special_top = SPECIAL_TOP),
  purposes = PURPOSES,
  bands = c("0,5-2 km", "2-10 km", "10-50 km", "más de 50 km"),
  keys = keys
), file.path(stage, "manifest.json"))

final <- file.path(OUT_ROOT, release)
for (old in setdiff(list.dirs(OUT_ROOT, recursive = FALSE), stage)) unlink(old, recursive = TRUE)
file.rename(stage, final)
write_obj(list(release = release), file.path(OUT_ROOT, "release.json"))
size <- sum(file.size(list.files(final, recursive = TRUE, full.names = TRUE)))
message(sprintf("release %s: %d files, %.1f MB", release, length(files) + 1, size / 1e6))
dbDisconnect(con, shutdown = TRUE)

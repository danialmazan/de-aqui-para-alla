# Geometry for the map: official MITMA municipal zoning -> WGS84 display
# geometry (Canary Islands shifted into an inset), provinces dissolved from it,
# zone centroids, and a PMTiles basemap built with tippecanoe.
#
# Display coordinates only: no data value depends on the inset shift.

suppressPackageStartupMessages({
  library(sf)
  library(jsonlite)
})
sf_use_s2(FALSE)

RAW <- "data/raw/zonificacion"
GEO_OUT <- "data/geo"
TILES_OUT <- Sys.getenv("DAPA_TILES_OUT", "public/tiles")
dir.create(GEO_OUT, recursive = TRUE, showWarnings = FALSE)
dir.create(TILES_OUT, recursive = TRUE, showWarnings = FALSE)

# Canary Islands (provinces 35, 38) move by this offset in degrees so they sit
# in a framed inset between Portugal's south coast and Morocco.
CANARY_SHIFT <- c(5.0, 6.6)
is_canary <- function(id) substr(id, 1, 2) %in% c("35", "38") & grepl("^[0-9]", id)

zone_kind <- function(id) {
  ifelse(grepl("^FR", id), "francia",
    ifelse(grepl("^PT", id), "portugal",
      ifelse(grepl("_AM$", id), "agrupacion", "municipio")))
}
zone_prov <- function(id) ifelse(grepl("^[0-9]", id), substr(id, 1, 2), substr(id, 1, 2))

shift_geom <- function(g, ids) {
  sel <- which(is_canary(ids))
  if (length(sel)) g[sel] <- g[sel] + CANARY_SHIFT
  g
}

# --- Zones ---------------------------------------------------------------------
# Work in EPSG:25830 (metres): snap to a 1 m grid, lightly simplify, repair, and
# dissolve there; reproject and shift only at the end. tippecanoe simplifies
# further per zoom.
zones <- st_read(file.path(RAW, "zonificacion_municipios/zonificacion_municipios.shp"), quiet = TRUE)
repair <- function(x) st_make_valid(x, geos_method = "valid_structure", geos_keep_collapsed = FALSE)
zones <- repair(st_set_precision(zones, 1))
zones <- repair(st_simplify(zones, dTolerance = 40, preserveTopology = TRUE))
zones$id <- zones$ID
zones$kind <- zone_kind(zones$id)
zones$prov <- zone_prov(zones$id)

names <- read.csv(file.path(RAW, "zonificacion_municipios/nombres_municipios.csv"), sep = "|", colClasses = "character")[, c("ID", "name")]
zones <- merge(zones[, c("id", "kind", "prov")], names, by.x = "id", by.y = "ID", all.x = TRUE)

# --- Provinces (Spain) and countries (FR/PT outlines) -----------------------------
dissolve <- function(x, by) {
  parts <- lapply(split(x, by), function(g) {
    u <- st_union(st_buffer(st_geometry(g), 0))
    st_cast(st_collection_extract(u, "POLYGON"), "MULTIPOLYGON")
  })
  st_sf(key = names(parts), geometry = do.call(c, parts), crs = st_crs(x))
}
spain <- zones[zones$kind %in% c("municipio", "agrupacion"), ]
provinces <- dissolve(spain, spain$prov)
foreign <- zones[zones$kind %in% c("francia", "portugal"), ]
countries <- dissolve(foreign, foreign$kind)

to_display <- function(x, ids) {
  x <- st_transform(x, 4326)
  st_geometry(x) <- shift_geom(st_geometry(x), ids)
  st_crs(x) <- 4326
  x
}
zones <- to_display(zones, zones$id)
provinces <- to_display(provinces, provinces$key)
countries <- st_transform(countries, 4326)

# --- Canary inset frame ------------------------------------------------------------
canary_bb <- st_bbox(zones[is_canary(zones$id), ])
pad <- 0.35
frame <- st_sf(kind = "canarias", geometry = st_sfc(st_polygon(list(rbind(
  c(canary_bb["xmin"] - pad, canary_bb["ymin"] - pad),
  c(canary_bb["xmax"] + pad, canary_bb["ymin"] - pad),
  c(canary_bb["xmax"] + pad, canary_bb["ymax"] + pad),
  c(canary_bb["xmin"] - pad, canary_bb["ymax"] + pad),
  c(canary_bb["xmin"] - pad, canary_bb["ymin"] - pad)
))), crs = 4326))

# --- Centroids (official), same shift ----------------------------------------------
cent <- st_transform(st_read(file.path(RAW, "zonificacion_municipios/zonificacion_municipios_centroides.shp"), quiet = TRUE), 4326)
st_geometry(cent) <- shift_geom(st_geometry(cent), cent$ID)
xy <- st_coordinates(cent)
centroids <- data.frame(id = cent$ID, lon = round(xy[, 1], 5), lat = round(xy[, 2], 5))

# --- Write layers and tile them ----------------------------------------------------
write_layer <- function(x, name) {
  path <- file.path(GEO_OUT, paste0(name, ".geojson"))
  if (file.exists(path)) file.remove(path)
  st_write(x, path, quiet = TRUE)
  path
}
paths <- c(
  zones = write_layer(zones, "zones"),
  provinces = write_layer(provinces, "provinces"),
  countries = write_layer(countries, "countries"),
  inset = write_layer(frame, "inset")
)
write_json(list(
  canary_shift = CANARY_SHIFT,
  inset_bbox = as.numeric(st_bbox(frame)),
  centroids = centroids
), file.path(GEO_OUT, "display.json"), digits = NA)

pmtiles <- file.path(TILES_OUT, "base.pmtiles")
args <- c("-q", "-o", pmtiles, "--force", "-Z", "3", "-z", "10",
          "--no-tile-size-limit", "--coalesce-densest-as-needed", "--detect-shared-borders",
          "--simplification=4", "--generate-ids",
          sprintf("-L%s:%s", names(paths), paths))
status <- system2("tippecanoe", args)
if (status != 0) stop("tippecanoe failed")
message(sprintf("zones=%d provinces=%d countries=%d  %s %.1f MB",
                nrow(zones), nrow(provinces), nrow(countries), pmtiles, file.size(pmtiles) / 1e6))

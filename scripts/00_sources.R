# Fetch the small official inputs (zoning, names, population, relation table,
# licence, methodology notes, monthly national aggregates) into data/raw/ and
# record their provenance in data/sources.lock.json.
#
# The large daily OD files are never stored: 02_stream_days.R streams them.

suppressPackageStartupMessages({
  library(jsonlite)
  library(digest)
})

BUCKET <- "https://movilidad-opendata.mitma.es"
RAW_DIR <- Sys.getenv("DAPA_RAW_DIR", "data/raw")
LOCK <- "data/sources.lock.json"

zoning_files <- function(level, stem) {
  base <- sprintf("zonificacion/zonificacion_%s/", level)
  exts <- c("shp", "shx", "dbf", "prj", "cpg")
  c(
    paste0(base, "zonificacion_", stem, ".", exts),
    paste0(base, "zonificacion_", stem, "_centroides.", exts),
    paste0(base, "nombres_", stem, ".csv"),
    paste0(base, "poblacion_", stem, ".csv")
  )
}

sources <- c(
  zoning_files("municipios", "municipios"),
  zoning_files("GAU", "gaus"),
  "zonificacion/relacion_ine_zonificacionMitma.csv",
  "zonificacion/poblacion.csv",
  "LICENCIA de datos abiertos del MITMA 20201203.pdf",
  "LEEME_Especificaciones_indicadores_OpenDataMovilidad.xlsx",
  "LEEME_CambioMetodología_IndicadoresBigdata_posteriores_a_20250701.pdf",
  "estudios_basicos/movilidad_agregada_mensual/incidencias.txt",
  "estudios_basicos/estadisticos/viajes/2024/municipal_estadisticos_diasemana_intra.csv",
  "estudios_basicos/estadisticos/viajes/2024/municipal_estadisticos_diasemana_inter.csv"
)

# Non-bucket sources: key under data/raw/ -> URL. INE's municipality dictionary
# gives every municipality's official name, for search over grouped zones.
EXTERNAL <- c(
  "ine/diccionario25.xlsx" = "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx"
)

url_for <- function(key) if (key %in% names(EXTERNAL)) EXTERNAL[[key]] else paste0(BUCKET, "/", utils::URLencode(key))

fetch <- function(key) {
  dest <- file.path(RAW_DIR, key)
  dir.create(dirname(dest), recursive = TRUE, showWarnings = FALSE)
  if (!file.exists(dest)) {
    message("GET ", key)
    status <- utils::download.file(url_for(key), dest, mode = "wb", quiet = TRUE)
    if (status != 0) stop("download failed: ", key)
  }
  headers <- curlGetHeaders(url_for(key))
  last_mod <- sub("^[Ll]ast-[Mm]odified: *", "", trimws(grep("^[Ll]ast-[Mm]odified", headers, value = TRUE)[1]))
  list(
    key = key,
    url = url_for(key),
    bytes = file.size(dest),
    sha256 = digest(file = dest, algo = "sha256"),
    last_modified = last_mod
  )
}

# Monthly national aggregates: list the folder and fetch every file in it.
list_prefix <- function(prefix) {
  xml <- paste(readLines(sprintf("%s/?list-type=2&prefix=%s", BUCKET, prefix), warn = FALSE), collapse = "")
  keys <- regmatches(xml, gregexpr("<Key>[^<]*</Key>", xml))[[1]]
  gsub("</?Key>", "", keys)
}
monthly <- list_prefix("estudios_basicos/movilidad_agregada_mensual/")
monthly <- monthly[!grepl("/$", monthly)]

entries <- lapply(unique(c(sources, monthly, names(EXTERNAL))), fetch)
lock <- list(
  retrieved_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  bucket = BUCKET,
  licence = "Licencia de datos abiertos del MITMA (2020-12-03). Atribución: «Basado en datos abiertos MITMA».",
  files = entries
)
write_json(lock, LOCK, auto_unbox = TRUE, pretty = TRUE)
message(sprintf("%d files, %.1f MB recorded in %s", length(entries), sum(sapply(entries, `[[`, "bytes")) / 1e6, LOCK))

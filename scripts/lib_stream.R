# Shared helpers for streaming MITMA daily municipal OD files through DuckDB.
# Raw files are read over HTTPS and never written to disk.

suppressPackageStartupMessages({
  library(DBI)
  library(duckdb)
})

BUCKET <- "https://movilidad-opendata.mitma.es"

day_url <- function(date) {
  date <- as.Date(date)
  sprintf("%s/estudios_basicos/por-municipios/viajes/ficheros-diarios/%s/%s_Viajes_municipios.csv.gz",
          BUCKET, format(date, "%Y-%m"), format(date, "%Y%m%d"))
}

open_duck <- function(threads = 4, memory = "6GB") {
  con <- dbConnect(duckdb())
  dbExecute(con, "INSTALL httpfs; LOAD httpfs;")
  dbExecute(con, sprintf("SET threads = %d; SET memory_limit = '%s';", threads, memory))
  dbExecute(con, "SET preserve_insertion_order = false;")
  con
}

# Destination activity grouped for the "¿A qué van?" filter.
PURPOSE_SQL <- "CASE actividad_destino
  WHEN 'trabajo_estudio' THEN 'trabajo'
  WHEN 'casa' THEN 'casa'
  WHEN 'frecuente' THEN 'frecuente'
  ELSE 'ocasional' END"

BAND_SQL <- "CASE distancia
  WHEN '0.5-2' THEN 0 WHEN '2-10' THEN 1 WHEN '10-50' THEN 2 ELSE 3 END"

# Stream one day into the `raw_day` table (only the columns we use), then write
# the two daily aggregates as parquet under out_dir/day=YYYYMMDD/.
stream_day <- function(con, date, out_dir) {
  date <- as.Date(date)
  day_dir <- file.path(out_dir, paste0("day=", format(date, "%Y%m%d")))
  dir.create(day_dir, recursive = TRUE, showWarnings = FALSE)
  t0 <- Sys.time()
  dbExecute(con, sprintf("
    CREATE OR REPLACE TEMP TABLE raw_day AS
    SELECT CAST(periodo AS TINYINT) AS h,
           origen AS o, destino AS d,
           (%s)::TINYINT AS band,
           %s AS purpose,
           viajes AS trips
    FROM read_csv('%s', delim = '|', header = true, compression = 'gzip',
                  columns = {
                    'fecha': 'VARCHAR', 'periodo': 'VARCHAR', 'origen': 'VARCHAR',
                    'destino': 'VARCHAR', 'distancia': 'VARCHAR',
                    'actividad_origen': 'VARCHAR', 'actividad_destino': 'VARCHAR',
                    'estudio_origen_posible': 'VARCHAR', 'estudio_destino_posible': 'VARCHAR',
                    'residencia': 'VARCHAR', 'renta': 'VARCHAR', 'edad': 'VARCHAR',
                    'sexo': 'VARCHAR', 'viajes': 'DOUBLE', 'viajes_km': 'DOUBLE'})",
    BAND_SQL, PURPOSE_SQL, day_url(date)))
  t_read <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  raw_rows <- dbGetQuery(con, "SELECT count(*) AS n, sum(trips) AS trips FROM raw_day")

  dbExecute(con, sprintf("COPY (
      SELECT o, d, h, sum(trips) AS trips FROM raw_day GROUP BY ALL
    ) TO '%s' (FORMAT parquet, COMPRESSION zstd)", file.path(day_dir, "od_hour.parquet")))
  dbExecute(con, sprintf("COPY (
      SELECT o, d, band, purpose, h, sum(trips) AS trips FROM raw_day GROUP BY ALL
    ) TO '%s' (FORMAT parquet, COMPRESSION zstd)", file.path(day_dir, "od_band_purpose.parquet")))
  t_total <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  dbExecute(con, "DROP TABLE raw_day")
  data.frame(date = as.character(date), raw_rows = raw_rows$n, trips = raw_rows$trips,
             read_s = round(t_read, 1), total_s = round(t_total, 1))
}

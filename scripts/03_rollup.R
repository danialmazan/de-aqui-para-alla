# Roll the streamed days up into one table per day key, so the 71 daily
# folders (2.6 GB) need not be kept. Publishing reads only these sums.
#
#   data/rollup/<key>/od_hour.parquet          o, d, h, trips = exact sum over the key's days
#   data/rollup/<key>/od_band_purpose.parquet  o, d, band, purpose, trips (typical keys; no hour)
#   data/rollup/keys.json                      days and day count per key
#   data/rollup/day_totals.csv                 national trips per streamed day (validation)
#
# Sums are DECIMAL (exact), so dividing them later by the day count gives the
# same averages, to the last digit, as averaging the daily files directly.
#
# The daily folders can be deleted afterwards. Streaming a day again takes
# 1–2 minutes (npm run data:stream), and is needed only to build a new day key.

suppressPackageStartupMessages(library(jsonlite))
source("scripts/lib_stream.R")

IN <- "data/interim/days"
OUT <- "data/rollup"
cal <- fromJSON("data/calendar.json", simplifyVector = FALSE)
con <- open_duck(threads = 6, memory = "8GB")

files_for <- function(days, what) {
  f <- sprintf("%s/day=%s/%s.parquet", IN, gsub("-", "", days), what)
  stopifnot(all(file.exists(f)))
  paste(sprintf("'%s'", f), collapse = ",")
}

keys <- c(
  lapply(cal$typical, function(t) list(kind = "typical", days = unlist(t$days))),
  lapply(cal$special, function(s) list(kind = "special", days = s$date))
)
dir.create(OUT, showWarnings = FALSE)
for (k in names(keys)) {
  days <- keys[[k]]$days
  dir <- file.path(OUT, k)
  dir.create(dir, showWarnings = FALSE)
  dbExecute(con, sprintf("COPY (
      SELECT o, d, h, sum(CAST(trips AS DECIMAL(18, 3))) AS trips FROM read_parquet([%s]) GROUP BY ALL ORDER BY o, d, h
    ) TO '%s' (FORMAT parquet, COMPRESSION zstd)", files_for(days, "od_hour"), file.path(dir, "od_hour.parquet")))
  if (keys[[k]]$kind == "typical") {
    dbExecute(con, sprintf("COPY (
        SELECT o, d, band, purpose, sum(CAST(trips AS DECIMAL(18, 3))) AS trips FROM read_parquet([%s])
        GROUP BY ALL ORDER BY o, d, band, purpose
      ) TO '%s' (FORMAT parquet, COMPRESSION zstd)", files_for(days, "od_band_purpose"), file.path(dir, "od_band_purpose.parquet")))
  }
  message(sprintf("%-14s %2d days  %.0f MB", k, length(days),
                  sum(file.size(list.files(dir, full.names = TRUE))) / 1e6))
}
write_json(lapply(keys, function(x) list(kind = x$kind, n = length(x$days), days = x$days)),
           file.path(OUT, "keys.json"), auto_unbox = FALSE, pretty = TRUE)

totals <- dbGetQuery(con, sprintf("SELECT regexp_extract(filename, 'day=([0-9]{8})', 1) AS day, sum(trips) AS trips
                                   FROM read_parquet('%s/day=*/od_hour.parquet', filename = true) GROUP BY ALL ORDER BY day", IN))
write.csv(totals, file.path(OUT, "day_totals.csv"), row.names = FALSE)
message(sprintf("%d days rolled up into %d keys", nrow(totals), length(keys)))
dbDisconnect(con, shutdown = TRUE)

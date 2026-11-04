# Stream every day listed in data/calendar.json into daily parquet aggregates
# (data/interim/days/day=YYYYMMDD/). Resumable: a day with a _done marker is
# skipped. Run shards in parallel with: Rscript scripts/02_stream_days.R <i> <n>

suppressPackageStartupMessages(library(jsonlite))
source("scripts/lib_stream.R")

args <- as.integer(commandArgs(trailingOnly = TRUE))
shard <- if (length(args) >= 1) args[1] else 1L
shards <- if (length(args) >= 2) args[2] else 1L
OUT <- "data/interim/days"
LOG <- sprintf("reports/stream-days-%d-of-%d.csv", shard, shards)

days <- fromJSON("data/calendar.json")$stream
days <- days[seq_along(days) %% shards == (shard - 1L)]
done <- function(d) file.exists(file.path(OUT, paste0("day=", gsub("-", "", d)), "_done"))
todo <- days[!vapply(days, done, logical(1))]
message(sprintf("shard %d/%d: %d days, %d to do", shard, shards, length(days), length(todo)))

con <- open_duck(threads = 3, memory = "4GB")
for (d in todo) {
  res <- tryCatch(stream_day(con, d, OUT), error = function(e) {
    message("FAILED ", d, ": ", conditionMessage(e))
    NULL
  })
  if (is.null(res)) next
  file.create(file.path(OUT, paste0("day=", gsub("-", "", d)), "_done"))
  write.table(res, LOG, sep = ",", row.names = FALSE, append = file.exists(LOG), col.names = !file.exists(LOG))
  message(sprintf("%s  %.1fM rows  %.1f s", d, res$raw_rows / 1e6, res$total_s))
}
dbDisconnect(con, shutdown = TRUE)

# Validate the streamed days and the published release. Writes
# reports/validation.json and reports/VALIDATION.md, and stops with an error if
# any check fails (so a bad release never goes unnoticed).
#
#   1. Each streamed day against the Ministry's official monthly national totals.
#   2. Conservation inside the release: national halos + arcs, place partners + rest.
#   3. Our normal weekday against the official 2024 day-of-week statistics per zone.
#   4. Day-type ordering and special-day signatures.
#   5. File size budgets.

suppressPackageStartupMessages({
  library(jsonlite)
  library(data.table)
})
source("scripts/lib_stream.R")

IN <- "data/interim/days"
RAW <- "data/raw"
release <- fromJSON("public/data/release.json")$release
REL <- file.path("public/data", release)
man <- fromJSON(file.path(REL, "manifest.json"), simplifyVector = FALSE)
cal <- fromJSON("data/calendar.json", simplifyVector = FALSE)

checks <- list()
check <- function(id, ok, detail) {
  checks[[length(checks) + 1]] <<- list(id = id, ok = isTRUE(ok), detail = detail)
  message(sprintf("%s  %-34s %s", if (isTRUE(ok)) "ok  " else "FAIL", id, detail))
}

con <- open_duck(threads = 6, memory = "6GB")
q <- function(sql) as.data.table(dbGetQuery(con, sql))

# --- 1. Streamed days vs official monthly totals -----------------------------------------
days <- q(sprintf("SELECT regexp_extract(filename, 'day=([0-9]{8})', 1) AS day, sum(trips) AS trips
                   FROM read_parquet('%s/day=*/od_hour.parquet', filename = true) GROUP BY ALL", IN))
days[, date := as.Date(day, "%Y%m%d")]
days <- days[as.character(date) %in% unlist(cal$stream)]
monthly <- rbindlist(lapply(unique(format(days$date, "%Y%m")), function(m) {
  x <- fread(sprintf("%s/estudios_basicos/movilidad_agregada_mensual/%s_datos_agregados.csv", RAW, m), sep = "|")
  ndays <- as.integer(format(seq(as.Date(paste0(m, "01"), "%Y%m%d"), by = "month", length.out = 2)[2] - 1, "%d"))
  data.table(month = m, official_per_day = sum(x$viajes) / ndays)
}))
days[, month := format(date, "%Y%m")]
days <- merge(days, monthly, by = "month")
days[, ratio := trips / official_per_day]
days[, dow := as.integer(format(date, "%u"))]
check("days.count", nrow(days) == length(cal$stream), sprintf("%d of %d calendar days streamed", nrow(days), length(cal$stream)))
check("days.vs_monthly_official", all(days$ratio > 0.6 & days$ratio < 1.4),
      sprintf("day / official monthly mean per day: %.2f–%.2f (weekdays %.2f, weekends %.2f median)",
              min(days$ratio), max(days$ratio), median(days[dow <= 5, ratio]), median(days[dow > 5, ratio])))
# The monthly mean includes weekends and holidays, so Tue–Thu should sit above it.
tt <- days[dow %in% 2:4 & as.character(date) %in% unlist(cal$typical$laborable$days)]
check("days.weekday_above_monthly_mean", median(tt$ratio) > 1 & median(tt$ratio) < 1.2,
      sprintf("normal weekdays: median %.3f of the monthly mean", median(tt$ratio)))

# --- 2. Conservation inside the release ---------------------------------------------------
cons <- rbindlist(lapply(names(man$keys), function(k) {
  t <- man$keys[[k]]$totals
  nat <- fromJSON(file.path(REL, "national", paste0(k, ".json")))
  halo <- sum(nat$nodes$halo)
  externo <- t$externo_share * t$trips
  within_area <- nat$share$all - externo - nat$share$inter_area
  data.table(day_key = k, halo = halo, expected_halo = within_area + nat$share$near,
             shipped = sum(nat$arcs$h), expected_shipped = nat$share$shipped)
}))
cons[, err := pmax(abs(halo / expected_halo - 1), abs(shipped / expected_shipped - 1))]
check("national.conservation", all(cons$err < 0.01),
      sprintf("halos = within-área + near; arcs = shipped; worst error %.3f%%", 100 * max(cons$err)))

zones <- fromJSON(file.path(REL, "zones.json"))
set.seed(1)
sample_ids <- c("28079", "08019", "28065", "46250", "41091", sample(list.files(file.path(REL, "places")), 60))
sample_ids <- unique(sub("\\.json$", "", sample_ids))
place_err <- rbindlist(lapply(sample_ids, function(id) {
  p <- fromJSON(file.path(REL, "places", paste0(id, ".json")), simplifyVector = FALSE)
  rbindlist(lapply(names(p$keys), function(k) {
    x <- p$keys[[k]]
    rbindlist(lapply(c("out", "in"), function(w) {
      total <- sum(unlist(x$hours[[w]]))
      shipped <- if (!is.null(x[[w]]$h)) sum(unlist(x[[w]]$h)) + sum(unlist(x[[w]]$sday)) else sum(unlist(x[[w]]$day))
      data.table(id = id, day_key = k, way = w, total = total, parts = shipped + x[[w]]$rest)
    }))
  }))
}))
place_err[, err := abs(parts - total) / pmax(total, 100)]
check("places.partners_plus_rest", all(place_err$err < 0.01),
      sprintf("%d places × keys × ways: partners + rest = total, worst error %.3f%%",
              nrow(place_err), 100 * max(place_err$err)))
mad <- fromJSON(file.path(REL, "places", "28079.json"), simplifyVector = FALSE)$keys$laborable
check("places.madrid_balance", abs(sum(unlist(mad$hours$out)) / sum(unlist(mad$hours[["in"]])) - 1) < 0.05,
      sprintf("Madrid out/in on a normal weekday: %.3f", sum(unlist(mad$hours$out)) / sum(unlist(mad$hours[["in"]]))))

# --- 3. Normal weekday vs official 2024 day-of-week statistics -----------------------------
stat <- function(f) {
  x <- fread(sprintf("%s/estudios_basicos/estadisticos/viajes/2024/municipal_estadisticos_diasemana_%s.csv", RAW, f),
             sep = "|", colClasses = c(cod_zona = "character"))
  x[dia_semana %in% c("MAR", "MIÉ", "JUE"), .(official = mean(promedio)), by = .(zone = cod_zona)]
}
lab <- unlist(cal$typical$laborable$days)
files <- paste(sprintf("'%s/day=%s/od_hour.parquet'", IN, gsub("-", "", lab)), collapse = ",")
ours <- q(sprintf("SELECT o AS zone, sum(trips) FILTER (WHERE o = d) / %d AS intra,
                          sum(trips) FILTER (WHERE o <> d) / %d AS inter_out
                   FROM read_parquet([%s]) GROUP BY o", length(lab), length(lab), files))
ours_in <- q(sprintf("SELECT d AS zone, sum(trips) / %d AS inter_in FROM read_parquet([%s])
                      WHERE o <> d GROUP BY d", length(lab), files))
cmp <- merge(merge(ours, ours_in, by = "zone"), stat("intra")[, .(zone, off_intra = official)], by = "zone")
cmp <- merge(cmp, stat("inter")[, .(zone, off_inter = official)], by = "zone")
# The official "inter" figure counts a zone's departures and arrivals together.
cmp[, inter := inter_out + inter_in]
cmp <- cmp[complete.cases(cmp)]
r_intra <- cor(log1p(cmp$intra), log1p(cmp$off_intra))
r_inter <- cor(log1p(cmp$inter), log1p(cmp$off_inter))
ratio_intra <- median(cmp$intra / cmp$off_intra)
ratio_inter <- median(cmp$inter / cmp$off_inter)
check("official_2024.within_zone", r_intra > 0.98 && abs(ratio_intra - 1) < 0.2,
      sprintf("%d zones, r(log) = %.4f, median ratio ours/official %.3f", nrow(cmp), r_intra, ratio_intra))
check("official_2024.between_zones", r_inter > 0.98 && abs(ratio_inter - 1) < 0.2,
      sprintf("departures + arrivals: r(log) = %.4f, median ratio ours/official %.3f", r_inter, ratio_inter))

# --- 4. Day types behave as expected -----------------------------------------------------
tot <- function(k) man$keys[[k]]$totals$trips
night <- function(k) { h <- unlist(man$keys[[k]]$totals$hourly); sum(h[1:6]) / sum(h) }
check("daytypes.ordering", tot("laborable") > tot("sabado") && tot("sabado") > tot("domingo"),
      sprintf("weekday %.1f M > Saturday %.1f M > Sunday %.1f M", tot("laborable") / 1e6, tot("sabado") / 1e6, tot("domingo") / 1e6))
check("daytypes.new_year_night", night("ano-nuevo") > 2 * night("laborable"),
      sprintf("trips 0–6h: New Year's Day %.1f%% vs normal weekday %.1f%%", 100 * night("ano-nuevo"), 100 * night("laborable")))

# --- 5. Size budgets (gzip, as served) ----------------------------------------------------
gz <- function(f) length(memCompress(readBin(f, "raw", file.size(f)), "gzip"))
nat_gz <- max(vapply(list.files(file.path(REL, "national"), full.names = TRUE), gz, 0))
place_files <- list.files(file.path(REL, "places"), full.names = TRUE)
place_gz <- max(vapply(place_files[order(-file.size(place_files))][1:20], gz, 0))
check("budget.national", nat_gz < 150e3, sprintf("largest national file %.0f KB gz (budget 150)", nat_gz / 1e3))
check("budget.place", place_gz < 40e3, sprintf("largest place file %.0f KB gz (budget 40)", place_gz / 1e3))
check("budget.search", gz(file.path(REL, "search.json")) < 80e3,
      sprintf("search index %.0f KB gz (budget 80)", gz(file.path(REL, "search.json")) / 1e3))

dbDisconnect(con, shutdown = TRUE)

# --- Report ------------------------------------------------------------------------------
dir.create("reports", showWarnings = FALSE)
failed <- Filter(function(x) !x$ok, checks)
write_json(list(release = release, generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
                passed = length(checks) - length(failed), failed = length(failed), checks = checks,
                days = days[order(date), .(date = as.character(date), trips = round(trips), ratio = round(ratio, 3))]),
           "reports/validation.json", auto_unbox = TRUE, pretty = TRUE)
md <- c(sprintf("# Validation · release %s", release), "",
        sprintf("%d of %d checks passed.", length(checks) - length(failed), length(checks)), "",
        "| Check | Result | Detail |", "|---|---|---|",
        vapply(checks, function(x) sprintf("| `%s` | %s | %s |", x$id, if (x$ok) "ok" else "**FAIL**", x$detail), ""))
writeLines(md, "reports/VALIDATION.md")
if (length(failed)) stop(length(failed), " validation check(s) failed: ", paste(vapply(failed, `[[`, "", "id"), collapse = ", "))
message("all checks passed")

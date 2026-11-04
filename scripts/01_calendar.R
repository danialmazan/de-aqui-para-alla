# Typical days and special days (docs/DECISIONS.md) -> data/calendar.json.
# Every date is checked against the bucket's published days and the known gaps.

suppressPackageStartupMessages(library(jsonlite))

MISSING <- as.Date(c("2024-11-09", "2024-11-10", "2024-11-26", "2025-04-28", "2025-04-29"))
NATIONAL_HOLIDAYS <- as.Date(c("2024-08-15", "2024-10-12", "2024-11-01", "2024-12-06", "2024-12-08",
                               "2024-12-25", "2025-01-01", "2025-01-06", "2025-04-17", "2025-04-18",
                               "2025-05-01"))

# ISO weekday: 1 = Monday … 7 = Sunday
wd <- function(d) as.integer(format(d, "%u"))
span <- function(from, to) seq(as.Date(from), as.Date(to), by = "day")
pick <- function(days, weekdays, except = character()) {
  days <- days[wd(days) %in% weekdays]
  days[!days %in% c(as.Date(except), NATIONAL_HOLIDAYS)]
}

TUE_THU <- 2:4
typical <- list(
  laborable = list(
    label = list(es = "Laborable normal", en = "Normal weekday"),
    note = list(es = "martes a jueves de octubre de 2024 y febrero de 2025",
                en = "Tuesdays to Thursdays in October 2024 and February 2025"),
    days = c(pick(span("2024-10-01", "2024-10-24"), TUE_THU), pick(span("2025-02-04", "2025-02-27"), TUE_THU))),
  sabado = list(
    label = list(es = "Sábado normal", en = "Normal Saturday"),
    note = list(es = "sábados de octubre de 2024 y febrero de 2025", en = "Saturdays in October 2024 and February 2025"),
    days = c(pick(span("2024-10-01", "2024-10-27"), 6), pick(span("2025-02-01", "2025-02-23"), 6))),
  domingo = list(
    label = list(es = "Domingo normal", en = "Normal Sunday"),
    note = list(es = "domingos de octubre de 2024 y febrero de 2025", en = "Sundays in October 2024 and February 2025"),
    days = c(pick(span("2024-10-01", "2024-10-27"), 7, "2024-10-13"), pick(span("2025-02-01", "2025-02-23"), 7))),
  verano = list(
    label = list(es = "Laborable de verano", en = "Summer weekday"),
    note = list(es = "martes a jueves del 16 de julio al 22 de agosto de 2024",
                en = "Tuesdays to Thursdays, 16 July to 22 August 2024"),
    days = pick(span("2024-07-16", "2024-08-22"), TUE_THU)),
  `verano-finde` = list(
    label = list(es = "Fin de semana de verano", en = "Summer weekend"),
    note = list(es = "sábados y domingos del 13 de julio al 25 de agosto de 2024, sin el puente del 15 de agosto",
                en = "Weekends, 13 July to 25 August 2024, excluding the 15 August long weekend"),
    days = pick(span("2024-07-13", "2024-08-25"), 6:7, c("2024-08-17", "2024-08-18")))
)

special <- list(
  `salida-verano` = list(label = list(es = "Salida de vacaciones", en = "Summer getaway"),
                         date = "2024-08-02", compare = "laborable"),
  nochebuena = list(label = list(es = "Nochebuena", en = "Christmas Eve"),
                    date = "2024-12-24", compare = "laborable"),
  `ano-nuevo` = list(label = list(es = "Año Nuevo", en = "New Year's Day"),
                     date = "2025-01-01", compare = "domingo"),
  `semana-santa` = list(label = list(es = "Miércoles Santo", en = "Easter getaway"),
                        date = "2025-04-16", compare = "laborable")
)

all_days <- sort(unique(c(do.call(c, lapply(typical, `[[`, "days")), as.Date(sapply(special, `[[`, "date")))))
stopifnot(!any(all_days %in% MISSING))

# Confirm each day is published (HEAD request against the bucket).
source("scripts/lib_stream.R")
ok <- vapply(as.character(all_days), function(d) {
  h <- tryCatch(curlGetHeaders(day_url(d)), error = function(e) "")
  any(grepl("^HTTP/[0-9.]+ 200", h))
}, logical(1))
if (!all(ok)) stop("not published: ", paste(names(ok)[!ok], collapse = ", "))

for (k in names(typical)) message(sprintf("%-13s %2d days", k, length(typical[[k]]$days)))

out <- list(
  generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  typical = lapply(typical, function(t) modifyList(t, list(days = as.character(t$days), n = length(t$days)))),
  special = special,
  stream = as.character(all_days)
)
write_json(out, "data/calendar.json", auto_unbox = TRUE, pretty = TRUE)
message("calendar: ", length(all_days), " days to stream")

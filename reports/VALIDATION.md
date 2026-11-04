# Validation · release 73b7b841ca

13 of 13 checks passed.

| Check | Result | Detail |
|---|---|---|
| `days.count` | ok | 71 of 71 calendar days streamed |
| `days.vs_monthly_official` | ok | day / official monthly mean per day: 0.72–1.10 (weekdays 1.06, weekends 0.87 median) |
| `days.weekday_above_monthly_mean` | ok | normal weekdays: median 1.058 of the monthly mean |
| `national.conservation` | ok | halos = within-área + near; arcs = shipped; worst error 0.004% |
| `places.partners_plus_rest` | ok | 1170 places × keys × ways: partners + rest = total, worst error 0.230% |
| `places.madrid_balance` | ok | Madrid out/in on a normal weekday: 0.998 |
| `official_2024.within_zone` | ok | 2548 zones, r(log) = 0.9965, median ratio ours/official 1.029 |
| `official_2024.between_zones` | ok | departures + arrivals: r(log) = 0.9991, median ratio ours/official 1.024 |
| `daytypes.ordering` | ok | weekday 148.8 M > Saturday 127.0 M > Sunday 112.2 M |
| `daytypes.new_year_night` | ok | trips 0–6h: New Year's Day 15.7% vs normal weekday 6.0% |
| `budget.national` | ok | largest national file 124 KB gz (budget 150) |
| `budget.place` | ok | largest place file 31 KB gz (budget 40) |
| `budget.search` | ok | search index 58 KB gz (budget 80) |

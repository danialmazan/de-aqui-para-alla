# Decisions

Decisions taken after the Stage 1 review (3 Nov 2026). They refine the approved plan.

## Typical days, not calendar averages

The site never plays a single arbitrary day, and it doesn't average whole seasons. Each **typical day** ("día tipo") is the average of a set of real, clean days. Each **special day** is one real day, labelled as such and compared with its matching typical day.

The sets are built by `scripts/01_calendar.R` and listed in `data/calendar.json`.

| Key | Typical day | Days averaged | Days |
|---|---|---|---|
| `laborable` | Normal weekday | Tue–Thu, 1–24 Oct 2024 and 4–27 Feb 2025 | 24 |
| `sabado` | Normal Saturday | Saturdays in Oct 2024 (except 12 Oct) and Feb 2025 | 7 |
| `domingo` | Normal Sunday | Sundays in Oct 2024 (except 13 Oct) and Feb 2025 | 7 |
| `verano` | Summer weekday | Tue–Thu, 16 Jul – 22 Aug 2024, except 15 Aug | 17 |
| `verano-finde` | Summer weekend | Sat/Sun, 13 Jul – 25 Aug 2024, except the 15 Aug long weekend | 12 |

Why October and February:
- Both are busy school-term months with no national holidays on Tue–Thu.
- Both fall before the 1 April 2025 population rescaling.
- October stops on the 24th, before the DANA (29 Oct).

| Key | Special day | Date |
|---|---|---|
| `salida-verano` | Summer holiday getaway | Fri 2 Aug 2024 |
| `nochebuena` | Christmas Eve | Tue 24 Dec 2024 |
| `ano-nuevo` | New Year's Day (the night out and the slow day) | Wed 1 Jan 2025 |
| `semana-santa` | Easter getaway | Wed 16 Apr 2025 |

Caveat: Semana Santa falls after the 1 April 2025 rescaling. The validation report measures the size of that jump.

## Which flows are drawn: by screen length, not kilometres

The Stage 1 25 km rule is dropped.

An arc is drawn only when it's at least `MIN_ARC_PX` (two dot gaps, 48 px) long on screen at the current zoom. A shorter arc can't show direction or density.

Trips on arcs that are too short are not lost. They fold into the origin's halo, which carries "viajes cercanos" together with trips inside the zone. Zooming in lets them out as arcs.

The busiest connections are chosen *after* this rule, so long-distance links are not crowded out by short commuter links.

## Initial view

The map opens on the Madrid area at municipal detail rather than the full peninsula. "Ver toda España" zooms out to the área-level national view.

## Dots

- Dots are translucent sparks with a soft glow.
- They sum in an offscreen buffer, and the sum is tone-mapped: brightness rises with density along a soft curve while the hue is kept, so busy streams glow and never bleach to white.
- The legend states the direction: amber where trips leave, aqua where they arrive.

## Pause

- Pause freezes the clock (the hour and its values), and the dots keep flowing at that hour.
- Reduced motion freezes everything.

## Scope and data sizes (4 Nov 2026)

- **No month-by-month data.** "El año" as a map section is dropped, and so is the "Meses" mode of La carrera. No further days are streamed beyond the 71 in `data/calendar.json`.
- **Streamed days are rolled up** (6 Nov 2026) by `scripts/03_rollup.R` into exact per-key sums in `data/rollup/` (194 MB), and the 71 daily folders (2.6 GB) were deleted. Republishing from the rollup gave the identical release (73b7b841ca). A new day key needs its days streamed again (1–2 min each).
- **Place files:** one per place (`places/<zone>.json`, 2,618 files, about 107 MB raw and 13.5 KB gzipped on average). Each holds all day keys:
  - typical days: the top 40 partners each way with 24-hour values, up to 300 more as daily totals, the rest as one number, plus hourly out/in/within, distance bands and purpose;
  - special days: the top 10 partners each way with daily totals, plus hourly out/in/within.
- **Map filters by distance or purpose are not built.** Distance and purpose appear only as Tu lugar charts, from the place files.
- **Search** covers all 8,132 INE municipalities (2025 dictionary), plus a few older or Castilian names.
- **Validation:** `scripts/07_validate.R` must pass before a release is used. Its report is `reports/VALIDATION.md`.

## La carrera, Días raros and day comparison (6 Nov 2026)

- **La carrera** (section 02) ranks places by trips arriving from other Spanish municipalities in each hour, on the chosen day key. It follows the shared clock and day. Two measures:
  - **Por vecino** (default): arrivals per 1,000 residents, in municipalities over 20,000 people. Counted raw, Madrid and Barcelona lead every hour; per resident, business parks, campuses, airports and beaches stand out.
  - **En total**: raw arrivals.
  - Data: `race.json` (35 KB gz, loaded when the section nears the screen). It holds every place in any hour's top 12 by either measure, with 24-hour arrivals. Built in `05_publish.R`.
- **Días raros** (section 03): the four special days as small multiples of national trips per hour, each against its manifest `compare` day. The hour with the largest relative change is marked. Each card's one-line story is hand-written and was checked against those hourly changes.
- **Comparar con** in Tu lugar's pulse chart: draws any other day key for the same place, dashed on the same scale. It reports the change in daily departures and arrivals. Special days start compared with their typical day.

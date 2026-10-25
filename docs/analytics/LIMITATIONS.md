# Known limitations

What this app cannot tell you, and why. Mirrors section 13 of the in-app **Data & methods** page.
Methods are in [METHODOLOGY.md](./METHODOLOGY.md); provider details in
[DATA_SOURCES.md](./DATA_SOURCES.md).

## Provider access

* `stats.nba.com` blocks many networks outright (cloud IP ranges, some ISPs and regions, VPNs) and
  rate-limits aggressive clients. Blocks surface as TCP timeouts, not HTTP errors. Ingestion paces
  requests (≥ 1 s), retries 408/425/429/5xx with backoff, and caches every raw response; an
  unreachable provider still means no real data. `python -m app.ingestion.cli probe` tells you.
* The app then serves the labelled `demo` namespace and never pretends otherwise.

## Historical coverage

| Family | Available from |
| --- | --- |
| Matchups (`matchups`) | 2017-18 |
| Defense dashboards (`defense_dash`) | 2013-14 |
| Shot locations (`shots`) | 1996-97 |
| Combine anthropometrics (`combine_anthro`) | 2000-01, only players who attended and were measured; many top picks skip measurements |

Earlier seasons are recorded as `missing` with a note and no provider call.

## Columns with no usable content

* `help_blk`, `help_fgm`, `help_fga` are null in the demo and unreliable in provider data; nothing
  is built on them.

## No adjusted impact metrics

There is no RAPM, EPM, RAPTOR, LEBRON or similar estimate. On/off, plus-minus, net rating and PIE
are shown as the provider publishes them and are not adjusted for teammates, opponents, minutes
distribution or garbage time.

## No play-by-play possessions

Possessions come from the provider's advanced tables (or `FGA − OREB + TOV + 0.44 × FTA` in the
demo). Per-100 rates inherit that approximation; no lineup or on/off figure is rebuilt from
play-by-play, and per-100 is offered only where a possessions column exists.

## Shooting

* No defender distance, closest defender, shot clock or shot-quality model.
* Points per FGA is not points per possession (ignores free throws, turnovers, offensive rebounds).
* Wilson intervals assume independent attempts; same-player, same-game shots are not independent,
  so intervals are somewhat too narrow.

## Matchups

* Partial possessions are fractional and scheme-dependent; sums across defenders do not equal team
  possessions.
* The lowest observed efficiency among qualifying matchups is not a "worst matchup".
* Shrinkage uses a league-wide prior (strength 25 pseudo-attempts by default), not a position- or
  role-specific one.

## Rankings

* Each lens is a user-defined index, computed within one season and season type.
* Percentiles do not remove era effects; a 90th-percentile three-point volume in 2016-17 and in
  2025-26 are different absolute numbers.
* A lens is only as good as its components and weights; overlapping components double-count a
  signal, and the builder only warns about a short hard-coded list of such pairs.

## Measurements

Listed heights (with shoes, team-reported) and combine heights (without shoes, measured once at
age 19–22) are different quantities and are never merged. Wingspan exists only for measured
players, so team wingspan averages cover part of a roster.

## Video evidence

* Only external references to the provider's event pages exist; there is no footage on disk, no
  playback, no annotation and no alignment yet. A listed clip says nothing about the defender, the
  lineup on court, or what the clip shows.
* Play-by-play events are ingested per game on demand, so most games have no events and their shots
  have no mapped event; the UI says so rather than guessing.

## Demo dataset

Fictional league with ids ≥ 9,000,000. On-court ratings, lineups, on/off, matchup possessions,
defense-dashboard categories and combine values are synthesised plausibly, not derived. Draw no
basketball conclusion from demo numbers.

## Live validation status

- The real pipeline has been run live against stats.nba.com for the 2025-26 Regular Season (all
  families) and 2024-25 / 2023-24, from a residential US connection on 2026-10-08. `make verify`
  confirmed that player-season and team-season totals equal the provider's summed game logs.
- Three provider quirks were found and handled on that run: per-team `leaguedashplayerstats` rows carry
  the player's *current* TEAM_ID (stints take the team from the request filter); player `TM_TOV_PCT`
  is 0-100 while every other percentage is a fraction (harmonised to fractions); `leaguedashptdefend`
  names its made/attempted/normal columns differently per defense category.
- Test reachability with `uv run python -m app.ingestion.cli probe`. Ad-hoc `curl` requests hang
  because the provider's edge holds clients without the modern Chrome header set; that is not a
  network block.


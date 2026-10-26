# Redesign v2: before and after

Captures of every page before the v2 redesign (`before/`) and after it (`after/`), taken with
`frontend/scripts/capture-screens.mjs` against `make dev` on the sanitized real-data session `demo9fc7b974`
(manager names are pseudonymous; the user is "Aaron"). The in-progress draft is a practice session
created through Setup and deleted afterwards. Names are `<page>-<width>x<height>-<theme>[-<variant>].png`.

Regenerate (from `frontend/`, with `make dev` running):

```sh
node scripts/capture-screens.mjs --session demo9fc7b974 --draft-session <in-progress id> --out ../docs/media/redesign/after
node scripts/capture-screens.mjs --session demo9fc7b974 --theme light --viewports 1440x900,390x844 --out ../docs/media/redesign/after
node scripts/capture-screens.mjs --session demo9fc7b974 --draft-session <id> --reduced-motion --viewports 1280x800 --pages overview,draft,season-free-agents,explorer --out ../docs/media/redesign/after
node scripts/capture-screens.mjs --session demo9fc7b974 --states --viewports 1440x900,390x844 --out ../docs/media/redesign/after
node scripts/capture-screens.mjs --session demo9fc7b974 --draft-session <id> --block-images --viewports 1440x900,390x844 --pages player,explorer,season-free-agents,performers,draft,overview,season-matchups --out ../docs/media/redesign/after
node scripts/capture-screens.mjs --session demo9fc7b974 --player 1629638 --variant longname --viewports 1440x900,390x844 --pages player --out ../docs/media/redesign/after
```

## Desktop (1440x900, dark)

| Page | Before | After |
| --- | --- | --- |
| overview | ![overview before](before/overview-1440x900-dark.png) | ![overview after](after/overview-1440x900-dark.png) |
| explorer | ![explorer before](before/explorer-1440x900-dark.png) | ![explorer after](after/explorer-1440x900-dark.png) |
| player | ![player before](before/player-1440x900-dark.png) | ![player after](after/player-1440x900-dark.png) |
| shooting | ![shooting before](before/shooting-1440x900-dark.png) | ![shooting after](after/shooting-1440x900-dark.png) |
| matchups | ![matchups before](before/matchups-1440x900-dark.png) | ![matchups after](after/matchups-1440x900-dark.png) |
| rankings | ![rankings before](before/rankings-1440x900-dark.png) | ![rankings after](after/rankings-1440x900-dark.png) |
| scouting | ![scouting before](before/scouting-1440x900-dark.png) | ![scouting after](after/scouting-1440x900-dark.png) |
| teams | ![teams before](before/teams-1440x900-dark.png) | ![teams after](after/teams-1440x900-dark.png) |
| compare | ![compare before](before/compare-1440x900-dark.png) | ![compare after](after/compare-1440x900-dark.png) |
| games | ![games before](before/games-1440x900-dark.png) | ![games after](after/games-1440x900-dark.png) |
| evidence | ![evidence before](before/evidence-1440x900-dark.png) | ![evidence after](after/evidence-1440x900-dark.png) |
| methodology | ![methodology before](before/methodology-1440x900-dark.png) | ![methodology after](after/methodology-1440x900-dark.png) |
| draft | ![draft before](before/draft-1440x900-dark.png) | ![draft after](after/draft-1440x900-dark.png) |
| recap | ![recap before](before/recap-1440x900-dark.png) | ![recap after](after/recap-1440x900-dark.png) |
| season-matchups | ![season-matchups before](before/season-matchups-1440x900-dark.png) | ![season-matchups after](after/season-matchups-1440x900-dark.png) |
| season-power | ![season-power before](before/season-power-1440x900-dark.png) | ![season-power after](after/season-power-1440x900-dark.png) |
| season-free-agents | ![season-free-agents before](before/season-free-agents-1440x900-dark.png) | ![season-free-agents after](after/season-free-agents-1440x900-dark.png) |
| season-results | ![season-results before](before/season-results-1440x900-dark.png) | ![season-results after](after/season-results-1440x900-dark.png) |
| performers | ![performers before](before/performers-1440x900-dark.png) | ![performers after](after/performers-1440x900-dark.png) |
| setup | not captured (private session list) | ![setup after](after/setup-1440x900-dark.png) |

## Phone (390x844, dark)

| Page | Before | After |
| --- | --- | --- |
| overview | ![overview before](before/overview-390x844-dark.png) | ![overview after](after/overview-390x844-dark.png) |
| explorer | ![explorer before](before/explorer-390x844-dark.png) | ![explorer after](after/explorer-390x844-dark.png) |
| player | ![player before](before/player-390x844-dark.png) | ![player after](after/player-390x844-dark.png) |
| shooting | ![shooting before](before/shooting-390x844-dark.png) | ![shooting after](after/shooting-390x844-dark.png) |
| matchups | ![matchups before](before/matchups-390x844-dark.png) | ![matchups after](after/matchups-390x844-dark.png) |
| rankings | ![rankings before](before/rankings-390x844-dark.png) | ![rankings after](after/rankings-390x844-dark.png) |
| scouting | ![scouting before](before/scouting-390x844-dark.png) | ![scouting after](after/scouting-390x844-dark.png) |
| teams | ![teams before](before/teams-390x844-dark.png) | ![teams after](after/teams-390x844-dark.png) |
| compare | ![compare before](before/compare-390x844-dark.png) | ![compare after](after/compare-390x844-dark.png) |
| games | ![games before](before/games-390x844-dark.png) | ![games after](after/games-390x844-dark.png) |
| evidence | ![evidence before](before/evidence-390x844-dark.png) | ![evidence after](after/evidence-390x844-dark.png) |
| methodology | ![methodology before](before/methodology-390x844-dark.png) | ![methodology after](after/methodology-390x844-dark.png) |
| draft | ![draft before](before/draft-390x844-dark.png) | ![draft after](after/draft-390x844-dark.png) |
| recap | ![recap before](before/recap-390x844-dark.png) | ![recap after](after/recap-390x844-dark.png) |
| season-matchups | ![season-matchups before](before/season-matchups-390x844-dark.png) | ![season-matchups after](after/season-matchups-390x844-dark.png) |
| season-power | ![season-power before](before/season-power-390x844-dark.png) | ![season-power after](after/season-power-390x844-dark.png) |
| season-free-agents | ![season-free-agents before](before/season-free-agents-390x844-dark.png) | ![season-free-agents after](after/season-free-agents-390x844-dark.png) |
| season-results | ![season-results before](before/season-results-390x844-dark.png) | ![season-results after](after/season-results-390x844-dark.png) |
| performers | ![performers before](before/performers-390x844-dark.png) | ![performers after](after/performers-390x844-dark.png) |
| setup | not captured (private session list) | ![setup after](after/setup-390x844-dark.png) |

## Other variants

### Dark at 1280x800 and 768x1024

- [`compare-1280x800-dark.png`](after/compare-1280x800-dark.png)
- [`compare-768x1024-dark.png`](after/compare-768x1024-dark.png)
- [`draft-1280x800-dark.png`](after/draft-1280x800-dark.png)
- [`draft-768x1024-dark.png`](after/draft-768x1024-dark.png)
- [`evidence-1280x800-dark.png`](after/evidence-1280x800-dark.png)
- [`evidence-768x1024-dark.png`](after/evidence-768x1024-dark.png)
- [`explorer-1280x800-dark.png`](after/explorer-1280x800-dark.png)
- [`explorer-768x1024-dark.png`](after/explorer-768x1024-dark.png)
- [`games-1280x800-dark.png`](after/games-1280x800-dark.png)
- [`games-768x1024-dark.png`](after/games-768x1024-dark.png)
- [`matchups-1280x800-dark.png`](after/matchups-1280x800-dark.png)
- [`matchups-768x1024-dark.png`](after/matchups-768x1024-dark.png)
- [`methodology-1280x800-dark.png`](after/methodology-1280x800-dark.png)
- [`methodology-768x1024-dark.png`](after/methodology-768x1024-dark.png)
- [`overview-1280x800-dark.png`](after/overview-1280x800-dark.png)
- [`overview-768x1024-dark.png`](after/overview-768x1024-dark.png)
- [`performers-1280x800-dark.png`](after/performers-1280x800-dark.png)
- [`performers-768x1024-dark.png`](after/performers-768x1024-dark.png)
- [`player-1280x800-dark.png`](after/player-1280x800-dark.png)
- [`player-768x1024-dark.png`](after/player-768x1024-dark.png)
- [`rankings-1280x800-dark.png`](after/rankings-1280x800-dark.png)
- [`rankings-768x1024-dark.png`](after/rankings-768x1024-dark.png)
- [`recap-1280x800-dark.png`](after/recap-1280x800-dark.png)
- [`recap-768x1024-dark.png`](after/recap-768x1024-dark.png)
- [`scouting-1280x800-dark.png`](after/scouting-1280x800-dark.png)
- [`scouting-768x1024-dark.png`](after/scouting-768x1024-dark.png)
- [`season-free-agents-1280x800-dark.png`](after/season-free-agents-1280x800-dark.png)
- [`season-free-agents-768x1024-dark.png`](after/season-free-agents-768x1024-dark.png)
- [`season-matchups-1280x800-dark.png`](after/season-matchups-1280x800-dark.png)
- [`season-matchups-768x1024-dark.png`](after/season-matchups-768x1024-dark.png)
- [`season-power-1280x800-dark.png`](after/season-power-1280x800-dark.png)
- [`season-power-768x1024-dark.png`](after/season-power-768x1024-dark.png)
- [`season-results-1280x800-dark.png`](after/season-results-1280x800-dark.png)
- [`season-results-768x1024-dark.png`](after/season-results-768x1024-dark.png)
- [`setup-1280x800-dark.png`](after/setup-1280x800-dark.png)
- [`setup-768x1024-dark.png`](after/setup-768x1024-dark.png)
- [`shooting-1280x800-dark.png`](after/shooting-1280x800-dark.png)
- [`shooting-768x1024-dark.png`](after/shooting-768x1024-dark.png)
- [`teams-1280x800-dark.png`](after/teams-1280x800-dark.png)
- [`teams-768x1024-dark.png`](after/teams-768x1024-dark.png)

### Light at 1440x900 and 390x844

- [`compare-1440x900-light.png`](after/compare-1440x900-light.png)
- [`compare-390x844-light.png`](after/compare-390x844-light.png)
- [`draft-1440x900-light.png`](after/draft-1440x900-light.png)
- [`draft-390x844-light.png`](after/draft-390x844-light.png)
- [`evidence-1440x900-light.png`](after/evidence-1440x900-light.png)
- [`evidence-390x844-light.png`](after/evidence-390x844-light.png)
- [`explorer-1440x900-light.png`](after/explorer-1440x900-light.png)
- [`explorer-390x844-light.png`](after/explorer-390x844-light.png)
- [`games-1440x900-light.png`](after/games-1440x900-light.png)
- [`games-390x844-light.png`](after/games-390x844-light.png)
- [`matchups-1440x900-light.png`](after/matchups-1440x900-light.png)
- [`matchups-390x844-light.png`](after/matchups-390x844-light.png)
- [`methodology-1440x900-light.png`](after/methodology-1440x900-light.png)
- [`methodology-390x844-light.png`](after/methodology-390x844-light.png)
- [`overview-1440x900-light.png`](after/overview-1440x900-light.png)
- [`overview-390x844-light.png`](after/overview-390x844-light.png)
- [`performers-1440x900-light.png`](after/performers-1440x900-light.png)
- [`performers-390x844-light.png`](after/performers-390x844-light.png)
- [`player-1440x900-light.png`](after/player-1440x900-light.png)
- [`player-390x844-light.png`](after/player-390x844-light.png)
- [`rankings-1440x900-light.png`](after/rankings-1440x900-light.png)
- [`rankings-390x844-light.png`](after/rankings-390x844-light.png)
- [`recap-1440x900-light.png`](after/recap-1440x900-light.png)
- [`recap-390x844-light.png`](after/recap-390x844-light.png)
- [`scouting-1440x900-light.png`](after/scouting-1440x900-light.png)
- [`scouting-390x844-light.png`](after/scouting-390x844-light.png)
- [`season-free-agents-1440x900-light.png`](after/season-free-agents-1440x900-light.png)
- [`season-free-agents-390x844-light.png`](after/season-free-agents-390x844-light.png)
- [`season-matchups-1440x900-light.png`](after/season-matchups-1440x900-light.png)
- [`season-matchups-390x844-light.png`](after/season-matchups-390x844-light.png)
- [`season-power-1440x900-light.png`](after/season-power-1440x900-light.png)
- [`season-power-390x844-light.png`](after/season-power-390x844-light.png)
- [`season-results-1440x900-light.png`](after/season-results-1440x900-light.png)
- [`season-results-390x844-light.png`](after/season-results-390x844-light.png)
- [`setup-1440x900-light.png`](after/setup-1440x900-light.png)
- [`setup-390x844-light.png`](after/setup-390x844-light.png)
- [`shooting-1440x900-light.png`](after/shooting-1440x900-light.png)
- [`shooting-390x844-light.png`](after/shooting-390x844-light.png)
- [`teams-1440x900-light.png`](after/teams-1440x900-light.png)
- [`teams-390x844-light.png`](after/teams-390x844-light.png)

### Reduced motion (1280x800)

- [`draft-1280x800-dark-reduced.png`](after/draft-1280x800-dark-reduced.png)
- [`explorer-1280x800-dark-reduced.png`](after/explorer-1280x800-dark-reduced.png)
- [`overview-1280x800-dark-reduced.png`](after/overview-1280x800-dark-reduced.png)
- [`season-free-agents-1280x800-dark-reduced.png`](after/season-free-agents-1280x800-dark-reduced.png)

### States: empty (fresh unlinked session), loading (API delayed 3 s, shot at 1 s), error (season endpoint returns 500)

- [`overview-1440x900-dark-empty.png`](after/overview-1440x900-dark-empty.png)
- [`overview-1440x900-dark-error.png`](after/overview-1440x900-dark-error.png)
- [`overview-1440x900-dark-loading.png`](after/overview-1440x900-dark-loading.png)
- [`overview-390x844-dark-empty.png`](after/overview-390x844-dark-empty.png)
- [`overview-390x844-dark-error.png`](after/overview-390x844-dark-error.png)
- [`overview-390x844-dark-loading.png`](after/overview-390x844-dark-loading.png)
- [`season-free-agents-1440x900-dark-empty.png`](after/season-free-agents-1440x900-dark-empty.png)
- [`season-free-agents-1440x900-dark-error.png`](after/season-free-agents-1440x900-dark-error.png)
- [`season-free-agents-1440x900-dark-loading.png`](after/season-free-agents-1440x900-dark-loading.png)
- [`season-free-agents-390x844-dark-empty.png`](after/season-free-agents-390x844-dark-empty.png)
- [`season-free-agents-390x844-dark-error.png`](after/season-free-agents-390x844-dark-error.png)
- [`season-free-agents-390x844-dark-loading.png`](after/season-free-agents-390x844-dark-loading.png)

### Images blocked (cdn.nba.com, a.espncdn.com): headshot and logo fallbacks

- [`draft-1440x900-dark-noimg.png`](after/draft-1440x900-dark-noimg.png)
- [`draft-390x844-dark-noimg.png`](after/draft-390x844-dark-noimg.png)
- [`explorer-1440x900-dark-noimg.png`](after/explorer-1440x900-dark-noimg.png)
- [`explorer-390x844-dark-noimg.png`](after/explorer-390x844-dark-noimg.png)
- [`overview-1440x900-dark-noimg.png`](after/overview-1440x900-dark-noimg.png)
- [`overview-390x844-dark-noimg.png`](after/overview-390x844-dark-noimg.png)
- [`performers-1440x900-dark-noimg.png`](after/performers-1440x900-dark-noimg.png)
- [`performers-390x844-dark-noimg.png`](after/performers-390x844-dark-noimg.png)
- [`player-1440x900-dark-noimg.png`](after/player-1440x900-dark-noimg.png)
- [`player-390x844-dark-noimg.png`](after/player-390x844-dark-noimg.png)
- [`season-free-agents-1440x900-dark-noimg.png`](after/season-free-agents-1440x900-dark-noimg.png)
- [`season-free-agents-390x844-dark-noimg.png`](after/season-free-agents-390x844-dark-noimg.png)
- [`season-matchups-1440x900-dark-noimg.png`](after/season-matchups-1440x900-dark-noimg.png)
- [`season-matchups-390x844-dark-noimg.png`](after/season-matchups-390x844-dark-noimg.png)

### Long name (Nickeil Alexander-Walker, player 1629638)

- [`player-1440x900-dark-longname.png`](after/player-1440x900-dark-longname.png)
- [`player-390x844-dark-longname.png`](after/player-390x844-dark-longname.png)

### Before, other viewports

- [`draft-1280x800-dark.png`](before/draft-1280x800-dark.png)
- [`draft-768x1024-dark.png`](before/draft-768x1024-dark.png)
- [`explorer-1280x800-dark.png`](before/explorer-1280x800-dark.png)
- [`explorer-768x1024-dark.png`](before/explorer-768x1024-dark.png)
- [`overview-1280x800-dark.png`](before/overview-1280x800-dark.png)
- [`overview-768x1024-dark.png`](before/overview-768x1024-dark.png)
- [`player-1280x800-dark.png`](before/player-1280x800-dark.png)
- [`player-768x1024-dark.png`](before/player-768x1024-dark.png)
- [`season-free-agents-1280x800-dark.png`](before/season-free-agents-1280x800-dark.png)
- [`season-free-agents-768x1024-dark.png`](before/season-free-agents-768x1024-dark.png)
- [`season-matchups-1280x800-dark.png`](before/season-matchups-1280x800-dark.png)
- [`season-matchups-768x1024-dark.png`](before/season-matchups-768x1024-dark.png)

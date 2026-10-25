import type { FreeAgentView, PlayerView, SeasonOverview, ActualLineView, GameLogsView, MinutesMetaView, MinutesView } from '../api/types'

export function makePlayer(id: string, name: string, team = 'BOS'): PlayerView {
  return {
    player_id: id,
    name,
    team,
    primary_position: 'PG',
    eligible_positions: ['PG', 'G'],
    eligibility_verified: true,
    injury_status: null,
    adp: null,
    rank: null,
    projection_source: 'demo',
    per_game: { MIN: 30 },
    per_game_sd: {},
    drafted_by: null,
    drafted_overall: null,
  } as PlayerView
}

export function makeActual(over: Partial<ActualLineView> = {}): ActualLineView {
  return {
    games: 2,
    per_game: { MIN: 30, PTS: 21, REB: 8, AST: 1, STL: 1, BLK: 1, FG3M: 2, FG3A: 4, FGM: 8, FGA: 9.5, FTM: 3, FTA: 3, TOV: 1 },
    fg_pct: 0.842,
    ft_pct: 1,
    value_actual: 16.8,
    value_proj: -1.6,
    value_delta: 18.4,
    ...over,
  }
}

export function makeFreeAgent(id: string, name: string, flags: string[] = [], actual: ActualLineView | null = null, minutes: MinutesView | null = null): FreeAgentView {
  return { player: makePlayer(id, name), score: 1.5, z: { PTS: 0.4 }, best_drop: makePlayer('d1', 'Bench Guy'), drop_value: 0.2, swap_delta: 1.3, injury_status: flags.includes('out') ? 'OUT' : 'ACTIVE', percent_owned: 12.5, flags, actual, drop_actual: null, minutes, drop_minutes: null }
}

export function makeMinutes(over: Partial<MinutesView> = {}): MinutesView {
  return { projected: 26.5, recent: 29.7, games: 2, used: 27.6, source: 'blend', ...over }
}

export const MINUTES_META: MinutesMetaView = { blend: true, k_games: 4, window_games: 10, overrides: 0, players_adjusted: 12 }

export function makeOverview(over: Partial<SeasonOverview> = {}): SeasonOverview {
  return {
    ids: { draft_revision: 1, strategy_revision: 0, league_revision: 1, last_seq: 1, snapshot_id: 'x', projection_version: 'v', seed: 1 },
    linked: true,
    league_name: 'L',
    synced_at: null,
    summary: null,
    warnings: [],
    current_period: 1,
    league_categories: [{ key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting', numerator: null, denominator: null }],
    manager_names: {},
    power: [],
    movement: {},
    matchups: [],
    user_matchup: null,
    ...over,
  }
}

/** Stored game-log meta fetched `hoursAgo` hours before now. */
export function makeGameLogs(hoursAgo: number, over: Partial<GameLogsView> = {}): GameLogsView {
  return { season: '2026-27', fetched_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(), rows: 812, max_game_date: '2026-10-24', ...over }
}

/** Two league categories, one of them lower-is-better, for detail-row and advanced-table tests. */
export const TWO_CATS: SeasonOverview['league_categories'] = [
  { key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting', numerator: null, denominator: null },
  { key: 'TOV', label: 'Turnovers', higher_is_better: false, kind: 'counting', numerator: null, denominator: null },
]

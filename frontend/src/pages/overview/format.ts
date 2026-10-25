/** Shared formatting and orientation helpers for the Overview's fantasy blocks. */
import type { CategoryDef, MatchupOddsView, TeamPowerView } from '@/fantasy/api/types'

/** A fraction as a whole percentage ("94%"); null stays missing. */
export const pct = (p: number | null | undefined): string => (p == null || Number.isNaN(p) ? '—' : `${Math.round(p * 100)}%`)

/** Inclusive band in which a category is a coin flip worth watching. */
export const CLOSE_MIN = 0.4
export const CLOSE_MAX = 0.6
export const isClose = (p: number | null | undefined): boolean => p != null && p >= CLOSE_MIN && p <= CLOSE_MAX

/** Manager display name; ESPN names can carry stray whitespace. */
export const managerName = (names: Record<string, string>, id: string): string => (names[id] ?? id).trim()

/** The odds seen from the user's side: the API reports them for manager A. */
export function oddsForUser(odds: MatchupOddsView, me: string) {
  const amA = odds.manager_a === me
  return {
    opponent: amA ? odds.manager_b : odds.manager_a,
    win: amA ? odds.p_win_a : odds.p_win_b,
    tie: odds.p_tie,
    lose: amA ? odds.p_win_b : odds.p_win_a,
    expectedMe: amA ? odds.expected_a : odds.expected_b,
    expectedThem: amA ? odds.expected_b : odds.expected_a,
    gamesMe: amA ? odds.games_a : odds.games_b,
    gamesThem: amA ? odds.games_b : odds.games_a,
    /** The user's chance of taking a category (null when the simulation has no value for it). */
    catP: (key: string): number | null => {
      const pa = odds.cat_p_a[key]
      return pa == null ? null : amA ? pa : 1 - pa
    },
  }
}

const VULNERABLE_COUNT = 3

/** The user's three lowest simulated category win chances against the league, weakest first. */
export function weakestCategories(power: TeamPowerView, categories: CategoryDef[], n = VULNERABLE_COUNT) {
  return categories
    .filter((c) => power.cat_win_prob[c.key] != null)
    .map((c) => ({ key: c.key, label: c.label, p: power.cat_win_prob[c.key] }))
    .sort((a, b) => a.p - b.p)
    .slice(0, n)
}

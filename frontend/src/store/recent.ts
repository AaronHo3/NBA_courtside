import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RecentPlayer = { player_id: number; full_name: string; team_abbreviation?: string | null; position?: string | null; at: number }

const MAX_RECENT = 8

type RecentState = {
  players: RecentPlayer[]
  touch: (p: Omit<RecentPlayer, 'at'>) => void
  clear: () => void
}

/** Recently viewed NBA players, newest first (Overview "pick up where you left off"). */
export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      players: [],
      touch: (p) =>
        set((s) => ({ players: [{ ...p, at: Date.now() }, ...s.players.filter((x) => x.player_id !== p.player_id)].slice(0, MAX_RECENT) })),
      clear: () => set({ players: [] }),
    }),
    { name: 'courtside-recent-v1' },
  ),
)

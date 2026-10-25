import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ComparePlayer = { player_id: number; full_name: string; team_abbreviation?: string | null }
export const MAX_COMPARE = 6

type CompareState = {
  players: ComparePlayer[]
  /** Namespace the group was built in; a different namespace (demo vs real) resets it. */
  namespace: string | null
  syncNamespace: (ns: string) => void
  add: (p: ComparePlayer) => boolean
  remove: (id: number) => void
  toggle: (p: ComparePlayer) => void
  set: (ps: ComparePlayer[]) => void
  clear: () => void
  has: (id: number) => boolean
}

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      players: [],
      namespace: null,
      syncNamespace: (ns) => {
        if (get().namespace === ns) return
        set({ namespace: ns, players: [] })  // a group saved under another (or unknown) namespace is stale
      },
      add: (p) => {
        const cur = get().players
        if (cur.some((x) => x.player_id === p.player_id)) return true
        if (cur.length >= MAX_COMPARE) return false
        set({ players: [...cur, p] })
        return true
      },
      remove: (id) => set({ players: get().players.filter((x) => x.player_id !== id) }),
      toggle: (p) => {
        if (get().has(p.player_id)) get().remove(p.player_id)
        else get().add(p)
      },
      set: (ps) => set({ players: ps.slice(0, MAX_COMPARE) }),
      clear: () => set({ players: [] }),
      has: (id) => get().players.some((x) => x.player_id === id),
    }),
    { name: 'courtside-compare-v2' },
  ),
)

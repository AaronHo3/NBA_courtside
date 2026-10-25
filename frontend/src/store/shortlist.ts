import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Which shortlist the workspace is working on. Shortlists live on the server (per namespace); the
 * browser only remembers the active id and the namespace it belongs to, so a namespace switch
 * never shows another namespace's list (same contract as the compare store).
 */
type ShortlistState = {
  activeId: string | null
  namespace: string | null
  setActive: (id: string | null) => void
  syncNamespace: (ns: string) => void
  clear: () => void
}

export const useShortlist = create<ShortlistState>()(
  persist(
    (set, get) => ({
      activeId: null,
      namespace: null,
      setActive: (id) => set({ activeId: id }),
      syncNamespace: (ns) => {
        if (get().namespace === ns) return
        set({ namespace: ns, activeId: null })
      },
      clear: () => set({ activeId: null, namespace: null }),
    }),
    { name: 'courtside-shortlist-v1' },
  ),
)

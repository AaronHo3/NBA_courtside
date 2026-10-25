import { useEffect } from 'react'
import { create } from 'zustand'

/** One breadcrumb segment a page contributes below its sidebar group, e.g. `{ label: 'Players', to: '/explorer' }`. */
export type Crumb = { label: string; to?: string }

type CrumbState = {
  parts: Crumb[]
  set: (parts: Crumb[]) => void
  clear: () => void
}

/** Page-provided breadcrumb tail (detail pages name their subject); the shell reads it for the breadcrumb and title. */
export const useCrumb = create<CrumbState>()((set) => ({
  parts: [],
  set: (parts) => set({ parts: parts.map((p) => ({ ...p })) }),
  clear: () => set({ parts: [] }),
}))

/**
 * Set the page's crumbs while it is mounted; `null` (still loading, not found) leaves the shell default.
 * Compared by value so callers can pass a fresh array literal every render.
 */
export function useSetCrumb(parts: Crumb[] | null): void {
  const key = parts ? JSON.stringify(parts) : null
  useEffect(() => {
    if (key === null) return
    const { set, clear } = useCrumb.getState()
    set(JSON.parse(key) as Crumb[])
    return clear
  }, [key])
}

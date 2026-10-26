// The copilot's "My league" views. Owned by the copilot; the shell (`components/layout/nav.ts`) re-exports them
// for the sidebar sub-items, breadcrumb and command palette.

export type SeasonTabId = 'matchups' | 'power' | 'free-agents' | 'results' | 'predictions'

/** The "My league" views: sidebar sub-items, the SeasonScreen tabs and the breadcrumb all read this. */
export const SEASON_TABS: Array<{ id: SeasonTabId; label: string }> = [
  { id: 'matchups', label: 'Matchups' },
  { id: 'power', label: 'Power rankings' },
  { id: 'free-agents', label: 'Free agents' },
  { id: 'results', label: 'Results' },
  { id: 'predictions', label: 'Track record' },
]

/** A `tab` query value as a season tab, falling back to the first (matchups). */
export function seasonTabFrom(raw: string | null | undefined): SeasonTabId {
  return SEASON_TABS.find((t) => t.id === raw)?.id ?? SEASON_TABS[0].id
}

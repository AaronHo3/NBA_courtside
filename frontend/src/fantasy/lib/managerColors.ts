// One accent colour per fantasy manager, for highlighting a team's rows across league-wide tables.
// Picked to stay distinguishable from each other on the dark surface and apart from the teal/coral
// signed-difference pair and the orange action colour of the design system.

export const MANAGER_PALETTE: readonly string[] = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#22c55e', // green
  '#ec4899', // pink
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
  '#8b5cf6', // violet
  '#f97316', // orange
  '#14b8a6', // teal-green
  '#e11d48', // rose
  '#eab308', // yellow
  '#60a5fa', // light blue
]

/** Manager id -> colour, assigned in list order so the mapping is stable for a given league. */
export function managerColors(managerIds: readonly string[]): Map<string, string> {
  return new Map(managerIds.map((id, i) => [id, MANAGER_PALETTE[i % MANAGER_PALETTE.length]]))
}

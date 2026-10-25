/**
 * Validated palette (dataviz skill reference instance). Categorical hues are assigned in fixed
 * order by entity, never cycled; scatter/bubble charts cap at three categorical series.
 */
/** Accent orange leads, then teal, amber, blue, violet, coral, green, grey; hues stay distinct under deuteranopia. */
export const CATEGORICAL_LIGHT = ['#d4621a', '#168a7c', '#b57a12', '#2a6fd6', '#6d4fc2', '#c9473a', '#2f7d32', '#6b6f76']
export const CATEGORICAL_DARK = ['#e8742a', '#2cb9a7', '#e0a63a', '#5b9cf6', '#a48cf0', '#ef6a5a', '#5fbf6a', '#9aa0a6']
export const SEQUENTIAL_BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
/** Blue (negative) ↔ neutral ↔ red (positive) for signed quantities such as FG% relative to league. */
export const DIVERGING_LIGHT = ['#0b4f47', '#168a7c', '#8fd3c9', '#ece9e3', '#f3b0a6', '#c9473a', '#7a2219']
export const DIVERGING_DARK = ['#9fe3d8', '#2cb9a7', '#176e63', '#2a2b2f', '#8c3a30', '#ef6a5a', '#f8b4aa']
export const STATUS = { good: '#2cb9a7', warning: '#e0a63a', serious: '#ef8a5a', critical: '#ef6a5a' }

export function categorical(theme: 'dark' | 'light'): string[] {
  return theme === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
}
export function diverging(theme: 'dark' | 'light'): string[] {
  return theme === 'dark' ? DIVERGING_DARK : DIVERGING_LIGHT
}
/** Plotly colorscale tuples from a hex list. */
export function toColorscale(hexes: string[]): Array<[number, string]> {
  const n = hexes.length - 1
  return hexes.map((h, i) => [i / n, h] as [number, string])
}

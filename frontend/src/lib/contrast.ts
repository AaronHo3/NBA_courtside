// WCAG 2.x contrast helpers used to keep the design tokens in src/index.css legible in both themes.
// scripts/contrast-report.mjs duplicates this math in plain JS; keep the two in step.

type Rgba = { r: number; g: number; b: number; a: number }

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const FUNC = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i

function parseColour(input: string): Rgba {
  const value = input.trim()
  const hex = HEX.exec(value)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    const n = Number.parseInt(digits, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const fn = FUNC.exec(value)
  if (fn) {
    const alpha = fn[4] == null ? 1 : fn[4].endsWith('%') ? Number.parseFloat(fn[4]) / 100 : Number.parseFloat(fn[4])
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: alpha }
  }
  throw new Error(`Unsupported colour: ${input}`)
}

function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(colour: string): number {
  const { r, g, b, a } = parseColour(colour)
  if (a < 1) throw new Error(`Composite translucent colour before measuring: ${colour}`)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two opaque colours (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Flattens a translucent colour over an opaque one; returns `#rrggbb`. */
export function composite(rgba: string, over: string): string {
  const top = parseColour(rgba)
  const base = parseColour(over)
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a)
  return toHex({ r: mix(top.r, base.r), g: mix(top.g, base.g), b: mix(top.b, base.b), a: 1 })
}

function blockBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`No "${selector}" block in stylesheet`)
  const open = css.indexOf('{', start)
  return css.slice(open + 1, css.indexOf('}', open))
}

function declarations(body: string): Record<string, string> {
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Record<string, string> = {}
  for (const match of stripped.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim()
  return out
}

/** Custom properties for a theme: the `:root` block, overlaid with the light block for 'light'. */
export function readThemeTokens(css: string, theme: 'dark' | 'light'): Record<string, string> {
  const base = declarations(blockBody(css, ':root'))
  return theme === 'light' ? { ...base, ...declarations(blockBody(css, ':root[data-theme="light"]')) } : base
}

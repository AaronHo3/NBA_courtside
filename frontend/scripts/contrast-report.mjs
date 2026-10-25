// Prints the token contrast matrix for both themes from src/index.css.
// Same math as src/lib/contrast.ts (duplicated so this runs with plain node); keep the two in step.
// Usage: node scripts/contrast-report.mjs
import { readFileSync } from 'node:fs'

const PAIRS = [
  ['--c-ink', '--c-page', 4.5], ['--c-ink', '--c-overlay', 4.5],
  ['--c-ink-2', '--c-page', 4.5], ['--c-ink-2', '--c-overlay', 4.5],
  ['--c-ink-3', '--c-page', 4.5], ['--c-ink-3', '--c-surface', 4.5], ['--c-ink-3', '--c-raised', 4.5], ['--c-ink-3', '--c-overlay', 4.5],
  ['--c-accent', '--c-page', 4.5], ['--c-accent', '--c-surface', 4.5], ['--c-accent', '--c-raised', 4.5],
  ['--c-accent-ink', '--c-accent', 4.5],
  ['--c-pos', '--c-page', 4.5], ['--c-pos', '--c-surface', 4.5], ['--c-neg', '--c-page', 4.5], ['--c-neg', '--c-surface', 4.5],
  ['--c-amber', '--c-page', 4.5], ['--c-amber', '--c-surface', 4.5],
  ['--c-on-fill', '--c-amber-fill', 4.5],
  ['--c-control-line', '--c-surface', 2.5],
]

function parse(value) {
  const v = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const d = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    const n = Number.parseInt(d, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(v)
  if (!fn) throw new Error(`Unsupported colour: ${value}`)
  const a = fn[4] == null ? 1 : fn[4].endsWith('%') ? Number.parseFloat(fn[4]) / 100 : Number.parseFloat(fn[4])
  return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a }
}
const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const hex = ({ r, g, b }) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

export function contrastRatio(fg, bg) {
  const [hi, lo] = [lum(parse(fg)), lum(parse(bg))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
export function composite(rgba, over) {
  const t = parse(rgba), b = parse(over)
  const mix = (x, y) => x * t.a + y * (1 - t.a)
  return hex({ r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b) })
}
function block(css, selector) {
  const open = css.indexOf('{', css.indexOf(`${selector} {`))
  const body = css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '')
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
export function readThemeTokens(css, theme) {
  const base = block(css, ':root')
  return theme === 'light' ? { ...base, ...block(css, ':root[data-theme="light"]') } : base
}

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
let failures = 0
for (const theme of ['dark', 'light']) {
  const t = readThemeTokens(css, theme)
  console.log(`\n${theme}`)
  for (const [fg, bg, min] of PAIRS) {
    const over = t[bg].startsWith('rgba') ? composite(t[bg], t['--c-surface']) : t[bg]
    const front = t[fg].startsWith('rgba') ? composite(t[fg], over) : t[fg]
    const ratio = contrastRatio(front, over)
    if (ratio < min) failures += 1
    console.log(`  ${ratio >= min ? 'pass' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}  ≥ ${min}  ${fg} on ${bg}`)
  }
}
process.exitCode = failures ? 1 : 0

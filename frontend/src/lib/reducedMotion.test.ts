import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// import.meta.url is not a file: URL under jsdom; resolve from this file's directory instead.
const SRC = resolve(__dirname, '..')
const FANTASY_STYLES = join(SRC, 'fantasy', 'styles')
const ANALYTICS = join(SRC, 'index.css')
const FANTASY_BASE = join(FANTASY_STYLES, 'base.css')
const ALL_SHEETS = [ANALYTICS, ...readdirSync(FANTASY_STYLES).filter((f) => f.endsWith('.css')).map((f) => join(FANTASY_STYLES, f))]

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (path: string) => stripComments(readFileSync(path, 'utf8'))

/** Bodies of every `@media (prefers-reduced-motion: reduce) { … }` block, brace-matched. */
function reducedMotionBlocks(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{/g)) {
    const start = (m.index ?? 0) + m[0].length
    let depth = 1
    let i = start
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push(css.slice(start, i - 1))
  }
  return out
}

/** True when a block has a rule whose selector list includes the universal selector and whose body sets `prop: none !important`. */
function neutralisesGlobally(block: string, prop: 'animation' | 'transition'): boolean {
  const rules = block.matchAll(/([^{}]+)\{([^{}]*)\}/g)
  for (const [, selector, body] of rules) {
    const selectors = selector.split(',').map((s) => s.trim())
    if (!selectors.includes('*')) continue
    if (new RegExp(`(^|;|\\s)${prop}\\s*:\\s*none\\s*!important`).test(body)) return true
  }
  return false
}

const keyframeNames = (css: string) => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])

describe('reduced motion coverage', () => {
  it.each([['src/index.css', ANALYTICS], ['src/fantasy/styles/base.css', FANTASY_BASE]])('%s neutralises every animation and transition under prefers-reduced-motion', (_name, path) => {
    const blocks = reducedMotionBlocks(read(path))
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.some((b) => neutralisesGlobally(b, 'animation'))).toBe(true)
    expect(blocks.some((b) => neutralisesGlobally(b, 'transition'))).toBe(true)
  })

  it('finds the keyframes added by the redesign, so the global rule is what covers them', () => {
    const names = new Set(ALL_SHEETS.flatMap((p) => keyframeNames(read(p))))
    for (const name of ['drawer-in', 'drawer-scrim-in', 'fade-in', 'pop-in', 'rise-in', 'shimmer']) expect(names).toContain(name)
  })

  it('no animation outside a reduced-motion block is !important (which would defeat the global rule)', () => {
    for (const path of ALL_SHEETS) {
      const css = read(path)
      const outside = reducedMotionBlocks(css).reduce((acc, b) => acc.replace(b, ''), css)
      expect({ path, hits: outside.match(/animation[\w-]*\s*:[^;}]*!important/g) ?? [] }).toEqual({ path, hits: [] })
    }
  })

  it('the skeleton keeps a static fill when motion is reduced', () => {
    expect(reducedMotionBlocks(read(ANALYTICS)).some((b) => /\.skeleton\s*\{[^}]*background\s*:/.test(b))).toBe(true)
  })
})

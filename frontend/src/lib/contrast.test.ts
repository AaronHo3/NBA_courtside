import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { contrastRatio, composite, readThemeTokens } from './contrast'

// import.meta.url is not a file: URL under jsdom; resolve from this file's directory instead.
const SRC = resolve(__dirname, '..')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const PAIRS: Array<[fg: string, bg: string, min: number]> = [
  ['--c-ink', '--c-page', 4.5], ['--c-ink', '--c-overlay', 4.5],
  ['--c-ink-2', '--c-page', 4.5], ['--c-ink-2', '--c-overlay', 4.5],
  ['--c-ink-3', '--c-page', 4.5], ['--c-ink-3', '--c-surface', 4.5], ['--c-ink-3', '--c-raised', 4.5], ['--c-ink-3', '--c-overlay', 4.5],
  ['--c-accent', '--c-page', 4.5], ['--c-accent', '--c-surface', 4.5], ['--c-accent', '--c-raised', 4.5], ['--c-accent', '--c-overlay', 4.5],
  ['--c-accent-ink', '--c-accent', 4.5],
  ['--c-pos', '--c-page', 4.5], ['--c-pos', '--c-surface', 4.5], ['--c-neg', '--c-page', 4.5], ['--c-neg', '--c-surface', 4.5],
  ['--c-amber', '--c-page', 4.5], ['--c-amber', '--c-surface', 4.5],
  ['--c-on-fill', '--c-amber-fill', 4.5],
  ['--c-control-line', '--c-surface', 2.5],
]

describe.each(['dark', 'light'] as const)('%s theme text contrast', (theme) => {
  const t = readThemeTokens(css, theme)
  it.each(PAIRS)('%s on %s ≥ %s', (fg, bg, min) => {
    expect(t[fg], `${fg} is defined`).toBeDefined()
    expect(t[bg], `${bg} is defined`).toBeDefined()
    const over = t[bg].startsWith('rgba') ? composite(t[bg], t['--c-surface']) : t[bg]
    const front = t[fg].startsWith('rgba') ? composite(t[fg], over) : t[fg]
    expect(contrastRatio(front, over)).toBeGreaterThanOrEqual(min)
  })
})

describe('contrast math', () => {
  it('black on white is 21:1 and identical colours are 1:1', () => {
    expect(contrastRatio('#000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('rgb(18, 19, 20)', '#121314')).toBeCloseTo(1, 5)
  })
  it('composites rgba over an opaque colour', () => {
    expect(composite('rgba(255, 255, 255, 0.5)', '#000000')).toBe('#808080')
    expect(composite('rgba(0,0,0,0)', '#123456')).toBe('#123456')
  })
  it('overlays the light block on the dark :root block', () => {
    const tokens = readThemeTokens(':root { --a: #111; --b: #222; } :root[data-theme="light"] { --a: #eee; }', 'light')
    expect(tokens['--a']).toBe('#eee')
    expect(tokens['--b']).toBe('#222')
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'test' ? [] : sourceFiles(full)
    if (/\.test\.(ts|tsx)$/.test(name)) return []
    return /\.(ts|tsx|css)$/.test(name) ? [full] : []
  })
}

it('ink-4 is never used as a text colour', () => {
  const offenders = sourceFiles(SRC).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, at: `${file.slice(SRC.length + 1)}:${i + 1}` }))
      .filter(({ line }) => /\btext-ink-4\b|(?:^|[\s;{])color:\s*var\(--(?:c-)?ink-4\)/.test(line))
      .map(({ at }) => at),
  )
  expect(offenders).toEqual([])
})

// Guard for DEC-31: the copilot never imports analytics-side modules. Research pages reach the copilot
// through `src/lib/fantasyBridge.ts`; the reverse direction must not exist.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FANTASY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = /\.(ts|tsx)$/
const TEST = /\.test\.(ts|tsx)$/
// static imports/exports (`from '…'`), side-effect imports (`import '…'`) and dynamic `import('…')`
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return SOURCE.test(name) && !TEST.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

function violations(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(SPECIFIER)]
    .map((m) => m[1])
    .filter((spec) => {
      if (spec.startsWith('@/')) return true
      if (!spec.startsWith('.')) return false // packages
      const target = resolve(dirname(file), spec)
      return target !== FANTASY_ROOT && !target.startsWith(FANTASY_ROOT + sep)
    })
    .map((spec) => `${relative(FANTASY_ROOT, file).split(sep).join('/')} → ${spec}`)
}

describe('fantasy isolation', () => {
  it('finds the copilot sources', () => {
    expect(sourceFiles(FANTASY_ROOT).length).toBeGreaterThan(20)
  })

  it('no copilot module imports from outside src/fantasy', () => {
    expect(sourceFiles(FANTASY_ROOT).flatMap(violations)).toEqual([])
  })
})

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * View-defining state lives in the URL so any view is shareable. Each hook reads one key and
 * writes it back with `replace` so filter twiddling does not flood history.
 */
export function useParam(key: string, fallback = ''): [string, (v: string | null | undefined) => void] {
  const [sp, setSp] = useSearchParams()
  const value = sp.get(key) ?? fallback
  const set = useCallback(
    (v: string | null | undefined) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (v === null || v === undefined || v === '' || v === fallback) next.delete(key)
          else next.set(key, v)
          return next
        },
        { replace: true },
      )
    },
    [key, fallback, setSp],
  )
  return [value, set]
}

export function useNumberParam(key: string, fallback: number): [number, (v: number | null) => void] {
  const [raw, setRaw] = useParam(key, String(fallback))
  const n = Number(raw)
  const value = Number.isFinite(n) ? n : fallback
  const set = useCallback((v: number | null) => setRaw(v === null ? null : String(v)), [setRaw])
  return [value, set]
}

export function useBoolParam(key: string, fallback = false): [boolean, (v: boolean) => void] {
  const [raw, setRaw] = useParam(key, fallback ? '1' : '0')
  const set = useCallback((v: boolean) => setRaw(v ? '1' : '0'), [setRaw])
  return [raw === '1' || raw === 'true', set]
}

export function useListParam(key: string): [number[], (ids: number[]) => void] {
  const [raw, setRaw] = useParam(key, '')
  const ids = useMemo(() => raw.split(',').map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0), [raw])
  const set = useCallback((next: number[]) => setRaw(next.length ? next.join(',') : null), [setRaw])
  return [ids, set]
}

export function parseIds(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
}

/** Reset every param except the global season context. */
export function useResetParams(keep: string[] = ['season', 'type']) {
  const [, setSp] = useSearchParams()
  return useCallback(() => {
    setSp(
      (prev) => {
        const next = new URLSearchParams()
        for (const k of keep) {
          const v = prev.get(k)
          if (v) next.set(k, v)
        }
        return next
      },
      { replace: true },
    )
  }, [keep, setSp])
}

import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

/** True on phone-width viewports, where 30 direct labels cannot fit a scatter; callers fall back to hover. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(QUERY).matches : false))
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

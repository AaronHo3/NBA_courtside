import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerSearch } from '@/hooks/useApi'
import type { PlayerSearchHit } from '@/lib/types'
import { clsx } from 'clsx'

type Props = {
  placeholder?: string
  onSelect?: (p: PlayerSearchHit) => void
  className?: string
  autoFocus?: boolean
  inputId?: string
}

/** Typeahead over /api/players/search. Default action: open the player profile. */
export function PlayerSearch({ placeholder = 'Search players', onSelect, className, autoFocus, inputId }: Props) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 150); return () => clearTimeout(t) }, [q])
  const res = usePlayerSearch(debounced)
  const hits = res.data?.data ?? []
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const choose = (p: PlayerSearchHit) => {
    setOpen(false)
    setQ('')
    if (onSelect) onSelect(p)
    else navigate(`/players/${p.player_id}`)
  }
  return (
    <div ref={ref} className={clsx('relative', className)}>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="player-search-list"
        aria-autocomplete="list"
        autoFocus={autoFocus}
        className="control w-full text-sm"
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && hits[active]) { e.preventDefault(); choose(hits[active]) }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && debounced && (
        <ul id="player-search-list" role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-[var(--radius-control)] border border-line-strong bg-surface py-1 text-sm">
          {res.isLoading && <li className="px-3 py-2 text-ink-3">Searching…</li>}
          {!res.isLoading && hits.length === 0 && <li className="px-3 py-2 text-ink-3">No players match “{debounced}”.</li>}
          {hits.map((p, i) => (
            <li
              key={p.player_id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(p) }}
              className={clsx('flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5', i === active && 'bg-accent-soft')}
            >
              <span className="text-ink">{p.full_name}</span>
              <span className="text-xs text-ink-3">{[p.position, p.team_abbreviation, p.is_active ? 'active' : `${p.from_year}–${p.to_year}`].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

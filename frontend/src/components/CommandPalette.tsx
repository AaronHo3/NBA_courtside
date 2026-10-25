import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { usePlayerSearch } from '@/hooks/useApi'
import { ALL_NAV_ITEMS, navGroupOf, navHref } from '@/components/layout/nav'
import { Portrait, nbaHeadshotUrl } from '@/components/ui'

type Item = { key: string; kind: 'player' | 'page'; label: string; detail: string; href: string; playerId?: number; team?: string | null }

/**
 * ⌘K palette: players (existing /players/search) and pages. Keyboard: ↑ ↓ Enter Esc.
 * Opened from the shell button or the shortcut; closes on navigation.
 */
export function CommandPalette({ open, onClose, sessionId }: { open: boolean; onClose: () => void; sessionId: string | null }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 120); return () => clearTimeout(t) }, [q])
  useEffect(() => { if (open) { setQ(''); setDebounced(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  const res = usePlayerSearch(open ? debounced : '', 6)
  const items = useMemo<Item[]>(() => {
    const needle = debounced.toLowerCase()
    const pages: Item[] = ALL_NAV_ITEMS.filter((n) => !needle || `${n.label} ${n.hint} ${navGroupOf(n.id)?.label ?? ''}`.toLowerCase().includes(needle))
      .slice(0, needle ? 6 : 8)
      .map((n) => ({ key: `page:${n.id}`, kind: 'page', label: n.label, detail: [navGroupOf(n.id)?.label, n.hint].filter(Boolean).join(' · '), href: navHref(n, sessionId) }))
    const players: Item[] = (res.data?.data ?? []).map((p) => ({
      key: `player:${p.player_id}`, kind: 'player', label: p.full_name, playerId: p.player_id, team: p.team_abbreviation,
      detail: [p.position, p.team_abbreviation, p.is_active ? 'active' : `${p.from_year}–${p.to_year}`].filter(Boolean).join(' · '), href: `/players/${p.player_id}`,
    }))
    return [...players, ...pages]
  }, [debounced, res.data, sessionId])
  useEffect(() => { setActive(0) }, [items.length])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const go = (it: Item) => { onClose(); navigate(it.href) }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Search players and pages" className="rise-in w-full max-w-xl overflow-hidden rounded-[var(--radius-panel)] border border-line-strong bg-surface shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <span className="text-ink-3" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-label="Search players and pages"
            className="h-12 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            placeholder="Search players or jump to a page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active]) }
            }}
          />
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-3">esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[60vh] overflow-auto py-1">
          {res.isLoading && debounced && <li className="px-3 py-2 text-xs text-ink-3">Searching players…</li>}
          {items.map((it, i) => (
            <li
              key={it.key}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); go(it) }}
              className={clsx('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', i === active ? 'bg-accent-soft text-ink' : 'text-ink-2')}
            >
              {it.kind === 'player' ? <Portrait name={it.label} src={it.playerId != null ? nbaHeadshotUrl(it.playerId) : null} team={it.team} size="xs" ring={false} /> : <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-raised text-[10px] text-ink-3">↗</span>}
              <span className="min-w-0 flex-1 truncate text-ink">{it.label}</span>
              <span className="truncate text-xs text-ink-3">{it.detail}</span>
            </li>
          ))}
          {!items.length && !res.isLoading && <li className="px-3 py-3 text-sm text-ink-3">Nothing matches “{debounced}”.</li>}
        </ul>
      </div>
    </div>
  )
}

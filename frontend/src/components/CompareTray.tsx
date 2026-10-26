import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { GitCompare, X } from 'lucide-react'
import { useCompare, MAX_COMPARE } from '@/store/compare'
import { useChartTheme } from '@/components/charts/Plot'
import { Button } from './ui'
import { useDialogFocus } from './ui/useDialogFocus'

const EMPTY_HINT = 'Add players from the explorer or a profile'

/** Closes an open popover on an outside click (Escape is handled by `useDialogFocus`). */
function useOutsideClick(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, close, ref])
}

/**
 * The comparison group as one control: `Compare · n/6`, opening a popover with the players and the way to
 * compare them. Non-modal: focus moves into the popover on open, Tab wraps while inside, and Escape (or any
 * close) returns focus to the trigger.
 */
export function CompareTray({ className }: { className?: string }) {
  const { players, remove, clear } = useCompare()
  const { series } = useChartTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const empty = players.length === 0
  const isOpen = open && !empty
  useOutsideClick(isOpen, close, ref)
  useDialogFocus(popoverRef, isOpen, close, false)

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-disabled={empty || undefined}
        title={empty ? EMPTY_HINT : undefined}
        onClick={() => { if (!empty) setOpen((o) => !o) }}
        className={clsx(
          't-fast press inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] border px-2.5 text-xs font-medium tnum',
          empty ? 'cursor-default border-line text-ink-3' : 'border-line-strong bg-surface text-ink hover:border-accent',
        )}
      >
        <GitCompare size={14} strokeWidth={1.75} aria-hidden="true" className={empty ? 'text-ink-3' : 'text-accent'} />
        <span className="max-sm:sr-only">Compare ·</span>{' '}{players.length}/{MAX_COMPARE}
      </button>
      {isOpen && (
        <div ref={popoverRef} role="dialog" aria-label="Comparison group" className="pop-in absolute right-0 top-full z-30 mt-1.5 w-72 rounded-[var(--radius-panel)] border border-line-strong bg-surface p-2 shadow-[var(--shadow-float)]">
          <ul className="flex flex-col gap-px" aria-label="Players in the comparison group">
            {players.map((p, i) => (
              <li key={p.player_id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-ink hover:bg-raised">
                <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: series[i % series.length] }} />
                <Link to={`/players/${p.player_id}`} onClick={close} className="min-w-0 flex-1 truncate hover:underline">{p.full_name}</Link>
                {p.team_abbreviation && <span className="text-meta text-ink-3">{p.team_abbreviation}</span>}
                <button type="button" aria-label={`Remove ${p.full_name} from comparison`} onClick={() => remove(p.player_id)} className="t-fast rounded p-0.5 text-ink-3 hover:text-critical">
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            <Button size="sm" variant="ghost" onClick={() => { clear(); close() }}>Clear</Button>
            <Link to={`/compare?ids=${players.map((p) => p.player_id).join(',')}`} onClick={close} className="text-xs font-medium text-accent hover:underline">
              Open comparison
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

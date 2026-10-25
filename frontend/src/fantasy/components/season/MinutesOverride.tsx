import { useState } from 'react'
import type { Strategy } from '../../api/types'
import { Icon } from '../ui/Icon'

const MAX_MINUTES = 48

interface MinutesOverrideProps {
  playerId: string
  playerName: string
  strategy: Strategy
  /** Saves the whole strategy (overrides live in `minutes_overrides`); resolves once the server accepted it. */
  onSave: (next: Strategy) => Promise<unknown>
}

/** Pin a player's minutes per game for every season screen (0 = benched). Lives in the strategy, so it is revisioned and undoable like any other setting.
 *  The parent keys this on player + current override so the draft resets when either changes. */
export function MinutesOverride({ playerId, playerName, strategy, onSave }: MinutesOverrideProps) {
  const overrides = strategy.minutes_overrides ?? {}
  const current = overrides[playerId]
  const [draft, setDraft] = useState<string>(current === undefined ? '' : String(current))
  const [busy, setBusy] = useState(false)
  const value = draft === '' ? null : Number(draft)
  const valid = value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_MINUTES
  const save = async (next: Record<string, number>) => {
    setBusy(true)
    try {
      await onSave({ ...strategy, minutes_overrides: next })
    } finally {
      setBusy(false)
    }
  }
  const inputId = `minutes-override-${playerId}`
  return (
    <span className="field" style={{ gap: 6 }}>
      <label htmlFor={inputId} className="small-text">
        Override minutes
      </label>
      <input id={inputId} type="number" min={0} max={MAX_MINUTES} step={0.5} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ width: 64 }} aria-label={`Override minutes for ${playerName}`} placeholder="min" />
      <button type="button" className="small" disabled={busy || !valid || value === current} onClick={() => valid && value !== null && void save({ ...overrides, [playerId]: value })}>
        <Icon name="check" size={12} /> Apply
      </button>
      {current !== undefined && (
        <button type="button" className="small ghost" disabled={busy} onClick={() => void save(Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== playerId)))}>
          <Icon name="close" size={12} /> Clear override
        </button>
      )}
    </span>
  )
}

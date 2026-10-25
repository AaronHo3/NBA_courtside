import { useEffect, useState } from 'react'
import type { Strategy } from '../../api/types'
import { fmtNum } from '../../lib/format'
import { Icon } from '../ui/Icon'

const MAX_MINUTES = 48
const SAVED_MS = 3000

interface MinutesOverrideProps {
  playerId: string
  playerName: string
  strategy: Strategy
  /** Minutes the ranking would use without an override (shown as the placeholder). */
  defaultMinutes?: number | null
  /** Saves the whole strategy (overrides live in `minutes_overrides`); resolves true once the server accepted it and the ranking reloaded. */
  onSave: (next: Strategy) => Promise<boolean>
}

/** Pin a player's minutes per game for every season screen (0 = benched). Lives in the strategy, so it is revisioned and undoable like any other setting.
 *  The parent keys this on the player; the draft resets whenever the stored override changes. */
export function MinutesOverride({ playerId, playerName, strategy, defaultMinutes = null, onSave }: MinutesOverrideProps) {
  const overrides = strategy.minutes_overrides ?? {}
  const current = overrides[playerId]
  const [draft, setDraft] = useState<string>(current === undefined ? '' : String(current))
  const [seen, setSeen] = useState(current)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  if (seen !== current) {
    setSeen(current)
    setDraft(current === undefined ? '' : String(current))
  }
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), SAVED_MS)
    return () => clearTimeout(t)
  }, [saved])
  const value = draft === '' ? null : Number(draft)
  const valid = value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_MINUTES
  const invalid = draft !== '' && !valid
  const save = async (next: Record<string, number>) => {
    setBusy(true)
    setSaved(false)
    try {
      setSaved(await onSave({ ...strategy, minutes_overrides: next }))
    } finally {
      setBusy(false)
    }
  }
  const inputId = `minutes-override-${playerId}`
  const errorId = `${inputId}-error`
  return (
    <span className="field minutes-override">
      <label htmlFor={inputId} className="small-text">
        Override minutes
      </label>
      <input
        id={inputId}
        type="number"
        min={0}
        max={MAX_MINUTES}
        step={0.5}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setSaved(false)
        }}
        aria-label={`Override minutes for ${playerName}`}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        placeholder={defaultMinutes === null || defaultMinutes === undefined ? 'min' : `projected ${fmtNum(defaultMinutes, 1)}`}
      />
      <button type="button" className="small" disabled={busy || !valid || value === current} onClick={() => valid && value !== null && void save({ ...overrides, [playerId]: value })}>
        <Icon name="check" size={12} /> Apply
      </button>
      {current !== undefined && (
        <button type="button" className="small ghost" disabled={busy} onClick={() => void save(Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== playerId)))}>
          <Icon name="close" size={12} /> Clear override
        </button>
      )}
      {invalid && (
        <span id={errorId} className="minutes-error" role="alert">
          Enter minutes between 0 and {MAX_MINUTES}
        </span>
      )}
      {saved && (
        <span className="minutes-saved" role="status">
          <Icon name="check" size={12} /> Saved · ranking refreshed
        </span>
      )}
    </span>
  )
}

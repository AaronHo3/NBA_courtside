import { Disclosure } from '../ui/Disclosure'

const LEAD = 3

interface RecReasonsProps {
  reasons: string[]
  /** Model notes from the fast ranking and, when current, the refinement. */
  notes: string[]
}

/** The three strongest reasons up front; the rest and the model notes behind one disclosure. */
export function RecReasons({ reasons, notes }: RecReasonsProps) {
  const lead = reasons.slice(0, LEAD)
  const rest = reasons.slice(LEAD)
  if (lead.length === 0 && notes.length === 0) return null
  return (
    <div className="rec-reasons-wrap">
      {lead.length > 0 && (
        <ul className="rec-reasons" aria-label="Reasons">
          {lead.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {(rest.length > 0 || notes.length > 0) && (
        <Disclosure summary="All reasons and model notes" testId="rec-more-reasons">
          {rest.length > 0 && (
            <ul className="rec-reasons" aria-label="More reasons">
              {rest.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <ul className="rec-notes" aria-label="Model notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Disclosure>
      )}
    </div>
  )
}

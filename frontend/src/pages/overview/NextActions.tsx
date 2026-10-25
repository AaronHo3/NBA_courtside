import { Link } from 'react-router-dom'
import { Panel } from '@/components/ui'

export type NextAction = { label: string; detail?: string; href: string }

/** Where to go from here; every link points at a copilot screen for data the Overview already has. */
export function NextActions({ actions }: { actions: NextAction[] }) {
  return (
    <Panel tone="plain" question="Next actions">
      <ul data-testid="next-actions" className="flex flex-col divide-y divide-line">
        {actions.map((a) => (
          <li key={a.href}>
            <Link to={a.href} className="t-fast group flex min-h-[44px] items-center justify-between gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink group-hover:text-accent">{a.label}</span>
                {a.detail && <span className="truncate text-xs text-ink-3">{a.detail}</span>}
              </span>
              <span aria-hidden="true" className="text-accent">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

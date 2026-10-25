import type { ReactNode } from 'react'
import { Panel } from '@/components/ui'
import type { SectionId } from './sections'

/** A methodology section: anchored, titled with the question it answers, with a one-line method. */
export function Section({ id, question, method, actions, children }: { id: SectionId; question: string; method?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-52 lg:scroll-mt-20">
      <Panel question={question} method={method} actions={actions}>{children}</Panel>
    </div>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="max-w-prose text-sm text-ink-2">{children}</p>
}

export function Formula({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <figure className="my-2 max-w-prose">
      <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-raised px-3 py-2 text-[13px] text-ink"><code>{children}</code></pre>
      {label && <figcaption className="mt-1 text-xs text-ink-3">{label}</figcaption>}
    </figure>
  )
}

export function Dl({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid max-w-prose grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Ul({ items }: { items: ReactNode[] }) {
  return (
    <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-ink-2">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-raised px-1 py-0.5 text-[12px] text-ink">{children}</code>
}

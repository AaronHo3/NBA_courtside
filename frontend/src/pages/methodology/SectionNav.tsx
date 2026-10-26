import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { SECTIONS, type SectionId } from './sections'

/** Anchor navigation; highlights the section nearest the top of the viewport. */
export function SectionNav() {
  const [active, setActive] = useState<SectionId>(SECTIONS[0].id)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]
        if (top) setActive(top[0] as SectionId)
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: [0, 0.1] },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])
  return (
    <nav aria-label="On this page" className="min-w-0 lg:sticky lg:top-16 lg:self-start">
      <ol className="flex gap-1 overflow-x-auto pb-1 text-xs lg:flex-col lg:gap-0.5 lg:pb-0">
        {SECTIONS.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'location' : undefined}
              className={clsx('block min-h-7 whitespace-nowrap rounded-[var(--radius-control)] px-2 py-1.5', active === s.id ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink')}
            >
              <span className="tnum text-ink-3">{i + 1}.</span> {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

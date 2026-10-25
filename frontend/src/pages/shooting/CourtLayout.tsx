import type { ReactNode } from 'react'
import { useContainerWidth } from '@/components/court/useContainerWidth'

/** Right column width and the layout width at which it moves beside the court (about a 1024px viewport with the sidebar). */
export const ASIDE_WIDTH = 360
export const SPLIT_MIN_WIDTH = 700

/**
 * Court on the left, `aside` in a fixed 360px column on the right once the panel is wide enough;
 * stacked (court first) below that. Measured on the container, so it follows the panel, not the viewport.
 */
export function CourtLayout({ court, aside }: { court: ReactNode; aside: ReactNode }) {
  const [ref, width] = useContainerWidth<HTMLDivElement>(1024)
  const split = width >= SPLIT_MIN_WIDTH
  return (
    <div
      ref={ref}
      data-testid="shooting-layout"
      data-layout={split ? 'split' : 'stacked'}
      className={split ? 'grid items-start gap-5' : 'flex flex-col gap-5'}
      style={split ? { gridTemplateColumns: `minmax(0, 1fr) ${ASIDE_WIDTH}px` } : undefined}
    >
      <div className="min-w-0" data-testid="shooting-court">{court}</div>
      {aside}
    </div>
  )
}

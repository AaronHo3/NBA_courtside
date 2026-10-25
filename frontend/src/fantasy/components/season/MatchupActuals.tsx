import { useId } from 'react'
import type { CategoryDef, WeekSideView } from '../../api/types'
import { categoryLabel, fmtCategoryValue, fmtNum } from '../../lib/format'

interface MatchupActualsProps {
  categories: CategoryDef[]
  /** Sides in the same order as the projected bars (left, right). */
  left: { name: string; side: WeekSideView | null }
  right: { name: string; side: WeekSideView | null }
}

/**
 * ESPN's running category totals for the week, kept apart from the simulated odds.
 * Rates arrive from the API already computed as summed makes ÷ summed attempts.
 */
export function MatchupActuals({ categories, left, right }: MatchupActualsProps) {
  const headingId = useId()
  const cell = (side: WeekSideView | null, key: string) => {
    const won = side?.results[key] === 'WIN'
    return (
      <td className={`num${won ? ' won' : ''}`}>
        {fmtCategoryValue(key, side?.values[key])}
        {won && <span className="visually-hidden"> (leading)</span>}
      </td>
    )
  }
  return (
    <section className="mc-section mc-actual" aria-labelledby={headingId}>
      <h4 className="mc-section-title" id={headingId}>
        Actual totals <span className="mc-section-note">(ESPN, running)</span>
      </h4>
      <table className="grid mc-actual-table">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="num">
              {left.name}
            </th>
            <th scope="col" className="num">
              {right.name}
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.key} data-testid={`actual-${c.key}`}>
              <th scope="row" title={c.higher_is_better ? undefined : 'lower is better'}>
                {categoryLabel(c.key, categories)}
              </th>
              {cell(left.side, c.key)}
              {cell(right.side, c.key)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Categories leading</th>
            <td className="num">{fmtNum(left.side?.cats_won, 1)}</td>
            <td className="num">{fmtNum(right.side?.cats_won, 1)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mc-note muted">FG% and FT% are the week's summed makes ÷ summed attempts. A tied category counts half.</p>
    </section>
  )
}

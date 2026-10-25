import type { ActualLineView, ActualsMetaView, PlayerView } from '../../api/types'
import { fmtDate, fmtNum, fmtPct, fmtSigned } from '../../lib/format'

const COLS: Array<{ key: string; label: string; digits?: number }> = [
  { key: 'MIN', label: 'MIN', digits: 1 },
  { key: 'PTS', label: 'PTS' },
  { key: 'REB', label: 'REB' },
  { key: 'AST', label: 'AST' },
  { key: 'STL', label: 'STL' },
  { key: 'BLK', label: 'BLK' },
  { key: 'FG3M', label: '3PM' },
]

function pct(makes: number, attempts: number): string {
  return attempts ? fmtPct(makes / attempts) : '—'
}

function Side({ label, player, actual }: { label: string; player: PlayerView; actual: ActualLineView | null | undefined }) {
  const pg = player.per_game
  return (
    <>
      <tr className="swap-actuals-head">
        <th scope="row" colSpan={2 + COLS.length + 4}>
          {label}: {player.name}
        </th>
      </tr>
      <tr>
        <th scope="row">Actual</th>
        {actual ? (
          <>
            <td className="num">{actual.games}</td>
            {COLS.map((c) => (
              <td key={c.key} className="num">
                {fmtNum(actual.per_game[c.key], c.digits ?? 1)}
              </td>
            ))}
            <td className="num">{actual.fg_pct === null ? '—' : fmtPct(actual.fg_pct)}</td>
            <td className="num">{actual.ft_pct === null ? '—' : fmtPct(actual.ft_pct)}</td>
            <td className="num">
              <b>{fmtNum(actual.value_actual, 1)}</b>
            </td>
            <td className={`num ${actual.value_delta > 0.5 ? 'pos' : actual.value_delta < -0.5 ? 'neg' : ''}`}>{fmtSigned(actual.value_delta, 1)}</td>
          </>
        ) : (
          <td className="muted" colSpan={1 + COLS.length + 4}>
            no games in the window
          </td>
        )}
      </tr>
      <tr className="muted">
        <th scope="row">Projected</th>
        <td className="num">—</td>
        {COLS.map((c) => (
          <td key={c.key} className="num">
            {fmtNum(pg[c.key], c.digits ?? 1)}
          </td>
        ))}
        <td className="num">{pct(pg.FGM, pg.FGA)}</td>
        <td className="num">{pct(pg.FTM, pg.FTA)}</td>
        <td className="num">{actual ? fmtNum(actual.value_proj, 1) : '—'}</td>
        <td className="num">—</td>
      </tr>
    </>
  )
}

/** Both sides of the proposed swap, actual per game in the actuals window against the snapshot projection. */
export function SwapActuals({ add, addActual, drop, dropActual, meta }: { add: PlayerView; addActual: ActualLineView | null | undefined; drop: PlayerView | null; dropActual: ActualLineView | null | undefined; meta: ActualsMetaView }) {
  const window = meta.scope === 'week' ? `week ${meta.period} (${meta.window_start} to ${meta.window_end})` : `season to date (through ${meta.window_end})`
  return (
    <div className="swap-actuals" data-testid="swap-actuals">
      <p className="muted small-text">
        Actual production, {window}; logs through {meta.max_game_date ?? '—'}, refreshed {fmtDate(meta.fetched_at).slice(0, 16)}. Value is per game on the projection's scale; Δ is actual minus projected.
      </p>
      <div className="table-wrap">
        <table className="grid compact" aria-label="Actual vs projected for the proposed swap">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="num">GP</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className="num">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="num">FG%</th>
              <th scope="col" className="num">FT%</th>
              <th scope="col" className="num">Value</th>
              <th scope="col" className="num">Δ</th>
            </tr>
          </thead>
          <tbody>
            <Side label="Add" player={add} actual={addActual} />
            {drop && <Side label="Drop" player={drop} actual={dropActual} />}
          </tbody>
        </table>
      </div>
    </div>
  )
}

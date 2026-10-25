import { forwardRef } from 'react'
import type { ActualsMetaView, CategoryDef, FreeAgentView, Strategy } from '../../api/types'
import { categoryLabel, fmtNum, fmtSigned, positionsText } from '../../lib/format'
import { minutesTitle } from '../../lib/minutes'
import { Diverging, DivergingPair } from '../charts/Diverging'
import { Badge } from '../common/Badge'
import { ChartFrame } from '../ui/ChartFrame'
import { Icon } from '../ui/Icon'
import { PlayerIdentity } from '../ui/PlayerIdentity'
import { MinutesOverride } from './MinutesOverride'
import { SwapActuals } from './SwapActuals'
import { NET_HELP, VALUE_HELP } from './FreeAgentsTable'

/** The free-agent response may carry the drop's category z (`drop_z`); until it does, the chart shows the add side only and says so. */
type SwapAgent = FreeAgentView & { drop_z?: Record<string, number> | null }

interface SwapPanelProps {
  agent: SwapAgent
  categories: CategoryDef[]
  actuals: ActualsMetaView | null
  actualMode: boolean
  strategy: Strategy | null
  onSaveStrategy: (next: Strategy) => Promise<boolean>
  onOpen: (playerId: string) => void
}

const fmtZ = (v: number) => v.toFixed(1)

function MinutesLine({ agent }: { agent: SwapAgent }) {
  const m = agent.minutes
  return (
    <span className="muted small-text" title={minutesTitle(m, agent.player.per_game.MIN)}>
      Minutes used <b>{fmtNum(m ? m.used : (agent.player.per_game.MIN ?? null), 1)}</b>
      {m ? ` · projected ${fmtNum(m.projected, 1)}` : ' · projected'}
      {m && m.recent !== null && m.recent !== undefined ? ` · last ${m.games} game${m.games === 1 ? '' : 's'} ${fmtNum(m.recent, 1)}` : ''}
      {m?.source === 'override' ? ' · your override' : ''}
    </span>
  )
}

function CategoryChart({ agent, categories }: { agent: SwapAgent; categories: CategoryDef[] }) {
  const drop = agent.best_drop
  const sub = (c: CategoryDef) => (c.higher_is_better ? undefined : 'lower is better')
  if (drop && agent.drop_z) {
    const dropZ = agent.drop_z
    return (
      <DivergingPair
        rows={categories.map((c) => ({ id: c.key, label: categoryLabel(c.key, categories), a: agent.z[c.key] ?? null, b: dropZ[c.key] ?? null, sublabel: sub(c) }))}
        nameA={`Add ${agent.player.name}`}
        nameB={`Drop ${drop.name}`}
        format={fmtZ}
        unit="z"
        negativeLabel="below pool"
        positiveLabel="above pool"
      />
    )
  }
  return (
    <>
      <Diverging
        rows={categories.map((c) => ({ id: c.key, label: categoryLabel(c.key, categories), value: agent.z[c.key] ?? null, sublabel: sub(c) }))}
        format={fmtZ}
        unit="z (season value vs league pool)"
        negativeLabel="below pool"
        positiveLabel="above pool"
      />
      {drop && <p className="muted small-text swap-chart-note">Bars show {agent.player.name}; the category breakdown for {drop.name} is not in the free-agent response, so only the drop's total value is shown.</p>}
    </>
  )
}

/** The proposed add/drop for the selected free agent: both sides, the net change, category z, minutes and actuals. */
export const SwapPanel = forwardRef<HTMLDivElement, SwapPanelProps>(function SwapPanel({ agent, categories, actuals, actualMode, strategy, onSaveStrategy, onOpen }, ref) {
  const drop = agent.best_drop
  const title = drop ? `Add ${agent.player.name}, drop ${drop.name}` : `Add ${agent.player.name}`
  const tone = agent.swap_delta > 0 ? 'good' : agent.swap_delta < 0 ? 'bad' : ''
  const defaultMinutes = agent.minutes ? agent.minutes.projected : (agent.player.per_game.MIN ?? null)
  return (
    <div ref={ref} className="swap-anchor">
      <ChartFrame
        title={title}
        description="Value is weighted z: season-total z-scores summed over your league's categories, vs the ~200-player pool. The drop is the roster player whose loss costs you least."
        testId="swap-panel"
        className="swap-frame"
      >
        <div className="swap">
          <div className="swap-sides">
            <div className="swap-side add">
              <span className="swap-k">
                <Icon name="arrow-up" size={13} /> Add
              </span>
              <PlayerIdentity name={agent.player.name} team={agent.player.team} positions={agent.player.eligible_positions} espnId={agent.player.espn_id} size={40} meta={agent.percent_owned != null ? `${fmtNum(agent.percent_owned, 0)}% owned` : undefined} />
              <span className="swap-val" title={VALUE_HELP}>
                value <b>{fmtNum(agent.score, 2)}</b>
              </span>
              {agent.flags.includes('out') && <Badge tone="error">OUT</Badge>}
              {agent.flags.includes('day-to-day') && <Badge tone="warn">day-to-day</Badge>}
            </div>
            <Icon name="swap" size={20} className="swap-icon" />
            <div className="swap-side drop">
              <span className="swap-k">
                <Icon name="arrow-down" size={13} /> Drop
              </span>
              {drop ? (
                <>
                  <PlayerIdentity name={drop.name} team={drop.team} positions={drop.eligible_positions} espnId={drop.espn_id} size={40} />
                  <span className="swap-val" title={VALUE_HELP}>
                    value <b>{fmtNum(agent.drop_value, 2)}</b>
                  </span>
                </>
              ) : (
                <span className="muted">No drop needed (open roster spot)</span>
              )}
            </div>
            <div className={`swap-net ${tone}`}>
              <span className="swap-k">Net Δ</span>
              <span className="swap-big">{fmtSigned(agent.swap_delta, 2)}</span>
              <span className="muted small-text">weighted z · {NET_HELP}</span>
            </div>
          </div>
          <div className="swap-cats swap-chart">
            <CategoryChart agent={agent} categories={categories} />
          </div>
        </div>
        {!actualMode && (
          <div className="swap-minutes" data-testid="swap-minutes">
            <MinutesLine agent={agent} />
            {strategy && <MinutesOverride key={agent.player.player_id} playerId={agent.player.player_id} playerName={agent.player.name} strategy={strategy} defaultMinutes={defaultMinutes} onSave={onSaveStrategy} />}
          </div>
        )}
        {actuals && <SwapActuals add={agent.player} addActual={agent.actual} drop={drop} dropActual={agent.drop_actual} meta={actuals} />}
        <div className="swap-foot">
          <button type="button" className="small" onClick={() => onOpen(agent.player.player_id)}>
            <Icon name="eye" size={13} /> Player details
          </button>
          <span className="muted small-text">
            {agent.player.team ?? 'FA'} · {positionsText(agent.player.eligible_positions)} · {agent.injury_status ?? 'status unknown'}
          </span>
        </div>
      </ChartFrame>
    </div>
  )
})

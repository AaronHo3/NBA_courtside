import type { ReactNode } from 'react'
import type { CandidateView, DraftStateView } from '../../api/types'
import { managerName, userIsOnClock } from '../../lib/draftState'
import { fmtNum, positionsText } from '../../lib/format'
import { selectRecCurrent, selectRefineCurrent, useDraftStore } from '../../store/draftStore'
import { Badge } from '../common/Badge'
import { PlayerName } from '../common/PlayerName'
import { Portrait } from '../performers/Portrait'
import { Tooltip } from '../ui/Tooltip'
import { ImpactBars, type ImpactRow } from './ImpactBars'
import { RecReasons } from './RecReasons'

/** Fixed so refinement, preview and recalculation never move the page under the cursor. */
const CARD_MIN_HEIGHT = '300px'
const NO_NOTES: string[] = []
const KEY_STATS = ['PTS', 'REB', 'AST'] as const
const SHORT_LABEL: Record<string, string> = { FG3M: '3PM', FG_PCT: 'FG%', FT_PCT: 'FT%' }

function impactRows(state: DraftStateView, c: CandidateView): ImpactRow[] {
  return (state.league.categories ?? []).map((cat) => ({
    key: cat.key,
    label: SHORT_LABEL[cat.key] ?? cat.key,
    value: c.contributions[cat.key] ?? null,
    lowerIsBetter: !cat.higher_is_better,
  }))
}

interface RecommendationCardProps {
  /** Rendered at the right of the header, e.g. the "My team" drawer launcher. */
  headerAside?: ReactNode
}

/** Hero card: who to take now (or the previewed player), projection, value and category impact, one primary action. */
export function RecommendationCard({ headerAside }: RecommendationCardProps) {
  const state = useDraftStore((s) => s.state)
  const rec = useDraftStore((s) => s.rec)
  const recStatus = useDraftStore((s) => s.recStatus)
  const recError = useDraftStore((s) => s.recError)
  const current = useDraftStore(selectRecCurrent)
  const refineNotes = useDraftStore((s) => (selectRefineCurrent(s) && s.refineResult ? s.refineResult.notes : NO_NOTES))
  const pendingCommit = useDraftStore((s) => s.pendingCommit)
  const previewPlayerId = useDraftStore((s) => s.previewPlayerId)
  const previewCandidate = useDraftStore((s) => s.rec?.preview_candidate ?? s.previewCandidate)
  const setPreview = useDraftStore((s) => s.setPreview)
  const toggleCompare = useDraftStore((s) => s.toggleCompare)
  const compareIds = useDraftStore((s) => s.compareIds)
  const commitPick = useDraftStore((s) => s.commitPick)
  const previewing = previewPlayerId !== null && previewCandidate !== null && previewCandidate.player_id === previewPlayerId
  // While recalculating, the last ranking stays on screen (dimmed, not draftable) so the card keeps its shape.
  const h = previewing ? previewCandidate : rec?.highlighted ?? null
  const espnId = useDraftStore((s) => (h ? s.players[h.player_id]?.espn_id ?? null : null))
  if (!state) return null

  const onClock = userIsOnClock(state)
  const alternatives = !previewing && current && rec && h ? rec.shortlist.filter((a) => a.player_id !== h.player_id).slice(0, 3) : []
  const draftDisabledReason = pendingCommit
    ? 'A pick is still saving.'
    : !current
      ? 'Recalculating for the current board…'
      : !onClock
        ? `${managerName(state, state.on_clock_manager_id)} is on the clock. Record their pick first${previewing ? '.' : '; this is your best pick when your turn comes.'}`
        : null
  const kicker = previewing ? `Previewing ${previewCandidate.name}` : 'Best pick now'

  return (
    <section className={current ? 'rec-card' : 'rec-card stale'} style={{ minHeight: CARD_MIN_HEIGHT }} aria-labelledby="rec-h" data-testid="rec-card" aria-busy={!current}>
      <div className="rec-top">
        <h3 id="rec-h" className="rec-kicker">
          {kicker}
        </h3>
        {previewing && (
          <button type="button" className="link-button" onClick={() => setPreview(null)}>
            Back to recommendation
          </button>
        )}
        {!current && <Badge testId="rec-updating">recalculating…</Badge>}
        <span className="spacer" />
        {headerAside}
      </div>
      {!current && recStatus === 'error' && (
        <p className="callout error" role="alert">
          Recommendation failed: {recError}
        </p>
      )}
      {!h && !current && recStatus !== 'error' && <p className="muted">Ranking players for the current board…</p>}
      {!h && current && <div className="empty-state">No available players fit your remaining roster.</div>}
      {h && (
        <>
          <div className="rec-head">
            <Portrait name={h.name} espnId={espnId} team={h.team} size={52} />
            <div className="rec-id">
              <div className="rec-name" data-testid="rec-name" data-player-id={h.player_id}>
                <PlayerName playerId={h.player_id} name={h.name} />
              </div>
              <div className="rec-sub">
                <span>
                  {h.team ?? 'FA'} · {positionsText(h.eligible_positions)}
                  {h.slot ? ` · fills ${h.slot === 'BENCH' ? 'bench' : h.slot}` : ''}
                </span>
                {!h.completion_ok && <Badge tone="warn">completion risk</Badge>}
                {!h.eligibility_verified && <Badge tone="warn">eligibility unverified</Badge>}
                {h.flags.map((f) => (
                  <Badge key={f}>{f}</Badge>
                ))}
              </div>
            </div>
            <div className="rec-actions">
              <button
                type="button"
                className="primary"
                data-testid="rec-draft"
                disabled={draftDisabledReason !== null}
                title={draftDisabledReason ?? `Draft ${h.name} for ${managerName(state, state.league.user_manager_id)}`}
                onClick={() => void commitPick(h.player_id, state.league.user_manager_id)}
              >
                Draft to my team
              </button>
              <button type="button" data-testid="rec-preview" onClick={() => setPreview(previewPlayerId === h.player_id ? null : h.player_id, h)} aria-pressed={previewPlayerId === h.player_id}>
                Preview
              </button>
              <button type="button" onClick={() => toggleCompare(h.player_id)} aria-pressed={compareIds.includes(h.player_id)}>
                {compareIds.includes(h.player_id) ? 'In compare' : 'Compare'}
              </button>
            </div>
          </div>
          {draftDisabledReason && <p className="rec-why-disabled">{draftDisabledReason}</p>}
          <div className="rec-blocks">
            <section className="rec-block" aria-labelledby="rec-proj-h">
              <h4 id="rec-proj-h">Projected</h4>
              <dl className="rec-stats">
                <div>
                  <dt>GP</dt>
                  <dd className="tnum">{fmtNum(h.games, 0)}</dd>
                </div>
                <div>
                  <dt>MIN</dt>
                  <dd className="tnum">{fmtNum(h.minutes, 1)}</dd>
                </div>
                {KEY_STATS.map((k) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className="tnum">{fmtNum(h.per_game[k], 1)}</dd>
                  </div>
                ))}
              </dl>
              <p className="rec-block-foot">per game · {h.projection_source}</p>
            </section>
            <section className="rec-block" aria-labelledby="rec-value-h">
              <h4 id="rec-value-h">Fantasy value</h4>
              <Tooltip content="Weighted z above the best player likely to be available at your next pick; ± one standard deviation from the projection model.">
                <span className="rec-value" tabIndex={0}>
                  <span className="tnum">{fmtNum(h.score, 2)}</span> <span className="sd tnum">± {fmtNum(h.value_sd, 2)}</span>
                </span>
              </Tooltip>
              <p className="rec-block-foot">above replacement{h.replacement_name ? ` (${h.replacement_name})` : ''}</p>
              <p className="rec-avail">{h.survival_hint}</p>
            </section>
            <section className="rec-block rec-impact" aria-labelledby="rec-impact-h">
              <h4 id="rec-impact-h">Category impact</h4>
              <ImpactBars rows={impactRows(state, h)} />
            </section>
          </div>
          <RecReasons reasons={h.reasons} notes={[...(current && rec ? rec.notes : NO_NOTES), ...refineNotes]} />
          {alternatives.length > 0 && (
            <div className="rec-alts" aria-label="Alternatives">
              <span className="muted">Next best:</span>
              {alternatives.map((a) => (
                <span key={a.player_id}>
                  <PlayerName playerId={a.player_id} name={a.name} />{' '}
                  <span className="muted tnum">
                    {fmtNum(a.score, 2)} · {a.slot ?? '—'}
                    {a.tier === h.tier ? ' · same tier' : ''}
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

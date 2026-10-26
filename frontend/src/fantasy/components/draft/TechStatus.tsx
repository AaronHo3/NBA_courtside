import { useShallow } from 'zustand/react/shallow'
import { fmtDate, fmtNum } from '../../lib/format'
import { selectRecCurrent, selectRefineCurrent, selectTier, useDraftStore, type DraftStore, type SaveStatus } from '../../store/draftStore'

const SAVE_TEXT: Record<SaveStatus, string> = { saved: 'saved', saving: 'saving…', offline: 'offline · unsaved pick', error: 'save error' }
const SAVE_TONE: Record<SaveStatus, string> = { saved: 'ok', saving: 'busy', offline: 'bad', error: 'bad' }

function refineText(s: DraftStore, budgetS: string): { text: string; title?: string } {
  if (s.refineUnavailable) return { text: 'refine unavailable' }
  const job = s.refineJob
  if (selectRefineCurrent(s) && s.refineResult) {
    const took = job?.elapsedMs ?? s.refineResult.computed_ms
    return { text: `refined ${(took / 1000).toFixed(1)} s`, title: `${s.refineResult.scenarios} scenarios · ${s.refineResult.opponent_model}` }
  }
  if (job && (job.status === 'queued' || job.status === 'running')) return { text: `refining ${budgetS} s` }
  if (job?.status === 'failed') return { text: 'refine failed', title: job.error ?? undefined }
  if (job?.status === 'timeout') return { text: 'refine timed out' }
  return { text: `refine ${budgetS} s` }
}

/** One quiet meta line: ranking time, tier, refinement, save state, format and data date; revision ids in the title. */
export function TechStatus() {
  const state = useDraftStore((s) => s.state)
  const rec = useDraftStore((s) => s.rec)
  const current = useDraftStore(selectRecCurrent)
  const tier = useDraftStore(useShallow(selectTier))
  const refine = useDraftStore(useShallow((s) => refineText(s, ((s.state?.strategy.sim_budget_ms ?? 0) / 1000).toFixed(1))))
  const saveStatus = useDraftStore((s) => s.saveStatus)
  const pending = useDraftStore((s) => s.pendingCommit)
  const retry = useDraftStore((s) => s.retryPending)
  const snapshot = useDraftStore((s) => s.snapshot)
  if (!state) return null
  const revisions = [
    `draft r${state.draft_revision}`,
    `strategy r${state.strategy_revision}`,
    `league r${state.league_revision}`,
    `seq ${state.last_seq}`,
    rec ? `ranking ids: draft r${rec.ids.draft_revision}, strategy r${rec.ids.strategy_revision}, snapshot ${rec.ids.snapshot_id}, projections ${rec.ids.projection_version}, seed ${rec.ids.seed}` : 'no ranking yet',
  ].join(' · ')
  const noTeam = !state.league.managers.some((m) => m.id === state.league.user_manager_id)
  const format = state.league.scoring_format.replace('h2h_', 'H2H ').replace(/_/g, ' ')

  return (
    <div className="tech-status" role="status" aria-label="Model and save status" title={revisions} data-testid="tech-status">
      <span>{current && rec ? `fast ranking ${fmtNum(rec.computed_ms, 0)} ms` : 'ranking…'}</span>
      <span className="sep">·</span>
      <span data-testid="top-tier" title={tier.label}>
        {tier.tier === '—' ? 'tier —' : `tier ${tier.tier}`}
      </span>
      <span className="sep">·</span>
      <span title={refine.title}>{refine.text}</span>
      <span className="sep">·</span>
      <span className={`save ${SAVE_TONE[saveStatus]}`} data-testid="top-save-status">
        {SAVE_TEXT[saveStatus]}
      </span>
      {pending && saveStatus !== 'saving' && (
        <button type="button" className="small" onClick={() => void retry()}>
          Retry save
        </button>
      )}
      <span className="spacer" />
      <span>
        {format}{' '}
        <span className={state.format_confirmed ? 'fmt ok' : 'fmt warn'} data-testid="top-format">
          {state.format_confirmed ? 'confirmed' : 'NOT confirmed'}
        </span>
      </span>
      <span className="sep">·</span>
      <span title={`${snapshot?.label ?? ''} · ${snapshot ? fmtDate(snapshot.created_at) : ''}`}>data {snapshot ? fmtDate(snapshot.created_at).slice(0, 10) : '…'}</span>
      {noTeam && <span className="save bad">no team selected</span>}
    </div>
  )
}

import { useTeams } from '@/hooks/useApi'
import { PlayerSearch } from '@/components/PlayerSearch'
import { Badge, Button, Segmented, Select } from '@/components/ui'
import type { CompareMode, ShootingState, View } from './state'

const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: 'none', label: 'No comparison' },
  { value: 'player', label: 'Another player' },
  { value: 'season', label: 'Same subject, another season' },
  { value: 'team', label: 'A team' },
]

/** Subject A (player or team) and the optional subject B, plus the view switch. */
export function SubjectPicker({ st, labelA, labelB }: { st: ShootingState; labelA: string; labelB: string }) {
  const teams = useTeams()
  const teamList = teams.data?.data ?? []
  const kindA = st.subjectA?.kind ?? (st.team ? 'team' : 'player')
  const otherSeasons = st.seasonsWithShots.filter((s) => s !== st.season)
  const needsSeasonB = st.compareMode === 'season'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Subject A</span>
          <Segmented ariaLabel="Subject A type" value={kindA} onChange={(k) => st.chooseA(k, null)} options={[{ value: 'player', label: 'Player' }, { value: 'team', label: 'Team' }]} />
        </div>
        {kindA === 'player' ? (
          <div className="flex flex-col gap-1 text-xs text-ink-3 w-64 max-w-full">
            <span>Player</span>
            <PlayerSearch placeholder="Search a player" onSelect={(p) => st.chooseA('player', p.player_id)} />
          </div>
        ) : (
          <Select label="Team" value={st.team} onChange={(e) => st.chooseA('team', Number(e.target.value) || null)}>
            <option value="">Choose a team</option>
            {teamList.map((t) => <option key={t.team_id} value={t.team_id}>{t.full_name}</option>)}
          </Select>
        )}
        {st.subjectA && (
          <div className="flex items-center gap-2 pb-1.5">
            <Badge tone="accent">A · {labelA}</Badge>
            <Button size="sm" variant="ghost" onClick={() => st.chooseA(kindA, null)} aria-label="Clear subject A">Clear</Button>
          </div>
        )}
      </div>
      {st.subjectA && (
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Compare with" value={st.compareMode} onChange={(e) => { st.setCmp(e.target.value); st.setSelected(null) }}>
            {COMPARE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {st.compareMode === 'player' && (
            <div className="flex flex-col gap-1 text-xs text-ink-3 w-64 max-w-full">
              <span>Player B</span>
              <PlayerSearch placeholder="Search a player" onSelect={(p) => st.setPlayerB(String(p.player_id))} />
            </div>
          )}
          {st.compareMode === 'team' && (
            <Select label="Team B" value={st.teamB} onChange={(e) => st.setTeamB(e.target.value)}>
              <option value="">Choose a team</option>
              {teamList.map((t) => <option key={t.team_id} value={t.team_id}>{t.full_name}</option>)}
            </Select>
          )}
          {st.compareMode !== 'none' && (
            <Select label={needsSeasonB ? 'Season for B' : 'Season for B (optional)'} value={st.seasonB} onChange={(e) => st.setSeasonB(e.target.value)}>
              {!needsSeasonB && <option value="">Same as A ({st.season})</option>}
              {needsSeasonB && !st.seasonB && <option value="">Choose a season</option>}
              {(needsSeasonB ? otherSeasons : st.seasonsWithShots).map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
          {st.subjectB && <div className="pb-1.5"><Badge>B · {labelB}</Badge></div>}
          {st.subjectB && (
            <div className="flex flex-col gap-1 text-xs text-ink-3">
              <span>View</span>
              <Segmented<View> ariaLabel="Comparison view" value={st.view} onChange={(v) => st.setView(v)} options={[{ value: 'single', label: 'A only' }, { value: 'side', label: 'Side by side' }, { value: 'diff', label: 'Difference (A − B)' }]} />
            </div>
          )}
          {st.compareMode === 'season' && otherSeasons.length === 0 && <span className="pb-2 text-xs text-ink-3">No other season has shot detail for this season type.</span>}
        </div>
      )}
    </div>
  )
}

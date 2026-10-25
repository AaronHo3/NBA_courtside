import { useState } from 'react'
import type { TeamPowerView } from '../../api/types'
import { categoryLabel, fmtNum, fmtPct, fmtSigned } from '../../lib/format'
import { probabilityTone } from '../../lib/scale'
import { useSeasonStore } from '../../store/seasonStore'
import { Diverging, DivergingPair } from '../charts/Diverging'
import { Heatmap, type HeatLead } from '../charts/Heatmap'
import { ChartFrame } from '../ui/ChartFrame'
import { Icon } from '../ui/Icon'

const CATS_INFO = 'Expected categories won per week against the league-average opponent over 600 simulated weeks (common random numbers). Rank follows this number.'
const MOVE_INFO = 'Rank change since the last sync that changed a roster. Up arrows climbed; a dot means no change.'
const SCALE_NOTE = '0–100% chance to win the category against the league-average opponent; 40–60% is a toss-up.'
const zText = (v: number) => fmtSigned(v, 1).replace(/^[+-]/, '')
const teamName = (t: TeamPowerView) => `${t.name}${t.is_user ? ' (you)' : ''}`

/** Power rankings as a sortable team × category heatmap; pick a row to compare that team with yours, category by category. */
export function PowerTab() {
  const overview = useSeasonStore((s) => s.overview)
  const [selected, setSelected] = useState<string | null>(null)
  if (!overview) return null
  const cats = overview.league_categories
  const byId = new Map(overview.power.map((t) => [t.manager_id, t]))
  const hasMovement = Object.values(overview.movement).some((v) => v !== 0)
  const me = overview.power.find((t) => t.is_user) ?? null
  const picked = selected ? byId.get(selected) ?? null : null
  const other = picked && me && picked.manager_id !== me.manager_id ? picked : null
  const profile = other ? null : picked ?? me
  const lead: HeatLead[] = [
    { key: 'rank', label: '#', numeric: true, firstDir: 'asc', sortValue: (id) => byId.get(id)?.rank, render: (id) => String(byId.get(id)?.rank ?? '') },
    {
      key: 'team',
      label: 'Team',
      header: true,
      sortValue: (id) => byId.get(id)?.name,
      render: (id) => {
        const t = byId.get(id)
        return t ? teamName(t) : id
      },
    },
    { key: 'cats', label: 'Cats / week', numeric: true, info: CATS_INFO, sortValue: (id) => byId.get(id)?.expected_cats, render: (id) => fmtNum(byId.get(id)?.expected_cats, 2) },
    {
      key: 'mv',
      label: 'Move',
      numeric: true,
      info: MOVE_INFO,
      sortValue: (id) => (hasMovement ? overview.movement[id] ?? 0 : null),
      render: (id) => {
        const mv = overview.movement[id] ?? 0
        if (!hasMovement) return <span className="muted" title="Movement appears once a later sync changes a roster">—</span>
        if (mv === 0) return <span className="muted" aria-label="no change">·</span>
        return (
          <span className={mv > 0 ? 'pos' : 'neg'} aria-label={`${mv > 0 ? 'up' : 'down'} ${Math.abs(mv)}`}>
            <Icon name={mv > 0 ? 'arrow-up' : 'arrow-down'} size={12} /> {Math.abs(mv)}
          </span>
        )
      },
    },
    { key: 'ir', label: 'IR', numeric: true, sortValue: (id) => byId.get(id)?.n_ir, render: (id) => String(byId.get(id)?.n_ir || '') },
  ]
  const lowerNote = (higher: boolean) => (higher ? '' : ' · lower is better')
  return (
    <div className="stack power-tab">
      <ChartFrame
        title="Power rankings"
        description="Expected categories won per week against the league-average opponent, over 600 simulated weeks with common random numbers. Each cell is the chance of winning that category. Click a header to sort; pick a team to compare it with yours."
        help="Rank is by expected categories per week. Movement is the rank change since the last sync that changed a roster, so it appears only after such a sync."
        legend={[{ label: 'you', swatch: 'mine' }]}
      >
        <Heatmap
          caption="Power rankings"
          testId="power-table"
          rows={overview.power.map((t) => ({ id: t.manager_id, label: t.name, className: t.is_user ? 'mine' : undefined }))}
          columns={cats.map((c) => ({ key: c.key, label: categoryLabel(c.key, cats), title: c.kind === 'ratio' ? `${c.numerator} ÷ ${c.denominator}` : c.higher_is_better ? undefined : 'lower is better' }))}
          value={(id, k) => byId.get(id)?.cat_win_prob[k]}
          format={fmtPct}
          tone={probabilityTone}
          intensity={(v) => Math.min(1, Math.max(0, v))}
          lead={lead}
          scaleNote={SCALE_NOTE}
          selectedId={(other ?? profile)?.manager_id ?? null}
          onSelect={setSelected}
          sortable
          defaultSort={{ key: 'cats', dir: 'desc' }}
        />
      </ChartFrame>
      {other && me && (
        <ChartFrame
          title={`${me.name} vs ${other.name}`}
          description={`Roster z-score per category against the league pool, both teams on one shared scale. Under each category: each team's chance to win it against the league-average opponent.`}
          actions={
            <button type="button" className="small" onClick={() => setSelected(null)}>
              Clear
            </button>
          }
          testId="power-compare"
        >
          <DivergingPair
            rows={cats.map((c) => ({
              id: c.key,
              label: categoryLabel(c.key, cats),
              a: me.z[c.key] ?? null,
              b: other.z[c.key] ?? null,
              sublabel: `${fmtPct(me.cat_win_prob[c.key])} vs ${fmtPct(other.cat_win_prob[c.key])}${lowerNote(c.higher_is_better)}`,
            }))}
            nameA={me.name}
            nameB={other.name}
            format={zText}
            unit="z"
          />
        </ChartFrame>
      )}
      {profile && (
        <ChartFrame
          title={`${teamName(profile)}: category profile`}
          description={`Roster z-score per category against the league pool. ${profile.n_players} players${profile.n_ir ? `, ${profile.n_ir} on IR` : ''}. Pick another team above to compare it with yours.`}
          testId="power-profile"
        >
          <Diverging
            rows={cats.map((c) => ({ id: c.key, label: categoryLabel(c.key, cats), value: profile.z[c.key] ?? null, sublabel: `${fmtPct(profile.cat_win_prob[c.key])} to win${lowerNote(c.higher_is_better)}` }))}
            format={zText}
            unit="z"
            negativeLabel="weakness"
            positiveLabel="strength"
          />
        </ChartFrame>
      )}
    </div>
  )
}

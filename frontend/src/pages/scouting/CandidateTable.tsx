import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Badge, Button } from '@/components/ui'
import type { CandidateRow } from '@/lib/types'
import { contributionShares, coverageChip, eligibilityLabel, formatTraitValue, traitLabel } from './model'

const numeric = { meta: { numeric: true } }

export function CandidateTable({ rows, traitUnits, traitLabels = {}, onAdd, inShortlist }: { rows: CandidateRow[]; traitUnits: Record<string, string>; traitLabels?: Record<string, string>; onAdd?: (row: CandidateRow) => void; inShortlist?: (id: number) => boolean }) {
  const traitKeys = useMemo(() => (rows[0] ? Object.keys(rows[0].traits) : []), [rows])
  const columns = useMemo<ColumnDef<CandidateRow, unknown>[]>(() => [
    {
      // Server order is the match ranking; the rank number rides in the pinned player column.
      id: 'player', header: 'Player', accessorFn: (_r, i) => i,
      cell: (c) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="w-6 shrink-0 text-right tnum text-ink-3">{c.row.index + 1}</span>
          <Link to={`/players/${c.row.original.player_id}`} className="text-ink hover:underline">{c.row.original.full_name ?? `Player ${c.row.original.player_id}`}</Link>
        </span>
      ),
    },
    { id: 'team', header: 'Team', accessorKey: 'team_abbreviation' },
    { id: 'pos', header: 'Pos', accessorKey: 'position' },
    { id: 'score', header: 'Match score', accessorFn: (r) => r.score ?? -1, cell: (c) => <span className="tnum">{c.row.original.score === null ? '–' : c.row.original.score.toFixed(1)}</span>, ...numeric },
    { id: 'eligible', header: 'Eligibility', accessorFn: (r) => (r.eligible ? 1 : 0), cell: (c) => { const r = c.row.original; const e = eligibilityLabel({ eligible: r.eligible, missing: r.missing.map((k) => traitLabel(traitLabels, k)) }); return <Badge tone={e.tone}>{e.text}</Badge> } },
    ...traitKeys.map<ColumnDef<CandidateRow, unknown>>((k) => ({
      id: k, header: traitLabel(traitLabels, k), accessorFn: (r) => r.traits[k]?.value ?? null,
      cell: (c) => { const t = c.row.original.traits[k]; return <span className={t?.qualified ? 'tnum' : 'tnum text-ink-3'}>{formatTraitValue(traitUnits[k] ?? null, t?.value ?? null)}</span> }, ...numeric,
    })),
    { id: 'contrib', header: 'Contributions', accessorFn: (r) => r.contributions.length, cell: (c) => (
      <span className="flex gap-1" aria-label="Contribution shares">
        {contributionShares(c.row.original.contributions).map((s) => <span key={s.metric} title={`${traitLabel(traitLabels, s.metric)}: ${(s.share * 100).toFixed(0)}% of score`} className="inline-block h-2 rounded-sm bg-accent/70" style={{ width: `${Math.max(2, s.share * 60)}px` }} />)}
      </span>
    ) },
    { id: 'video', header: 'Video', accessorKey: 'video_coverage', cell: (c) => { const ch = coverageChip(c.getValue<CandidateRow['video_coverage']>()); return <Badge tone={ch.tone}>{ch.text}</Badge> } },
    ...(onAdd ? [{ id: 'add', header: '', cell: (c) => { const r = c.row.original; const has = inShortlist?.(r.player_id); return <Button size="sm" variant="ghost" disabled={has} onClick={(e) => { e.stopPropagation(); onAdd(r) }} aria-label={`Add ${r.full_name ?? r.player_id} to shortlist`}>{has ? 'In shortlist' : 'Add'}</Button> } } as ColumnDef<CandidateRow, unknown>] : []),
  ], [traitKeys, traitUnits, traitLabels, onAdd, inShortlist])
  return <DataTable data={rows} columns={columns} rowKey={(r) => r.player_id} dense maxHeight={520} pinFirstColumn initialSort={[]} emptyMessage="No candidates: loosen the cohort or pick another template." />
}

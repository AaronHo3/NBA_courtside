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
      // Pinned identity sorts by name; the match rank (server order) has its own column beside it.
      id: 'player', header: 'Player', accessorFn: (r) => r.full_name ?? '', sortingFn: 'alphanumeric',
      cell: (c) => <Link to={`/players/${c.row.original.player_id}`} className="whitespace-nowrap text-ink hover:underline">{c.row.original.full_name ?? `Player ${c.row.original.player_id}`}</Link>,
    },
    {
      id: 'rank', header: () => <span title="Rank"><span aria-hidden="true">#</span><span className="sr-only">Rank</span></span>,
      accessorFn: (_r, i) => i, sortDescFirst: false,
      cell: (c) => <span className="tnum text-ink-3">{c.row.index + 1}</span>, ...numeric,
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
  return <DataTable data={rows} columns={columns} rowKey={(r) => r.player_id} dense maxHeight={520} pinFirstColumn initialSort={[{ id: 'rank', desc: false }]} emptyMessage="No candidates: loosen the cohort or pick another template." />
}

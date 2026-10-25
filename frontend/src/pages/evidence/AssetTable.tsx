import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui'
import { DataTable } from '@/components/table/DataTable'
import type { MediaAsset } from '@/lib/types'
import { fmtBytes, fmtMs } from './state'

const TONE: Record<MediaAsset['status'], 'neutral' | 'accent' | 'warning' | 'good' | 'critical'> = { registered: 'neutral', probed: 'accent', ready: 'good', failed: 'critical', deleted: 'warning' }

export function AssetTable({ assets, onOpen }: { assets: MediaAsset[]; onOpen: (asset: MediaAsset) => void }) {
  const columns = useMemo<ColumnDef<MediaAsset, unknown>[]>(() => [
    { accessorKey: 'original_filename', header: 'File', cell: (c) => <span className="text-ink">{c.row.original.original_filename ?? c.row.original.asset_id}</span> },
    { accessorKey: 'status', header: 'Status', cell: (c) => <Badge tone={TONE[c.row.original.status]}>{c.row.original.status}</Badge> },
    { accessorKey: 'duration_ms', header: 'Duration', cell: (c) => <span className="tnum">{fmtMs(c.row.original.duration_ms)}</span> },
    { id: 'size', header: 'Size', accessorFn: (r) => r.byte_size ?? 0, cell: (c) => <span className="tnum">{fmtBytes(c.row.original.byte_size)}</span> },
    { id: 'dims', header: 'Frame', accessorFn: (r) => (r.width ?? 0) * (r.height ?? 0), cell: (c) => <span className="tnum">{c.row.original.width && c.row.original.height ? `${c.row.original.width}×${c.row.original.height}` : '–'}</span> },
    { accessorKey: 'created_at', header: 'Uploaded', cell: (c) => <span className="tnum text-ink-3">{c.row.original.created_at.slice(0, 16).replace('T', ' ')}</span> },
  ], [])
  return <DataTable data={assets} columns={columns} rowKey={(r) => r.asset_id} onRowClick={onOpen} height={360} dense emptyMessage="No managed footage yet. Upload a clip you are authorised to use." />
}

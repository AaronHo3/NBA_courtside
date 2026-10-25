import { useId, useState } from 'react'
import { Button } from '@/components/ui'
import { fmtBytes } from './state'

const SOURCES = [
  ['own_recording', 'Own recording (I filmed it)'],
  ['user_upload', 'Upload I am authorised to use'],
  ['dataset_import', 'Openly licensed research dataset (CC BY-NC or similar)'],
  ['team_provided', 'Provided by a team or rights holder'],
  ['unknown', 'Unknown (metadata only, no processing)'],
] as const
const OPS = ['view', 'playback_derivative', 'thumbnail', 'cv_processing'] as const

/** Every upload carries a permission statement; nothing is processed on an unknown permission (DEC-08). */
export function UploadDialog({ ffmpegAvailable, maxBytes, onSubmit, busy }: { ffmpegAvailable: boolean; maxBytes: number | null; onSubmit: (form: FormData) => void; busy: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [ops, setOps] = useState<string[]>(['view', 'playback_derivative', 'thumbnail'])
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('')
  const fileId = useId()
  const sourceId = useId()
  const refId = useId()
  const notesId = useId()
  const tooBig = file !== null && maxBytes !== null && file.size > maxBytes
  const can = file !== null && source !== '' && !tooBig && !busy

  const submit = () => {
    if (!can || !file) return
    const fd = new FormData()
    fd.set('file', file)
    fd.set('permission_source', source)
    fd.set('allowed_operations', source === 'unknown' ? '' : ops.join(','))
    if (ref) fd.set('authorization_ref', ref)
    if (notes) fd.set('notes', notes)
    onSubmit(fd)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="upload-dialog">
      {!ffmpegAvailable && <p className="rounded-[var(--radius-control)] bg-raised p-2 text-xs text-ink-2">ffmpeg is not installed on this machine: the file is stored and registered but cannot be probed or played until it is (brew install ffmpeg).</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <label htmlFor={fileId} className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Video file</span>
          <input id={fileId} type="file" accept="video/*,.mp4,.mov,.mkv,.webm" className="control text-sm text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <span className={tooBig ? 'text-critical' : ''}>{file.name} · {fmtBytes(file.size)}{tooBig ? ` is larger than the limit (${fmtBytes(maxBytes)})` : ''}</span>}
        </label>
        <label htmlFor={sourceId} className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Permission source (required)</span>
          <select id={sourceId} className="control text-sm text-ink" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose who authorised this footage…</option>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-xs text-ink-3">
          <legend>Allowed operations</legend>
          <div className="flex flex-wrap gap-3">
            {OPS.map((op) => (
              <label key={op} className="flex items-center gap-1">
                <input type="checkbox" disabled={source === 'unknown'} checked={source !== 'unknown' && ops.includes(op)} onChange={(e) => setOps(e.target.checked ? [...ops, op] : ops.filter((o) => o !== op))} />
                {op}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor={refId} className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Authorisation reference (licence, email, dataset URL)</span>
          <input id={refId} className="control text-sm text-ink" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={400} />
        </label>
        <label htmlFor={notesId} className="flex flex-col gap-1 text-xs text-ink-3 md:col-span-2">
          <span>Notes</span>
          <input id={notesId} className="control text-sm text-ink" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={submit} disabled={!can}>Upload</Button>
        <span className="text-xs text-ink-3">Files are hashed, probed with ffprobe and kept under data/&lt;namespace&gt;/media. Provider clips are never downloaded.</span>
      </div>
    </div>
  )
}

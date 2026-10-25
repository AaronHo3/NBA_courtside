import { Badge, Button } from '@/components/ui'
import type { AssetState } from './state'

const TONE: Record<AssetState['key'], 'neutral' | 'accent' | 'warning' | 'good' | 'critical'> = {
  ready: 'good', processing: 'accent', registered: 'neutral', metadata_only: 'neutral', permission_unknown: 'warning', no_worker: 'warning', no_ffmpeg: 'critical', failed: 'critical',
}

/** The one place that tells the reviewer why footage does or does not play (VIDEO_PIPELINE §5). */
export function AssetStateCard({ state, onRetry, busy = false }: { state: AssetState; onRetry: () => void; busy?: boolean }) {
  return (
    <div data-testid="asset-state" data-state={state.key} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line p-3">
      <div className="flex items-center gap-2">
        <Badge tone={TONE[state.key]}>{state.label}</Badge>
        {state.canRetry && <Button size="sm" onClick={onRetry} disabled={busy}>Retry processing</Button>}
      </div>
      <p className="text-xs text-ink-2">{state.explanation}</p>
    </div>
  )
}

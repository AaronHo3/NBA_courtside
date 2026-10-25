import { Input, Segmented, Select, Toggle } from '@/components/ui'
import { METRIC_SHORT, type AccuracyMetric, type RangePreset } from '@/components/court/colour'
import type { CourtLayer, FrequencyEncoding, MarkerFilter } from '@/components/court/types'
import type { ShootingState } from './state'

/** Layer, encodings, fixed colour range, low-sample threshold and hex size. */
export function ViewControls({ st }: { st: ShootingState }) {
  const isHex = st.layer === 'hex'
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="flex flex-col gap-1 text-xs text-ink-3">
        <span>Layer</span>
        <Segmented<CourtLayer> ariaLabel="Court layer" value={st.layer} onChange={(v) => { st.setLayer(v); st.setSelected(null) }} options={[{ value: 'hex', label: 'Hexbins' }, { value: 'zones', label: 'Zones' }, { value: 'markers', label: 'Markers' }, { value: 'density', label: 'Density' }]} />
      </div>
      {st.layer === 'markers' && (
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Show</span>
          <Segmented<MarkerFilter> ariaLabel="Marker filter" value={st.markers} onChange={st.setMarkers} options={[{ value: 'both', label: 'Both' }, { value: 'made', label: 'Made' }, { value: 'missed', label: 'Missed' }]} />
        </div>
      )}
      {(isHex || st.layer === 'zones') && (
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Colour = accuracy</span>
          <Segmented<AccuracyMetric> ariaLabel="Accuracy metric" value={st.metric} onChange={st.setMetric} options={[
            { value: 'fg_pct', label: METRIC_SHORT.fg_pct, title: 'Field-goal percentage' },
            { value: 'rel_fg_pct', label: METRIC_SHORT.rel_fg_pct, title: 'FG% minus league FG% in the same provider zone, same season' },
            { value: 'pts_per_fga', label: METRIC_SHORT.pts_per_fga, title: 'Points per FGA (field goals only; no free throws)' },
          ]} />
        </div>
      )}
      {isHex && (
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          <span>Frequency encoding</span>
          <Segmented<FrequencyEncoding> ariaLabel="Frequency encoding" value={st.encoding} onChange={st.setEncoding} options={[{ value: 'size', label: 'Hex size' }, { value: 'opacity', label: 'Opacity' }]} />
        </div>
      )}
      {(isHex || st.layer === 'zones') && (
        <Select label="Colour range (fixed)" value={st.range} onChange={(e) => st.setRange(e.target.value as RangePreset)}>
          <option value="narrow">Narrow</option>
          <option value="standard">Standard</option>
          <option value="wide">Wide</option>
        </Select>
      )}
      {st.layer !== 'markers' && (
        <Input label={`Low-sample threshold: ${st.minAttempts} FGA`} type="range" min={1} max={50} step={1} value={st.minAttempts} onChange={(e) => st.setMinAttempts(Number(e.target.value))} className="w-44" aria-valuetext={`${st.minAttempts} attempts`} />
      )}
      {(isHex || st.layer === 'density') && (
        <Input label={`Hex size: ${st.sizeFt.toFixed(2)} ft`} type="range" min={1} max={3} step={0.25} value={st.sizeFt} onChange={(e) => { st.setSizeFt(Number(e.target.value)); st.setSelected(null) }} className="w-36" aria-valuetext={`${st.sizeFt} feet`} />
      )}
      {(isHex || st.layer === 'density') && <div className="pb-1.5"><Toggle checked={st.hideLow} onChange={st.setHideLow} label="Hide low-sample bins" /></div>}
    </div>
  )
}

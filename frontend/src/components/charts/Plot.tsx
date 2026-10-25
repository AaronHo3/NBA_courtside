import { useMemo } from 'react'
import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import type { Config, Data, Layout } from 'plotly.js'
import { useTheme } from '@/store/theme'
import { categorical } from './palette'

const PlotlyComponent = createPlotlyComponent(Plotly)

export type ChartTheme = {
  theme: 'dark' | 'light'
  ink: string
  ink2: string
  ink3: string
  grid: string
  axis: string
  surface: string
  accent: string
  series: string[]
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function useChartTheme(): ChartTheme {
  const theme = useTheme((s) => s.theme)
  return useMemo(
    () => ({
      theme,
      ink: cssVar('--ink'),
      ink2: cssVar('--ink-2'),
      ink3: cssVar('--ink-3'),
      grid: cssVar('--grid'),
      axis: cssVar('--axis'),
      surface: cssVar('--surface'),
      accent: cssVar('--accent'),
      series: categorical(theme),
    }),
    [theme],
  )
}

export function baseLayout(t: ChartTheme, overrides: Partial<Layout> = {}): Partial<Layout> {
  const axis = {
    gridcolor: t.grid,
    zerolinecolor: t.axis,
    linecolor: t.axis,
    tickfont: { color: t.ink3, size: 11 },
    titlefont: { color: t.ink2, size: 12 },
    automargin: true,
  }
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: t.ink2, size: 12 },
    margin: { l: 56, r: 16, t: 16, b: 48 },
    hoverlabel: { bgcolor: cssVar('--overlay') || t.surface, bordercolor: cssVar('--line-strong') || t.axis, font: { color: t.ink, size: 12, family: 'IBM Plex Sans, system-ui, sans-serif' }, align: 'left' },
    legend: { orientation: 'h', y: -0.18, font: { color: t.ink2, size: 11 } },
    colorway: t.series,
    dragmode: 'zoom',
    ...overrides,
    xaxis: { ...axis, ...(overrides.xaxis ?? {}) },
    yaxis: { ...axis, ...(overrides.yaxis ?? {}) },
  }
}

export const baseConfig: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ['toImage', 'autoScale2d', 'toggleSpikelines'],
  scrollZoom: false,
}

export type PlotProps = {
  data: Data[]
  layout?: Partial<Layout>
  config?: Partial<Config>
  className?: string
  style?: React.CSSProperties
  onClick?: (e: Readonly<Plotly.PlotMouseEvent>) => void
  onSelected?: (e: Readonly<Plotly.PlotSelectionEvent> | undefined) => void
  onHover?: (e: Readonly<Plotly.PlotHoverEvent>) => void
  onUnhover?: (e: Readonly<Plotly.PlotMouseEvent>) => void
  onRelayout?: (e: Readonly<Plotly.PlotRelayoutEvent>) => void
}

/** Themed Plotly chart. Charts hold their previous render while new data loads (dim via className). */
export function Plot({ data, layout, config, className, style, onClick, onSelected, onHover, onUnhover, onRelayout }: PlotProps) {
  const t = useChartTheme()
  const fullLayout = useMemo(() => baseLayout(t, { autosize: true, ...(layout ?? {}) }), [t, layout])
  return (
    <PlotlyComponent
      data={data}
      layout={fullLayout}
      config={{ ...baseConfig, ...(config ?? {}) }}
      useResizeHandler
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      onClick={onClick}
      onSelected={onSelected}
      onHover={onHover}
      onUnhover={onUnhover}
      onRelayout={onRelayout}
    />
  )
}

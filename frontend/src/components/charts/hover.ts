/** Plotly renders hovertemplate text as HTML; labels are escaped so a name can never inject markup. */
function escapeLabel(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Build a Plotly `hovertemplate` from `[label, value]` rows. Values are Plotly template expressions
 * (e.g. `%{y:.1%}`, `%{customdata[0]}`) or literal text; the trace-name box is suppressed.
 */
export function hoverTemplate(rows: Array<[label: string, value: string]>): string {
  return rows.map(([label, value]) => `${escapeLabel(label)}: <b>${value}</b>`).join('<br>') + '<extra></extra>'
}

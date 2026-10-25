/** Collapsible methodology for the lab. Content is text only. */
export function MethodNote() {
  return (
    <details className="rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3 text-sm text-ink-2">
      <summary className="cursor-pointer select-none text-[15px] font-semibold text-ink">How this page computes things</summary>
      <dl className="mt-3 grid gap-x-8 gap-y-3 md:grid-cols-2">
        <div>
          <dt className="font-medium text-ink">Coordinates</dt>
          <dd>The provider reports each shot as LOC_X and LOC_Y in tenths of a foot from the hoop centre. We divide by ten to get feet; x is positive to the shooter's right, y increases toward half court. The court is drawn from the same constants the server uses to classify zones (50 ft wide, hoop 5.25 ft from the baseline, three-point arc of 23.75 ft meeting 22 ft corner lines at y = sqrt(23.75² − 22²) ≈ 8.95 ft).</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Hexbins</dt>
          <dd>Shots are assigned to a pointy-top hexagonal lattice whose circumradius is the hex size control. Each bin reports attempts, makes, FG%, points per FGA and its share of all attempts. Hexagon size (or opacity) carries frequency; colour carries accuracy only. The colour range is fixed by the control, never fitted to the subject, so two courts can be read against each other.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Uncertainty</dt>
          <dd>Every FG% comes with a 95% Wilson score interval, which behaves sensibly at small counts and near 0% or 100%. Bins and zones with fewer attempts than the low-sample threshold are hatched and desaturated; the threshold is yours to set. Shots are treated as independent trials, which ignores streaks, game context and shot selection.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">League baseline</dt>
          <dd>"FG% vs league zone average" is the bin's FG% minus league-wide FG% in the same provider zone (restricted area, paint non-RA, mid-range, corner threes, above the break) for the same season and season type. It is a crude expected-value baseline: it corrects for where a shot was taken, not for how contested it was.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Points per FGA</dt>
          <dd>Points scored on field-goal attempts divided by attempts (2 or 3 points per make). Free throws are excluded, so this is not points per possession and should not be read as one.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">What is not offered</dt>
          <dd>No expected-shot-quality or shot-quality-adjusted model: closest-defender distance, shot-clock state and touch time are not in the public shot-chart data, and any model without them would mostly restate zone averages. Differences between subjects are simple per-bin subtractions on matching lattice cells; cells that only one subject used are drawn hollow rather than treated as zero.</dd>
        </div>
      </dl>
    </details>
  )
}

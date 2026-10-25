import { Link } from 'react-router-dom'
import { Code, Dl, Formula, P, Section, Ul } from './Prose'

export function ThresholdsSection() {
  return (
    <Section id="thresholds" question="Who counts, and on what scale?" method="Qualification thresholds define the comparison population; normalisations change the scale of counting stats only.">
      <div className="flex flex-col gap-3">
        <Dl items={[
          ['Totals', 'Season sums as published.'],
          ['Per game', 'total / games played.'],
          ['Per 36 minutes', '36 × total / minutes.'],
          ['Per 100 possessions', <>100 × total / possessions. Offered only where the provider supplies a possessions column; the demo estimates team possessions as <Code>FGA − OREB + TOV + 0.44 × FTA</Code> and says so in the manifest.</>],
        ]} />
        <P>Percentages, rates and ratings (TS%, AST%, ORtg, PIE, …) are never rescaled: they are already normalised by their own denominators. Only <Code>counting</Code> metrics change with the scale selector, and labels carry the suffix (<Code>/ game</Code>, <Code>/ 36</Code>, <Code>/ 100</Code>) so a column is never ambiguous.</P>
        <Dl items={[
          ['League explorer defaults', 'per game · ≥ 10 games · ≥ 100 minutes; both thresholds adjustable in the filter row.'],
          ['Rankings defaults', <>rate mode (per game) · percentile normalisation · ≥ 10 games · ≥ 100 minutes. Cumulative mode switches counting components to season totals so availability counts. See <Link className="text-accent hover:underline" to="/rankings">Rankings</Link>.</>],
          ['Player percentiles', 'Computed against the qualified population of the same season and season type (all players, same position, same team or a custom group); the population size is always shown next to the percentile.'],
        ]} />
      </div>
    </Section>
  )
}

export function MissingDataSection() {
  return (
    <Section id="missing-data" question="What happens when a number is not there?" method="Null stays null. No imputation, no zero-filling, no silent re-weighting.">
      <Ul items={[
        <>Missing values are stored as null and rendered as a dash. A zero denominator returns null, never 0 or infinity: a player with no turnovers has an undefined AST/TO, not an infinite one.</>,
        <>Multi-game and multi-stint percentages are recomputed from pooled numerators and denominators (<Code>Σ FGM / Σ FGA</Code>), never averaged from per-game percentages.</>,
        <>Traded players keep one row per team stint plus one <Code>TOT</Code> aggregate flagged <Code>is_aggregate</Code>. Counting stats are summed across stints; percentages are recomputed from the pooled totals; ratings (ORtg, DRtg, NetRtg, pace, PIE, usage and the other rate columns) are possession-weighted means, falling back to minutes when possessions are unavailable. League populations use the TOT row so a traded player is not counted twice.</>,
        <>Composite rankings exclude a player who lacks any component and list them separately with the missing component named. Weights are shares of the whole index and are never re-normalised to the components a player happens to have.</>,
        <>Coverage gaps are shown as coverage, not as zeros: a season without matchup data says so rather than showing an empty leaderboard.</>,
      ]} />
    </Section>
  )
}

export function UncertaintySection() {
  return (
    <Section id="uncertainty" question="How sure can we be about a percentage?" method="Shooting-style proportions carry a Wilson 95% interval; small matchup samples are shrunk toward a league prior with a stated strength.">
      <h3 className="text-sm font-semibold text-ink">Wilson score interval (95%, z = 1.96)</h3>
      <Formula label="p̂ = makes / attempts, n = attempts. The interval is asymmetric, stays inside [0, 1] and does not collapse to zero width at 0% or 100%.">{`centre = (p̂ + z²/(2n)) / (1 + z²/n)
half   = z · √( p̂(1 − p̂)/n + z²/(4n²) ) / (1 + z²/n)
interval = [centre − half, centre + half]`}</Formula>
      <h3 className="mt-3 text-sm font-semibold text-ink">Beta shrinkage toward the league matchup FG%</h3>
      <Formula label="k is the prior strength in pseudo-attempts (default 25). The weight on observed data is n / (n + k), shown next to every shrunk value.">{`μ          = league matchup FG% for the season
prior      = Beta(μ·k, (1 − μ)·k)
posterior  = (makes + μ·k) / (attempts + k)`}</Formula>
      <P>Both treat attempts as independent Bernoulli trials. Shots by one player in the same games, against the same defenders and in the same game states are not independent, so the intervals are somewhat too narrow; read them as a floor on uncertainty, not an exact probability. Zero attempts yield null, not a 0% with an interval.</P>
    </Section>
  )
}

export function ShootingSection() {
  return (
    <Section id="shooting" question="How are shot locations and efficiencies computed?" method="Provider coordinates converted to feet from the hoop centre; pointy-top hexagonal bins; league baselines per provider zone.">
      <Dl items={[
        ['Coordinates', <>Provider <Code>LOC_X</Code>/<Code>LOC_Y</Code> are tenths of a foot with the origin at the centre of the basket; <Code>y</Code> increases toward half court and <Code>x</Code> increases to the right as seen from behind the basket (so the left corner has negative x). The app divides by 10 and draws the court in feet relative to the hoop centre (baseline at y = −5.25 ft).</>],
        ['Zones', <>Real shots keep the provider's own <Code>SHOT_ZONE_BASIC</Code>, <Code>SHOT_ZONE_AREA</Code> and <Code>SHOT_ZONE_RANGE</Code> labels; the geometric zone classifier is used only to label synthetic shots in the demo.</>],
        ['Hex bins', <>Pointy-top hexagons in axial (q, r) coordinates with a user-set circumradius in feet (default 1.5 ft, 0.75–6 ft). Each bin carries attempts, makes, FG%, points per FGA, frequency share, a Wilson 95% interval and a <Code>low_sample</Code> flag below the attempt threshold (default 5). Bins are flagged, never dropped, so the threshold is the user's choice.</>],
        ['League baseline', <>For each season and season type the league FG% is computed per provider zone from all shots; <Code>rel_fg_pct = bin FG% − league FG% in the same zone</Code>. Zone summaries use a default threshold of 10 attempts.</>],
        ['Points per FGA', <><Code>(2 × 2PM + 3 × 3PM) / FGA</Code>. This is not points per possession: it ignores free throws, turnovers and offensive rebounds, and is labelled accordingly.</>],
        ['No shot-quality model', 'Defender distance, closest-defender identity and shot clock are not public in the shot detail feed, so no expected-FG% or shot-quality adjustment is computed. Frequency and accuracy are encoded separately (size or opacity for frequency, colour for accuracy relative to league).'],
      ]} />
    </Section>
  )
}

export function MatchupsSection() {
  return (
    <Section id="matchups" question="What can offender-vs-defender data say, and what can it not?" method="Provider matchup rows enriched with raw FG%, shrunk FG%, Wilson intervals and a qualifying threshold on partial possessions.">
      <Dl items={[
        ['Partial possessions', <>The provider's <Code>PARTIAL_POSS</Code>: possessions, counted fractionally, during which the defender was the tracked primary matchup for the offensive player. A possession where the matchup changed mid-way contributes a fraction to each defender, so sums across defenders approximate, not equal, team possessions.</>],
        ['Qualification', 'Rows with at least the minimum partial possessions (default 10, adjustable) are marked as qualifying; the rest are shown but flagged low-sample.'],
        ['Per possession', <><Code>player_pts / partial_poss</Code> and <Code>team_pts / partial_poss</Code> are reported separately; zero possessions yield null.</>],
        ['Wording rule', <>Values describe the lowest observed efficiency (or the highest) among qualifying matchups, not a player's "worst matchup". Matchup attribution, switching, help defense, opponent selection and team scheme limit what individual matchup data can show.</>],
        ['Attribution limits', <>Help-defense columns (<Code>help_blk</Code>, <Code>help_fgm</Code>, <Code>help_fga</Code>) are null in the demo and sparse in provider data; who "caused" a miss is not observable from matchup tracking alone. Matchup data exists from 2017-18 onward.</>],
      ]} />
    </Section>
  )
}

export function RankingsSection() {
  return (
    <Section id="rankings" question="What is a ranking here?" method="A user-defined index, computed transparently, not an established statistic.">
      <Formula label="share_i = w_i / Σ w; norm_i is a mid-rank percentile (0–100) or a z-score within the eligible population, sign-flipped for lower-is-better components.">{`score = Σ_i share_i · norm_i`}</Formula>
      <Ul items={[
        <>Every lens publishes its components, weights, directions and caveat; the response returns each player's raw value, normalised value, weight, contribution and the population size per component, and the UI shows all of them.</>,
        <>The normalisation population is the set of players who met the thresholds <em>and</em> have every component, so each component is ranked among the same players.</>,
        <>Rate mode normalises counting components per game; cumulative mode uses season totals. Percentages, rates and ratings are unchanged by the mode.</>,
        <>Players missing any component are ineligible and listed with the missing component named. Weights are never re-normalised per player.</>,
        <>Comparisons are within one season and season type. Percentiles do not remove era effects: a 90th-percentile three-point volume in 2016-17 and in 2025-26 describe different absolute numbers.</>,
        <>No named impact metric is fabricated. "Impact indicators" are the provider's PIE, net rating, on/off differentials and plus-minus, labelled as such; none is adjusted for teammates, opponents or minutes distribution. No RAPM, EPM or RAPTOR-style estimates exist here.</>,
      ]} />
      <P>Build your own in <Link className="text-accent hover:underline" to="/rankings?lens=custom">Rankings → Custom composite</Link>; the definition is encoded in the URL so it can be shared.</P>
    </Section>
  )
}

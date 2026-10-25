import { Code, Dl, P, Section, Ul } from './Prose'

export function MeasurementsSection() {
  return (
    <Section id="measurements" question="Where does a player's height or wingspan come from?" method="Two sources with different conventions; each value is labelled with its source and never merged into one column.">
      <Dl items={[
        ['Roster-listed height and weight', <>From the provider's player index and roster pages (<Code>height_in</Code>, <Code>weight_lb</Code>, source "roster"). Listed heights are conventionally measured with shoes and are self- or team-reported; they can change between seasons.</>],
        ['Combine measurements', <>From the draft combine anthropometrics (<Code>height_wo_shoes_in</Code>, <Code>height_w_shoes_in</Code>, <Code>wingspan_in</Code>, <Code>standing_reach_in</Code>, hand size, body fat), tagged with the combine season and measured once, typically at age 19–22. Only players who attended a combine have them.</>],
        ['Wingspan', <>Shown only when measured: there is no listed wingspan, so <Code>wingspan_in</Code> and <Code>wingspan_height_ratio</Code> (<Code>wingspan_in / height_wo_shoes_in</Code>, both without shoes) are null for players without a combine record. Team-level averages of wingspan therefore cover only the measured part of a roster and say so.</>],
      ]} />
    </Section>
  )
}

export function DemoSection() {
  return (
    <Section id="demo" question="What is real in the demo dataset?" method="Nothing. It is a deterministic synthetic league generated locally so the app works when the provider is unreachable. Every row carries source = demo-synthetic.">
      <Dl items={[
        ['Identity', <>30 fictional teams and fictional players with generated names; player ids start at 9,000,001 and team ids at 9,100,001 so they can never collide with real provider ids. Fixed seed, so the dataset is reproducible.</>],
        ['Simulated', <>For the three most recent seasons: per-game box scores from player archetypes (minutes, usage, shooting tendencies with Poisson noise), individual shots with locations sampled per archetype, and a defender assignment per shot. Older seasons get season totals only (expected rate × minutes with Poisson noise), so game logs, shots, matchups, lineups, on/off and defense dashboards are missing there by design.</>],
        ['Derived by public formulas', <>From the simulated totals, using the same formulas as for real data: eFG%, TS%, usage %, assist %, assist ratio, offensive/defensive/total rebound %, turnover %, PIE, pace and per-36 / per-100 rates. Team possessions are estimated as <Code>FGA − OREB + TOV + 0.44 × FTA</Code>.</>],
        ['Synthesised (no play-by-play exists)', <>On-court offensive/defensive/net ratings, lineup minutes and ratings, on/off splits, matchup partial possessions and matchup box scores (counts drawn around the simulated shots; <Code>help_*</Code> not modelled), defense-dashboard categories and combine measurements (about 80% of recent draftees). These are plausible values, not reconstructions, and the manifest notes label them.</>],
      ]} />
      <P>Demo and real data live in separate namespaces (<Code>demo</Code> and <Code>nba</Code>), are never joined, and the amber banner stays visible whenever the demo namespace is served.</P>
    </Section>
  )
}

export function LimitationsSection() {
  return (
    <Section id="limitations" question="What should you not conclude from this app?" method="Provider, coverage and modelling limits, in one place. Mirrored in docs/LIMITATIONS.md.">
      <Ul items={[
        <><strong className="text-ink">Provider access.</strong> stats.nba.com blocks many networks (cloud providers, some ISPs and VPNs) and rate-limits aggressively. Ingestion paces requests, retries and caches, but an unreachable provider means no real data; the app then serves the labelled demo and never pretends otherwise.</>,
        <><strong className="text-ink">Historical coverage.</strong> Matchup tracking exists from 2017-18; defense dashboards from 2013-14; shot locations from 1996-97; draft-combine anthropometrics only for players who attended a combine (roughly from 2000, with gaps). Earlier seasons simply lack those families.</>,
        <><strong className="text-ink">Help defense.</strong> <Code>help_blk</Code>, <Code>help_fgm</Code> and <Code>help_fga</Code> are null in the demo and unreliable in provider data; nothing is built on them.</>,
        <><strong className="text-ink">No adjusted impact metrics.</strong> There is no RAPM, EPM, RAPTOR, LEBRON or similar. On/off, plus-minus, net rating and PIE are shown as the provider publishes them and are not adjusted for teammates, opponents, minutes or garbage time.</>,
        <><strong className="text-ink">No play-by-play possessions.</strong> Possessions come from the provider's advanced tables (or an estimate in the demo); per-100 rates inherit that approximation, and no lineup or on/off figure is rebuilt from play-by-play.</>,
        <><strong className="text-ink">Shooting.</strong> No defender distance, shot clock or shot-quality model; points per FGA is not points per possession; Wilson intervals assume independent attempts.</>,
        <><strong className="text-ink">Matchups.</strong> Partial possessions are fractional and scheme-dependent; the lowest observed efficiency among qualifying matchups is not a "worst matchup"; shrinkage uses a league-wide prior, not a position- or role-specific one.</>,
        <><strong className="text-ink">Rankings.</strong> User-defined indexes, within one season; percentiles do not remove era effects; a lens is only as good as its components and weights.</>,
        <><strong className="text-ink">Measurements.</strong> Listed heights (with shoes, self-reported) and combine heights (without shoes, measured once) are different quantities; wingspan exists only for measured players.</>,
        <><strong className="text-ink">Demo.</strong> Fictional league; on-court ratings, lineups, on/off, matchups and combine values are synthesised, not derived. Draw no basketball conclusion from demo numbers.</>,
      ]} />
    </Section>
  )
}

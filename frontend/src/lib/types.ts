export type SeasonType = 'Regular Season' | 'Playoffs' | 'Pre Season'
export type Normalization = 'totals' | 'per_game' | 'per_36' | 'per_100'

export type Status = {
  namespace: string
  is_demo: boolean
  reason: string
  /** Public deployment: ingestion routes are absent and provider fetches are refused. */
  read_only?: boolean
  generated_at: string | null
  seasons: string[]
  season_types: SeasonType[]
  default_season: string | null
  default_season_type: SeasonType
  coverage: Record<string, Record<string, Record<string, string>>>
  families: string[]
  normalizations: Record<Normalization, string>
  banner: string | null
}

export type MetricKind = 'counting' | 'pct' | 'rate' | 'rating' | 'physical' | 'context'
export type Metric = {
  key: string
  label: string
  kind: MetricKind
  definition: string
  formula: string | null
  higher_is_better: boolean | null
  unit: string | null
  source: string
  decimals: number
}

export type Team = {
  team_id: number
  abbreviation: string
  city: string
  name: string
  full_name: string
  conference: string
  division: string
}

export type PlayerSearchHit = {
  player_id: number
  full_name: string
  position: string | null
  is_active: boolean
  from_year: number | null
  to_year: number | null
  team_abbreviation: string | null
}

/** A league-explorer / population row. Counting stats are already normalized server-side. */
export type PlayerRow = {
  player_id: number
  full_name: string
  team_id: number
  team_abbreviation: string | null
  position: string | null
  is_aggregate: boolean
  age: number | null
  gp: number | null
  min: number | null
  poss: number | null
  normalization: Normalization
  height_in: number | null
  weight_lb: number | null
  wingspan_in: number | null
  standing_reach_in: number | null
  wingspan_height_ratio: number | null
  on_off_net: number | null
  [metric: string]: number | string | boolean | null
}

export type ExplorerMeta = {
  normalization: Normalization
  population: number
  returned: number
  season: string
  season_type: SeasonType
  thresholds: { min_gp: number; min_minutes: number }
}

export type PlayerBio = {
  player_id: number
  full_name: string
  first_name: string
  last_name: string
  birthdate: string | null
  country: string | null
  school: string | null
  position: string | null
  height_in: number | null
  weight_lb: number | null
  draft_year: number | null
  draft_round: number | null
  draft_number: number | null
  from_year: number | null
  to_year: number | null
  is_active: boolean
  height_source: string | null
}

export type CombineMeasurements = {
  combine_season: string
  height_wo_shoes_in: number | null
  height_w_shoes_in: number | null
  weight_lb: number | null
  wingspan_in: number | null
  standing_reach_in: number | null
  body_fat_pct: number | null
  hand_length_in: number | null
  hand_width_in: number | null
  wingspan_height_ratio: number | null
  source: string
  measured_at: string
}

export type PlayerSeasonRow = PlayerRow & {
  season: string
  season_type: SeasonType
  team_name: string | null
  mpg: number | null
}

export type PlayerProfile = {
  bio: PlayerBio
  measurements: {
    roster: { height_in: number | null; weight_lb: number | null; source: string; note: string }
    combine: CombineMeasurements | null
  }
  seasons: PlayerSeasonRow[]
  career: Record<string, number | string[] | null>
  timeline: Array<{ season: string; season_type: SeasonType; team_id: number; team_abbreviation: string; team_name: string | null; gp: number; min: number }>
}

export type PercentileEntry = {
  metric: string
  value: number | null
  percentile: number | null
  population_size: number
  normalization: Normalization | null
}
export type Percentiles = {
  population: { kind: string; label: string; size: number; min_minutes: number; min_gp: number }
  metrics: PercentileEntry[]
}

export type Shot = {
  game_id: string
  game_event_id: number
  player_id: number
  team_id: number
  opponent_team_id: number
  game_date: string
  period: number
  minutes_remaining: number
  seconds_remaining: number
  action_type: string
  shot_type: string
  shot_zone_basic: string
  shot_zone_area: string
  shot_zone_range: string
  shot_distance: number
  loc_x: number
  loc_y: number
  shot_made_flag: 0 | 1
  home: boolean
}

export type HexBin = {
  q: number
  r: number
  x_ft: number
  y_ft: number
  zone: string
  fga: number
  fgm: number
  pts: number
  fg_pct: number | null
  ci_low: number | null
  ci_high: number | null
  low_sample: boolean
  pts_per_fga: number | null
  frequency: number
  league_fg_pct: number | null
  rel_fg_pct: number | null
}

export type ZoneSummary = Omit<HexBin, 'q' | 'r' | 'x_ft' | 'y_ft'>

export type ShotMeta = {
  available: boolean
  reason?: string
  total?: number
  returned?: number
  capped?: boolean
  cap?: number
  total_fga?: number
  total_fgm?: number
  size_ft?: number
  min_attempts?: number
}

export type ShotFilterOptions = {
  opponents: Array<{ team_id: number; abbreviation: string; full_name: string }>
  periods: number[]
  action_types: Array<{ action_type: string; n: number }>
  zones: string[]
  date_range: { min: string | null; max: string | null }
  supported: string[]
  unsupported: Array<{ key: string; reason: string }>
}

export type CourtGeometry = {
  bounds: { x_min: number; x_max: number; y_min: number; y_max: number }
  hoop: { cx: number; cy: number; r: number }
  backboard: { x1: number; x2: number; y: number }
  paint: { x: number; y: number; width: number; height: number }
  inner_paint: { x: number; y: number; width: number; height: number }
  free_throw_circle: { cx: number; cy: number; r: number }
  restricted_area: { cx: number; cy: number; r: number }
  three_point: { radius: number; corner_x: number; corner_break_y: number; baseline_y: number }
  half_court: { y: number }
  center_circle: { cx: number; cy: number; r: number }
}

export type MatchupRow = {
  season: string
  season_type: SeasonType
  off_player_id: number
  off_player_name: string
  off_position: string | null
  def_player_id: number
  def_player_name: string
  def_position: string | null
  gp: number
  matchup_min: number | null
  partial_poss: number | null
  player_pts: number | null
  team_pts: number | null
  matchup_ast: number | null
  matchup_tov: number | null
  matchup_blk: number | null
  matchup_fgm: number | null
  matchup_fga: number | null
  matchup_fg3m: number | null
  matchup_fg3a: number | null
  matchup_ftm: number | null
  matchup_fta: number | null
  sfl: number | null
  fg_pct: number | null
  fg3_pct: number | null
  fg_pct_shrunk: number | null
  ci_low: number | null
  ci_high: number | null
  pts_per_poss: number | null
  team_pts_per_poss: number | null
  qualifies: boolean
}

export type MatchupMeta = {
  available: boolean
  reason: string | null
  prior: { mean: number; strength: number }
  min_poss: number
  wording: string
  shrinkage: string
}

export type DefenseDashRow = {
  defense_category: string
  gp: number | null
  g: number | null
  freq: number | null
  d_fgm: number | null
  d_fga: number | null
  d_fg_pct: number | null
  normal_fg_pct: number | null
  pct_plusminus: number | null
}

export type TeamSeason = Team & {
  season: string
  season_type: SeasonType
  gp: number
  w: number
  l: number
  pts: number
  off_rating: number | null
  def_rating: number | null
  net_rating: number | null
  pace: number | null
  pie: number | null
  efg_pct: number | null
  ts_pct: number | null
  fta_rate: number | null
  tm_tov_pct: number | null
  oreb_pct: number | null
  opp_efg_pct: number | null
  opp_fta_rate: number | null
  opp_tov_pct: number | null
  opp_oreb_pct: number | null
  fg3a_rate: number | null
  [metric: string]: number | string | boolean | null
}

export type RosterRow = PlayerRow & {
  share_min: number | null
  share_pts: number | null
  share_fga: number | null
  share_ast: number | null
  share_reb: number | null
  mpg: number | null
  traded: boolean
  on_net_rating: number | null
  off_net_rating: number | null
}

export type LineupRow = {
  group_id: string
  group_name: string
  player_ids: number[]
  gp: number
  w: number
  l: number
  min: number
  poss: number | null
  off_rating: number | null
  def_rating: number | null
  net_rating: number | null
  pace: number | null
  pts: number | null
  [metric: string]: number | string | number[] | null
}

export type OnOffRow = {
  player_id: number
  full_name: string
  gp: number
  on_min: number
  off_min: number
  on_off_rating: number
  on_def_rating: number
  on_net_rating: number
  off_off_rating: number
  off_def_rating: number
  off_net_rating: number
  on_off_net: number
}

export type TeamSeasonDetail = {
  team: TeamSeason
  roster: RosterRow[]
  lineups: LineupRow[]
  on_off: OnOffRow[]
  stints: Array<{ player_id: number; full_name: string; team_id: number; gp: number; min: number; first_game: string | null; last_game: string | null; season_stints: number }>
}

export type RosterMetricsRow = TeamSeason & {
  usage_gini: number | null
  usg_pct_top: number | null
  avg_height_in: number | null
  avg_wingspan_in: number | null
  avg_age: number | null
  top3_min_share: number | null
  players_used: number
  continuity_min_share: number | null
}

export type LensComponent = { metric: string; weight: number; higher_is_better: boolean; label: string; kind: MetricKind | null }
export type Lens = { key: string; label: string; description: string; components: LensComponent[]; caveat: string | null }

export type Contribution = {
  metric: string
  raw: number
  normalized: number
  normalization: 'percentile' | 'zscore'
  higher_is_better: boolean
  weight: number
  contribution: number
  population_size: number
}
export type RankingRow = {
  rank: number | null
  player_id: number
  full_name: string
  team_abbreviation: string | null
  position: string | null
  age: number | null
  gp: number | null
  min: number | null
  score: number | null
  eligible: boolean
  missing: string[]
  contributions: Contribution[]
  [metric: string]: number | string | boolean | null | string[] | Contribution[]
}
export type RankingMeta = {
  population_size: number
  normalization: 'percentile' | 'zscore'
  normalization_of_counting_stats: Normalization
  min_gp: number
  min_minutes: number
  mode: 'rate' | 'cumulative'
  disclaimer: string
  components: Array<LensComponent & { scaled: boolean }>
}

export type ManifestEntry = {
  family: string
  season: string | null
  season_type: string | null
  status: 'ok' | 'missing' | 'stale' | 'failed' | 'partial'
  rows: number
  fetched_at: string | null
  source: string
  path: string | null
  error: string | null
  note: string | null
}
export type Manifest = { namespace: string; generated_at: string | null; entries: ManifestEntry[] }

export type IngestionStatus = {
  namespace: string
  reason: string
  running: boolean
  last_run: Record<string, unknown> | null
  provider_reachable: boolean | null
  real_manifest: { entries: number; ok: number; failed: number; seasons: string[]; generated_at: string | null }
}

// --- scouting extension: games, play-by-play events, evidence (A-06 routes) ---------------------

export type Game = {
  game_id: string
  season: string
  season_type: SeasonType
  game_date: string
  home_team_id: number
  away_team_id: number
  home_score: number | null
  away_score: number | null
  status: string
  neutral_site: boolean | null
  periods: number | null
  attendance: number | null
  arena: string | null
  source_endpoint: string
}
export type GameCoverage = { events: number; shots: number; mapped_shots: number; evidence_items: number }
export type PageMeta = { total: number; returned: number; limit: number; offset: number; coverage?: string }

export type GameEvent = {
  game_id: string
  season: string
  season_type: string
  source_event_system: string
  source_event_id: number
  source_order: number
  duplicate_of: number | null
  period: number | null
  clock_ms: number | null
  action_type: string | null
  sub_type: string | null
  description: string | null
  team_id: number | null
  person_id: number | null
  is_field_goal: boolean | null
  shot_result: string | null
  shot_value: number | null
  x_legacy: number | null
  y_legacy: number | null
  shot_distance: number | null
  score_home: number | null
  score_away: number | null
  video_available: boolean | null
}
export type EventParticipant = { role: string; person_id: number; team_id: number | null }

export type Availability = 'available' | 'unavailable' | 'unverified' | 'stale'
export type EvidenceReference = {
  asset_id?: string
  external_provider?: string | null
  external_url: string | null
  availability: Availability
  availability_checked_at: string | null
  metadata: Record<string, unknown> | null
}
export type EvidenceKind = 'video_segment' | 'annotation' | 'external_reference' | 'statistic' | 'model_estimate'
export type EvidenceClass = 'statistical' | 'reviewed_observation' | 'model_estimate' | 'interpretation' | 'reference'
export type EvidenceItem = {
  evidence_id: string
  kind: EvidenceKind
  evidence_class: EvidenceClass
  review_status: string
  status: 'active' | 'stale' | 'superseded' | 'deleted'
  summary: string
  player_ids: number[] | null
  game_id: string | null
  season: string | null
  season_type: string | null
  created_at?: string
  reference?: EvidenceReference | null
}
export type ShotEvidence = { event: GameEvent; participants: EventParticipant[]; evidence: EvidenceItem[] }
export type ShotEvidenceMeta = { event_id_map_method: string | null; confidence: string | null; reason?: string; verified_at?: string | null }
export type EventDetail = {
  event: GameEvent
  duplicates: GameEvent[]
  participants: EventParticipant[]
  shot: (Partial<Shot> & { game_event_id: number; map: { method: string; confidence: string } }) | null
  evidence: EvidenceItem[]
}
export type Capabilities = {
  ffmpeg: { available: boolean; version: string | null; ffprobe?: boolean }
  cv_runtime: boolean
  llm_provider: string
  worker_alive: boolean
  jobs?: { inline: boolean; queued: number; running: number }
  video_sources: string[]
  state_db: { namespace: string; schema_version: number }
  media_limits?: { max_upload_bytes: number; max_duration_ms: number; max_pixels: number; purge_after_days: number; reference_stale_after_days: number }
}

// --- managed media, segments, alignment, annotations (scouting B-09) ---------------------------------
export type MediaAsset = {
  asset_id: string
  kind: 'managed_original' | 'external_reference'
  sha256: string | null
  storage_key: string | null
  original_filename: string | null
  byte_size: number | null
  container: string | null
  video_codec: string | null
  audio_codec: string | null
  duration_ms: number | null
  width: number | null
  height: number | null
  frame_rate_num: number | null
  frame_rate_den: number | null
  time_base_num: number | null
  time_base_den: number | null
  variable_frame_rate: number | boolean | null
  processing_version: number | null
  status: 'registered' | 'probed' | 'ready' | 'failed' | 'deleted'
  availability: Availability | null
  created_at: string
  updated_at: string
}
export type MediaPermission = {
  permission_id: string
  source: string
  permission_status: 'known' | 'unknown' | 'revoked'
  allowed_operations: string[] | null
  authorization_ref: string | null
  notes: string | null
  expires_at: string | null
  created_at: string
}
export type MediaDerivative = {
  derivative_id: string
  kind: string
  storage_key: string
  processing_version: number
  byte_size: number | null
  params: Record<string, unknown> | null
  created_at: string
}
export type Job = {
  job_id: string
  kind: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'partial'
  attempt: number
  max_attempts: number
  progress: number | null
  progress_note: string | null
  result: Record<string, unknown> | null
  error: string | null
  payload: Record<string, unknown>
  created_at: string
  started_at: string | null
  finished_at: string | null
}
export type MediaDetail = { asset: MediaAsset; permissions: MediaPermission[]; job: Job | null; derivatives: MediaDerivative[] }
export type SegmentClassification = 'live' | 'replay' | 'unknown' | 'non_game'
export type ReviewStatus = 'unreviewed' | 'reviewed_ok' | 'reviewed_corrected' | 'rejected'
export type Segment = {
  segment_id: string
  asset_id: string
  media_start_ms: number
  media_end_ms: number
  classification: SegmentClassification
  view: string | null
  origin: string
  model_version: string | null
  review_status: ReviewStatus
  reviewed_by: string | null
  notes: string | null
  created_at: string
}
export type Anchor = {
  anchor_id: string
  asset_id: string
  segment_id: string | null
  media_pts_ms: number
  period: number
  clock_ms: number
  method: string
  error_ms: number | null
  review_status: ReviewStatus
}
export type Placement = { media_ms: number; timing_error_ms: number; method: 'anchor' | 'interpolated'; anchor_ids: string[]; segment_id: string }
export type AlignmentReport = { asset_id: string; ok: boolean; rules: Array<{ rule: string; passed: boolean; failing_segments: string[]; details: string[] }>; segments: number; anchors: number; links: number }
export type EventKeyDto = { source_event_system: string; game_id: string; source_event_id: number }
export type EventLink = {
  link_id: string
  game_id: string
  source_event_system: string
  source_event_id: number
  asset_id: string
  segment_id: string | null
  media_start_ms: number | null
  media_end_ms: number | null
  alignment_method: string
  timing_error_ms: number | null
  supporting_anchor_ids: string[] | null
  link_status: string
  review_status: ReviewStatus
  evidence?: EvidenceItem | null
  segment?: Segment | null
  created?: boolean
}
export type VocabEntry = { action: string; definition: string; outcomes: string[] }
export type RosterPlayer = { player_id: number; team_id: number; team_abbreviation: string | null; full_name: string | null; position?: string | null }
export type AnnotationParticipant = { role: string; player_id: number | null; identity_status: 'verified' | 'asserted' | 'unknown' }
export type Annotation = {
  annotation_id: string
  segment_id: string
  media_start_ms: number
  media_end_ms: number
  subject_player_id: number | null
  subject_identity_status: 'verified' | 'asserted' | 'unknown'
  action: string
  vocab_version: number
  outcome: string | null
  participants: AnnotationParticipant[] | null
  visibility: 'full' | 'partial' | 'obstructed' | 'off_frame'
  label_source: string
  confidence_raw: number | null
  sampling_method: string
  event_key: EventKeyDto | null
  game_id: string | null
  notes: { content: string; trust: 'untrusted_free_text' } | null
  supporting_timestamps: number[] | null
  review_status: ReviewStatus
  reviewed_by: string | null
  superseded_by: string | null
  revision: number
  deleted_at: string | null
  created_by: string | null
  created_at: string
}
export type AnnotationRevision = { annotation_id: string; revision: number; changed_by: string | null; changed_at: string; change_reason: string | null; diff: Record<string, { from: unknown; to: unknown }>; snapshot: Record<string, unknown> }
export type SnapshotVersion = { version: number; families: Record<string, { rows: number; path: string }> }

export type ShortlistEntry = {
  player_id: number
  rank: number
  score: number | null
  eligible: boolean | null
  missing: string[]
  contributions: Array<Record<string, unknown>>
  added_by: 'manual' | 'compare' | 'candidates'
  pinned: boolean
  note: string | null
  created_at: string
  updated_at: string
}
export type Shortlist = {
  shortlist_id: string
  namespace: string
  label: string
  role_id: string | null
  role_version: number | null
  season: string
  season_type: SeasonType
  cohort: Record<string, unknown> | null
  ranking_meta: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
  entries: ShortlistEntry[]
}
export type ShortlistSummary = Omit<Shortlist, 'entries'> & { entry_count: number }

// --- scouting workspace (C-06) ----------------------------------------------------------------------

export type VideoCoverage = 'unknown' | 'none' | 'references_only' | 'limited' | 'adequate'
export type RoleComponentDto = { trait_key: string; weight: number; higher_is_better: boolean | null }
export type RoleFilterDto = { column: string; op: string; value: unknown; label: string }
export type RoleTemplateDto = {
  role_id: string
  version: number
  label: string
  description: string
  components: RoleComponentDto[]
  filters: RoleFilterDto[]
  optional_video_traits: string[]
  caveats: string[]
  is_builtin: boolean
  cohort_defaults: { population: string; min_gp: number; min_minutes: number; position: string | null }
}
export type CandidateTrait = { value: number | null; n: number | null; qualified: boolean }
export type CandidateRow = {
  player_id: number
  full_name: string | null
  team_abbreviation: string | null
  position: string | null
  age: number | null
  gp: number | null
  min: number | null
  score: number | null
  eligible: boolean
  missing: string[]
  contributions: Contribution[]
  traits: Record<string, CandidateTrait>
  video_coverage: VideoCoverage
}
export type CandidateMeta = {
  template: RoleTemplateDto
  trait_registry_version: number
  data_fingerprint: string
  season: string
  season_type: string
  cohort: { population: string; min_gp: number; min_minutes: number; position: string | null }
  normalization: string
  disclaimer: string
  notes: string[]
  funnel: Array<{ stage: string; remaining: number }>
  total: number
  limit: number
  offset: number
  eligible?: number
  components?: Array<{ trait_key: string; weight: number; higher_is_better: boolean; label: string }>
}
export type TraitRecord = {
  key: string
  label: string
  evidence_class: EvidenceClass
  definition: string
  formula: string | null
  units: string
  higher_is_better: boolean | null
  value: number | null
  raw_value?: number | null
  interval: { low: number; high: number; method: string } | null
  percentile: number | null
  sample: { n: number | null; denominator: string | null } | null
  coverage: { games_played: number | null; games_covered: number | null; fraction: number | null } | null
  qualification: { met: boolean; reason: string | null } & Record<string, unknown>
  limitations: string[]
  unsupported_reason: string | null
}
export type ScoutingProfile = {
  player: { player_id: number; full_name: string | null; position: string | null }
  time_window: { season: string; season_type: string }
  cohort: Record<string, unknown>
  traits: Record<'statistical' | 'reviewed_observation' | 'model_estimate' | 'interpretation', TraitRecord[]>
  measurements: PlayerProfile['measurements']
  stints: Array<{ team_id: number; team_abbreviation: string; is_aggregate: boolean; gp: number | null; min: number | null }>
  evidence_ids: string[]
  snapshot: { snapshot_id: string; created_at: string; data_fingerprint: string; trait_registry_version: number; superseded: string[]; reused: boolean }
  limits: string[]
}
export type ClaimType = 'statistical' | 'reviewed_observation' | 'model_estimate' | 'interpretation' | 'limitation'
export type ReportClaim = {
  claim_id: string
  order_index: number
  claim_text: string
  claim_type: ClaimType
  original_type: ClaimType
  player_ids: number[]
  time_scope: Record<string, unknown>
  evidence_ids: string[]
  numeric_refs: Array<Record<string, unknown>>
  limitations: string[]
  counterevidence_ids: string[]
  validation_status: 'valid' | 'downgraded' | 'dropped'
  notes: string[]
  created_at: string
}
export type ReportSection = {
  key: string
  title: string
  method?: string
  players?: Array<{ player_id: number; full_name: string; traits: Array<Partial<TraitRecord> & { key: string; label: string; value: number | null; qualified?: boolean }> }>
  unsupported?: string | null
  note?: string
  text?: string
  items?: string[]
}
export type Report = {
  report_id: string
  title: string
  status: 'draft' | 'final'
  season: string
  season_type: string
  shortlist: Shortlist | null
  sections: ReportSection[]
  claims: ReportClaim[]
  data_fingerprint: string | null
  llm_mode: string
  model_id: string | null
  generated_by: string
  rendered_markdown: string
  created_at: string
  updated_at: string
}
export type ReportSummary = { report_id: string; title: string; status: string; season: string; season_type: string; shortlist_id: string | null; llm_mode: string; claim_count: number; created_at: string; updated_at: string }

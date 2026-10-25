-- Media registry, event links, alignment anchors and evidence items (docs/scouting/DATA_MODEL.md §4, §5, §8).
CREATE TABLE IF NOT EXISTS video_assets (
    asset_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('managed_original', 'external_reference')),
    sha256 TEXT,
    storage_key TEXT,
    original_filename TEXT,
    byte_size INTEGER,
    container TEXT,
    video_codec TEXT,
    audio_codec TEXT,
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    frame_rate_num INTEGER,
    frame_rate_den INTEGER,
    time_base_num INTEGER,
    time_base_den INTEGER,
    variable_frame_rate INTEGER,
    probe_json TEXT,
    processing_version INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'registered'
        CHECK (status IN ('registered', 'probed', 'ready', 'failed', 'deleted')),
    external_provider TEXT,
    external_ref_key TEXT,
    external_url TEXT,
    metadata_json TEXT,
    availability TEXT NOT NULL DEFAULT 'unverified'
        CHECK (availability IN ('available', 'unavailable', 'unverified', 'stale')),
    availability_checked_at TEXT,
    deleted_at TEXT,
    source TEXT,
    source_ref TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_video_assets_sha ON video_assets (namespace, sha256) WHERE sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_video_assets_ref ON video_assets (namespace, external_ref_key) WHERE external_ref_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_video_assets_status ON video_assets (namespace, status);

CREATE TABLE IF NOT EXISTS source_permissions (
    permission_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES video_assets (asset_id),
    source TEXT NOT NULL,
    authorization_ref TEXT,
    allowed_operations_json TEXT NOT NULL,
    permission_status TEXT NOT NULL CHECK (permission_status IN ('known', 'unknown')),
    expires_at TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_source_permissions_asset ON source_permissions (asset_id);

CREATE TABLE IF NOT EXISTS video_derivatives (
    derivative_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES video_assets (asset_id),
    kind TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    processing_version INTEGER NOT NULL,
    params_json TEXT NOT NULL,
    params_hash TEXT NOT NULL,
    byte_size INTEGER,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    sha256 TEXT NOT NULL,
    job_id TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (asset_id, kind, processing_version, params_hash)
);

CREATE TABLE IF NOT EXISTS video_segments (
    segment_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES video_assets (asset_id),
    media_start_ms INTEGER NOT NULL,
    media_end_ms INTEGER NOT NULL CHECK (media_end_ms > media_start_ms),
    classification TEXT NOT NULL CHECK (classification IN ('live', 'replay', 'unknown', 'non_game')),
    view TEXT,
    origin TEXT NOT NULL,
    model_version TEXT,
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    reviewed_by TEXT,
    reviewed_at TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_video_segments_asset ON video_segments (asset_id, media_start_ms);

CREATE TABLE IF NOT EXISTS event_video_links (
    link_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    game_id TEXT NOT NULL,
    source_event_system TEXT NOT NULL,
    source_event_id INTEGER NOT NULL,
    asset_id TEXT NOT NULL REFERENCES video_assets (asset_id),
    segment_id TEXT REFERENCES video_segments (segment_id),
    media_start_ms INTEGER,
    media_end_ms INTEGER,
    alignment_method TEXT NOT NULL
        CHECK (alignment_method IN ('provider_metadata', 'manual', 'ocr_assisted', 'interpolated', 'none')),
    timing_error_ms INTEGER,
    supporting_anchor_ids_json TEXT,
    link_status TEXT NOT NULL
        CHECK (link_status IN ('available', 'unavailable', 'unverified', 'stale', 'superseded')),
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_event_video_links
    ON event_video_links (namespace, game_id, source_event_system, source_event_id, asset_id, COALESCE(segment_id, ''));
CREATE INDEX IF NOT EXISTS ix_event_video_links_event ON event_video_links (namespace, game_id, source_event_id);

CREATE TABLE IF NOT EXISTS alignment_anchors (
    anchor_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES video_assets (asset_id),
    media_pts_ms INTEGER NOT NULL,
    period INTEGER NOT NULL,
    clock_ms INTEGER NOT NULL,
    method TEXT NOT NULL,
    error_ms INTEGER,
    segment_id TEXT REFERENCES video_segments (segment_id),
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_alignment_anchors_asset ON alignment_anchors (asset_id, media_pts_ms);

CREATE TABLE IF NOT EXISTS evidence_items (
    evidence_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('video_segment', 'annotation', 'external_reference', 'statistic', 'model_estimate')),
    ref_table TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    player_ids_json TEXT,
    game_id TEXT,
    season TEXT,
    season_type TEXT,
    summary TEXT NOT NULL,
    evidence_class TEXT NOT NULL
        CHECK (evidence_class IN ('statistical', 'reviewed_observation', 'model_estimate', 'interpretation', 'reference')),
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'superseded', 'deleted')),
    superseded_by TEXT,
    snapshot_version INTEGER,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (namespace, ref_table, ref_id)
);
CREATE INDEX IF NOT EXISTS ix_evidence_items_game ON evidence_items (namespace, game_id);
CREATE INDEX IF NOT EXISTS ix_evidence_items_status ON evidence_items (namespace, status);

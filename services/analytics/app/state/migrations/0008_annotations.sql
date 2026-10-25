-- Annotations (DATA_MODEL §6): current head rows, append-only revisions, full-text search over notes.
-- The plan numbered this 0004, but migrations 0004–0007 already existed, so it is 0008.
CREATE TABLE IF NOT EXISTS annotations (
    annotation_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    segment_id TEXT NOT NULL REFERENCES video_segments (segment_id),
    media_start_ms INTEGER NOT NULL CHECK (media_start_ms >= 0),
    media_end_ms INTEGER NOT NULL CHECK (media_end_ms > media_start_ms),
    subject_player_id INTEGER,
    subject_identity_status TEXT NOT NULL CHECK (subject_identity_status IN ('verified', 'asserted', 'unknown')),
    action TEXT NOT NULL,
    vocab_version INTEGER NOT NULL,
    outcome TEXT,
    participants_json TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('full', 'partial', 'obstructed', 'off_frame')),
    label_source TEXT NOT NULL DEFAULT 'human',
    confidence_raw REAL,
    sampling_method TEXT NOT NULL
        CHECK (sampling_method IN ('complete_event_set', 'systematic_sample', 'random_sample', 'curated', 'provider_selected')),
    event_key_json TEXT,
    game_id TEXT,
    notes TEXT,
    supporting_timestamps_json TEXT,
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    reviewed_by TEXT,
    reviewed_at TEXT,
    superseded_by TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_annotations_segment ON annotations (namespace, segment_id, media_start_ms);
CREATE INDEX IF NOT EXISTS ix_annotations_subject ON annotations (namespace, subject_player_id);
CREATE INDEX IF NOT EXISTS ix_annotations_game ON annotations (namespace, game_id);

CREATE TABLE IF NOT EXISTS annotation_revisions (
    annotation_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    revision INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    diff_json TEXT NOT NULL,
    changed_by TEXT,
    changed_at TEXT NOT NULL,
    change_reason TEXT,
    PRIMARY KEY (annotation_id, revision)
);

-- Maintained by app.evidence.annotations on every save (no triggers: the migration runner splits on semicolons).
CREATE VIRTUAL TABLE IF NOT EXISTS annotations_fts USING fts5 (
    annotation_id UNINDEXED,
    namespace UNINDEXED,
    notes,
    tokenize = 'porter unicode61'
);

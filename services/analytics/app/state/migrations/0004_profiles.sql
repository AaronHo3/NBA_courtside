-- Scouting profile snapshots: a stored, reproducible derived view with the inputs that produced it.
CREATE TABLE IF NOT EXISTS scouting_profile_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    season TEXT NOT NULL,
    season_type TEXT NOT NULL,
    cohort_json TEXT NOT NULL,
    cohort_hash TEXT NOT NULL,
    traits_json TEXT NOT NULL,
    evidence_ids_json TEXT NOT NULL,
    trait_registry_version INTEGER NOT NULL,
    snapshot_version INTEGER NOT NULL DEFAULT 1,
    data_fingerprint TEXT NOT NULL,
    stale INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (namespace, player_id, season, season_type, cohort_hash, trait_registry_version, data_fingerprint)
);
CREATE INDEX IF NOT EXISTS ix_profile_snapshots_player ON scouting_profile_snapshots (namespace, player_id, season, season_type, created_at);

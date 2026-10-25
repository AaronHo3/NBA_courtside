-- Saved candidate lists with the ranking context frozen at save time (DATA_MODEL §9).
CREATE TABLE IF NOT EXISTS shortlists (
    shortlist_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    label TEXT NOT NULL,
    role_id TEXT,
    role_version INTEGER,
    season TEXT NOT NULL,
    season_type TEXT NOT NULL,
    cohort_json TEXT,
    ranking_meta_json TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_shortlists_namespace ON shortlists (namespace, created_at);

CREATE TABLE IF NOT EXISTS shortlist_entries (
    shortlist_id TEXT NOT NULL REFERENCES shortlists (shortlist_id) ON DELETE CASCADE,
    namespace TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    score REAL,
    eligible INTEGER,
    missing_json TEXT,
    contributions_json TEXT,
    added_by TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (shortlist_id, player_id)
);

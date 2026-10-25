-- Scouting report drafts and their validated claims (DATA_MODEL §9).
CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    shortlist_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
    season TEXT NOT NULL,
    season_type TEXT NOT NULL,
    sections_json TEXT NOT NULL,
    numbers_json TEXT NOT NULL,
    data_fingerprint TEXT,
    llm_mode TEXT NOT NULL DEFAULT 'none',
    model_id TEXT,
    generated_by TEXT NOT NULL,
    rendered_markdown TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reports_namespace ON reports (namespace, created_at);

CREATE TABLE IF NOT EXISTS report_claims (
    claim_id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES reports (report_id) ON DELETE CASCADE,
    namespace TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    claim_text TEXT NOT NULL,
    claim_type TEXT NOT NULL,
    original_type TEXT NOT NULL,
    player_ids_json TEXT NOT NULL,
    time_scope_json TEXT NOT NULL,
    evidence_ids_json TEXT NOT NULL,
    numeric_refs_json TEXT NOT NULL,
    limitations_json TEXT NOT NULL,
    counterevidence_ids_json TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    validation_notes_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_report_claims_report ON report_claims (report_id, order_index);

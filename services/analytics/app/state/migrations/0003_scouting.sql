-- User-defined role templates (built-ins live in code: app/scouting/roles.py).
CREATE TABLE IF NOT EXISTS role_templates (
    role_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    components_json TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    optional_video_traits_json TEXT NOT NULL,
    caveats_json TEXT NOT NULL,
    cohort_defaults_json TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_role_templates_namespace ON role_templates (namespace, created_at);

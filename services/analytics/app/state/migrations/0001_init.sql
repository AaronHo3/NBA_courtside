-- Namespace guard and file-level metadata. Feature tables arrive with their own tasks.
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

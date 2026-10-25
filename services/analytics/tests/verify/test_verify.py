from app.data.db import Database
from app.verify import verify_player, verify_team


def test_player_and_team_summaries_match_logs(demo_layout):
    db = Database(demo_layout)
    label, checks = verify_player(db, "2024-25", "Regular Season", None)
    assert checks, label
    assert all(c.ok for c in checks), [c for c in checks if not c.ok]
    label, checks = verify_team(db, "2024-25", "Regular Season", None)
    assert checks, label
    assert all(c.ok for c in checks), [c for c in checks if not c.ok]


def test_missing_logs_is_reported_not_crashed(demo_layout):
    db = Database(demo_layout)
    label, checks = verify_player(db, "2023-24", "Regular Season", None)
    assert checks == [] and "no game logs" in label

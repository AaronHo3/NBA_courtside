from app.evidence.cli import main
from app.state.connection import open_state_db

GAME = "0022400061"


def test_link_events_command(nba_root, events_db, capsys):
    code = main(["--data-dir", str(nba_root), "link-events", "--game-id", GAME])
    assert code == 0
    out = capsys.readouterr().out
    assert "links" in out and GAME in out
    db = open_state_db(events_db.layout)
    try:
        assert db.scalar("SELECT COUNT(*) FROM event_video_links") > 0
    finally:
        db.close()

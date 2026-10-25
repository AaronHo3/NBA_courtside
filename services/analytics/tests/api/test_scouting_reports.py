def _ok(resp, codes=(200, 201)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


def test_report_lifecycle(client):
    sl, _ = _ok(
        client.post(
            "/api/scouting/shortlists",
            json={
                "label": "R",
                "season": "2024-25",
                "source": {
                    "role": "rebounding_interior_player",
                    "min_gp": 5,
                    "min_minutes": 100,
                    "limit": 3,
                },
            },
        )
    )
    report, meta = _ok(
        client.post(
            "/api/scouting/reports", json={"shortlist_id": sl["shortlist_id"], "title": "Bigs"}
        )
    )
    rid = report["report_id"]
    assert (
        report["status"] == "draft"
        and meta["llm_mode"] == "none"
        and report["rendered_markdown"].startswith("# Bigs")
    )
    pid = report["sections"][0]["players"][0]["player_id"]
    stored, _ = _ok(
        client.post(
            f"/api/scouting/reports/{rid}/claims",
            json={
                "claims": [
                    {
                        "text": "plays hard",
                        "claim_type": "reviewed_observation",
                        "player_ids": [pid],
                        "time_scope": {"season": "2024-25"},
                    },
                    {
                        "text": "no contract data",
                        "claim_type": "limitation",
                        "player_ids": [],
                        "time_scope": {},
                    },
                ]
            },
        )
    )
    assert [c["validation_status"] for c in stored["claims"]] == ["downgraded", "valid"]
    one, _ = _ok(client.get(f"/api/scouting/reports/{rid}"))
    assert one["claims"][0]["claim_type"] == "interpretation"
    listed, _ = _ok(client.get("/api/scouting/reports"))
    assert any(r["report_id"] == rid for r in listed)
    patched, _ = _ok(
        client.patch(
            f"/api/scouting/reports/{rid}",
            json={"interpretation": "Worth a closer look at closeouts.", "status": "final"},
        )
    )
    assert patched["status"] == "final" and "closer look" in patched["rendered_markdown"]
    assert client.get("/api/scouting/reports/01HZZZZZZZZZZZZZZZZZZZZZZZ").status_code == 404
    assert client.post("/api/scouting/reports", json={"title": "x"}).status_code == 422

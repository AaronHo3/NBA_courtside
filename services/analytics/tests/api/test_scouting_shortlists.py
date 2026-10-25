def _ok(resp, codes=(200, 201)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


def test_shortlist_lifecycle_over_the_api(client):
    created, _ = _ok(
        client.post(
            "/api/scouting/shortlists",
            json={
                "label": "Rebounders",
                "season": "2024-25",
                "season_type": "Regular Season",
                "source": {
                    "role": "rebounding_interior_player",
                    "min_gp": 5,
                    "min_minutes": 100,
                    "limit": 4,
                },
            },
        )
    )
    sid = created["shortlist_id"]
    assert len(created["entries"]) == 4 and created["ranking_meta"]["funnel"]
    listed, meta = _ok(client.get("/api/scouting/shortlists"))
    assert any(s["shortlist_id"] == sid for s in listed) and meta["total"] >= 1
    one, _ = _ok(client.get(f"/api/scouting/shortlists/{sid}"))
    assert one["label"] == "Rebounders"
    pid = one["entries"][0]["player_id"]
    patched, _ = _ok(
        client.patch(
            f"/api/scouting/shortlists/{sid}/entries/{pid}", json={"pinned": True, "note": "n"}
        )
    )
    assert [e for e in patched["entries"] if e["player_id"] == pid][0]["pinned"] is True
    added, _ = _ok(
        client.post(
            f"/api/scouting/shortlists/{sid}/entries",
            json={"player_ids": [9000001, 9000002], "added_by": "compare"},
        )
    )
    assert len(added["entries"]) >= 5
    removed, _ = _ok(client.delete(f"/api/scouting/shortlists/{sid}/entries/{pid}"))
    assert pid not in [e["player_id"] for e in removed["entries"]]
    renamed, _ = _ok(
        client.patch(f"/api/scouting/shortlists/{sid}", json={"label": "Rebounders 2"})
    )
    assert renamed["label"] == "Rebounders 2"
    _ok(client.delete(f"/api/scouting/shortlists/{sid}"))
    assert client.get(f"/api/scouting/shortlists/{sid}").status_code == 404


def test_validation_and_guards(client):
    assert (
        client.post("/api/scouting/shortlists", json={"label": "", "season": "2024-25"}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/scouting/shortlists",
            json={"label": "x", "season": "2024-25", "source": {"role": "nope"}},
        ).status_code
        == 404
    )
    r = client.post(
        "/api/scouting/shortlists",
        json={"label": "x", "season": "2024-25", "player_ids": [1628369]},
    )
    assert (
        r.status_code == 422
        and "demo" in r.json()["error"].lower()
        or "provider" in r.json()["error"].lower()
    )
    assert client.get("/api/scouting/shortlists/01HZZZZZZZZZZZZZZZZZZZZZZZ").status_code == 404

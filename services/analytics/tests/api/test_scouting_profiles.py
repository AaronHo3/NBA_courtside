def _ok(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


def test_profile_endpoint(client):
    pid = _ok(client.get("/api/players/search", params={"q": "a"}))[0][0]["player_id"]
    data, meta = _ok(client.get(f"/api/scouting/profiles/{pid}", params={"season": "2024-25"}))
    assert data["player"]["player_id"] == pid
    assert set(data["traits"]) == {
        "statistical",
        "reviewed_observation",
        "model_estimate",
        "interpretation",
    }
    assert meta["snapshot_id"] == data["snapshot"]["snapshot_id"] and meta["data_fingerprint"]
    assert client.get("/api/scouting/profiles/1", params={"season": "2024-25"}).status_code == 404


def test_snapshots_endpoint(client):
    pid = _ok(client.get("/api/players/search", params={"q": "a"}))[0][0]["player_id"]
    _ok(client.get(f"/api/scouting/profiles/{pid}", params={"season": "2024-25"}))
    data, _ = _ok(
        client.get(f"/api/scouting/profiles/{pid}/snapshots", params={"season": "2024-25"})
    )
    assert data and {"snapshot_id", "data_fingerprint", "stale", "created_at"} <= set(data[0])

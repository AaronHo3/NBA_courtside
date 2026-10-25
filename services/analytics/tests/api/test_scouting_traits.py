def _ok(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


def test_registry_endpoint(client):
    data, meta = _ok(client.get("/api/scouting/traits"))
    assert any(t["key"] == "fg3_pct" for t in data)
    assert meta["trait_registry_version"] == 1


def test_player_traits_endpoint(client):
    pid = _ok(client.get("/api/players/search", params={"q": "a"}))[0][0]["player_id"]
    data, meta = _ok(
        client.get(
            f"/api/scouting/traits/{pid}", params={"season": "2024-25", "keys": "ts_pct,fg3_pct"}
        )
    )
    assert {r["key"] for r in data} == {"ts_pct", "fg3_pct"}
    assert meta["cohort"]["min_gp"] == 10 and meta["trait_registry_version"] == 1
    assert client.get("/api/scouting/traits/1", params={"season": "2024-25"}).status_code == 404
    assert (
        client.get(
            f"/api/scouting/traits/{pid}", params={"season": "2024-25", "keys": "nope"}
        ).status_code
        == 422
    )

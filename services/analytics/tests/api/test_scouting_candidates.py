def _ok(resp):
    assert resp.status_code in (200, 201), resp.text  # creates answer 201
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


def test_roles_endpoint_lists_builtins(client):
    data, meta = _ok(client.get("/api/scouting/roles"))
    ids = [r["role_id"] for r in data]
    assert "low_usage_perimeter_shooter" in ids and all("components" in r for r in data)
    assert meta["trait_registry_version"] == 1


def test_candidates_endpoint(client):
    data, meta = _ok(
        client.get(
            "/api/scouting/candidates",
            params={
                "role": "rebounding_interior_player",
                "season": "2024-25",
                "min_gp": 5,
                "min_minutes": 100,
                "limit": 5,
            },
        )
    )
    assert len(data) <= 5 and meta["total"] >= len(data)
    assert meta["funnel"] and meta["template"]["version"] >= 1
    assert (
        client.get(
            "/api/scouting/candidates", params={"role": "nope", "season": "2024-25"}
        ).status_code
        == 404
    )
    assert (
        client.get(
            "/api/scouting/candidates",
            params={"role": "rebounding_interior_player", "season": "2024-25", "limit": 500},
        ).status_code
        == 422
    )


def test_custom_candidates_and_saved_roles(client):
    body = {
        "label": "Shooting bigs",
        "description": "test",
        "components": [
            {"trait_key": "fg3_pct", "weight": 2},
            {"trait_key": "reb_per36", "weight": 1},
        ],
        "filters": [{"column": "position", "op": "in", "value": ["C", "F"]}],
        "season": "2024-25",
        "season_type": "Regular Season",
        "min_gp": 5,
        "min_minutes": 100,
        "limit": 5,
    }
    data, meta = _ok(client.post("/api/scouting/candidates", json=body))
    assert (
        meta["template"]["is_builtin"] is False
        and meta["template"]["components"][0]["trait_key"] == "fg3_pct"
    )
    bad = client.post(
        "/api/scouting/candidates",
        json={**body, "components": [{"trait_key": "nope", "weight": 1}]},
    )
    assert bad.status_code == 422
    saved, _ = _ok(
        client.post(
            "/api/scouting/roles",
            json={k: body[k] for k in ("label", "description", "components", "filters")},
        )
    )
    assert len(saved["role_id"]) == 26
    listed, _ = _ok(client.get("/api/scouting/roles"))
    assert any(r["role_id"] == saved["role_id"] for r in listed)
    one, _ = _ok(client.get(f"/api/scouting/roles/{saved['role_id']}"))
    assert one["label"] == "Shooting bigs"
    data2, meta2 = _ok(
        client.get(
            "/api/scouting/candidates",
            params={"role": saved["role_id"], "season": "2024-25", "min_gp": 5, "min_minutes": 100},
        )
    )
    assert meta2["template"]["role_id"] == saved["role_id"]

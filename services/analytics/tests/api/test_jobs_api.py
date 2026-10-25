from app.jobs import queue as q


def _ok(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


def test_jobs_routes(client):
    state = client.app.state.state_db
    job = q.enqueue(state, "test_noop", {"a": 1}, idempotency_key="api:test:1")
    rows, meta = _ok(client.get("/api/jobs", params={"status": "queued"}))
    assert any(r["job_id"] == job.job_id for r in rows) and meta["total"] >= 1
    one, _ = _ok(client.get(f"/api/jobs/{job.job_id}"))
    assert one["job"]["kind"] == "test_noop" and one["events"][0]["type"] == "enqueued"
    cancelled, _ = _ok(client.post(f"/api/jobs/{job.job_id}/cancel"))
    assert cancelled["job"]["status"] == "cancelled"
    assert client.get("/api/jobs/01HZZZZZZZZZZZZZZZZZZZZZZZ").status_code == 404
    caps, _ = _ok(client.get("/api/meta/capabilities"))
    assert caps["worker_alive"] is False and caps["jobs"]["inline"] in (True, False)

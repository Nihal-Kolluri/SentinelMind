"""API integration tests."""
from fastapi.testclient import TestClient
from sentinelmind.api import app

client = TestClient(app)


def test_list_incidents():
    response = client.get("/api/incidents")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 10
    ids = [inc["id"] for inc in data]
    assert "INC-101" in ids
    assert "INC-102" in ids
    assert "INC-103" in ids
    assert "INC-104" in ids
    assert "INC-108" in ids


def test_get_incident_detail():
    response = client.get("/api/incidents/INC-101")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "INC-101"
    assert data["scenario"]["service"] == "payments-api"


def test_demo_seed_and_stats():
    # Seed demo data
    res_seed = client.post("/api/demo/seed")
    assert res_seed.status_code == 200

    # Verify stats
    res_stats = client.get("/api/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "time_saved_pct" in stats
    assert "actions_reduced_pct" in stats


def test_kill_switch():
    response = client.post("/api/kill")
    assert response.status_code == 200
    assert "Kill switch triggered" in response.json()["message"]


def test_custom_incident_analysis():
    payload = {
        "service": "dynamic-payment-gw",
        "severity": "P1",
        "category": "performance",
        "description": "Massive gateway latency surge",
        "p95_ms": 4600,
        "error_rate": 0.12,
        "logs": [
            "dynamic-payment-gw ERROR connection pool exhausted (size=20, wait=140)",
            "postgres WARN connection limit reached",
        ],
        "root_cause": "db_pool_exhaustion",
        "effective_action": "increase_db_pool",
        "memory_on": False,
        "run_immediately": True,
    }
    response = client.post("/api/incidents/custom", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "incident_id" in data
    assert data["incident_id"].startswith("INC-DYN-")
    assert data["scenario"]["service"] == "dynamic-payment-gw"
    assert data["run"] is not None
    assert data["run"]["status"] in ("resolved", "escalated")
    assert data["run"]["root_cause_analysis"] is not None
    assert len(data["run"]["actionable_recommendations"]) > 0
    assert len(data["run"]["agent_reasoning"]) > 0


def test_history_endpoint_and_persistence():
    # 1. Ingest dynamic incident
    payload = {
        "service": "history-audit-svc",
        "severity": "P2",
        "category": "performance",
        "description": "Simulated history persistence check",
        "p95_ms": 3800,
        "error_rate": 0.08,
        "logs": ["history-audit-svc WARN redis cache miss 90%"],
        "root_cause": "cache_stampede",
        "effective_action": "enable_request_coalescing",
        "memory_on": True,
        "run_immediately": True,
    }
    create_res = client.post("/api/incidents/custom", json=payload)
    assert create_res.status_code == 200
    created_id = create_res.json()["incident_id"]

    # 2. Check that the run appears in /api/history
    hist_res = client.get("/api/history?limit=100")
    assert hist_res.status_code == 200
    runs = hist_res.json()
    assert len(runs) > 0
    matching_runs = [r for r in runs if r.get("incident_id") == created_id]
    assert len(matching_runs) > 0
    run_entry = matching_runs[0]
    assert run_entry["service"] == "history-audit-svc"
    assert run_entry["status"] in ("resolved", "escalated")
    assert run_entry.get("root_cause_analysis") is not None

    # 3. Check service filter in /api/history
    svc_res = client.get("/api/history?service=history-audit-svc")
    assert svc_res.status_code == 200
    svc_runs = svc_res.json()
    assert len(svc_runs) >= 1
    assert all(r["service"] == "history-audit-svc" for r in svc_runs)

    # 4. Check persistent retrieval via GET /api/incidents/{created_id}
    inc_res = client.get(f"/api/incidents/{created_id}")
    assert inc_res.status_code == 200
    inc_data = inc_res.json()
    assert inc_data["id"] == created_id
    assert inc_data["scenario"]["service"] == "history-audit-svc"
    assert inc_data["latest_run"] is not None
    assert inc_data["latest_run"]["incident_id"] == created_id


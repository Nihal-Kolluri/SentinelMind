"""Tests for health endpoint and degraded mode detection."""
import os
from fastapi.testclient import TestClient
from sentinelmind.api import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "llm_provider" in data
    assert "hindsight_bank" in data
    assert "memory_degraded" in data


def test_health_degraded_when_keys_missing(monkeypatch):
    monkeypatch.delenv("HINDSIGHT_API_KEY", raising=False)
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "degraded"
    assert data["memory_degraded"] is True

"""Tests verifying that memory reduces resolution time and action counts."""
from sentinelmind.orchestrator import run_incident
from sentinelmind.memory import NullMemory


def test_memory_acceleration(fake_llm, fake_mem):
    # 1. Baseline: Run INC-102 cold without memory
    base = run_incident("INC-102", NullMemory(), fake_llm, label="baseline")
    assert base["status"] == "resolved"
    assert len(base["tried"]) >= 3
    assert base["minutes"] >= 16

    # 2. Learn: Run INC-101 and INC-103 with memory to seed knowledge
    run_incident("INC-101", fake_mem, fake_llm, label="learn")
    run_incident("INC-103", fake_mem, fake_llm, label="learn")

    # 3. With Memory: Run INC-102 again (warm)
    warm = run_incident("INC-102", fake_mem, fake_llm, label="with_memory")
    assert warm["status"] == "resolved"

    # Verifications: With-memory is significantly faster and requires fewer actions
    assert len(warm["tried"]) < len(base["tried"])
    assert warm["minutes"] < base["minutes"]
    assert warm["tried"][0] == "enable_request_coalescing"

    # Memory trail was recorded and influenced agents
    assert len(warm["memory_trail"]) > 0
    trail_item = warm["memory_trail"][0]
    assert trail_item["incident_id"] == "INC-101"
    assert "Planner" in trail_item["influenced"]

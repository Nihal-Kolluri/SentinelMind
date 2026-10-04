"""Tests verifying that worsening metrics trigger automatic rollback and plan freezing."""
from sentinelmind.orchestrator import run_incident
from sentinelmind.memory import NullMemory


def test_harmful_action_rollback(fake_llm):
    # Running INC-103 or INC-104 without memory tries default order: restart_pods, scale_out...
    # scale_out is harmful in db_pool_exhaustion, worsening latency by 40%
    st = run_incident("INC-104", NullMemory(), fake_llm, label="rollback_test")

    assert st["status"] == "resolved"
    assert "scale_out" in st["tried"]
    assert "scale_out" in st["worsened"]

    # Verify rollback was recorded in exec_log
    rollback_entries = [e for e in st["exec_log"] if "worsened" in str(e).lower() or "rolled back" in str(e).lower()]
    assert len(rollback_entries) > 0
    assert "increase_db_pool" in st["succeeded"]

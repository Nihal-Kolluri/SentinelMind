"""Tests for human approval gating and escalation handling."""
from sentinelmind.orchestrator import run_incident


def test_high_risk_action_escalation(fake_llm, fake_mem):
    # INC-108 requires failover_db which is 'high' risk and not in AUTO_APPROVE
    st = run_incident("INC-108", fake_mem, fake_llm, label="escalation_test")

    assert st["status"] == "escalated"
    assert st["escalated"] is True
    assert "failover_db" in st["needs_human"]
    assert "human approval" in st["escalation_reason"].lower()

    # Verify that escalation learning was retained into memory
    retained_escalation = [d for d in fake_mem.docs if "ESCALATED" in d and "INC-108" in d]
    assert len(retained_escalation) > 0

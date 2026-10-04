"""Tests for orchestrator state machine, agent transitions, and checkpointing."""
import os
from sentinelmind.orchestrator import run_incident
from sentinelmind.memory import NullMemory


def test_state_machine_full_run(fake_llm):
    events = []

    def on_event(ev_type, data):
        events.append((ev_type, data))

    st = run_incident(
        incident_id="INC-101",
        mem=NullMemory(),
        llm=fake_llm,
        label="test_sm",
        on_event=on_event,
    )

    assert st["status"] == "resolved"
    assert st["service"] == "payments-api"
    assert st["diagnosis"]["root_cause"] == "cache_stampede"
    assert len(st["tried"]) > 0
    assert "enable_request_coalescing" in st["succeeded"]
    assert st["minutes"] > 0

    # Verify event emission occurred
    event_types = [e[0] for e in events]
    assert "start" in event_types
    assert "stage" in event_types
    assert "step_complete" in event_types
    assert "complete" in event_types

    # Check checkpoint file created
    checkpoint_file = f"runs/INC-101-test_sm.json"
    assert os.path.exists(checkpoint_file)

    # Verify Root Cause Analysis
    assert st.get("root_cause_analysis") is not None
    assert st["root_cause_analysis"]["root_cause"] == "cache_stampede"
    assert "Cache Stampede" in st["root_cause_analysis"]["title"]
    assert "evidence" in st["root_cause_analysis"]
    assert "impact" in st["root_cause_analysis"]

    # Verify Actionable Recommendations
    assert isinstance(st.get("actionable_recommendations"), list)
    assert len(st["actionable_recommendations"]) > 0
    actions = [r["action"] for r in st["actionable_recommendations"]]
    assert "enable_request_coalescing" in actions

    # Verify Agent Reasoning
    assert isinstance(st.get("agent_reasoning"), list)
    assert len(st["agent_reasoning"]) >= 4
    agents_in_trace = [s["agent"] for s in st["agent_reasoning"]]
    assert "Sentinel" in agents_in_trace
    assert "Triage" in agents_in_trace
    assert "Investigator" in agents_in_trace
    assert "Planner" in agents_in_trace


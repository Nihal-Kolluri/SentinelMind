"""Test fixtures with deterministic FakeLLM and FakeMemory for offline test suite."""
import json
import os
import re
import pytest
from typing import Any, Dict, List

# Ensure project root is in sys.path
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


class FakeMemory:
    """In-memory simulation of Hindsight memory layer."""
    enabled = True
    degraded = False

    def __init__(self):
        self.docs: List[str] = []

    def retain(self, content: str, context: str = "incident postmortem") -> None:
        self.docs.append(content)

    def recall(self, query: str, k: int = 8) -> List[str]:
        q_tokens = set(re.findall(r"[a-zA-Z0-9_-]+", query.lower()))
        matched = []
        for doc in self.docs:
            d_tokens = set(re.findall(r"[a-zA-Z0-9_-]+", doc.lower()))
            overlap = len(q_tokens & d_tokens)
            if overlap >= 3:
                matched.append(doc)
        return matched[:k]

    def reflect(self, query: str) -> str:
        return "Synthesized playbook: For cache_stampede use enable_request_coalescing; for db_pool_exhaustion use increase_db_pool."


class FakeLLM:
    """Deterministic LLM mock responding with valid JSON tailored to agent prompts."""

    def json(self, system: str, user: str, retries: int = 2) -> Dict[str, Any]:
        u = json.loads(user) if user.startswith("{") else {}
        memory = " ".join(u.get("memory", []))

        # Triage agent
        if "AGENT:triage" in system:
            known = bool(memory and ("Incident" in memory or "SUCCEEDED" in memory))
            return {
                "severity": "P2",
                "category": "performance",
                "known": known,
                "match_note": "Matches prior incident pattern" if known else "Novel pattern",
            }

        # Investigator agent
        if "AGENT:investigator" in system:
            logs = " ".join(u.get("logs", [])).lower()
            if "deadlock" in logs or "lock" in logs:
                rc = "database_lock_contention"
            elif "cache" in logs or "redis" in logs:
                rc = "cache_stampede"
            elif "pool" in logs or "connection" in logs:
                rc = "db_pool_exhaustion"
            elif "oom" in logs or "memory" in logs:
                rc = "memory_leak"
            else:
                rc = "unknown_issue"

            return {
                "root_cause": rc,
                "explanation": f"Automated root cause identification for {rc}",
                "confidence": 0.85,
                "evidence": ["Log match", "Metric pattern"],
            }

        # Planner agent
        if "AGENT:planner" in system:
            root_cause = u.get("root_cause", {}).get("root_cause", "")
            if root_cause == "database_lock_contention":
                # High-risk action requiring human approval
                return {"plan": ["failover_db"], "rationale": "Database failover required"}

            # Memory-guided ordering: find succeeded actions for this root cause
            good = re.findall(r"Action\s+(\w+)\s+SUCCEEDED", memory)
            # Only consider actions bad if they failed or worsened THIS specific root cause
            bad = re.findall(rf"Action\s+(\w+)\s+(?:FAILED for {root_cause}|made {root_cause} WORSE)", memory)


            default_order = [
                "restart_pods",
                "scale_out",
                "enable_request_coalescing",
                "increase_db_pool",
                "warm_cache",
            ]

            # Prioritize proven successes, exclude proven bad
            plan = [a for a in good if a not in bad]
            for a in default_order:
                if a not in plan and a not in bad:
                    plan.append(a)

            tried = u.get("already_tried", [])
            final_plan = [a for a in plan if a not in tried][:3]
            return {"plan": final_plan, "rationale": "Memory informed plan"}

        # Historian agent
        if "AGENT:historian" in system:
            return {"lesson": "Always leverage past memory to avoid harmful actions."}

        return {"status": "ok"}


@pytest.fixture
def fake_llm():
    return FakeLLM()


@pytest.fixture
def fake_mem():
    return FakeMemory()


@pytest.fixture
def tmp_db(tmp_path):
    return str(tmp_path / "test_sentinelmind.sqlite3")

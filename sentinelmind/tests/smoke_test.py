"""Offline test with a fake LLM and fake memory: verifies the state machine, learning effect, rollback and escalation."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from sentinelmind.orchestrator import run_incident
from sentinelmind.memory import NullMemory


class FakeMem:
    enabled = True
    def __init__(self): self.docs = []
    def retain(self, content, context=""): self.docs.append(content)
    def recall(self, q, k=8):
        toks = set(re.findall(r"[a-z]+", q.lower()))
        return [d for d in self.docs if len(toks & set(re.findall(r"[a-z]+", d.lower()))) >= 4][:k]
    def reflect(self, q): return "reflection"


class FakeLLM:
    def json(self, system, user):
        import json; u = json.loads(user) if user.startswith("{") else {}
        mem = " ".join(u.get("memory", []))
        if "AGENT:triage" in system: return dict(severity="P2", category="performance", known=bool(mem), match_note="")
        if "AGENT:investigator" in system:
            logs = " ".join(u["logs"]).lower()
            rc = "cache_stampede" if ("cache" in logs or "redis" in logs) else "db_pool_exhaustion"
            return dict(root_cause=rc, explanation="x", confidence=0.9, evidence=[])
        if "AGENT:planner" in system:
            good = re.findall(r"Action (\w+) SUCCEEDED", mem); bad = re.findall(r"Action (\w+) (?:FAILED|made)", mem)
            tried = re.search(r"do not repeat\): (\[.*?\])", system); tried = eval(tried.group(1)) if tried else []
            order = ["restart_pods", "scale_out", "enable_request_coalescing", "increase_db_pool"]
            plan = good + [a for a in order if a not in bad and a not in good]
            return dict(plan=[a for a in plan if a not in tried][:3], rationale="")
        return dict(lesson="ok")


llm, mem = FakeLLM(), FakeMem()
base = run_incident("INC-102", NullMemory(), llm, "test")
run_incident("INC-101", mem, llm, "test"); run_incident("INC-103", mem, llm, "test")
learned = run_incident("INC-102", mem, llm, "test")
base4 = run_incident("INC-104", NullMemory(), llm, "test")
learned4 = run_incident("INC-104", mem, llm, "test")
print("INC-102 baseline", base["tried"], base["minutes"], "| with memory", learned["tried"], learned["minutes"])
print("INC-104 baseline", base4["tried"], base4["minutes"], "worsened", base4["worsened"], "| with memory", learned4["tried"], learned4["minutes"])
assert learned["minutes"] < base["minutes"] and learned4["minutes"] < base4["minutes"]
assert learned["tried"][0] == "enable_request_coalescing" and learned4["tried"] == ["increase_db_pool"]
assert base4["worsened"] == ["scale_out"]
print("SMOKE TEST PASSED")

"""Orchestrator: owns the state machine, retry budgets, checkpoints, escalation,
and event emissions for real-time Server-Sent Events (SSE).
"""
import copy
import json
import logging
import os
import time
from typing import Any, Callable, Dict, List, Optional
from . import agents as A
from .world import World
from .db import save_run

log = logging.getLogger("sentinelmind.orchestrator")
MAX_REPLANS = 2

# Global kill switch registry for currently executing incidents
ACTIVE_RUNS: Dict[str, bool] = {}


class Escalate(Exception):
    pass


class Aborted(Exception):
    pass


def set_kill_switch(incident_id: Optional[str] = None) -> None:
    """Activates the kill switch to abort all running incidents or a specific one."""
    if incident_id:
        ACTIVE_RUNS[incident_id] = False
        log.warning("Kill switch set for incident: %s", incident_id)
    else:
        for k in list(ACTIVE_RUNS.keys()):
            ACTIVE_RUNS[k] = False
        log.warning("Global kill switch activated for all incidents.")


def _guard(st: Dict[str, Any], name: str, fn: Callable[[], Any], on_event: Optional[Callable[[str, Any], None]] = None, retries: int = 2) -> Any:
    """Runs one agent step with retry/backoff. Exhausted retries raise Escalate."""
    # Check kill switch before starting step
    if not ACTIVE_RUNS.get(st["id"], True):
        raise Aborted(f"Incident {st['id']} aborted by kill switch")

    st["current_stage"] = name
    if st.get("status") != "resolved" and st.get("status") != "escalated":
        st["status"] = name
    _emit(on_event, "stage", {"stage": name, "incident_id": st["id"], "minutes": st["minutes"]})
    _checkpoint(st)

    for attempt in range(retries + 1):
        try:
            out = fn()
            _checkpoint(st)
            _emit(on_event, "step_complete", {
                "stage": name,
                "incident_id": st["id"],
                "minutes": st["minutes"],
                "log_lines": list(st.get("log_lines", [])),
                "memory_trail": list(st.get("memory_trail", [])),
                "confidence": st.get("confidence", 0.5),
                "confidence_breakdown": st.get("confidence_breakdown"),
                "root_cause_analysis": st.get("root_cause_analysis"),
                "actionable_recommendations": st.get("actionable_recommendations", []),
                "agent_reasoning": list(st.get("agent_reasoning", [])),
                "memory_correlation": st.get("memory_correlation"),
            })
            return out
        except Exception as e:
            log.warning("%s failed (%d/%d): %s", name, attempt + 1, retries + 1, e)
            if attempt < retries:
                time.sleep(0.5 * (2 ** attempt))
            else:
                raise Escalate(f"{name} exhausted retries: {e}")


def _checkpoint(st: Dict[str, Any], d: str = "runs") -> None:
    os.makedirs(d, exist_ok=True)
    filepath = f"{d}/{st['id']}-{st['label']}.json"
    with open(filepath, "w") as f:
        json.dump(st, f, indent=2, default=str)
    try:
        save_run(st)
    except Exception as e:
        log.warning("SQLite checkpoint failed: %s", e)


def _emit(callback: Optional[Callable[[str, Any], None]], event_type: str, data: Any) -> None:
    if callback:
        try:
            callback(event_type, data)
        except Exception as e:
            log.warning("Event emission callback error: %s", e)


def run_incident(
    incident_id: str,
    mem: Any,
    llm: Any,
    label: str = "run",
    on_event: Optional[Callable[[str, Any], None]] = None,
) -> Dict[str, Any]:
    """Executes the full incident response state machine:
    Sentinel -> Triage -> Investigator -> Planner -> Executor -> Verifier -> Historian
    """
    ACTIVE_RUNS[incident_id] = True
    world = World(incident_id)

    st: Dict[str, Any] = {
        "id": incident_id,
        "label": label,
        "status": "detected",
        "service": world.s["service"],
        "severity": world.s.get("severity", "P2"),
        "category": world.s.get("category", "performance"),
        "minutes": 1,
        "tried": [],
        "succeeded": [],
        "failed": [],
        "worsened": [],
        "exec_log": [],
        "log_lines": [],
        "memory_trail": [],
        "metric_history": list(world.metric_history),
        "escalated": False,
        "escalation_reason": "",
        "needs_human": [],
        "memory_on": bool(getattr(mem, "enabled", False)),
        "memory_degraded": bool(getattr(mem, "degraded", False)),
        "confidence": 0.5,
        "confidence_breakdown": None,
        "diagnosis": {},
        "root_cause_analysis": None,
        "actionable_recommendations": [],
        "agent_reasoning": [],
        "memory_correlation": None,
        "postmortem": "",
        "reflection": "",
    }

    _emit(on_event, "start", {"incident_id": incident_id, "service": st["service"], "memory_on": st["memory_on"]})

    try:
        # 1. Sentinel
        _guard(st, "detected", lambda: A.sentinel(st, world), on_event)

        # 2. Triage
        _guard(st, "triaged", lambda: A.triage(st, mem, llm), on_event)

        # 3. Investigator
        _guard(st, "investigating", lambda: A.investigator(st, world, mem, llm), on_event)

        # 4. Planner & Execution Loop
        resolved = False
        for replan in range(MAX_REPLANS + 1):
            if not ACTIVE_RUNS.get(incident_id, True):
                raise Aborted("Aborted by kill switch")

            _guard(st, "planned", lambda: A.planner(st, mem, llm), on_event)

            # High-risk action requires human escalation
            if st.get("needs_human"):
                raise Escalate(f"Action {st['needs_human']} requires human approval (high-risk)")

            if not st.get("plan"):
                raise Escalate("No approved actions left in plan")

            # Execute planned steps sequentially
            for action in list(st["plan"]):
                if not ACTIVE_RUNS.get(incident_id, True):
                    raise Aborted("Aborted by kill switch")

                # Executor step
                st["status"] = "executing"
                _emit(on_event, "action_start", {"action": action, "incident_id": incident_id})
                A.executor_step(st, world, action)
                st["metric_history"] = list(world.metric_history)
                _checkpoint(st)

                # Verifier step
                st["status"] = "verifying"
                verdict = A.verifier(st, world, action)
                st["metric_history"] = list(world.metric_history)
                _checkpoint(st)

                _emit(on_event, "action_result", {
                    "action": action,
                    "verdict": verdict,
                    "metrics": world.metrics(),
                    "minutes": st["minutes"],
                })

                if verdict == "resolved":
                    st["status"] = "resolved"
                    resolved = True
                    break

                if verdict == "worsened":
                    # Freeze remaining steps in this plan and trigger replan
                    _emit(on_event, "plan_frozen", {"bad_action": action, "replan": replan + 1})
                    break

            if resolved:
                break
        else:
            raise Escalate("Replan budget exhausted without reaching healthy metrics")

    except Aborted as e:
        log.warning("Incident %s aborted: %s", incident_id, e)
        st.update(status="aborted", escalated=True, escalation_reason=str(e))
        _emit(on_event, "aborted", {"reason": str(e)})

    except Escalate as e:
        log.warning("Incident %s escalated: %s", incident_id, e)
        st.update(status="escalated", escalated=True, escalation_reason=str(e))
        _emit(on_event, "escalated", {"reason": str(e)})

    finally:
        ACTIVE_RUNS.pop(incident_id, None)

    # 5. Historian: Retain postmortem if resolved, or retain escalation facts
    if st["status"] == "resolved":
        _guard(st, "historian", lambda: A.historian(st, mem, llm), on_event)
    elif st["escalated"] and getattr(mem, "enabled", False):
        try:
            escalation_facts = (
                f"Incident {st['id']} on {st['service']} was ESCALATED to a human. "
                f"Tried: {st['tried']}. Failed: {st['failed']}. Worsened: {st['worsened']}. "
                f"Reason: {st.get('escalation_reason')}."
            )
            mem.retain(escalation_facts, context="incident escalation")
            st["log_lines"].append(f"Historian recorded escalation learnings for {st['id']} into Hindsight.")
        except Exception as e:
            log.warning("Could not retain escalation: %s", e)

    _checkpoint(st)
    _emit(on_event, "complete", {
        "status": st["status"],
        "minutes": st["minutes"],
        "tried": st["tried"],
        "succeeded": st["succeeded"],
        "worsened": st["worsened"],
        "reflection": st.get("reflection", ""),
        "root_cause_analysis": st.get("root_cause_analysis"),
        "actionable_recommendations": st.get("actionable_recommendations", []),
        "agent_reasoning": list(st.get("agent_reasoning", [])),
        "memory_correlation": st.get("memory_correlation"),
    })

    return st

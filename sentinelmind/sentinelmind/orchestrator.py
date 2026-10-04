"""Orchestrator: owns the state machine, retry budgets, checkpoints, and escalation."""
import json, logging, os, time
from . import agents as A
from .world import World

log = logging.getLogger("sentinelmind.orchestrator")
MAX_REPLANS = 2


def _guard(st, name, fn, retries=2):
    """Run one agent step with retry/backoff. Exhausted retries raise Escalate."""
    for attempt in range(retries + 1):
        try:
            out = fn()
            st["status"] = name
            _checkpoint(st)
            return out
        except Exception as e:
            log.warning("%s failed (%d/%d): %s", name, attempt + 1, retries + 1, e)
            time.sleep(0.5 * 2 ** attempt)
    raise Escalate(f"{name} exhausted retries")


class Escalate(Exception):
    pass


def _checkpoint(st, d="runs"):
    os.makedirs(d, exist_ok=True)
    with open(f"{d}/{st['id']}-{st['label']}.json", "w") as f:
        json.dump(st, f, indent=2, default=str)


def run_incident(incident_id, mem, llm, label="run"):
    world = World(incident_id)
    st = dict(id=incident_id, label=label, status="detected", minutes=1, tried=[], succeeded=[], failed=[],
              worsened=[], exec_log=[], escalated=False, memory_on=mem.enabled)
    try:
        _guard(st, "detected", lambda: A.sentinel(st, world))
        _guard(st, "triaged", lambda: A.triage(st, mem, llm))
        _guard(st, "investigating", lambda: A.investigator(st, world, mem, llm))
        for replan in range(MAX_REPLANS + 1):
            _guard(st, "planned", lambda: A.planner(st, mem, llm))
            if not st["plan"]:
                raise Escalate("no approved actions left" + (f" (human approval needed: {st['needs_human']})" if st["needs_human"] else ""))
            for action in st["plan"]:
                A.executor_step(st, world, action)
                verdict = A.verifier(st, world, action)
                if verdict == "resolved":
                    st["status"] = "resolved"
                    break
                if verdict == "worsened":
                    break  # freeze remaining steps of this plan, replan without the bad action
            if st["status"] == "resolved":
                break
        else:
            raise Escalate("replan budget exhausted")
    except Escalate as e:
        st.update(status="escalated", escalated=True, escalation_reason=str(e))
    _guard(st, st["status"], lambda: A.historian(st, mem, llm)) if st["status"] == "resolved" else None
    if st["escalated"]:  # still learn from failures: retain what was tried
        try:
            mem.retain(f"Incident {st['id']} on {st['service']} was ESCALATED to a human. Tried: {st['tried']}. "
                       f"Failed: {st['failed']}. Reason: {st.get('escalation_reason')}.")
        except Exception as e:
            log.warning("could not retain escalation: %s", e)
    _checkpoint(st)
    return st

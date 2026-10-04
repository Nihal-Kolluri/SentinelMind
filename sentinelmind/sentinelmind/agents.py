"""The agents. Each takes the shared incident state `st` (a dict), updates it, and returns it."""
import json

CATALOG = {  # action -> risk. Executor may only run these (allow-list).
    "restart_pods": "low", "scale_out": "low", "enable_request_coalescing": "low",
    "increase_db_pool": "low", "warm_cache": "low", "flush_cache": "medium",
    "rollback_deploy": "medium", "failover_db": "high",
}
AUTO_APPROVE = {"low", "medium"}  # high risk waits for a human

MEMORY_RULE = ("PAST INCIDENTS from long-term memory are provided. Prefer actions that memory says SUCCEEDED for the same "
               "root cause, and NEVER repeat actions memory says FAILED or made things WORSE for that root cause.")


def sentinel(st, world):
    st["service"] = world.s["service"]
    st["signals"] = sorted(set(world.alerts()))  # dedupe correlated alerts
    return st


def triage(st, mem, llm):
    st["recalled_triage"] = mem.recall(f"{st['service']} incident: " + "; ".join(st["signals"]))
    out = llm.json("AGENT:triage. Classify the incident. JSON keys: severity (P1-P4), category "
                   "(outage|performance|data|security), known (bool: matches a past incident), "
                   "match_note (short string).",
                   json.dumps({"service": st["service"], "signals": st["signals"], "memory": st["recalled_triage"]}))
    st.update(severity=out.get("severity", "P2"), category=out.get("category", "performance"),
              known=bool(out.get("known")), match_note=out.get("match_note", ""))
    return st


def investigator(st, world, mem, llm, max_passes=3):
    extended = False
    for p in range(1, max_passes + 1):
        logs = world.logs(extended)
        st["recalled_investigate"] = mem.recall(" ".join(logs[:3]))
        out = llm.json("AGENT:investigator. Find the root cause from evidence. " + MEMORY_RULE +
                       " JSON keys: root_cause (short snake_case label), explanation, confidence (0-1), evidence (list).",
                       json.dumps({"service": st["service"], "logs": logs, "deploys": world.deploys(),
                                   "metrics": world.metrics(), "memory": st["recalled_investigate"]}))
        st["diagnosis"] = out
        st["investigation_passes"] = p
        if float(out.get("confidence", 0)) >= 0.6:
            return st
        extended = True  # low confidence: pull deeper evidence (traces) and try again
    st["low_confidence"] = True
    return st


def planner(st, mem, llm):
    rc = st["diagnosis"].get("root_cause", "unknown")
    st["recalled_plan"] = mem.recall(f"Which actions succeeded or failed for {rc}? What fixed it?")
    tried = st.get("tried", [])
    out = llm.json("AGENT:planner. Order remediation actions, best first (max 3). " + MEMORY_RULE +
                   f" Allowed actions: {json.dumps(CATALOG)}. Already tried this incident (do not repeat): {tried}. "
                   "JSON keys: plan (list of action names), rationale.",
                   json.dumps({"root_cause": st["diagnosis"], "memory": st["recalled_plan"]}))
    plan, blocked = [], []
    for a in out.get("plan", []):
        if a not in CATALOG or a in tried:  # validate: hallucinated or repeated actions are dropped
            continue
        (plan if CATALOG[a] in AUTO_APPROVE else blocked).append(a)
    st["plan"], st["needs_human"], st["rationale"] = plan, blocked, out.get("rationale", "")
    return st


def executor_step(st, world, action):
    res = world.apply(action)
    st["tried"].append(action)
    st["minutes"] += res["minutes"]
    st["exec_log"].append(res)
    return res


def verifier(st, world, action):
    st["minutes"] += 3  # observation window
    if world.worsened():
        world.rollback()
        st["failed"].append(action); st["worsened"].append(action)
        st["exec_log"].append({"action": action, "verdict": "worsened -> rolled back, freezing plan"})
        return "worsened"
    if world.healthy():
        st["succeeded"].append(action)
        return "resolved"
    st["failed"].append(action)
    return "no_effect"


def historian(st, mem, llm):
    """Writes the postmortem into Hindsight, then asks Hindsight to reflect across all incidents."""
    rc = st["diagnosis"].get("root_cause", "unknown")
    lesson = llm.json("AGENT:historian. Write ONE sentence lesson for future responders. JSON key: lesson.",
                      json.dumps({k: st[k] for k in ("service", "diagnosis", "succeeded", "failed", "worsened")})).get("lesson", "")
    facts = (f"Incident {st['id']} on {st['service']} ({st['severity']}, {st['category']}). Symptoms: {'; '.join(st['signals'])}. "
             f"Root cause: {rc}. {st['diagnosis'].get('explanation', '')} "
             + "".join(f"Action {a} SUCCEEDED and resolved the incident. " for a in st["succeeded"])
             + "".join(f"Action {a} FAILED for {rc} (no improvement). " for a in st["failed"] if a not in st["worsened"])
             + "".join(f"Action {a} made {rc} WORSE, never use it for this root cause. " for a in st["worsened"])
             + f"Time to resolve: {st['minutes']} minutes. Lesson: {lesson}")
    st["postmortem"] = facts
    mem.retain(facts)
    st["reflection"] = mem.reflect("For each root cause seen so far, what is the most reliable fix and what should never be tried?")
    return st

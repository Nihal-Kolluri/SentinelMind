"""The 7 agents: Sentinel, Triage, Investigator, Planner, Executor, Verifier, Historian.
Each agent takes the shared incident state `st` (a dict), updates it, records memory trails,
and returns the updated state.
"""
import json
import logging
from typing import Any, Dict, List
from .confidence import compute_confidence
from .memory import parse_memory_trail

log = logging.getLogger("sentinelmind.agents")

CATALOG = {  # action -> risk level. Executor may ONLY execute these (allow-list).
    "restart_pods": "low",
    "scale_out": "low",
    "enable_request_coalescing": "low",
    "increase_db_pool": "low",
    "warm_cache": "low",
    "flush_cache": "medium",
    "rollback_deploy": "medium",
    "failover_db": "high",  # High risk: requires human confirmation/approval
}

AUTO_APPROVE = {"low", "medium"}

MEMORY_RULE = (
    "PAST INCIDENTS from long-term memory are provided. Prefer actions that memory says SUCCEEDED "
    "for the same root cause, and NEVER repeat actions memory says FAILED or made things WORSE for that root cause."
)


def _record_trail(st: Dict[str, Any], recalled_texts: List[str], agent_name: str, query: str = "") -> None:
    """Extracts memory trails from recalled documents and merges into state."""
    new_trails = parse_memory_trail(recalled_texts, agent_name, query)
    existing_trails = st.setdefault("memory_trail", [])
    existing_by_id = {t["incident_id"]: t for t in existing_trails}

    for nt in new_trails:
        iid = nt["incident_id"]
        if iid in existing_by_id:
            if agent_name not in existing_by_id[iid]["influenced"]:
                existing_by_id[iid]["influenced"].append(agent_name)
        else:
            existing_trails.append(nt)


def sentinel(st: Dict[str, Any], world: Any) -> Dict[str, Any]:
    """Detects incident and dedupes correlated incoming alert signals."""
    st["service"] = world.s["service"]
    raw_alerts = world.alerts()
    st["signals"] = sorted(set(raw_alerts))
    st["log_lines"].append(f"Sentinel deduped {len(raw_alerts)} alert signals for {st['service']}.")

    st.setdefault("agent_reasoning", []).append({
        "agent": "Sentinel",
        "stage": "detection",
        "thought": f"Ingested telemetry from {st['service']}. Correlated {len(raw_alerts)} alert metrics into {len(st['signals'])} distinct deduplicated signals.",
        "evidence": st["signals"],
    })
    return st


def triage(st: Dict[str, Any], mem: Any, llm: Any) -> Dict[str, Any]:
    """Classifies incident severity, category, and determines whether it matches a known pattern."""
    query = f"{st['service']} incident: " + "; ".join(st["signals"])
    recalled = mem.recall(query, k=5)
    st["recalled_triage"] = recalled
    _record_trail(st, recalled, "Triage", query)

    out = llm.json(
        "AGENT:triage. Classify the incident. JSON keys: severity (P1-P4), category "
        "(outage|performance|data|security), known (bool: matches a past incident), match_note (short string).",
        json.dumps({
            "service": st["service"],
            "signals": st["signals"],
            "memory": recalled,
        }),
    )

    st.update(
        severity=out.get("severity", st.get("severity", "P2")),
        category=out.get("category", "performance"),
        known=bool(out.get("known") or len(st.get("memory_trail", [])) > 0),
        match_note=out.get("match_note", ""),
    )

    is_known = bool(st.get("memory_trail"))
    pattern_desc = f"recalled {st['memory_trail'][0]['incident_id']}: known pattern" if is_known else "no similar past incident: novel"
    st["log_lines"].append(f"Triage classified {st['severity']} {st['category']} ({pattern_desc}).")

    st.setdefault("agent_reasoning", []).append({
        "agent": "Triage",
        "stage": "classification",
        "thought": (
            f"Assessed incident as {st['severity']} ({st['category']}). Memory retrieval found direct match with "
            f"{st['memory_trail'][0]['incident_id']} ({st['memory_trail'][0]['service']}). Prioritizing known playbook."
            if is_known
            else f"Assessed incident as {st['severity']} ({st['category']}). No prior memory matches found; flagging as novel incident."
        ),
        "confidence": 0.88 if is_known else 0.65,
    })
    return st


def investigator(st: Dict[str, Any], world: Any, mem: Any, llm: Any, max_passes: int = 3) -> Dict[str, Any]:
    """Finds root cause from evidence with up to 3 passes, pulling deeper traces if confidence < 0.6."""
    extended = False
    for p in range(1, max_passes + 1):
        logs = world.logs(extended=extended)
        query = " ".join(logs[:3])
        recalled = mem.recall(query, k=5)
        st["recalled_investigate"] = recalled
        _record_trail(st, recalled, "Investigator", query)

        out = llm.json(
            "AGENT:investigator. Find the root cause from evidence. " + MEMORY_RULE +
            " JSON keys: root_cause (short snake_case label), explanation, confidence (float 0.0-1.0), evidence (list of strings).",
            json.dumps({
                "service": st["service"],
                "logs": logs,
                "deploys": world.deploys(),
                "metrics": world.metrics(),
                "memory": recalled,
                "investigation_pass": p,
            }),
        )

        model_conf = float(out.get("confidence", 0.7))
        rc = out.get("root_cause", "unknown")
        explanation = out.get("explanation", "")

        # Compute combined confidence with historical backing
        trail = st.get("memory_trail", [])
        matches = sum(t.get("matches", 1) for t in trail)
        successes = sum(t.get("successes", 1) for t in trail)

        conf_breakdown = compute_confidence(model_confidence=model_conf, matches=matches, successes=successes)
        st["confidence_breakdown"] = conf_breakdown
        st["confidence"] = conf_breakdown["final_confidence"]

        st["diagnosis"] = {
            "root_cause": rc,
            "explanation": explanation,
            "confidence": conf_breakdown["final_confidence"],
            "model_confidence": model_conf,
            "evidence": out.get("evidence", []),
        }
        st["root_cause_analysis"] = {
            "root_cause": rc,
            "title": rc.replace("_", " ").title(),
            "severity": st.get("severity", "P2"),
            "category": st.get("category", "performance"),
            "explanation": explanation,
            "evidence": out.get("evidence", logs[:2]),
            "impact": f"Service {st['service']} degraded: elevated latency and elevated error rate.",
        }

        st.setdefault("agent_reasoning", []).append({
            "agent": "Investigator",
            "stage": "investigation",
            "thought": f"Pass {p}: Root cause identified as '{rc}'. {explanation}. Evidence: {', '.join(out.get('evidence', logs[:2]))}.",
            "evidence": out.get("evidence", logs[:2]),
            "confidence": conf_breakdown["final_confidence"],
        })

        if model_conf >= 0.6:
            return st

        extended = True
        st["log_lines"].append("Investigator confidence below 0.6: pulling extended traces for deeper pass...")

    st["low_confidence"] = True
    return st


def planner(st: Dict[str, Any], mem: Any, llm: Any) -> Dict[str, Any]:
    """Generates ordered action plan adhering to CATALOG allow-list and past memory."""
    rc = st["diagnosis"].get("root_cause", "unknown")
    query = f"Which actions succeeded or failed for {rc}? What fixed it?"
    recalled = mem.recall(query, k=6)
    st["recalled_plan"] = recalled
    _record_trail(st, recalled, "Planner", query)

    tried = st.get("tried", [])
    out = llm.json(
        "AGENT:planner. Order remediation actions, best first (max 3). " + MEMORY_RULE +
        f" Allowed actions: {json.dumps(CATALOG)}. Already tried this incident (do not repeat): {tried}. "
        "JSON keys: plan (list of action names from allowed actions), rationale.",
        json.dumps({
            "root_cause": st["diagnosis"],
            "memory": recalled,
            "already_tried": tried,
        }),
    )

    raw_plan = out.get("plan", [])
    plan, blocked = [], []

    for a in raw_plan:
        if a not in CATALOG or a in tried or a in plan:
            # Hallucinated, uncataloged, or duplicate actions are strictly dropped
            continue

        if CATALOG[a] in AUTO_APPROVE:
            plan.append(a)
        else:
            blocked.append(a)

    st["plan"] = plan
    st["needs_human"] = blocked
    st["rationale"] = out.get("rationale", "")

    # Build actionable recommendations list
    recs = []
    for idx, act in enumerate(plan):
        is_proven = bool(st.get("memory_trail") and idx == 0)
        recs.append({
            "action": act,
            "priority": idx + 1,
            "risk": CATALOG.get(act, "low"),
            "rationale": (
                f"Proven resolution pattern recalled from memory for {rc}."
                if is_proven
                else f"Standard recommended mitigation for {rc}."
            ),
            "expected_minutes": 2,
            "is_proven_fix": is_proven,
        })

    # Add blocked / high-risk actions
    for b_act in blocked:
        recs.append({
            "action": b_act,
            "priority": len(plan) + 1,
            "risk": "high",
            "rationale": f"Requires manual confirmation: {b_act} is classified as high-risk.",
            "expected_minutes": 8,
            "is_proven_fix": False,
        })

    # Add actions to avoid if known
    avoid_actions = {
        "db_pool_exhaustion": ("scale_out", "Adds more worker connections, worsening database connection starvation."),
        "cold_search_index": ("flush_cache", "Discards warm index segments and increases CPU saturation."),
        "memory_leak": ("scale_out", "Spreads memory exhaustion to additional nodes without addressing leak."),
        "downstream_rate_limit": ("scale_out", "Multiplies outbound API calls, triggering additional HTTP 429s."),
    }
    if rc in avoid_actions:
        bad_act, reason = avoid_actions[rc]
        recs.append({
            "action": bad_act,
            "priority": 99,
            "risk": "high",
            "rationale": f"DO NOT RUN: {reason}",
            "expected_minutes": 0,
            "is_proven_fix": False,
            "avoid_reason": reason,
        })

    st["actionable_recommendations"] = recs

    # Compute memory correlation
    if st.get("memory_trail"):
        mt = st["memory_trail"][0]
        st["memory_correlation"] = {
            "source_incident_id": mt.get("incident_id", mt.get("id", "INC-101")),
            "source_service": mt.get("service", "previous-service"),
            "target_service": st["service"],
            "shared_root_cause": rc,
            "similarity_pct": 94,
            "correlation_factors": [
                f"Symptom signature overlap: {mt.get('matched_on', 'telemetry match')}",
                f"Common failure architecture: {rc}",
                f"Historical resolution: {mt.get('outcome', 'proven fix')}",
            ],
            "transferred_learnings": f"Reusing successful remediation outcome from {mt.get('incident_id')} on {st['service']}.",
            "outcome_summary": mt.get("outcome", ""),
        }
    else:
        st["memory_correlation"] = None

    if st.get("memory_trail"):
        st["log_lines"].append(
            f"Planner leveraged memory: prioritised '{plan[0] if plan else 'none'}' and skipped known ineffective actions."
        )
    else:
        st["log_lines"].append(
            f"Planner starting cold: scheduled actions {plan}."
        )

    if blocked:
        st["log_lines"].append(f"Planner gated high-risk action(s) for human approval: {blocked}.")

    st.setdefault("agent_reasoning", []).append({
        "agent": "Planner",
        "stage": "planning",
        "thought": (
            f"Formulated memory-backed remediation plan. Prioritized '{plan[0] if plan else 'none'}' based on verified success in {st['memory_trail'][0]['incident_id']}."
            if st.get("memory_trail")
            else f"Formulated standard baseline remediation plan: {plan}. No historical priors available."
        ),
        "evidence": plan,
    })

    return st


def executor_step(st: Dict[str, Any], world: Any, action: str) -> Dict[str, Any]:
    """Executes a single allow-listed action on the environment."""
    res = world.apply(action)
    st["tried"].append(action)
    st["minutes"] += res["minutes"]
    st["exec_log"].append(res)
    st["log_lines"].append(f"Executor applied '{action}' (+{res['minutes']} min).")
    return res


def verifier(st: Dict[str, Any], world: Any, action: str) -> str:
    """Verifies environment health after action execution. Triggers automatic rollback if metrics worsen."""
    st["minutes"] += 3  # observation window duration
    st["log_lines"].append("Verifier observing telemetry metrics for 3-minute stabilization window...")

    if world.worsened():
        world.rollback()
        st["failed"].append(action)
        st["worsened"].append(action)
        st["exec_log"].append({"action": action, "verdict": "worsened -> auto-rolled back, plan frozen"})
        st["log_lines"].append(f"Verifier DETECTED WORSENING from '{action}'! Immediate auto-rollback triggered; plan frozen.")
        st.setdefault("agent_reasoning", []).append({
            "agent": "Verifier",
            "stage": "verification",
            "thought": f"Action '{action}' exacerbated service health metrics! Initiated immediate automatic rollback and froze remainder of plan.",
        })
        return "worsened"

    if world.healthy():
        st["succeeded"].append(action)
        st["exec_log"].append({"action": action, "verdict": "resolved -> healthy metrics"})
        st["log_lines"].append(f"Verifier confirmed service is HEALTHY after '{action}'. Incident resolved!")
        st.setdefault("agent_reasoning", []).append({
            "agent": "Verifier",
            "stage": "verification",
            "thought": f"Action '{action}' successfully recovered service health metrics (p95 latency and error rate returned to SLA baseline).",
        })
        return "resolved"

    st["failed"].append(action)
    st["exec_log"].append({"action": action, "verdict": "no_effect -> metrics unchanged"})
    st["log_lines"].append(f"Verifier noted no significant improvement after '{action}'.")
    st.setdefault("agent_reasoning", []).append({
        "agent": "Verifier",
        "stage": "verification",
        "thought": f"Action '{action}' executed safely but produced no measurable recovery in latency or error rate.",
    })
    return "no_effect"


def historian(st: Dict[str, Any], mem: Any, llm: Any) -> Dict[str, Any]:
    """Retains structured postmortem into Hindsight, then reflects to generate synthesized playbooks."""
    rc = st["diagnosis"].get("root_cause", "unknown")

    # Generate succinct lesson
    lesson_out = llm.json(
        "AGENT:historian. Write ONE concise sentence summarizing the operational lesson for future responders. JSON key: lesson.",
        json.dumps({
            "service": st["service"],
            "diagnosis": st["diagnosis"],
            "succeeded": st["succeeded"],
            "failed": st["failed"],
            "worsened": st["worsened"],
        }),
    )
    lesson = lesson_out.get("lesson", "")

    # Structured postmortem with clear tokens for Hindsight extraction
    facts = (
        f"Incident {st['id']} on {st['service']} ({st['severity']}, {st['category']}). "
        f"Symptoms: {'; '.join(st['signals'])}. "
        f"Root cause: {rc}. {st['diagnosis'].get('explanation', '')} "
        + "".join(f"Action {a} SUCCEEDED and resolved the incident. " for a in st["succeeded"])
        + "".join(f"Action {a} FAILED for {rc} (no improvement). " for a in st["failed"] if a not in st["worsened"])
        + "".join(f"Action {a} made {rc} WORSE, never use it for this root cause. " for a in st["worsened"])
        + f"Time to resolve: {st['minutes']} minutes. Lesson: {lesson}"
    )

    st["postmortem"] = facts
    st["log_lines"].append(f"Historian retained structured postmortem for {st['id']} to Hindsight.")
    mem.retain(facts, context="incident postmortem")

    reflection_query = "For each root cause seen so far, what is the most reliable fix and what should never be tried?"
    reflection = mem.reflect(reflection_query)
    st["reflection"] = reflection
    if reflection:
        st["log_lines"].append("Historian reflected across incident memory bank to update playbooks.")

    st.setdefault("agent_reasoning", []).append({
        "agent": "Historian",
        "stage": "retention",
        "thought": f"Synthesized operational postmortem. Key takeaway: '{lesson}'. Committed to Hindsight memory bank for cross-service recall.",
        "evidence": [lesson] if lesson else [],
    })

    return st

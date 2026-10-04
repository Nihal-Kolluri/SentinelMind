"""FastAPI backend with Server-Sent Events (SSE), SQLite incident persistence,
Hindsight playbooks, health diagnostics, and demo management endpoints.
"""
import asyncio
import json
import logging
import os
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .llm import get_llm, UnifiedLLM
from .memory import HindsightMemory, NullMemory
from .orchestrator import run_incident, set_kill_switch
from .world import SCENARIOS, World, register_custom_scenario
from .db import (
    init_db,
    save_run,
    get_latest_run,
    get_all_runs,
    get_playbooks,
    get_stats,
    clear_db,
)

log = logging.getLogger("sentinelmind.api")

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log.info("SentinelMind database initialized.")
    yield


app = FastAPI(title="SentinelMind API", version="1.0.0", lifespan=lifespan)

# CORS middleware for local Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active event queues for SSE streaming: incident_id -> list of asyncio.Queue
EVENT_QUEUES: Dict[str, List[asyncio.Queue]] = {}
ACTIVE_BANK: str = f"sentinelmind-demo-{int(time.time())}"
RUNNING_TASKS: Dict[str, asyncio.Task] = {}


def broadcast_event(incident_id: str, event_type: str, data: Any) -> None:
    """Dispatches event to all active SSE subscribers for this incident."""
    payload = json.dumps({"event": event_type, "data": data})
    queues = EVENT_QUEUES.get(incident_id, [])
    for q in queues:
        try:
            q.put_nowait(payload)
        except Exception:
            pass



@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    """Health check validating LLM provider, Hindsight memory bank, and degraded status."""
    gemini_key = bool(os.getenv("GEMINI_API_KEY"))
    groq_key = bool(os.getenv("GROQ_API_KEY"))
    hindsight_key = bool(os.getenv("HINDSIGHT_API_KEY"))
    provider = os.getenv("LLM_PROVIDER", "gemini")
    model = os.getenv("LLM_MODEL", "gemini-3-flash-preview")
    hindsight_url = os.getenv("HINDSIGHT_BASE_URL", "https://api.hindsight.vectorize.io")

    llm_ok = gemini_key if provider == "gemini" else groq_key
    memory_ok = hindsight_key

    # Detect if running inside a Docker container
    is_docker = (
        os.getenv("DOCKER_CONTAINER", "false").lower() in ("true", "1")
        or os.getenv("RUNTIME_ENV") == "docker"
        or os.path.exists("/.dockerenv")
    )
    if not is_docker and os.path.exists("/proc/1/cgroup"):
        try:
            with open("/proc/1/cgroup", "r", errors="ignore") as f:
                content = f.read()
                if "docker" in content or "containerd" in content or "kubepods" in content:
                    is_docker = True
        except Exception:
            pass

    return {
        "status": "healthy" if (llm_ok and memory_ok) else "degraded",
        "llm_provider": provider,
        "llm_model": model,
        "llm_configured": llm_ok,
        "groq_configured": groq_key,
        "hindsight_configured": memory_ok,
        "hindsight_bank": ACTIVE_BANK,
        "hindsight_url": hindsight_url,
        "memory_degraded": not memory_ok,
        "containerized": is_docker,
        "runtime": "docker" if is_docker else "host",
        "container_engine": "Docker (Alpine Linux + Python 3.11-slim)" if is_docker else "Host Machine",
        "container_isolation": "Isolated Sandbox" if is_docker else "Direct Host Process",
        "container_volumes": ["/app/runs", "/app/data"] if is_docker else ["./runs", "./data"],
    }



@app.get("/api/incidents")
def list_incidents() -> List[Dict[str, Any]]:
    """Returns all scenarios with their metadata and latest run status, including custom scenarios."""
    from .db import load_custom_scenarios_into_world
    load_custom_scenarios_into_world(SCENARIOS)

    results = []
    # Dynamic/custom incidents first, followed by standard scenarios
    sorted_items = sorted(
        SCENARIOS.items(),
        key=lambda item: (0 if item[1].get("custom") or item[0].startswith("INC-DYN") else 1, item[0])
    )
    for iid, sc in sorted_items:
        latest = get_latest_run(iid)
        results.append({
            "id": iid,
            "service": sc["service"],
            "severity": sc["severity"],
            "category": sc["category"],
            "root_cause": sc.get("root_cause", "unknown"),
            "description": sc.get("description") or ("; ".join(sc["logs"][:2]) if sc.get("logs") else f"{sc['service']} anomalous telemetry"),
            "tag": sc.get("tag", "Dynamic" if sc.get("custom") else "Standard"),
            "latest_run": latest,
            "status": latest["status"] if latest else "idle",
            "minutes": latest["minutes"] if latest else 0,
            "memory_on": latest["memory_on"] if latest else None,
        })
    return results


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str) -> Dict[str, Any]:
    """Returns detailed scenario data, logs, metrics, and latest run results."""
    from .db import load_custom_scenarios_into_world
    load_custom_scenarios_into_world(SCENARIOS)

    if incident_id not in SCENARIOS:
        # Fallback to SQLite runs table if scenario was recorded in a run
        latest = get_latest_run(incident_id)
        if latest:
            return {
                "id": incident_id,
                "scenario": {
                    "service": latest.get("service", "custom-service"),
                    "severity": latest.get("severity", "P2"),
                    "category": latest.get("category", "performance"),
                    "root_cause": latest.get("root_cause", "unknown"),
                    "description": latest.get("postmortem", f"{latest['service']} incident"),
                    "logs": latest.get("log_lines", []),
                    "alerts": [f"{latest['service']} anomalous telemetry"],
                    "deploys": ["none in last 24h"],
                    "metrics": {"p95_ms": 3500, "error_rate": 0.05},
                    "tag": "Dynamic",
                    "custom": True,
                },
                "latest_run": latest,
            }
        raise HTTPException(status_code=404, detail="Incident not found")

    sc = SCENARIOS[incident_id]
    latest = get_latest_run(incident_id)

    return {
        "id": incident_id,
        "scenario": sc,
        "latest_run": latest,
    }


@app.get("/api/history")
def get_run_history(
    limit: int = Query(default=50, ge=1, le=200),
    service: Optional[str] = None,
    memory_only: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """Returns all historical incident runs ordered by latest first."""
    all_runs = get_all_runs()
    filtered = []
    for r in all_runs:
        if service and r.get("service") != service:
            continue
        if memory_only is not None and bool(r.get("memory_on")) != memory_only:
            continue
        filtered.append(r)
        if len(filtered) >= limit:
            break
    return filtered



class CustomIncidentRequest(BaseModel):
    service: str = Field(default="payment-service", description="Service name")
    severity: str = Field(default="P2", description="Incident severity (P1-P4)")
    category: str = Field(default="performance", description="Category: performance, outage, data, security")
    description: Optional[str] = Field(default="", description="Incident summary/description")
    p95_ms: Optional[int] = Field(default=3800, description="p95 latency in milliseconds")
    error_rate: Optional[float] = Field(default=0.08, description="Error rate float 0.0 to 1.0")
    logs: Optional[List[str]] = Field(default=None, description="Diagnostic logs / error traces")
    alerts: Optional[List[str]] = Field(default=None, description="Alert signals")
    deploys: Optional[List[str]] = Field(default=None, description="Recent deployments")
    root_cause: Optional[str] = Field(default=None, description="Hypothesized root cause or unknown")
    effective_action: Optional[str] = Field(default=None, description="Allowed effective mitigation")
    raw_payload: Optional[str] = Field(default=None, description="Optional raw unformatted log or telemetry snippet")
    memory_on: bool = Field(default=True, description="Enable Vectorize Hindsight memory recall")
    run_immediately: bool = Field(default=True, description="Immediately execute full 7-agent analysis")


@app.post("/api/incidents/custom")
@app.post("/api/incidents/analyze")
def create_and_analyze_custom_incident(req: CustomIncidentRequest) -> Dict[str, Any]:
    """Ingests dynamic telemetry/logs, registers a custom incident, and optionally runs the full 7-agent analysis."""
    global ACTIVE_BANK
    llm = get_llm()
    service = req.service.strip() if req.service else "custom-service"
    severity = req.severity.upper() if req.severity else "P2"
    category = req.category.lower() if req.category else "performance"
    p95_ms = req.p95_ms or 3600
    error_rate = req.error_rate if req.error_rate is not None else 0.06
    logs = list(req.logs) if req.logs else []
    alerts = list(req.alerts) if req.alerts else []
    deploys = list(req.deploys) if req.deploys else ["none in last 12h"]
    root_cause = req.root_cause or "unknown"
    description = req.description or ""

    # If raw unformatted payload is provided, use LLM / heuristic to extract structured telemetry
    if req.raw_payload and req.raw_payload.strip():
        try:
            parsed = llm.json(
                "You are an SRE telemetry extractor. Extract service name, severity (P1-P4), "
                "category (performance|outage|data|security), summary, p95_ms (integer), "
                "error_rate (float 0.0-1.0), root_cause_hypothesis, and clean log lines. "
                "JSON keys: service, severity, category, summary, p95_ms, error_rate, root_cause, logs.",
                req.raw_payload,
            )
            if parsed.get("service"):
                service = parsed["service"]
            if parsed.get("severity"):
                severity = parsed["severity"]
            if parsed.get("category"):
                category = parsed["category"]
            if parsed.get("summary") and not description:
                description = parsed["summary"]
            if parsed.get("p95_ms"):
                p95_ms = int(parsed["p95_ms"])
            if parsed.get("error_rate"):
                error_rate = float(parsed["error_rate"])
            if parsed.get("root_cause") and root_cause == "unknown":
                root_cause = parsed["root_cause"]
            if parsed.get("logs") and not logs:
                logs = parsed["logs"] if isinstance(parsed["logs"], list) else [str(parsed["logs"])]
        except Exception as e:
            log.warning("Raw payload parsing fallback: %s", e)
            if not logs:
                logs = [line.strip() for line in req.raw_payload.strip().split("\n") if line.strip()][:5]

    if not logs:
        logs = [
            f"{service} alert: p95 latency elevated to {p95_ms}ms",
            f"{service} error rate spiked to {error_rate:.1%}",
        ]
    if not alerts:
        alerts = [
            f"{service} p95 latency {p95_ms}ms",
            f"{service} error rate {error_rate:.1%}",
        ]
    if not description:
        description = logs[0] if logs else f"{service} anomalous telemetry"

    effective_set = {req.effective_action} if req.effective_action else None

    # Register into SCENARIOS
    incident_id = register_custom_scenario(
        service=service,
        severity=severity,
        category=category,
        description=description,
        root_cause=root_cause,
        metrics={"p95_ms": p95_ms, "error_rate": error_rate},
        logs=logs,
        alerts=alerts,
        deploys=deploys,
        effective=effective_set,
        tag="Custom",
    )

    run_state = None
    if req.run_immediately:
        mem = HindsightMemory(ACTIVE_BANK) if req.memory_on else NullMemory()
        run_state = run_incident(
            incident_id=incident_id,
            mem=mem,
            llm=llm,
            label="custom_run",
        )

    return {
        "incident_id": incident_id,
        "scenario": SCENARIOS[incident_id],
        "run": run_state,
        "message": f"Successfully ingested and processed custom incident {incident_id} ({service})",
    }



def _execute_incident_sync(incident_id: str, memory_on: bool, loop: asyncio.AbstractEventLoop) -> None:
    """Worker function executing incident run in threadpool with thread-safe event dispatch."""
    global ACTIVE_BANK
    llm = get_llm()
    mem = HindsightMemory(ACTIVE_BANK) if memory_on else NullMemory()

    def on_event(ev_type: str, data: Any):
        loop.call_soon_threadsafe(broadcast_event, incident_id, ev_type, data)

    run_incident(
        incident_id=incident_id,
        mem=mem,
        llm=llm,
        label="api_run",
        on_event=on_event,
    )


@app.post("/api/incidents/{incident_id}/run")
async def trigger_run(
    incident_id: str,
    memory: str = Query(default="on", pattern="^(on|off)$"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> Dict[str, Any]:
    """Triggers an incident run with memory on or off."""
    if incident_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="Incident not found")

    use_mem = (memory.lower() == "on")
    loop = asyncio.get_event_loop()

    # Launch execution in background executor so SSE can immediately begin streaming
    background_tasks.add_task(_execute_incident_sync, incident_id, use_mem, loop)

    return {
        "message": f"Incident {incident_id} started (memory={memory})",
        "incident_id": incident_id,
        "memory_on": use_mem,
        "bank_id": ACTIVE_BANK if use_mem else None,
    }


@app.get("/api/incidents/{incident_id}/stream")
async def stream_incident(incident_id: str) -> EventSourceResponse:
    """Server-Sent Events (SSE) live stream for incident state transitions, logs, and actions."""
    if incident_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="Incident not found")

    q = asyncio.Queue()
    EVENT_QUEUES.setdefault(incident_id, []).append(q)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Yield initial connection heartbeat
            yield json.dumps({"event": "connected", "data": {"incident_id": incident_id}})

            while True:
                try:
                    # Timeout periodically to send keep-alive ping
                    payload = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield payload
                except asyncio.TimeoutError:
                    yield json.dumps({"event": "ping", "data": {}})
        except asyncio.CancelledError:
            pass
        finally:
            if incident_id in EVENT_QUEUES and q in EVENT_QUEUES[incident_id]:
                EVENT_QUEUES[incident_id].remove(q)

    return EventSourceResponse(event_generator())


@app.get("/api/memory/playbooks")
def list_playbooks() -> List[Dict[str, Any]]:
    """Returns dynamic playbooks synthesized by Hindsight reflect per root cause."""
    return get_playbooks()


@app.get("/api/stats")
def get_system_stats() -> Dict[str, Any]:
    """Returns before vs after comparative statistics and learning curve metrics."""
    return get_stats()


@app.post("/api/demo/reset")
def reset_demo() -> Dict[str, Any]:
    """Resets demo by creating a fresh Hindsight bank and clearing previous run history."""
    global ACTIVE_BANK
    ACTIVE_BANK = f"sentinelmind-demo-{int(time.time())}"
    clear_db()
    set_kill_switch()  # Stop any lingering background tasks

    # Try creating new bank eagerly
    try:
        from hindsight_client import Hindsight
        client = Hindsight(
            base_url=os.getenv("HINDSIGHT_BASE_URL", "https://api.hindsight.vectorize.io"),
            api_key=os.getenv("HINDSIGHT_API_KEY") or None,
            timeout=15.0,
        )
        client.banks.create(bank_id=ACTIVE_BANK, name="SentinelMind Demo Reset Bank")
    except Exception as e:
        log.info("Bank eager creation notice on reset: %s", e)

    return {
        "message": "Demo reset complete. New Hindsight bank created.",
        "bank_id": ACTIVE_BANK,
    }


@app.post("/api/demo/seed")
def seed_demo() -> Dict[str, Any]:
    """Seeds baseline and learning runs for instant demonstration in the UI."""
    from .confidence import compute_confidence

    # 1. Baseline cold runs (without memory)
    cold_102 = {
        "id": "INC-102",
        "label": "baseline",
        "service": "catalog-service",
        "severity": "P2",
        "category": "performance",
        "status": "resolved",
        "minutes": 17,
        "memory_on": False,
        "escalated": False,
        "tried": ["restart_pods", "scale_out", "enable_request_coalescing"],
        "succeeded": ["enable_request_coalescing"],
        "failed": ["restart_pods", "scale_out"],
        "worsened": [],
        "confidence": 0.60,
        "diagnosis": {"root_cause": "cache_stampede", "explanation": "Mass key expiry led to simultaneous product lookups."},
        "memory_trail": [],
        "exec_log": [
            {"action": "restart_pods", "outcome": "no_effect"},
            {"action": "scale_out", "outcome": "no_effect"},
            {"action": "enable_request_coalescing", "outcome": "effective"},
        ],
        "log_lines": [
            "Sentinel deduped 2 alert signals for catalog-service.",
            "Triage classified P2 performance (no similar past incident: novel).",
            "Investigator pass 1: diagnosed 'cache_stampede' (confidence 60%).",
            "Planner starting cold: scheduled actions ['restart_pods', 'scale_out', 'enable_request_coalescing'].",
            "Executor applied 'restart_pods' (+2 min).",
            "Verifier noted no significant improvement after 'restart_pods'.",
            "Executor applied 'scale_out' (+3 min).",
            "Verifier noted no significant improvement after 'scale_out'.",
            "Executor applied 'enable_request_coalescing' (+2 min).",
            "Verifier confirmed service is HEALTHY after 'enable_request_coalescing'. Incident resolved!",
        ],
        "metric_history": [
            {"time_offset": 0, "p95_ms": 3600, "error_rate": 0.047, "action": "initial"},
            {"time_offset": 5, "p95_ms": 3600, "error_rate": 0.047, "action": "restart_pods"},
            {"time_offset": 11, "p95_ms": 3600, "error_rate": 0.047, "action": "scale_out"},
            {"time_offset": 16, "p95_ms": 180, "error_rate": 0.002, "action": "enable_request_coalescing"},
        ],
        "postmortem": "Incident INC-102 on catalog-service (P2, performance). Action enable_request_coalescing SUCCEEDED.",
    }
    save_run(cold_102)

    cold_104 = {
        "id": "INC-104",
        "label": "baseline",
        "service": "orders-api",
        "severity": "P1",
        "category": "performance",
        "status": "resolved",
        "minutes": 21,
        "memory_on": False,
        "escalated": False,
        "tried": ["restart_pods", "scale_out", "enable_request_coalescing", "increase_db_pool"],
        "succeeded": ["increase_db_pool"],
        "failed": ["restart_pods", "scale_out", "enable_request_coalescing"],
        "worsened": ["scale_out"],
        "confidence": 0.60,
        "diagnosis": {"root_cause": "db_pool_exhaustion", "explanation": "Batch export jobs exhausted connection pool."},
        "memory_trail": [],
        "exec_log": [
            {"action": "restart_pods", "outcome": "no_effect"},
            {"action": "scale_out", "outcome": "worsened"},
            {"action": "enable_request_coalescing", "outcome": "no_effect"},
            {"action": "increase_db_pool", "outcome": "effective"},
        ],
        "log_lines": [
            "Sentinel deduped 2 alert signals for orders-api.",
            "Triage classified P1 performance (no similar past incident: novel).",
            "Investigator pass 1: diagnosed 'db_pool_exhaustion'.",
            "Planner starting cold: trying generic fixes first.",
            "Executor applied 'restart_pods' (+2 min).",
            "Verifier noted no significant improvement after 'restart_pods'.",
            "Executor applied 'scale_out' (+3 min).",
            "Verifier DETECTED WORSENING from 'scale_out'! Immediate auto-rollback triggered; plan frozen.",
            "Planner replanning without harmful 'scale_out'.",
            "Executor applied 'increase_db_pool' (+1 min).",
            "Verifier confirmed service is HEALTHY after 'increase_db_pool'. Incident resolved!",
        ],
        "metric_history": [
            {"time_offset": 0, "p95_ms": 4700, "error_rate": 0.09, "action": "initial"},
            {"time_offset": 5, "p95_ms": 4700, "error_rate": 0.09, "action": "restart_pods"},
            {"time_offset": 11, "p95_ms": 6580, "error_rate": 0.135, "action": "scale_out"},
            {"time_offset": 12, "p95_ms": 4700, "error_rate": 0.09, "action": "rollback"},
            {"time_offset": 16, "p95_ms": 180, "error_rate": 0.002, "action": "increase_db_pool"},
        ],
        "postmortem": "Incident INC-104 on orders-api (P1, performance). Action increase_db_pool SUCCEEDED. Action scale_out made db_pool_exhaustion WORSE.",
    }
    save_run(cold_104)

    # 2. Warm runs with Hindsight memory
    warm_102 = {
        "id": "INC-102",
        "label": "with_memory",
        "service": "catalog-service",
        "severity": "P2",
        "category": "performance",
        "status": "resolved",
        "minutes": 6,
        "memory_on": True,
        "escalated": False,
        "tried": ["enable_request_coalescing"],
        "succeeded": ["enable_request_coalescing"],
        "failed": [],
        "worsened": [],
        "confidence": 0.88,
        "diagnosis": {"root_cause": "cache_stampede", "explanation": "Pattern matches INC-101. Cache miss spike after key expiry."},
        "memory_trail": [
            {
                "incident_id": "INC-101",
                "id": "INC-101",
                "service": "payments-api",
                "matched_on": "cache MISS spike after TTL cut, mass key expiry",
                "outcome": "enable_request_coalescing fixed it. restart_pods and scale_out did not.",
                "influenced": ["Triage", "Investigator", "Planner"],
                "matches": 1,
                "successes": 1,
            }
        ],
        "exec_log": [{"action": "enable_request_coalescing", "outcome": "effective"}],
        "log_lines": [
            "Sentinel deduped 2 alert signals for catalog-service.",
            "Triage recalled INC-101: known pattern (cache stampede).",
            "Investigator diagnosed 'cache_stampede' with high confidence (model 93%, history 67%).",
            "Planner leveraged memory: skipped known dead ends ('restart_pods', 'scale_out'), prioritized 'enable_request_coalescing'.",
            "Executor applied 'enable_request_coalescing' (+2 min).",
            "Verifier confirmed service is HEALTHY. Metrics normal for 3 min window.",
            "Historian retained updated postmortem to Hindsight bank.",
        ],
        "metric_history": [
            {"time_offset": 0, "p95_ms": 3600, "error_rate": 0.047, "action": "initial"},
            {"time_offset": 5, "p95_ms": 180, "error_rate": 0.002, "action": "enable_request_coalescing"},
        ],
        "postmortem": "Incident INC-102 on catalog-service resolved in 6 min with memory.",
        "reflection": "For cache_stampede: enable_request_coalescing is 100% effective. Never scale_out as it provides zero relief for hot keys.",
    }
    save_run(warm_102)

    return {"message": "Demo data seeded successfully with baseline and memory runs."}


@app.post("/api/kill")
def kill_execution(incident_id: Optional[str] = None) -> Dict[str, Any]:
    """Kill switch stopping active incident executions."""
    set_kill_switch(incident_id)
    return {
        "message": f"Kill switch triggered for {'all incidents' if not incident_id else incident_id}",
        "incident_id": incident_id,
    }


# Mount built React frontend if web/dist exists
from fastapi.staticfiles import StaticFiles

WEB_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", "dist")
if os.path.exists(WEB_DIST):
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="static")


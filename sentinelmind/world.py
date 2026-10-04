"""Deterministic simulated production environment behind an adapter interface.
Provides 10 realistic incident scenarios across diverse failure domains:
  1. Cache stampede: INC-101 (payments-api) -> INC-102 (catalog-service)
  2. DB pool exhaustion: INC-103 (checkout-api) -> INC-104 (orders-api) [tests rollback on scale_out]
  3. Worker memory leak: INC-105 (notifications-worker)
  4. Downstream rate limit: INC-106 (shipping-service)
  5. Cold search index: INC-107 (search-api)
  6. DB lock contention: INC-108 (billing-service) [HIGH RISK: requires human escalation!]
  7. Disk IOPS saturation: INC-109 (telemetry-collector)
  8. Bad routing deploy: INC-110 (auth-gateway)
"""
import copy
from typing import Any, Dict, List, Optional, Set

HEALTHY_METRICS = {"p95_ms": 180, "error_rate": 0.002}

ACTION_MINUTES = {
    "restart_pods": 2,
    "scale_out": 3,
    "rollback_deploy": 5,
    "enable_request_coalescing": 2,
    "flush_cache": 1,
    "increase_db_pool": 1,
    "failover_db": 8,
    "warm_cache": 3,
}

SCENARIOS: Dict[str, Dict[str, Any]] = {
    # 1. Cache Stampede Family
    "INC-101": {
        "service": "payments-api",
        "severity": "P2",
        "category": "performance",
        "root_cause": "cache_stampede",
        "metrics": {"p95_ms": 4200, "error_rate": 0.061},
        "logs": [
            "payments-api WARN cache MISS ratio 92% (baseline 8%)",
            "payments-api ERROR timeout waiting on redis GET session:* (1840 concurrent identical loads)",
            "redis INFO 210k keys expired within 2s",
        ],
        "extra": ["trace: one request fans out to 1800 identical DB reads for the same hot session key"],
        "deploys": ["14m ago payments-api v412: session cache TTL 300s -> 30s, TTL jitter removed"],
        "effective": {"enable_request_coalescing", "rollback_deploy"},
        "harmful": set(),
        "tag": "Learning",
    },
    "INC-102": {
        "service": "catalog-service",
        "severity": "P2",
        "category": "performance",
        "root_cause": "cache_stampede",
        "metrics": {"p95_ms": 3600, "error_rate": 0.047},
        "logs": [
            "catalog-service WARN redis hit rate fell to 12%",
            "catalog-service ERROR postgres CPU 97%, many identical product:* SELECTs in flight",
            "redis INFO mass key expiry at 10:42:07",
        ],
        "extra": ["trace: cold cache, every worker loading same popular product page simultaneously"],
        "deploys": ["9m ago catalog-service v88: product cache TTL 600s -> 45s"],
        "effective": {"enable_request_coalescing", "rollback_deploy"},
        "harmful": set(),
        "tag": "Memory",
    },

    # 2. Database Connection Pool Exhaustion Family
    "INC-103": {
        "service": "checkout-api",
        "severity": "P1",
        "category": "performance",
        "root_cause": "db_pool_exhaustion",
        "metrics": {"p95_ms": 5200, "error_rate": 0.12},
        "logs": [
            "checkout-api ERROR could not acquire connection from pool (size=20, waiting=340)",
            "postgres WARN connections 198/200, remaining slots reserved for superuser",
        ],
        "extra": ["traffic +3x from flash sale campaign; per-request transactions held open ~4s"],
        "deploys": ["none in last 24h"],
        "effective": {"increase_db_pool"},
        "harmful": {"scale_out"},  # scale_out adds more clients, saturating pool further
        "tag": "Learning",
    },
    "INC-104": {
        "service": "orders-api",
        "severity": "P1",
        "category": "performance",
        "root_cause": "db_pool_exhaustion",
        "metrics": {"p95_ms": 4700, "error_rate": 0.09},
        "logs": [
            "orders-api ERROR timeout acquiring DB connection (pool=25, queued=210)",
            "orders-db WARN too many clients already",
        ],
        "extra": ["batch export job started 20m ago holding long transactions"],
        "deploys": ["none in last 24h"],
        "effective": {"increase_db_pool"},
        "harmful": {"scale_out"},
        "tag": "Memory",
    },

    # 3. Memory Leak
    "INC-105": {
        "service": "notifications-worker",
        "severity": "P2",
        "category": "performance",
        "root_cause": "memory_leak",
        "metrics": {"p95_ms": 3100, "error_rate": 0.082},
        "logs": [
            "notifications-worker ERROR OOMKilled worker container pod-7bc9",
            "kernel INFO Out of memory: Kill process 18239 (python) score 920",
            "notifications-worker WARN heap size growing +120MB/min without garbage collection",
        ],
        "extra": ["trace: unbounded in-memory task accumulator introduced in notification batching"],
        "deploys": ["25m ago notifications-worker v2.4: batched notification dispatch"],
        "effective": {"restart_pods", "rollback_deploy"},
        "harmful": {"scale_out"},
        "tag": "Extended",
    },

    # 4. Downstream Carrier Rate Limit
    "INC-106": {
        "service": "shipping-service",
        "severity": "P3",
        "category": "performance",
        "root_cause": "downstream_rate_limit",
        "metrics": {"p95_ms": 2800, "error_rate": 0.053},
        "logs": [
            "shipping-service WARN carrier API returned HTTP 429 Too Many Requests",
            "shipping-service ERROR circuit breaker carrier_quotes tripped to OPEN",
        ],
        "extra": ["outbound rate 45 req/s exceeds carrier SLA limit of 15 req/s"],
        "deploys": ["none in last 48h"],
        "effective": {"enable_request_coalescing"},
        "harmful": {"scale_out"},
        "tag": "Extended",
    },

    # 5. Cold Search Index
    "INC-107": {
        "service": "search-api",
        "severity": "P2",
        "category": "performance",
        "root_cause": "cold_search_index",
        "metrics": {"p95_ms": 4100, "error_rate": 0.038},
        "logs": [
            "search-api WARN index segment cache hit fell from 89% to 4%",
            "elasticsearch ERROR heavy query thread pool queue length 128 (max 100)",
        ],
        "extra": ["node cluster restart flushed in-memory warm filter segments"],
        "deploys": ["node maintenance 20m ago: search-node-03 restarted"],
        "effective": {"warm_cache"},
        "harmful": {"flush_cache"},
        "tag": "Extended",
    },

    # 6. Database Lock Contention (High Risk -> Human Escalation)
    "INC-108": {
        "service": "billing-service",
        "severity": "P1",
        "category": "data",
        "root_cause": "database_lock_contention",
        "metrics": {"p95_ms": 6800, "error_rate": 0.22},
        "logs": [
            "billing-service ERROR deadlock detected on table accounts_ledger",
            "postgres FATAL Process 3120 waits for ExclusiveLock; Process 3124 holds ShareLock",
            "billing-service CRITICAL billing pipeline stalled: 1400 financial records blocked",
        ],
        "extra": ["deadlock cycle involving master write node: requires failover_db to break lock graph"],
        "deploys": ["none in last 24h"],
        "effective": {"failover_db"},  # HIGH RISK: must pause and wait for human approval
        "harmful": {"restart_pods"},
        "tag": "Escalation",
    },

    # 7. Disk IOPS Saturation
    "INC-109": {
        "service": "telemetry-collector",
        "severity": "P3",
        "category": "performance",
        "root_cause": "disk_iops_saturation",
        "metrics": {"p95_ms": 2400, "error_rate": 0.041},
        "logs": [
            "telemetry-collector WARN buffer write latency > 800ms",
            "iostat WARN nvme0n1 utilization 99.8%, queue depth 32",
        ],
        "extra": ["trace: debug log spooling filling write ring buffer"],
        "deploys": ["45m ago telemetry-collector: log level set to TRACE for debugging"],
        "effective": {"restart_pods"},
        "harmful": {"scale_out"},
        "tag": "Extended",
    },

    # 8. Bad Routing Deploy
    "INC-110": {
        "service": "auth-gateway",
        "severity": "P1",
        "category": "outage",
        "root_cause": "bad_routing_deploy",
        "metrics": {"p95_ms": 5900, "error_rate": 0.185},
        "logs": [
            "auth-gateway ERROR 502 Bad Gateway on /oauth/v2/token",
            "envoy WARN upstream connection failure to cluster auth-internal-canary",
        ],
        "extra": ["routing table rule sends 50% traffic to non-existent internal canary"],
        "deploys": ["8m ago auth-gateway v3.12: dynamic canary routing rules enabled"],
        "effective": {"rollback_deploy"},
        "harmful": {"restart_pods"},
        "tag": "Extended",
    },
}


class BaseWorld:
    """Interface for incident telemetry and execution environments."""

    def alerts(self) -> List[str]:
        raise NotImplementedError

    def logs(self, extended: bool = False) -> List[str]:
        raise NotImplementedError

    def deploys(self) -> List[str]:
        raise NotImplementedError

    def metrics(self) -> Dict[str, Any]:
        raise NotImplementedError

    def healthy(self) -> bool:
        raise NotImplementedError

    def worsened(self) -> bool:
        raise NotImplementedError

    def apply(self, action: str) -> Dict[str, Any]:
        raise NotImplementedError

    def rollback(self) -> None:
        raise NotImplementedError


class World(BaseWorld):
    """Deterministic simulated production world."""

    def __init__(self, incident_id: str):
        if incident_id not in SCENARIOS:
            raise ValueError(f"Unknown incident scenario: {incident_id}")

        self.id = incident_id
        self.s = copy.deepcopy(SCENARIOS[incident_id])
        self.m = dict(self.s["metrics"])
        self._prev: Optional[Dict[str, Any]] = None
        self.metric_history: List[Dict[str, Any]] = [
            {"time_offset": 0, "p95_ms": self.m["p95_ms"], "error_rate": self.m["error_rate"], "action": "initial"}
        ]
        self.elapsed_minutes = 0

    def alerts(self) -> List[str]:
        if self.s.get("alerts"):
            return list(self.s["alerts"])
        return [
            f"{self.s['service']} p95 latency {self.m['p95_ms']}ms",
            f"{self.s['service']} error rate {self.m['error_rate']:.1%}",
        ]

    def logs(self, extended: bool = False) -> List[str]:
        return self.s["logs"] + (self.s.get("extra", []) if extended else [])

    def deploys(self) -> List[str]:
        return self.s.get("deploys", [])

    def metrics(self) -> Dict[str, Any]:
        return dict(self.m)

    def healthy(self) -> bool:
        return self.m["p95_ms"] <= 450 and self.m["error_rate"] <= 0.015

    def worsened(self) -> bool:
        return self._prev is not None and self.m["p95_ms"] > (self._prev["p95_ms"] * 1.1)

    def apply(self, action: str) -> Dict[str, Any]:
        self._prev = dict(self.m)
        duration = ACTION_MINUTES.get(action, 2)
        self.elapsed_minutes += duration

        if action in self.s["effective"]:
            self.m = dict(HEALTHY_METRICS)
            outcome = "effective"
        elif action in self.s["harmful"]:
            self.m = {
                "p95_ms": int(self.m["p95_ms"] * 1.4),
                "error_rate": min(0.60, round(self.m["error_rate"] * 1.5, 3)),
            }
            outcome = "worsened"
        else:
            # Neutral / no effect
            outcome = "no_effect"

        self.metric_history.append({
            "time_offset": self.elapsed_minutes,
            "p95_ms": self.m["p95_ms"],
            "error_rate": self.m["error_rate"],
            "action": action,
            "outcome": outcome,
        })

        return {
            "action": action,
            "minutes": duration,
            "outcome": outcome,
            "metrics": dict(self.m),
        }

    def rollback(self) -> None:
        if self._prev:
            self.m = dict(self._prev)
            self.metric_history.append({
                "time_offset": self.elapsed_minutes,
                "p95_ms": self.m["p95_ms"],
                "error_rate": self.m["error_rate"],
                "action": "rollback",
                "outcome": "rolled_back",
            })


def register_custom_scenario(
    service: str,
    severity: str = "P2",
    category: str = "performance",
    description: str = "",
    root_cause: str = "unknown",
    metrics: Optional[Dict[str, Any]] = None,
    logs: Optional[List[str]] = None,
    alerts: Optional[List[str]] = None,
    deploys: Optional[List[str]] = None,
    extra: Optional[List[str]] = None,
    effective: Optional[Set[str]] = None,
    harmful: Optional[Set[str]] = None,
    tag: str = "Dynamic",
    custom_id: Optional[str] = None,
) -> str:
    """Registers a dynamic or user-submitted incident scenario into SCENARIOS."""
    if custom_id:
        incident_id = custom_id
    else:
        # Generate next dynamic ID
        dyn_count = sum(1 for k in SCENARIOS if k.startswith("INC-DYN-")) + 1
        incident_id = f"INC-DYN-{dyn_count:02d}"

    if metrics is None:
        metrics = {"p95_ms": 3200, "error_rate": 0.05}
    if logs is None:
        logs = [f"{service} alert: anomalous telemetry detected", f"{service} latency elevated"]
    if alerts is None:
        alerts = [f"{service} p95 latency {metrics.get('p95_ms', 3200)}ms", f"{service} error rate {metrics.get('error_rate', 0.05):.1%}"]
    if deploys is None:
        deploys = ["none in last 12h"]

    if effective is None:
        effective_map = {
            "cache_stampede": {"enable_request_coalescing", "rollback_deploy"},
            "db_pool_exhaustion": {"increase_db_pool"},
            "memory_leak": {"restart_pods"},
            "downstream_rate_limit": {"enable_request_coalescing"},
            "cold_search_index": {"warm_cache"},
            "database_lock_contention": {"failover_db"},
            "disk_iops_saturation": {"restart_pods"},
            "bad_routing_deploy": {"rollback_deploy"},
        }
        effective = effective_map.get(root_cause, {"restart_pods", "scale_out", "increase_db_pool"})

    if harmful is None:
        harmful_map = {
            "db_pool_exhaustion": {"scale_out"},
            "cold_search_index": {"flush_cache"},
            "downstream_rate_limit": {"scale_out"},
            "memory_leak": {"scale_out"},
            "bad_routing_deploy": {"restart_pods"},
        }
        harmful = harmful_map.get(root_cause, set())

    scenario_entry = {
        "id": incident_id,
        "service": service,
        "severity": severity,
        "category": category,
        "root_cause": root_cause,
        "metrics": metrics,
        "logs": logs,
        "alerts": alerts,
        "deploys": deploys,
        "extra": extra or ([description] if description else []),
        "effective": set(effective),
        "harmful": set(harmful),
        "tag": tag,
        "custom": True,
        "description": description or (logs[0] if logs else f"{service} incident"),
    }
    SCENARIOS[incident_id] = scenario_entry

    try:
        from .db import save_custom_scenario
        save_custom_scenario(scenario_entry)
    except Exception as e:
        log.warning("Could not persist custom scenario to SQLite: %s", e)

    return incident_id


# Automatically load any previously persisted custom scenarios from SQLite into memory
try:
    from .db import load_custom_scenarios_into_world
    load_custom_scenarios_into_world(SCENARIOS)
except Exception:
    pass



"""Deterministic simulated production environment (swap for Datadog / PagerDuty / kubectl adapters).
Two incident families, each appearing twice with different services, so memory can transfer:
  cache stampede: INC-101 (payments-api) -> INC-102 (catalog-service)
  DB pool exhaustion: INC-103 (checkout-api) -> INC-104 (orders-api)"""
import copy

HEALTHY = dict(p95_ms=180, error_rate=0.002)
ACTION_MINUTES = dict(restart_pods=2, scale_out=3, rollback_deploy=5, enable_request_coalescing=2,
                      flush_cache=1, increase_db_pool=1, failover_db=8, warm_cache=3)

SCENARIOS = {
    "INC-101": dict(service="payments-api", metrics=dict(p95_ms=4200, error_rate=0.061),
        logs=["payments-api WARN cache MISS ratio 92% (baseline 8%)",
              "payments-api ERROR timeout waiting on redis GET session:* (1840 concurrent identical loads)",
              "redis INFO 210k keys expired within 2s"],
        extra=["trace: one request fans out to 1800 identical DB reads for the same hot key"],
        deploys=["14m ago payments-api v412: session cache TTL 300s -> 30s, TTL jitter removed"],
        effective={"enable_request_coalescing", "rollback_deploy"}, harmful=set()),
    "INC-102": dict(service="catalog-service", metrics=dict(p95_ms=3600, error_rate=0.047),
        logs=["catalog-service WARN redis hit rate fell to 12%",
              "catalog-service ERROR postgres CPU 97%, many identical product:* SELECTs in flight",
              "redis INFO mass key expiry at 10:42:07"],
        extra=["trace: cold cache, every worker loading same popular product page simultaneously"],
        deploys=["9m ago catalog-service v88: product cache TTL 600s -> 45s"],
        effective={"enable_request_coalescing", "rollback_deploy"}, harmful=set()),
    "INC-103": dict(service="checkout-api", metrics=dict(p95_ms=5200, error_rate=0.12),
        logs=["checkout-api ERROR could not acquire connection from pool (size=20, waiting=340)",
              "postgres WARN connections 198/200, remaining slots reserved for superuser"],
        extra=["traffic +3x from flash sale campaign; per-request transactions held open ~4s"],
        deploys=["none in last 24h"],
        effective={"increase_db_pool"}, harmful={"scale_out"}),
    "INC-104": dict(service="orders-api", metrics=dict(p95_ms=4700, error_rate=0.09),
        logs=["orders-api ERROR timeout acquiring DB connection (pool=25, queued=210)",
              "orders-db WARN too many clients already"],
        extra=["batch export job started 20m ago holding long transactions"],
        deploys=["none in last 24h"],
        effective={"increase_db_pool"}, harmful={"scale_out"}),
}


class World:
    def __init__(self, incident_id: str):
        self.id, self.s = incident_id, copy.deepcopy(SCENARIOS[incident_id])
        self.m = dict(self.s["metrics"]); self._prev = None

    def alerts(self):
        return [f"{self.s['service']} p95 latency {self.m['p95_ms']}ms",
                f"{self.s['service']} error rate {self.m['error_rate']:.1%}"]

    def logs(self, extended=False): return self.s["logs"] + (self.s["extra"] if extended else [])
    def deploys(self): return self.s["deploys"]
    def metrics(self): return dict(self.m)
    def healthy(self): return self.m["p95_ms"] < 500 and self.m["error_rate"] < 0.01
    def worsened(self): return self._prev is not None and self.m["p95_ms"] > self._prev["p95_ms"] * 1.1

    def apply(self, action: str) -> dict:
        self._prev = dict(self.m)
        if action in self.s["effective"]:
            self.m = dict(HEALTHY)
        elif action in self.s["harmful"]:
            self.m = dict(p95_ms=int(self.m["p95_ms"] * 1.4), error_rate=min(0.5, self.m["error_rate"] * 1.5))
        return dict(action=action, minutes=ACTION_MINUTES.get(action, 2))

    def rollback(self):
        if self._prev: self.m = dict(self._prev)

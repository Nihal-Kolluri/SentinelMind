"""Hindsight memory layer: retain (store), recall (retrieve), reflect (synthesize).
Memory failures degrade gracefully: the incident still runs, just without history."""
import logging, os, time
from datetime import datetime, timezone

log = logging.getLogger("sentinelmind.memory")


class NullMemory:
    """Baseline for the before/after demo: an agent with no memory."""
    enabled = False
    def recall(self, query, k=8): return []
    def retain(self, content, context="incident"): pass
    def reflect(self, query): return ""


class HindsightMemory:
    enabled = True

    def __init__(self, bank_id: str, client=None):
        if client is None:
            from hindsight_client import Hindsight
            client = Hindsight(base_url=os.getenv("HINDSIGHT_BASE_URL", "http://localhost:8888"),
                               api_key=os.getenv("HINDSIGHT_API_KEY") or None, timeout=60.0)
        self.client, self.bank_id = client, bank_id
        try:
            self.client.banks.create(bank_id=bank_id, name="SentinelMind incident memory")
        except Exception as e:  # already exists / older client: retain creates banks lazily
            log.info("bank create skipped: %s", e)

    def _retry(self, fn, *a, **kw):
        for attempt in range(3):
            try:
                return fn(*a, **kw)
            except Exception as e:
                log.warning("hindsight call failed (%d/3): %s", attempt + 1, e)
                time.sleep(0.5 * 2 ** attempt)
        return None

    def recall(self, query: str, k: int = 8) -> list[str]:
        res = self._retry(self.client.recall, bank_id=self.bank_id, query=query)
        if not res:
            return []
        return [f"[{getattr(r, 'type', 'fact')}] {r.text}" for r in res.results][:k]

    def retain(self, content: str, context: str = "incident postmortem"):
        self._retry(self.client.retain, bank_id=self.bank_id, content=content, context=context,
                    timestamp=datetime.now(timezone.utc).isoformat())
        time.sleep(float(os.getenv("RETAIN_SETTLE_S", "4")))  # let extraction finish

    def reflect(self, query: str) -> str:
        res = self._retry(self.client.reflect, bank_id=self.bank_id, query=query)
        return getattr(res, "text", "") if res else ""

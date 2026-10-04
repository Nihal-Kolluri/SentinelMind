"""Hindsight memory layer: retain (store), recall (retrieve), reflect (synthesize).
Memory failures degrade gracefully: the incident still runs without crashing,
and sets degraded=True so the UI displays a 'memory degraded' banner.
"""
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("sentinelmind.memory")


class MemoryTrailItem:
    """Structured representation of a recalled memory influencing agent decisions."""

    def __init__(
        self,
        incident_id: str,
        service: str,
        matched_on: str,
        outcome: str,
        influenced: List[str],
        raw_text: str = "",
        matches: int = 1,
        successes: int = 1,
    ):
        self.incident_id = incident_id
        self.service = service
        self.matched_on = matched_on
        self.outcome = outcome
        self.influenced = influenced
        self.raw_text = raw_text
        self.matches = matches
        self.successes = successes

    def to_dict(self) -> Dict[str, Any]:
        return {
            "incident_id": self.incident_id,
            "id": self.incident_id,
            "service": self.service,
            "matched_on": self.matched_on,
            "outcome": self.outcome,
            "influenced": self.influenced,
            "raw_text": self.raw_text,
            "matches": self.matches,
            "successes": self.successes,
        }


def parse_memory_trail(recalled_texts: List[str], current_agent: str, query: str = "") -> List[Dict[str, Any]]:
    """Extracts structured incident trail items from recalled Hindsight snippets."""
    trails = []
    seen_ids = set()

    for item in recalled_texts:
        text = str(item)
        match_id = re.search(r"Incident\s+([A-Z0-9_-]+)", text, re.IGNORECASE)
        if not match_id:
            continue

        iid = match_id.group(1).upper()
        if iid in seen_ids:
            # Add current agent to influenced list of existing item
            for t in trails:
                if t["incident_id"] == iid and current_agent not in t["influenced"]:
                    t["influenced"].append(current_agent)
            continue

        seen_ids.add(iid)

        # Extract service
        match_svc = re.search(r"on\s+([a-zA-Z0-9._-]+)", text)
        service = match_svc.group(1) if match_svc else "service"

        # Extract outcome summary
        succeeded = re.findall(r"Action\s+(\w+)\s+SUCCEEDED", text)
        failed = re.findall(r"Action\s+(\w+)\s+FAILED", text)
        worsened = re.findall(r"Action\s+(\w+)\s+made.*?WORSE", text)

        outcome_parts = []
        if succeeded:
            outcome_parts.append(f"{', '.join(succeeded)} resolved it.")
        if worsened:
            outcome_parts.append(f"{', '.join(worsened)} made it worse and was rolled back.")
        if failed:
            outcome_parts.append(f"{', '.join(failed)} had no effect.")

        outcome = " ".join(outcome_parts) or text[:120] + "..."

        # Matched on symptoms or query
        match_sym = re.search(r"Symptoms:\s*(.*?)(?:\. Root cause|\. Action|$)", text)
        matched_on = match_sym.group(1).strip() if match_sym else query or "Past incident match"

        # Historical counts
        matches = len(succeeded) + len(failed) + len(worsened)
        successes = len(succeeded)

        trails.append({
            "incident_id": iid,
            "id": iid,
            "service": service,
            "matched_on": matched_on,
            "outcome": outcome,
            "influenced": [current_agent],
            "raw_text": text,
            "matches": max(1, matches),
            "successes": successes,
        })

    return trails


class NullMemory:
    """Baseline for before/after comparison: an agent running with zero past memory."""
    enabled = False
    degraded = False

    def recall(self, query: str, k: int = 8) -> List[str]:
        return []

    def retain(self, content: str, context: str = "incident postmortem") -> None:
        pass

    def reflect(self, query: str) -> str:
        return ""


class HindsightMemory:
    """Production memory layer powered by Vectorize Hindsight."""
    enabled = True

    def __init__(self, bank_id: str, client: Any = None):
        self.bank_id = bank_id
        self.degraded = False
        self.client = client

        if self.client is None:
            try:
                from hindsight_client import Hindsight
                base_url = os.getenv("HINDSIGHT_BASE_URL", "https://api.hindsight.vectorize.io")
                api_key = os.getenv("HINDSIGHT_API_KEY") or None
                self.client = Hindsight(base_url=base_url, api_key=api_key, timeout=30.0)
            except Exception as e:
                log.error("Failed to initialize Hindsight client: %s. Entering degraded mode.", e)
                self.degraded = True
                self.client = None

        if self.client is not None:
            try:
                # In hindsight-client, create bank if not present
                self.client.banks.create(bank_id=bank_id, name="SentinelMind Incident Memory")
            except Exception as e:
                # Hindsight allows lazy bank creation upon retain or may throw bank exists error
                log.info("Hindsight bank creation skipped or already exists: %s", e)

    def _retry(self, fn, *args, **kwargs) -> Any:
        """Executes a Hindsight call with retries. On persistent failure, sets degraded mode."""
        if self.client is None or self.degraded:
            return None

        last_err = None
        for attempt in range(3):
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                last_err = e
                log.warning("Hindsight call attempt %d/3 failed: %s", attempt + 1, e)
                time.sleep(0.5 * (2 ** attempt))

        log.error("Hindsight operation failed after 3 retries: %s. Degraded mode active.", last_err)
        self.degraded = True
        return None

    def recall(self, query: str, k: int = 8) -> List[str]:
        """Recalls relevant memories using multi-strategy retrieval."""
        if self.degraded or not self.client:
            return []

        res = self._retry(self.client.recall, bank_id=self.bank_id, query=query)
        if not res or not hasattr(res, "results"):
            return []

        results = []
        for r in res.results:
            text = getattr(r, "text", str(r))
            typ = getattr(r, "type", "fact")
            results.append(f"[{typ}] {text}")

        return results[:k]

    def retain(self, content: str, context: str = "incident postmortem") -> None:
        """Stores structured postmortem and waits for extraction/indexing to settle."""
        if self.degraded or not self.client:
            return

        settle_s = float(os.getenv("RETAIN_SETTLE_S", "4"))
        self._retry(
            self.client.retain,
            bank_id=self.bank_id,
            content=content,
            context=context,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        time.sleep(settle_s)

    def reflect(self, query: str) -> str:
        """Synthesizes playbooks and conclusions across memories in the bank."""
        if self.degraded or not self.client:
            return ""

        res = self._retry(self.client.reflect, bank_id=self.bank_id, query=query)
        return getattr(res, "text", "") if res else ""

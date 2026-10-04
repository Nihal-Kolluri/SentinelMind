"""Tests for graceful degradation when Hindsight is unreachable mid-run."""
from sentinelmind.memory import HindsightMemory
from sentinelmind.orchestrator import run_incident


class BrokenHindsightClient:
    """Simulates network failure / unreachable Hindsight service."""
    class Banks:
        def create(self, **kwargs):
            raise ConnectionError("Hindsight API unreachable: 503 Service Unavailable")
    banks = Banks()

    def retain(self, **kwargs):
        raise ConnectionError("Connection reset by peer")

    def recall(self, **kwargs):
        raise ConnectionError("Connection timed out")

    def reflect(self, **kwargs):
        raise ConnectionError("DNS resolution failed")


def test_hindsight_unreachable_degrades_gracefully(fake_llm):
    broken_client = BrokenHindsightClient()
    mem = HindsightMemory(bank_id="test-broken-bank", client=broken_client)

    # Calling recall should return [] and set degraded=True without raising
    recalled = mem.recall("test query")
    assert recalled == []
    assert mem.degraded is True

    # Calling retain should not crash
    mem.retain("test facts")

    # Calling reflect should return "" without crashing
    reflection = mem.reflect("test synthesis")
    assert reflection == ""

    # Running an incident with degraded Hindsight memory must NOT crash
    st = run_incident("INC-101", mem, fake_llm, label="degraded_test")
    assert st["status"] == "resolved"
    assert st["minutes"] > 0
    assert "enable_request_coalescing" in st["succeeded"]

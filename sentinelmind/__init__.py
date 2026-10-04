"""SentinelMind: Multi-agent AI incident-response system powered by Hindsight persistent memory."""

from .llm import get_llm, UnifiedLLM, LLMError
from .memory import HindsightMemory, NullMemory, MemoryTrailItem
from .orchestrator import run_incident, set_kill_switch, Escalate
from .world import World, SCENARIOS
from .confidence import compute_confidence

__version__ = "1.0.0"
__all__ = [
    "get_llm",
    "UnifiedLLM",
    "LLMError",
    "HindsightMemory",
    "NullMemory",
    "MemoryTrailItem",
    "run_incident",
    "set_kill_switch",
    "Escalate",
    "World",
    "SCENARIOS",
    "compute_confidence",
]

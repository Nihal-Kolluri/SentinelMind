"""Unified LLM interface with provider switch, defensive JSON extraction,
rate-limit exponential backoff, and model fallback.

Supports:
- Gemini via its OpenAI-compatible endpoint (base_url: https://generativelanguage.googleapis.com/v1beta/openai/)
- Groq via OpenAI client (base_url: https://api.groq.com/openai/v1)
"""
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional
from openai import OpenAI

log = logging.getLogger("sentinelmind.llm")


class LLMError(Exception):
    pass


def extract_json(text: str) -> dict:
    """Defensively parses JSON from LLM output:
    1. Removes <think>...</think> reasoning tags
    2. Strips markdown code blocks (```json ... ```)
    3. Finds the outermost matching '{' and '}'
    """
    if not text:
        raise ValueError("empty LLM response")

    # Remove thinking tags from reasoning models
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Strip code block wrappers
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"```$", "", cleaned, flags=re.MULTILINE).strip()

    # Locate outermost JSON object
    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start == -1 or end == -1 or end < start:
        raise ValueError(f"no JSON object found in response: {text[:200]}")

    candidate = cleaned[start:end + 1]
    return json.loads(candidate)


class UnifiedLLM:
    """Single interface for LLM completions across Gemini and Groq providers."""

    def __init__(
        self,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        fallback_model: Optional[str] = None,
    ):
        self.provider = (provider or os.getenv("LLM_PROVIDER", "gemini")).lower()

        if self.provider == "gemini":
            self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
            self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
            self.models = [
                model or os.getenv("LLM_MODEL", "gemini-3-flash-preview"),
                fallback_model or os.getenv("LLM_FALLBACK_MODEL", "gemini-3.1-flash-lite"),
            ]
        elif self.provider == "groq":
            self.base_url = "https://api.groq.com/openai/v1"
            self.api_key = api_key or os.getenv("GROQ_API_KEY", "")
            self.models = [
                model or os.getenv("LLM_MODEL", "openai/gpt-oss-120b"),
                fallback_model or os.getenv("LLM_FALLBACK_MODEL", "qwen/qwen3-32b"),
            ]
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider}")

        if not self.api_key:
            log.warning("No API key configured for provider: %s (operating in offline heuristic fallback)", self.provider)
            self.client = None
        else:
            self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def _heuristic_fallback(self, system: str, user: str) -> Dict[str, Any]:
        """Deterministic offline fallback when API keys are not supplied."""
        u = {}
        try:
            if user.strip().startswith("{"):
                u = json.loads(user)
        except Exception:
            pass

        if "AGENT:triage" in system:
            return {
                "severity": "P2",
                "category": "performance",
                "known": False,
                "match_note": "Novel pattern (offline heuristic)",
            }
        elif "AGENT:investigator" in system:
            text = str(u).lower()
            if "pool" in text or "connection" in text:
                rc = "db_pool_exhaustion"
                exp = "Database connection pool saturated with queue starvation."
            elif "cache" in text or "redis" in text:
                rc = "cache_stampede"
                exp = "Cache stampede thundering herd on backend."
            elif "leak" in text or "oom" in text:
                rc = "memory_leak"
                exp = "Memory growth exceeding node threshold."
            elif "rate" in text or "429" in text:
                rc = "downstream_rate_limit"
                exp = "Outbound downstream service rate limits hit."
            elif "lock" in text or "deadlock" in text:
                rc = "database_lock_contention"
                exp = "Deadlock on table rows."
            elif "routing" in text or "canary" in text:
                rc = "bad_routing_deploy"
                exp = "Misrouted traffic to invalid endpoint."
            else:
                rc = "service_degradation"
                exp = "Service degradation detected from anomalous metrics."
            return {
                "root_cause": rc,
                "explanation": exp,
                "confidence": 0.85,
                "evidence": ["anomalous telemetry", "error spikes"],
            }
        elif "AGENT:planner" in system:
            rc = u.get("root_cause", {}).get("root_cause", "unknown") if isinstance(u.get("root_cause"), dict) else str(u.get("root_cause", ""))
            plan_map = {
                "db_pool_exhaustion": ["increase_db_pool"],
                "cache_stampede": ["enable_request_coalescing"],
                "memory_leak": ["restart_pods"],
                "downstream_rate_limit": ["enable_request_coalescing"],
                "cold_search_index": ["warm_cache"],
                "database_lock_contention": ["failover_db"],
                "bad_routing_deploy": ["rollback_deploy"],
            }
            plan = plan_map.get(rc, ["restart_pods", "scale_out"])
            return {"plan": plan, "rationale": "Offline heuristic remediation plan"}
        elif "AGENT:historian" in system:
            return {"lesson": "Remediated incident and maintained SLA stability."}
        else:
            return {"message": "processed", "status": "ok"}

    def json(self, system: str, user: str, retries: int = 2) -> Dict[str, Any]:
        """Requests structured JSON output, retrying with backoff and falling back to second model."""
        if self.client is None:
            return self._heuristic_fallback(system, user)

        last_error = None

        for model_idx, model in enumerate(self.models):
            for attempt in range(retries + 1):
                try:
                    # Small delay between calls to preserve rate limits on free tiers
                    time.sleep(0.35)

                    response = self.client.chat.completions.create(
                        model=model,
                        temperature=0.2,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    f"{system}\n"
                                    "IMPORTANT: Respond ONLY with a valid JSON object matching the requested schema. "
                                    "Do NOT wrap with markdown, explanation, or commentary."
                                ),
                            },
                            {"role": "user", "content": user},
                        ],
                    )

                    content = response.choices[0].message.content or ""
                    parsed = extract_json(content)
                    return parsed

                except Exception as e:
                    last_error = e
                    err_msg = str(e).lower()
                    is_rate_limit = "429" in err_msg or "rate limit" in err_msg or "quota" in err_msg

                    wait_time = (1.5 * (2 ** attempt)) if is_rate_limit else (0.5 * (2 ** attempt))
                    log.warning(
                        "LLM [%s] (model=%s, attempt=%d/%d) error: %s. Retrying in %.1fs...",
                        self.provider,
                        model,
                        attempt + 1,
                        retries + 1,
                        e,
                        wait_time,
                    )
                    time.sleep(wait_time)

            log.info("Switching to fallback model after exhausting retries on %s", model)

        raise LLMError(f"All models failed for provider {self.provider}. Last error: {last_error}")


def get_llm() -> UnifiedLLM:
    """Factory function returning configured UnifiedLLM instance."""
    return UnifiedLLM()

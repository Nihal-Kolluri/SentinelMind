"""Confidence computation module.
Computes confidence by blending LLM model confidence and historical success rate:
  history_score = (successes + 1) / (matches + 2)
  final_confidence = 0.5 * model_confidence + 0.5 * history_score
"""
from typing import Dict, Any


def compute_history_score(matches: int, successes: int) -> float:
    """Laplace-smoothed success rate from similar past incidents."""
    matches = max(0, int(matches))
    successes = max(0, min(matches, int(successes)))
    return (successes + 1.0) / (matches + 2.0)


def compute_confidence(model_confidence: float, matches: int = 0, successes: int = 0) -> Dict[str, Any]:
    """Calculates final confidence score and returns detailed mathematical breakdown."""
    model_conf = max(0.0, min(1.0, float(model_confidence)))
    hist_score = compute_history_score(matches, successes)
    final_conf = round(0.5 * model_conf + 0.5 * hist_score, 4)

    return {
        "final_confidence": final_conf,
        "final_confidence_pct": round(final_conf * 100, 1),
        "model_confidence": round(model_conf, 4),
        "model_confidence_pct": round(model_conf * 100, 1),
        "history_score": round(hist_score, 4),
        "history_score_pct": round(hist_score * 100, 1),
        "matches": matches,
        "successes": successes,
        "formula": "0.5 * model_confidence + 0.5 * ((successes + 1) / (matches + 2))",
        "explanation": (
            f"Blend of model confidence ({round(model_conf * 100)}%) and "
            f"history success rate ({round(hist_score * 100)}%, {successes} of {matches} similar past fixes)."
        )
    }

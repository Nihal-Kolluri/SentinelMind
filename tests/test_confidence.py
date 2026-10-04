"""Tests for the confidence calculation formula:
  history_score = (successes + 1) / (matches + 2)
  final_confidence = 0.5 * model_confidence + 0.5 * history_score
"""
from sentinelmind.confidence import compute_confidence, compute_history_score


def test_history_score_cold():
    # 0 matches, 0 successes: (0 + 1) / (0 + 2) = 0.50
    score = compute_history_score(matches=0, successes=0)
    assert score == 0.50


def test_history_score_one_success():
    # 1 match, 1 success: (1 + 1) / (1 + 2) = 2/3 = 0.6667
    score = compute_history_score(matches=1, successes=1)
    assert round(score, 4) == round(2 / 3, 4)


def test_history_score_many_successes():
    # 8 matches, 8 successes: (8 + 1) / (8 + 2) = 9/10 = 0.90
    score = compute_history_score(matches=8, successes=8)
    assert score == 0.90


def test_confidence_blend():
    # model_confidence=0.70, matches=0, successes=0 -> hist=0.50 -> final = 0.5*0.70 + 0.5*0.50 = 0.60
    res = compute_confidence(model_confidence=0.70, matches=0, successes=0)
    assert res["final_confidence"] == 0.60
    assert res["final_confidence_pct"] == 60.0
    assert res["model_confidence"] == 0.70
    assert res["history_score"] == 0.50


def test_confidence_warm_boost():
    # model_confidence=0.90, matches=1, successes=1 -> hist=0.6667 -> final = 0.5*0.90 + 0.5*0.6667 = 0.7833
    res = compute_confidence(model_confidence=0.90, matches=1, successes=1)
    assert round(res["final_confidence"], 3) == 0.783
    assert res["matches"] == 1
    assert res["successes"] == 1

"""End-to-End Before/After Demo Script for SentinelMind.
Demonstrates measurable improvement when using Hindsight memory:
  1) BASELINE : INC-102 and INC-104 with NO memory (cold start)
  2) LEARN    : INC-101 and INC-103 with Hindsight (agent learns what succeeds, fails, or worsens)
  3) WITH MEM : INC-102 and INC-104 again (warm start; memory transfers across services)

Usage:
  python demo.py [--bank <custom-bank-name>]
"""
import argparse
import logging
import os
import sys
import time
from typing import Any
from dotenv import load_dotenv

# Ensure root directory is on sys.path
sys.path.insert(0, os.path.dirname(__file__))

load_dotenv()

from sentinelmind.llm import get_llm
from sentinelmind.memory import HindsightMemory, NullMemory
from sentinelmind.orchestrator import run_incident

def main():
    parser = argparse.ArgumentParser(description="SentinelMind Demo Flow")
    parser.add_argument("--bank", default=f"sentinelmind-demo-{int(time.time())}", help="Hindsight bank name")
    parser.add_argument("--offline", action="store_true", help="Run with mock LLM/memory for quick verification")
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING)

    print("======================================================================")
    print("           SENTINELMIND: INCIDENT RESPONSE THAT REMEMBERS              ")
    print("======================================================================")
    print(f"Hindsight Bank : {args.bank}")
    print(f"LLM Provider   : {os.getenv('LLM_PROVIDER', 'gemini')}")
    print(f"LLM Model      : {os.getenv('LLM_MODEL', 'gemini-3-flash-preview')}")
    print("----------------------------------------------------------------------")

    if args.offline:
        from tests.conftest import FakeLLM, FakeMemory
        llm, mem = FakeLLM(), FakeMemory()
    else:
        llm = get_llm()
        mem = HindsightMemory(args.bank)

    rows = []

    def run_flow(iid: str, memory_layer: Any, label: str, phase_title: str):
        print(f"\n>>> [{phase_title.upper()}] Incident: {iid}")
        st = run_incident(iid, memory_layer, llm, label=label)
        root_cause = st.get("diagnosis", {}).get("root_cause", "unknown")
        print(f"    Root Cause : {root_cause}")
        print(f"    Actions    : {st['tried']} -> status: {st['status']}, {st['minutes']} min")
        if st.get("worsened"):
            print(f"    Harmful    : {st['worsened']} (AUTOMATICALLY ROLLED BACK)")
        if st.get("memory_trail"):
            print(f"    Recalled   : {len(st['memory_trail'])} past incident(s) from Hindsight bank")

        rows.append((phase_title, iid, len(st["tried"]), st["minutes"], st["status"], round(st.get("confidence", 0.5) * 100)))
        return st

    # Phase 1: Baseline (cold, without memory)
    print("\n--- PHASE 1: BASELINE (COLD, NO MEMORY) ---")
    for iid in ("INC-102", "INC-104"):
        run_flow(iid, NullMemory(), "baseline", "no memory")

    # Phase 2: Learn (store postmortems into Hindsight)
    print("\n--- PHASE 2: LEARNING (STORING INCIDENTS INTO HINDSIGHT) ---")
    for iid in ("INC-101", "INC-103"):
        run_flow(iid, mem, "learn", "learning")

    # Phase 3: With Memory (warm, cross-service transfer)
    print("\n--- PHASE 3: WITH HINDSIGHT MEMORY (WARM TRANSFER) ---")
    last_warm = None
    for iid in ("INC-102", "INC-104"):
        last_warm = run_flow(iid, mem, "memory", "with memory")

    print("\n" + "=" * 70)
    print("                     BEFORE / AFTER SUMMARY RESULTS                   ")
    print("=" * 70)
    print(f"{'Phase':<15} {'Incident':<10} {'Actions':<9} {'Minutes':<9} {'Status':<11} {'Confidence'}")
    print("-" * 70)
    for r in rows:
        print(f"{r[0]:<15} {r[1]:<10} {r[2]:<9} {r[3]:<9} {r[4]:<11} {r[5]}%")
    print("=" * 70)

    # Calculate aggregate improvements
    cold_rows = [r for r in rows if r[0] == "no memory"]
    warm_rows = [r for r in rows if r[0] == "with memory"]
    if cold_rows and warm_rows:
        cold_time = sum(r[3] for r in cold_rows)
        warm_time = sum(r[3] for r in warm_rows)
        time_saved = round(((cold_time - warm_time) / cold_time) * 100, 1)

        cold_acts = sum(r[2] for r in cold_rows)
        warm_acts = sum(r[2] for r in warm_rows)
        acts_saved = round(((cold_acts - warm_acts) / cold_acts) * 100, 1)

        print(f"\n[+] Resolution Time Saved: {time_saved}% ({cold_time} min -> {warm_time} min)")
        print(f"[+] Remediation Actions Reduced: {acts_saved}% ({cold_acts} -> {warm_acts} actions)")

    print("\n--- HINDSIGHT SYNTHESIZED PLAYBOOK (REFLECT) ---")
    reflection = last_warm.get("reflection") if last_warm else None
    print(reflection or "(Playbook will refine with more incident samples)")


if __name__ == "__main__":
    main()

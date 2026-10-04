"""Before/after demo. Run: python demo.py
1) BASELINE  : INC-102 and INC-104 with NO memory
2) LEARN     : INC-101 and INC-103 with Hindsight (agent learns fixes and what fails)
3) WITH MEM  : INC-102 and INC-104 again, different services, same root-cause families"""
import argparse, logging, time
from dotenv import load_dotenv
load_dotenv()
from sentinelmind.llm import GroqLLM
from sentinelmind.memory import HindsightMemory, NullMemory
from sentinelmind.orchestrator import run_incident

ap = argparse.ArgumentParser()
ap.add_argument("--bank", default=f"sentinelmind-demo-{int(time.time())}")
args = ap.parse_args()
logging.basicConfig(level=logging.WARNING)
llm, mem = GroqLLM(), HindsightMemory(args.bank)
rows = []


def go(iid, memory, label, title):
    print(f"\n=== {title}: {iid} ===")
    st = run_incident(iid, memory, llm, label)
    print(f"root cause : {st.get('diagnosis', {}).get('root_cause')}")
    print(f"tried      : {st['tried']}  ->  status: {st['status']}, {st['minutes']} min")
    if st["worsened"]: print(f"worsened   : {st['worsened']} (auto-rolled back)")
    rows.append((title, iid, len(st["tried"]), st["minutes"], st["status"]))
    return st


for iid in ("INC-102", "INC-104"): go(iid, NullMemory(), "baseline", "no memory")
for iid in ("INC-101", "INC-103"): go(iid, mem, "learn", "learning")
last = None
for iid in ("INC-102", "INC-104"): last = go(iid, mem, "memory", "with memory")

print("\n--- SUMMARY ---\nphase          incident  actions  minutes  status")
for r in rows: print(f"{r[0]:<14} {r[1]:<9} {r[2]:<8} {r[3]:<8} {r[4]}")
print("\n--- HINDSIGHT REFLECTION ---\n" + (last.get("reflection") or "(none)"))

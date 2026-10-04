"""Test real live Hindsight retain, recall, reflect, and Gemini LLM."""
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sentinelmind.llm import get_llm
from sentinelmind.memory import HindsightMemory

def test_live():
    print("[*] Testing Live Gemini LLM...")
    llm = get_llm()
    resp = llm.json(
        "AGENT:triage. Classify incident. Reply JSON with keys: severity, category.",
        "payments-api error rate 6.1%"
    )
    print("[+] Gemini JSON response:", resp)

    bank_id = f"sentinelmind-live-test-{int(time.time())}"
    print(f"[*] Testing Live Hindsight with bank: {bank_id}...")
    mem = HindsightMemory(bank_id=bank_id)

    postmortem = (
        "Incident INC-101 on payments-api (P2, performance). "
        "Symptoms: cache miss ratio 92%. Root cause: cache_stampede. "
        "Action enable_request_coalescing SUCCEEDED and resolved the incident. "
        "Action restart_pods FAILED for cache_stampede. "
        "Action scale_out FAILED for cache_stampede. Time to resolve: 17 minutes."
    )
    print("[*] Retaining postmortem into Hindsight...")
    mem.retain(postmortem, context="incident postmortem")
    print("[+] Retain completed.")

    print("[*] Recalling memories for 'Which actions fixed cache_stampede?'...")
    recalled = mem.recall("Which actions fixed cache_stampede?", k=5)
    print(f"[+] Recalled {len(recalled)} snippets:")
    for r in recalled:
        print("   -", r[:100], "...")

    print("[*] Reflecting across memories...")
    reflection = mem.reflect("What action resolves cache_stampede?")
    print("[+] Reflection result:", reflection[:200] if reflection else "(in progress)")

    print("[+] LIVE TEST SUCCESSFUL!")

if __name__ == "__main__":
    test_live()

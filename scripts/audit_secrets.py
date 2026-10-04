import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Read actual configured keys from .env dynamically
keys_to_check = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GROQ_API_KEY", ""),
    os.getenv("HINDSIGHT_API_KEY", ""),
]
keys_to_check = [k.strip() for k in keys_to_check if len(k.strip()) > 8]

detected = []

for root, dirs, files in os.walk("."):
    if any(ignore in root for ignore in [".git", ".venv", ".tools", "node_modules", "runs", ".pytest_cache"]):
        continue
    for f in files:
        if f in [".env", ".env.local"]:
            continue
        p = os.path.join(root, f)
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as file_obj:
                txt = file_obj.read()
                for key in keys_to_check:
                    if key in txt:
                        detected.append(p)
                        break
        except Exception:
            pass

if detected:
    print(f"[!] SECURITY LEAK DETECTED in: {detected}")
    sys.exit(1)
else:
    print(f"[+] SECURITY AUDIT PASSED: Scanned for all active .env keys. Zero leaks detected.")
    sys.exit(0)

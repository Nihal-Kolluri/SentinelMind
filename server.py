"""Main server runner for SentinelMind.
Launches the FastAPI backend and serves the compiled React frontend at http://127.0.0.1:8000.
"""
import os
import sys
import threading
import time
import webbrowser
import uvicorn
from dotenv import load_dotenv

load_dotenv()

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(__file__))

def open_browser(url: str):
    time.sleep(1.2)
    print(f"\n[+] Opening browser at {url} ...")
    webbrowser.open(url)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    local_url = f"http://127.0.0.1:{port}"

    print("=" * 70)
    print("               SENTINELMIND: SERVER RUNNING                       ")
    print("=" * 70)
    print(f"[+] Access the Web Console in your browser at:")
    print(f"    --> {local_url}")
    print(f"    --> http://localhost:{port}")
    print("    (Note: Do NOT click 0.0.0.0 - Windows browsers require 127.0.0.1)")
    print("=" * 70)

    # Automatically open default browser after startup
    threading.Thread(target=open_browser, args=(local_url,), daemon=True).start()

    uvicorn.run("sentinelmind.api:app", host=host, port=port, reload=False)

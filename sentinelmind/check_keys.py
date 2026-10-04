"""Safe key and connectivity checker. Never prints or logs secrets."""
import os
import sys
from dotenv import load_dotenv

# Load from project root .env
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
load_dotenv()

def check():
    ok = True
    provider = os.getenv("LLM_PROVIDER", "gemini")
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key = os.getenv("GROQ_API_KEY", "")
    hindsight_key = os.getenv("HINDSIGHT_API_KEY", "")
    hindsight_url = os.getenv("HINDSIGHT_BASE_URL", "https://api.hindsight.vectorize.io")
    model = os.getenv("LLM_MODEL", "gemini-3-flash-preview")

    print("[*] Checking configuration...")
    if not gemini_key:
        print("[!] GEMINI_API_KEY is missing or empty in .env")
        ok = False
    else:
        print("[+] GEMINI_API_KEY is set")

    if not groq_key:
        print("[!] GROQ_API_KEY is missing or empty in .env")
    else:
        print("[+] GROQ_API_KEY is set")

    if not hindsight_key:
        print("[!] HINDSIGHT_API_KEY is missing or empty in .env")
        ok = False
    else:
        print("[+] HINDSIGHT_API_KEY is set")

    # Test Gemini connectivity
    if gemini_key:
        print(f"[*] Testing LLM connectivity (provider={provider}, model={model})...")
        try:
            from openai import OpenAI
            client = OpenAI(
                api_key=gemini_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
            )
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "Reply with 'OK'"}],
                max_tokens=10
            )
            print("[+] LLM connection successful!")
        except Exception as e:
            print(f"[!] LLM connection failed: {e}")
            ok = False

    # Test Hindsight connectivity
    if hindsight_key:
        print(f"[*] Testing Hindsight connectivity ({hindsight_url})...")
        try:
            from hindsight_client import Hindsight
            client = Hindsight(base_url=hindsight_url, api_key=hindsight_key, timeout=15.0)
            banks = client.banks.list()
            print("[+] Hindsight connection successful!")
        except Exception as e:
            print(f"[!] Hindsight connection test notice: {e}")
            # If banks.list is not available or bank creation is lazy, test retain or ping
            try:
                test_bank = f"sentinelmind-probe"
                client.retain(bank_id=test_bank, content="SentinelMind connectivity probe", context="probe")
                print("[+] Hindsight retain probe successful!")
            except Exception as e2:
                print(f"[!] Hindsight connection failed: {e2}")
                ok = False

    return ok

if __name__ == "__main__":
    success = check()
    sys.exit(0 if success else 1)

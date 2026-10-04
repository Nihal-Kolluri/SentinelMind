import os
import sys
import urllib.request

TOOLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".tools")
CLOUDFLARED_EXE = os.path.join(TOOLS_DIR, "cloudflared.exe")
URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

def setup_tunnel():
    os.makedirs(TOOLS_DIR, exist_ok=True)
    if not os.path.exists(CLOUDFLARED_EXE):
        print("[*] Downloading Cloudflare Tunnel (cloudflared)...")
        urllib.request.urlretrieve(URL, CLOUDFLARED_EXE)
        print("[+] Downloaded cloudflared to .tools/cloudflared.exe")
    else:
        print("[+] cloudflared is already present.")

if __name__ == "__main__":
    setup_tunnel()

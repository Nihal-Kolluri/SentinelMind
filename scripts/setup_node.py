import os
import sys
import urllib.request
import zipfile

NODE_VERSION = "v20.18.0"
URL = f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-win-x64.zip"
TOOLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".tools")
NODE_DIR = os.path.join(TOOLS_DIR, "node")
ZIP_PATH = os.path.join(TOOLS_DIR, "node.zip")

def setup_node():
    os.makedirs(TOOLS_DIR, exist_ok=True)
    node_exe = os.path.join(NODE_DIR, "node.exe")
    if os.path.exists(node_exe):
        print(f"[+] Node already present at {NODE_DIR}")
        return True

    print(f"[*] Downloading Node.js {NODE_VERSION}...")
    urllib.request.urlretrieve(URL, ZIP_PATH)
    print(f"[*] Extracting {ZIP_PATH}...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(TOOLS_DIR)

    extracted_folder = os.path.join(TOOLS_DIR, f"node-{NODE_VERSION}-win-x64")
    if os.path.exists(extracted_folder):
        if os.path.exists(NODE_DIR):
            import shutil
            shutil.rmtree(NODE_DIR)
        os.rename(extracted_folder, NODE_DIR)

    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)

    print(f"[+] Node.js setup complete at {NODE_DIR}")
    return True

if __name__ == "__main__":
    setup_node()

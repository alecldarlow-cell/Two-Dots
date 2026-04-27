"""
Direct Android SDK package installer.
Bypasses sdkmanager XML v4 incompatibility by fetching the repo manifest
ourselves and downloading/extracting packages directly.
"""
import urllib.request, zipfile, os, subprocess, sys, shutil, re, xml.etree.ElementTree as ET

SDK = r"C:\Users\chloe\AppData\Local\Android\Sdk"
# Try latest-2 first (v20, installed by Android Studio), then latest
_tools_candidates = [
    os.path.join(SDK, "cmdline-tools", "latest-2", "bin"),
    os.path.join(SDK, "cmdline-tools", "latest", "bin"),
]
TOOLS_BIN = next((d for d in _tools_candidates if os.path.exists(os.path.join(d, "avdmanager.bat"))), _tools_candidates[0])

def download(url, dest, label):
    print(f"  Downloading {label}...", flush=True)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest, reporthook=lambda b,bs,t: print(f"\r  {min(100,b*bs*100//(t or 1))}%", end="", flush=True) if b % 100 == 0 else None)
    print(" done", flush=True)

def extract_zip(zpath, dest):
    print(f"  Extracting to {dest}...", flush=True)
    os.makedirs(dest, exist_ok=True)
    with zipfile.ZipFile(zpath, 'r') as z:
        z.extractall(dest)
    print("  Extracted.", flush=True)

print("=== Step 1: Fetch SDK repository manifest ===")
# Try v4 first (current format), then older versions
manifest_urls = [
    "https://dl.google.com/android/repository/repository2-4.xml",
    "https://dl.google.com/android/repository/repository2-3.xml",
    "https://dl.google.com/android/repository/repository2-2.xml",
]
content = None
for mu in manifest_urls:
    try:
        print(f"  Trying {mu}")
        with urllib.request.urlopen(mu, timeout=15) as r:
            content = r.read().decode('utf-8')
        print("  Got manifest.")
        break
    except Exception as e:
        print(f"  Failed: {e}")

# Parse emulator URL from manifest
emu_url = None
if content:
    # Find <remotePackage path="emulator"> ... <archive os="windows"><complete><url>
    m = re.search(r'path="emulator".*?<archive[^>]*os="windows"[^>]*>.*?<url>([^<]+)</url>', content, re.DOTALL)
    if not m:
        # try without os attr (pick first windows url near emulator section)
        idx = content.find('path="emulator"')
        if idx != -1:
            chunk = content[idx:idx+3000]
            m2 = re.search(r'<url>(emulator-windows[^<]+\.zip)</url>', chunk)
            if m2:
                emu_url = "https://dl.google.com/android/repository/" + m2.group(1)
    else:
        raw = m.group(1).strip()
        emu_url = raw if raw.startswith("http") else "https://dl.google.com/android/repository/" + raw

# Fallback: try known recent emulator URLs
if not emu_url:
    print("  Could not parse emulator URL from manifest, trying known URLs...")
    fallbacks = [
        # Emulator 35.x / 36.x builds (2025-2026) - try newest first
        "https://dl.google.com/android/repository/emulator-windows_x64-13114758.zip",
        "https://dl.google.com/android/repository/emulator-windows_x64-12803340.zip",
        "https://dl.google.com/android/repository/emulator-windows_x64-12597559.zip",
        "https://dl.google.com/android/repository/emulator-windows_x64-12414864.zip",
        "https://dl.google.com/android/repository/emulator-windows_x64-12227869.zip",
        "https://dl.google.com/android/repository/emulator-windows_x64-11237101.zip",
    ]
    for fb in fallbacks:
        try:
            req = urllib.request.Request(fb, method="HEAD")
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200:
                    emu_url = fb
                    break
        except:
            pass

if not emu_url:
    print("ERROR: Could not find emulator download URL. Exiting.")
    sys.exit(1)

print(f"  Emulator URL: {emu_url}")

print("\n=== Step 2: Download + install emulator ===")
tmp = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "emu.zip")
download(emu_url, tmp, "emulator")
emu_dest = os.path.join(SDK, "emulator")
if os.path.exists(emu_dest):
    shutil.rmtree(emu_dest)
with zipfile.ZipFile(tmp, 'r') as z:
    z.extractall(SDK)  # emulator zip extracts to emulator/ folder
print(f"  Installed emulator -> {emu_dest}")

print("\n=== Step 3: Download system image (android-33 x86_64 google_apis) ===")
# System images are in a separate manifest
sysimg_url = None
try:
    with urllib.request.urlopen("https://dl.google.com/android/repository/sys-img/google_apis/sys-img.xml", timeout=15) as r:
        si_content = r.read().decode('utf-8')
    # Find x86_64 api 33
    m3 = re.search(r'<api-level>33</api-level>.*?<abi>x86_64</abi>.*?<url>([^<]+)</url>', si_content, re.DOTALL)
    if not m3:
        m3 = re.search(r'<abi>x86_64</abi>.*?<api-level>33</api-level>.*?<url>([^<]+)</url>', si_content, re.DOTALL)
    if m3:
        raw = m3.group(1).strip()
        sysimg_url = raw if raw.startswith("http") else "https://dl.google.com/android/repository/sys-img/google_apis/" + raw
except Exception as e:
    print(f"  Could not parse sys-img manifest: {e}")

if not sysimg_url:
    print("  Using fallback system image URL...")
    sysimg_url = "https://dl.google.com/android/repository/sys-img/google_apis/x86_64-33_r05.zip"

print(f"  Sys-img URL: {sysimg_url}")
tmp2 = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "sysimg.zip")
download(sysimg_url, tmp2, "system-image")

sysimg_dest = os.path.join(SDK, "system-images", "android-33", "google_apis", "x86_64")
os.makedirs(sysimg_dest, exist_ok=True)
with zipfile.ZipFile(tmp2, 'r') as z:
    # Zip may have a top-level folder; strip it
    names = z.namelist()
    prefix = names[0] if names[0].endswith('/') else ""
    for member in z.infolist():
        rel = member.filename[len(prefix):] if prefix and member.filename.startswith(prefix) else member.filename
        if not rel:
            continue
        target = os.path.join(sysimg_dest, rel)
        if member.is_dir():
            os.makedirs(target, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(member) as src, open(target, 'wb') as dst:
                shutil.copyfileobj(src, dst)
print(f"  Installed system image -> {sysimg_dest}")

print("\n=== Step 4: Install platforms;android-33 ===")
plat_dest = os.path.join(SDK, "platforms", "android-33")
if not os.path.exists(plat_dest):
    # Find from manifest
    plat_url = None
    if content:
        m4 = re.search(r'path="platforms;android-33".*?<url>([^<]+\.zip)</url>', content, re.DOTALL)
        if m4:
            raw = m4.group(1).strip()
            plat_url = raw if raw.startswith("http") else "https://dl.google.com/android/repository/" + raw
    if not plat_url:
        plat_url = "https://dl.google.com/android/repository/platform-33-ext4_r01.zip"
    tmp3 = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "platform33.zip")
    download(plat_url, tmp3, "platform-33")
    extract_zip(tmp3, os.path.join(SDK, "platforms"))
    # Rename extracted folder to android-33 if needed
    for d in os.listdir(os.path.join(SDK, "platforms")):
        if d.startswith("android-") and d != "android-33":
            os.rename(os.path.join(SDK, "platforms", d), plat_dest)
    print(f"  Installed platform -> {plat_dest}")
else:
    print(f"  Platform already present at {plat_dest}")

print("\n=== Step 5: Create AVD ===")
# Use ANDROID_SDK_ROOT env var instead of --sdk_root flag
env = os.environ.copy()
env["ANDROID_SDK_ROOT"] = SDK
env["ANDROID_HOME"] = SDK

avdmgr = os.path.join(TOOLS_BIN, "avdmanager.bat")
result = subprocess.run(
    [avdmgr, "create", "avd", "-n", "TwoDots",
     "-k", "system-images;android-33;google_apis;x86_64",
     "--device", "pixel_4", "--force"],
    input="no\n", capture_output=True, text=True, env=env
)
print(result.stdout)
if result.returncode != 0:
    print("avdmanager stderr:", result.stderr)
    # Try without device flag
    result2 = subprocess.run(
        [avdmgr, "create", "avd", "-n", "TwoDots",
         "-k", "system-images;android-33;google_apis;x86_64", "--force"],
        input="no\n", capture_output=True, text=True, env=env
    )
    print(result2.stdout)
    if result2.returncode != 0:
        print("avdmanager stderr:", result2.stderr)

print("\n=== Step 6: Launch emulator ===")
emu_exe = os.path.join(SDK, "emulator", "emulator.exe")
if os.path.exists(emu_exe):
    subprocess.Popen([emu_exe, "-avd", "TwoDots", "-no-snapshot", "-gpu", "swiftshader_indirect"])
    print("Emulator launched! Boot takes ~90 seconds.")
else:
    print(f"ERROR: emulator.exe not found at {emu_exe}")
    print("Contents of emulator dir:")
    if os.path.exists(os.path.dirname(emu_exe)):
        print(os.listdir(os.path.dirname(emu_exe)))

print("\nDone. Press Enter to close.")
input()

#!/usr/bin/env python3
"""
BlockExDSE one-command launcher for Windows, Linux and macOS.

    Linux / macOS :  python3 run.py        (or ./run_all.sh)
    Windows       :  py run.py             (or double-click run_all.bat)

What it does: installs dependencies on first run, compiles the contract, starts the Hardhat
chain, deploys, starts three edge nodes, opens the dashboard. Ctrl+C stops everything.
Other chains: set RPC_URL and CHAIN_PRIVATE_KEY (a funded TEST-network key) before running; see README.
Options: --no-browser   --demo-delay SECONDS   --no-compile   --lan (phone access)   --block-time MS
         --demo   (poster day: live market simulator on, faster order flow, one-tap "Try it now" accounts)
         --public (share an https link through a free Cloudflare quick tunnel; needs cloudflared installed)
"""
import argparse
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IS_WIN = os.name == "nt"
LOGS = ROOT / "logs"
VENV = ROOT / ".venv"
VPY = VENV / ("Scripts/python.exe" if IS_WIN else "bin/python")
PORTS = {8545: "Hardhat node", 9001: "edge node 1 (gateway)", 9002: "edge node 2", 9003: "edge node 3", 9004: "edge node 4"}
NODES = (1, 2, 3, 4)
procs = []


def say(msg=""):
    print(msg, flush=True)


def die(msg, code=1):
    say(f"\nERROR: {msg}")
    stop_all()
    sys.exit(code)


def port_busy(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def run_step(title, cmd, hint=None, **kw):
    say(f"==> {title}")
    r = subprocess.run([str(c) for c in cmd], cwd=kw.pop("cwd", ROOT), **kw)
    if r.returncode != 0:
        die(f"step failed: {title}\n       command: {' '.join(str(c) for c in cmd)}" + (f"\n       {hint}" if hint else ""))


def check_tools():
    node, npm, npx = shutil.which("node"), shutil.which("npm"), shutil.which("npx")
    if not (node and npm and npx):
        die("Node.js was not found. Install Node 20 LTS from https://nodejs.org, then open a NEW terminal and try again.")
    ver = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    major = int(ver.lstrip("v").split(".")[0]) if ver else 0
    if major < 18:
        die(f"Node {ver} is too old. Install Node 20 LTS.")
    if major > 22:
        say(f"WARNING: Node {ver} is newer than Hardhat 2 officially supports. If compile fails, install Node 20 LTS.")
    return npm, npx


OK_MIN, OK_MAX = (3, 10), (3, 13)   # versions with ready-made packages for every dependency


def probe(cmd):
    """Return (executable, (major, minor)) for an interpreter command, or None."""
    try:
        r = subprocess.run([str(c) for c in cmd] + ["-c", "import sys;print(sys.executable);print(sys.version_info[0], sys.version_info[1])"],
                           capture_output=True, text=True, timeout=30)
        lines = r.stdout.strip().splitlines()
        if r.returncode != 0 or len(lines) < 2:
            return None
        major, minor = lines[1].split()
        return lines[0], (int(major), int(minor))
    except Exception:
        return None


def compatible(ver):
    return ver is not None and OK_MIN <= ver <= OK_MAX


def find_python():
    cands = []
    if os.getenv("BLOCKEXDSE_PYTHON"):
        cands.append([os.getenv("BLOCKEXDSE_PYTHON")])
    cands.append([sys.executable])
    for v in ("3.12", "3.13", "3.11", "3.10"):
        if IS_WIN:
            cands.append(["py", f"-{v}"])
        elif shutil.which(f"python{v}"):
            cands.append([shutil.which(f"python{v}")])
    for c in cands:
        found = probe(c)
        if found and compatible(found[1]):
            return found
    return None


def setup_python():
    if VPY.exists():
        found = probe([VPY])
        if not (found and compatible(found[1])):
            say("==> Existing .venv was built with an unsupported Python; rebuilding it")
            shutil.rmtree(VENV, ignore_errors=True)
            if VPY.exists():
                die("Could not remove the old .venv folder. Close other windows using it, delete the .venv folder by hand, and run again.")
    if not VPY.exists():
        found = find_python()
        if not found:
            cur = sys.version.split()[0]
            die(f"No compatible Python found. BlockExDSE needs Python 3.10 to 3.13 (3.12 is recommended).\n"
                f"       The Python running this launcher is {cur}, which is outside that range: some required packages\n"
                f"       (web3, pydantic and others) have no ready-made installers for it.\n"
                f"       Fix: install Python 3.12 from https://www.python.org/downloads/ (tick 'Add python.exe to PATH').\n"
                f"       You can keep your newer Python installed. Then run this launcher again.")
        say(f"==> Using Python {found[1][0]}.{found[1][1]} ({found[0]})")
        run_step("Creating Python virtual environment", [found[0], "-m", "venv", VENV])
        if not VPY.exists():
            die("Could not create the virtual environment. On Ubuntu/Debian run: sudo apt install python3-venv")
    req = ROOT / "edge" / "requirements.txt"
    stamp = VENV / ".deps-hash"
    digest = hashlib.sha256(req.read_bytes()).hexdigest()
    if not stamp.exists() or stamp.read_text() != digest:
        run_step("Installing Python packages (first run only, 1-3 minutes)",
                 [VPY, "-m", "pip", "install", "--disable-pip-version-check", "--prefer-binary", "-q", "-r", req],
                 hint="Package install failed. If you see 'Microsoft Visual C++ 14.0 or greater is required', your Python is too new\n"
                      "       or too old for ready-made packages. Install Python 3.12, delete the .venv folder, and run again.")
        # Optional speed-up: coincurve (libsecp256k1) makes signing and signature checks about seven times faster than the
        # pure-Python fallback. Installed only if a ready-made package exists for this computer; a failure here is harmless.
        try:
            subprocess.run([str(VPY), "-m", "pip", "install", "--disable-pip-version-check", "--only-binary=:all:", "-q", "coincurve"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
        except Exception:
            pass
        stamp.write_text(digest)


def spawn(name, cmd, cwd, env_extra=None):
    LOGS.mkdir(exist_ok=True)
    log = open(LOGS / f"{name}.log", "w", encoding="utf-8")
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", **(env_extra or {})}
    kw = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if IS_WIN else {"start_new_session": True}
    p = subprocess.Popen([str(c) for c in cmd], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, **kw)
    p.name = name
    procs.append(p)
    return p


def kill_tree(p):
    if p.poll() is not None:
        return
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
        else:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            try:
                p.wait(timeout=4)
            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(p.pid), signal.SIGKILL)
    except Exception:
        pass


def stop_all():
    for p in reversed(procs):
        kill_tree(p)
    procs.clear()


RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
SIGNED = bool(os.getenv("CHAIN_PRIVATE_KEY", "").strip())    # use an existing EVM chain instead of the built-in local node


def rpc_ready():
    try:
        req = urllib.request.Request(RPC_URL, data=b'{"jsonrpc":"2.0","method":"eth_chainId","id":1}',
                                     headers={"Content-Type": "application/json"})
        return b"result" in urllib.request.urlopen(req, timeout=2).read()
    except Exception:
        return False


def http_ok(url):
    try:
        return urllib.request.urlopen(url, timeout=2).status == 200
    except Exception:
        return False


def wait_for(label, test, seconds, proc=None):
    say(f"==> Waiting for {label}", )
    end = time.time() + seconds
    while time.time() < end:
        if test():
            return
        if proc is not None and proc.poll() is not None:
            die(f"{label} stopped unexpectedly. See logs/{proc.name}.log")
        time.sleep(0.5)
    die(f"{label} did not become ready in {seconds}s. See the logs folder.")


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sk:
            sk.connect(("10.255.255.255", 1))
            return sk.getsockname()[0]
    except Exception:
        return "YOUR-PC-IP"


def start_tunnel():
    """Free Cloudflare quick tunnel: an https address for the gateway, no account needed. Returns the URL or None."""
    exe = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if not exe:
        say("==> --public: cloudflared is not installed, so no public link. Install it, then run again:")
        say("      Windows: winget install --id Cloudflare.cloudflared    macOS: brew install cloudflared")
        say("      Linux  : see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
        return None
    p = spawn("tunnel", [exe, "tunnel", "--no-autoupdate", "--url", "http://localhost:9001"], ROOT)
    say("==> Opening a public https link (Cloudflare quick tunnel)")
    end = time.time() + 40
    while time.time() < end:
        time.sleep(1)
        try:
            txt = (LOGS / "tunnel.log").read_text(encoding="utf-8", errors="ignore")
        except Exception:
            txt = ""
        for word in txt.replace("|", " ").split():
            if word.startswith("https://") and word.rstrip("/").endswith(".trycloudflare.com"):
                url = word.rstrip("/")
                (LOGS / "public_url.txt").write_text(url, encoding="utf-8")
                return url
        if p.poll() is not None:
            break
    say("==> The tunnel did not start (see logs/tunnel.log). Continuing without a public link.")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--no-compile", action="store_true")
    ap.add_argument("--block-time", type=int, default=0, help="mine one block every N ms (benchmark realism); 0 = instant")
    ap.add_argument("--lan", action="store_true", help="let phones on the same Wi-Fi open the dashboard (demo use only)")
    ap.add_argument("--demo-delay", type=float, default=None, help="seconds of visual pause between stages (default 0.35)")
    ap.add_argument("--demo", action="store_true", help="poster day: market simulator on, faster flow, quick-start accounts")
    ap.add_argument("--public", action="store_true", help="open a free https link with cloudflared (anyone with the link can use the demo)")
    a = ap.parse_args()

    if a.block_time:
        os.environ["BLOCK_TIME_MS"] = str(a.block_time)
    say("BlockExDSE launcher\n")
    npm, npx = check_tools()

    busy = [f"{p} ({n})" for p, n in PORTS.items() if port_busy(p) and not (SIGNED and p == 8545)]
    if busy:
        die("These ports are already in use: " + ", ".join(busy) +
            "\n       A previous run is probably still open. Close that window, or stop it:"
            "\n         Windows: run  stop_all.bat" + "\n         Linux  : fuser -k 8545/tcp 9001/tcp 9002/tcp 9003/tcp 9004/tcp")

    hh_cfg = os.getenv("HARDHAT_CONFIG")  # testing hook
    hh = [npx, "hardhat"] + (["--config", hh_cfg] if hh_cfg else [])

    if not (ROOT / "node_modules" / "hardhat").exists():
        run_step("Installing Hardhat (first run only)", [npm, "install", "--no-audit", "--no-fund"])
    setup_python()
    if not (a.no_compile or os.getenv("SKIP_COMPILE")):
        run_step("Compiling the Solidity contract", hh + ["compile"])

    if SIGNED:
        say(f"==> Using the existing chain at {RPC_URL} (signed transactions; use a TEST network only)")
        chain = None
    else:
        chain = spawn("hardhat", hh + ["node"], ROOT)
    wait_for("the blockchain node", rpc_ready, 60, chain)
    run_step("Deploying the contract and registering demo traders", [VPY, ROOT / "edge" / "deploy.py"])

    extra = {} if a.demo_delay is None else {"DEMO_DELAY": str(a.demo_delay)}
    if a.demo:
        extra.update(DEMO_SIM="DSE", SIM_EVERY="0.8", QUICKSTART="1")
    (LOGS / "public_url.txt").unlink(missing_ok=True) if LOGS.exists() else None
    for i in NODES:
        env_i = {"NODE_ID": str(i), **extra}
        if a.lan and i == 1:
            env_i["HOST"] = "0.0.0.0"          # only the gateway is exposed; validators stay local
        spawn(f"edge{i}", [VPY, "edge_node.py"], ROOT / "edge", env_i)
    wait_for("edge nodes", lambda: all(http_ok(f"http://127.0.0.1:{9000 + i}/health") for i in NODES), 40)
    wait_for("the gateway API", lambda: http_ok("http://127.0.0.1:9001/api/info"), 20)

    public = start_tunnel() if a.public else None
    if a.lan and not public:
        LOGS.mkdir(exist_ok=True)
        (LOGS / "public_url.txt").write_text(f"http://{lan_ip()}:9001", encoding="utf-8")

    say("\n" + "=" * 58)
    say("  BlockExDSE is running")
    say("  Dashboard : http://localhost:9001")
    say(f"  Edge nodes: 9001 (gateway)  9002  9003  9004   |  Chain RPC: {RPC_URL}")
    if a.lan:
        say(f"  On a phone (same Wi-Fi): http://{lan_ip()}:9001   (allow the firewall prompt; demo use only)")
    if public:
        say(f"  PUBLIC LINK: {public}   (share it or open {public}/#board for the big screen with its QR code)")
    if a.demo:
        say("  Demo mode : market simulator on, \"Try it now\" quick-start accounts on")
    say("  Logs      : " + str(LOGS))
    say("  Press Ctrl+C in this window to stop everything")
    say("=" * 58)
    if not a.no_browser:
        webbrowser.open("http://localhost:9001")

    try:
        while True:
            time.sleep(1)
            for p in procs:
                if p.poll() is not None:
                    say(f"\n{p.name} stopped unexpectedly (see logs/{p.name}.log). Shutting down.")
                    return
    except KeyboardInterrupt:
        pass


def _graceful(signum, frame):
    raise KeyboardInterrupt


if __name__ == "__main__":
    # make Ctrl+C, terminal close and "kill" all shut the whole stack down cleanly
    for _name in ("SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"):
        if hasattr(signal, _name):
            signal.signal(getattr(signal, _name), _graceful)
    try:
        main()
    finally:
        say("\nStopping...")
        stop_all()

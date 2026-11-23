"""HTTP and signing helper shared by the test scripts.

Version 2 orders are signed by the investor, so the tests sign exactly as the dashboard does. That needs the project's
Python packages; if this script was started with another Python, it restarts itself with the project's own one.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "edge"))
try:
    import signing as S
except ImportError:
    _vpy = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if _vpy.exists() and Path(sys.executable).resolve() != _vpy.resolve():
        sys.exit(subprocess.call([str(_vpy)] + sys.argv))
    raise SystemExit("Python packages are missing. Start the system once with run_all first; it installs them.")

BASE = "http://127.0.0.1:9001"
KEYS, WALLETS, _INFO = {}, {}, {}


def call(path, body=None, token=None, method=None):
    """Returns (status, json). Never raises on HTTP errors."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def login(email, password="Demo@123"):
    """Signs in. Demo trader accounts receive their demo signing key, as the dashboard does."""
    s, j = call("/api/auth/login", {"email": email, "password": password})
    assert s == 200, f"login failed for {email}: {j}"
    if j.get("demo_key"):
        KEYS[j["token"]] = j["demo_key"]
    return j["token"]


def new_key():
    """A fresh signing key, as the browser creates one at sign-up. Returns (key hex, address)."""
    key = os.urandom(32).hex()
    return key, S.address_of(key)


def market_info(market):
    if not _INFO:
        _INFO.update(call("/api/info")[1])
    return _INFO["markets"][market]


def wallet_of(token):
    if token not in WALLETS:
        WALLETS[token] = call("/api/me", token=token)[1]["user"]["wallet"]
    return WALLETS[token]


def sign_order(key, market, trader, ticker, side, qty, price, otype="LIMIT", ttl=1800):
    mk = market_info(market)
    o = {"market": market, "trader": trader, "ticker": ticker, "qty": int(qty), "price": int(price), "side": side, "otype": otype,
         "nonce": int.from_bytes(os.urandom(7), "big"), "expiry": int(time.time()) + ttl}
    o["sig"] = S.hx(S.sign(key, S.order_digest(bytes.fromhex(mk["domain"][2:]), o)))
    return o


TERMINAL = ("settled", "open", "partial", "rejected", "cancelled", "part_filled", "held")


def wait_order(token, oid, done=TERMINAL):
    o = {}
    for _ in range(150):
        _, o = call(f"/api/orders/{oid}", token=token)
        if o.get("status") in done:
            return o
        time.sleep(0.2)
    return o


def submit(token, ticker, side, qty, price=None, market="DSE", otype="LIMIT", key=None, ttl=1800):
    """Signs with the account's own key (or `key`), sends the order and waits for its final state."""
    if price is None:                                       # market order: protective limit at the band edge
        t = market_info(market)["tickers"][ticker]
        price = t["hi"] if side == "BUY" else t["lo"]
    o = sign_order(key or KEYS[token], market, wallet_of(token), ticker, side, qty, price, otype, ttl)
    body = {k: o[k] for k in ("market", "ticker", "qty", "price", "side", "otype", "expiry", "sig")} | {"nonce": str(o["nonce"])}
    s, j = call("/api/order", body, token=token)
    if s != 200:
        return {"status": "http_" + str(s), "error": j.get("detail")}
    return wait_order(token, j["id"])


def cancel(token, oid, key=None, signed=True):
    """Cancels a resting order with the investor's signature (signed=False shows what happens without it)."""
    _, o = call(f"/api/orders/{oid}", token=token)
    body = {}
    if signed and o.get("chain_id"):
        dom = bytes.fromhex(market_info(o["market"])["domain"][2:])
        body["sig"] = S.hx(S.sign(key or KEYS[token], S.cancel_digest(dom, o["chain_id"])))
    return call(f"/api/orders/{oid}/cancel", body, token=token, method="POST")


class Checker:
    def __init__(self):
        self.ok, self.n = True, 0

    def __call__(self, name, cond, extra=""):
        self.ok &= bool(cond)
        self.n += 1
        print(("PASS " if cond else "FAIL ") + name, extra)

    def finish(self):
        print(f"ALL {self.n} PASSED" if self.ok else "SOME FAILED")
        raise SystemExit(0 if self.ok else 1)

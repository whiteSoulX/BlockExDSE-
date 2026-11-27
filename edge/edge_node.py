"""
BlockExDSE edge node v2 (FastAPI).

Run four of them:  NODE_ID=1 .. NODE_ID=4  (ports 9001-9004).
Every node is a validator: it checks each order itself (investor signature, KYC on the contract, price band, size
limit, restricted list) and signs an attestation. The settlement contract recovers those signatures on-chain.
Node 1 is also the gateway: dashboard, sign-up/sign-in, order entry, collection of attestations, on-chain placement,
matching, settlement, hash anchoring, the review queue, the proof lab, the audit and the live market data stream.
"""
import asyncio
import copy
import hashlib
import json
import os
import random
import secrets
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from web3 import Web3

import signing as S
from audit import audit_market
from auth import AuthError, AuthStore
from contract_client import Chain, ContractClient
from markets import MARKETS, band_bps

VERSION_TAG = "2.1"
NODE_ID = int(os.getenv("NODE_ID", "1"))
PORT = int(os.getenv("PORT", str(9000 + NODE_ID)))
HOST = os.getenv("HOST", "127.0.0.1")
LEADER_ID = 1
IS_LEADER = NODE_ID == LEADER_ID
PEERS = {i: 9000 + i for i in range(1, S.N_VALIDATORS + 1)}
DEMO_DELAY = float(os.getenv("DEMO_DELAY", "0.35"))   # purely visual pause between stages; 0 for benchmarks
QUICKSTART = os.getenv("QUICKSTART", "1") != "0"         # v2.1: one-tap practice accounts for visitors (demo days)
SIM_EVERY = float(os.getenv("SIM_EVERY", "1.6"))          # v2.1: seconds between simulated bot orders
ROOT = Path(__file__).resolve().parent.parent
DASH = ROOT / "dashboard"

_KEY = S.edge_key(NODE_ID)
MY_ADDR = S.address_of(_KEY)
# fault: "off" honest | "garbage" signs the wrong data (crash-like) | "rogue" signs without checking (compromised)
STATE = {"fault": "off", "votes_cast": 0, "refused": 0, "orders_seen": 0, "signs": 0, "recovers": 0,
         "link_ms": float(os.getenv("LINK_DELAY_MS", "0") or 0),
         # benchmark-only random faults: p_lazy = chance of signing without checking, p_drop = chance of not answering
         "p_lazy": 0.0, "p_drop": 0.0, "lazy_now": False}

CHAIN = Chain.get()
CLIENTS = {code: ContractClient(code) for code in json.loads((ROOT / "deployment.json").read_text(encoding="utf-8"))["contracts"]}
DEP = next(iter(CLIENTS.values())).dep
MK = {code: MARKETS[code] for code in CLIENTS}          # market configuration (static) for markets that are deployed
EDGE_ADDR = DEP["edge_nodes"]
KYC_CACHE: set = set()                                  # (market, address) pairs this node has confirmed on-chain
# accounts frozen by compliance after KYC: known only to the edge validators, not to the contract
RESTRICTED = {m: {S.address_of(S.demo_trader_key(n)).lower() for n in MK[m].get("restricted", [])} for m in MK}

HTTP = httpx.Client(timeout=4.0)                        # one keep-alive connection pool for all calls between nodes
app = FastAPI(title=f"BlockExDSE edge node {NODE_ID}")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(AuthError)
async def _auth_error(_, exc: AuthError):
    return JSONResponse({"detail": str(exc)}, status_code=exc.status)


def crypto_backend() -> str:
    try:
        from eth_keys import keys
        return type(keys.backend).__name__
    except Exception:
        return "unknown"


# ───────────────────────── storage (MongoDB if reachable, else memory) ─────────────────────────
class Storage:
    def __init__(self):
        self.mem, self.col, self.mode = {}, None, "memory"
        if IS_LEADER:
            try:
                from pymongo import MongoClient
                mc = MongoClient(os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017"), serverSelectionTimeoutMS=1200)
                mc.admin.command("ping")
                self.col = mc["blockexdse"]["orders"]
                self.col.delete_many({})
                self.mode = "mongodb"
            except Exception:
                pass
        print(f"[node {NODE_ID}] storage mode: {self.mode}")

    def save(self, rec):
        self.mem[rec["id"]] = rec
        if self.col is not None:
            try:
                self.col.replace_one({"_id": rec["id"]}, {**json.loads(json.dumps(rec)), "_id": rec["id"]}, upsert=True)
            except Exception:
                pass


STORE = Storage()


# ───────────────────────── market rules (shared by every node) ─────────────────────────
def ref_of(m, t):
    return MK[m]["tickers"][t]["ref"]


def bps_of(m, t):
    return band_bps(MK[m], ref_of(m, t))


def limits(m, t):
    return S.band_limits(ref_of(m, t), bps_of(m, t))


def protective_price(m, t, side):
    """A market order carries a protective limit at the edge of the allowed band."""
    return S.protective_price(ref_of(m, t), bps_of(m, t), side)


def risk_of(o: dict) -> dict:
    """The same integer rule that the contract applies (BlockExDSE.riskScore)."""
    m, t = o["market"], o["ticker"]
    return S.risk(ref_of(m, t), bps_of(m, t), MK[m]["risk_notional"], int(o["qty"]), int(o["price"]), o["otype"])


def sign_d(dig: bytes) -> bytes:
    STATE["signs"] += 1
    return S.sign(_KEY, dig)


def recover_d(dig: bytes, sig) -> str:
    STATE["recovers"] += 1
    return S.recover(dig, sig)


def is_kyc(market: str, addr: str) -> bool:
    """Each node checks the trader's KYC status on the market's contract itself (no trust in the gateway)."""
    key = (market, str(addr).lower())
    if key in KYC_CACHE:
        return True
    try:
        ok = Web3.is_address(addr) and CLIENTS[market].is_kyc(addr)
    except Exception:
        return False
    if ok:
        KYC_CACHE.add(key)
    return ok


def validate(o: dict):
    """Pre-trade checks. Every validator runs them itself; nothing is taken on trust from the gateway."""
    m = o.get("market")
    if m not in MK:
        return False, "unknown market"
    if o.get("ticker") not in MK[m]["tickers"]:
        return False, f"unknown ticker for {m}"
    if o.get("side") not in S.SIDES:
        return False, "side must be BUY or SELL"
    if o.get("otype") not in S.OTYPES:
        return False, "order type must be LIMIT or MARKET"
    try:
        qty, price, expiry = int(o["qty"]), int(o["price"]), int(o["expiry"])
        int(o["nonce"])
    except Exception:
        return False, "qty, price, nonce and expiry must be integers"
    if qty <= 0:
        return False, "quantity must be > 0"
    if price <= 0:
        return False, "price must be > 0"
    trader = o.get("trader", "")
    if not Web3.is_address(trader):
        return False, "bad trader address"
    try:
        signer = recover_d(S.order_digest(CLIENTS[m].domain, o), o.get("sig") or "")
    except Exception:
        return False, "the order signature is malformed"
    if signer.lower() != trader.lower():
        return False, "the order is not signed by the account holder"
    if not is_kyc(m, trader):
        return False, f"participant not KYC-registered on the {m} contract"
    if trader.lower() in RESTRICTED[m]:
        return False, "the account is on the restricted list"
    if expiry < time.time():
        return False, "the order has expired"
    ref, bps = ref_of(m, o["ticker"]), bps_of(m, o["ticker"])
    if not S.in_band(ref, bps, price):
        return False, f"price outside the ±{bps / 100:.2f}% band of reference {ref}"
    if qty > MK[m]["max_qty"]:
        return False, f"quantity above the order size limit of {MK[m]['max_qty']} (possible input error)"
    return True, "ok"


def attest(batch: dict) -> dict:
    """Independent check of every order in the batch, then one signature over the batch root."""
    m, orders = batch.get("market"), batch.get("orders") or []
    out = {"node": NODE_ID, "address": MY_ADDR, "verdict": "reject", "reason": "ok", "signature": ""}
    if m not in MK or not orders or any(o.get("market") != m for o in orders):
        out["reason"] = "malformed batch"
        return out
    lazy = STATE["fault"] == "rogue" or STATE["lazy_now"] or (STATE["p_lazy"] > 0 and random.random() < STATE["p_lazy"])
    if not lazy:                                        # a rogue (compromised) or careless validator signs without checking
        for o in orders:
            ok, why = validate(o)
            if not ok:
                out["reason"] = why
                STATE["refused"] += 1
                return out
    try:
        dig = S.attest_digest(CLIENTS[m].domain, S.batch_root([S.order_hash(o) for o in orders]))
    except Exception:
        out["reason"] = "malformed order"
        return out
    if STATE["fault"] == "garbage":                     # Byzantine demo: the signature is over the wrong data
        dig = os.urandom(32)
    out.update(verdict="accept", signature=S.hx(sign_d(dig)))
    STATE["votes_cast"] += 1
    return out


# ───────────────────────── validator endpoints (every node) ─────────────────────────
class BatchIn(BaseModel):
    market: str
    orders: list[dict]


@app.post("/attest")
def attest_endpoint(b: BatchIn):
    if STATE["link_ms"]:
        time.sleep(STATE["link_ms"] / 1000)             # emulated network distance to this edge site
    if STATE["p_drop"] > 0 and random.random() < STATE["p_drop"]:
        return {"node": NODE_ID, "address": MY_ADDR, "verdict": "no-response", "signature": "", "reason": "no answer (injected fault)"}
    return attest(b.model_dump())


@app.get("/health")
def health():
    return {"node": NODE_ID, "port": PORT, "address": MY_ADDR, "faulty": STATE["fault"] != "off", "fault": STATE["fault"],
            "votes_cast": STATE["votes_cast"], "refused": STATE["refused"], "signs": STATE["signs"], "recovers": STATE["recovers"],
            "cpu_s": round(time.process_time(), 4), "link_ms": STATE["link_ms"], "leader": IS_LEADER}


def _fault_mode(word: str) -> str:
    w = word.lower()
    return "rogue" if w == "rogue" else ("garbage" if w in ("on", "true", "1", "garbage") else "off")


@app.post("/fault/{mode}")
def fault(mode: str):
    STATE["fault"] = _fault_mode(mode)
    return {"node": NODE_ID, "faulty": STATE["fault"] != "off", "fault": STATE["fault"]}


@app.post("/link/{ms}")
def link(ms: float):
    STATE["link_ms"] = max(0.0, min(float(ms), 2000.0))
    return {"node": NODE_ID, "link_ms": STATE["link_ms"]}


@app.post("/noise/{p_lazy}/{p_drop}")
def noise(p_lazy: float, p_drop: float):
    """Benchmark only: random faults for the quorum-depth experiment (see scripts/benchmark.py, scenarios lazyNN and dropNN)."""
    STATE["p_lazy"] = max(0.0, min(float(p_lazy), 1.0))
    STATE["p_drop"] = max(0.0, min(float(p_drop), 1.0))
    return {"node": NODE_ID, "p_lazy": STATE["p_lazy"], "p_drop": STATE["p_drop"]}


# ───────────────────────── gateway: auth + accounts ─────────────────────────
AUTH = AuthStore()
DEMO_PASSWORD, ADMIN_PASSWORD, BROKER_PASSWORD = "Demo@123", "Admin@123", "Broker@123"
BOTS = ("Dave", "Erin", "Frank")                         # demo traders that act as market makers in the simulator
DEMO_NAMES = {t["name"] for t in DEP["traders"]}
if IS_LEADER:
    seeds = [("Admin", "admin@blockexdse.demo", ADMIN_PASSWORD, "admin", None),
             ("Broker", "broker@blockexdse.demo", BROKER_PASSWORD, "broker", None)]
    seeds += [(t["name"], f"{t['name'].lower()}@blockexdse.demo", DEMO_PASSWORD, "trader", t["address"]) for t in DEP["traders"]]
    AUTH.seed(seeds)
APPROVE_LOCK = threading.Lock()


def current_user(authorization: str = Header(default=None)):
    token = (authorization or "").removeprefix("Bearer ").strip()
    u = AUTH.user_for(token)
    if not u:
        raise HTTPException(401, "Please sign in.")
    return u


def staff_user(u=Depends(current_user)):
    if u["role"] not in ("broker", "admin"):
        raise HTTPException(403, "Broker or admin access only.")
    return u


def admin_user(u=Depends(current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Admin access only.")
    return u


def trading_user(u=Depends(current_user)):
    if u["role"] != "trader":
        raise HTTPException(403, "Only trader accounts can place orders.")
    if u["status"] != "active" or not u["wallet"]:
        raise HTTPException(403, "Your account is not approved for trading yet.")
    return u


def _leader_only():
    if not IS_LEADER:
        raise HTTPException(400, f"node {NODE_ID} is a validator; use the gateway on port {PEERS[LEADER_ID]}")


def _name_of(addr: str) -> str:
    return AUTH.name_of_wallet(addr) or (addr[:6] + "…" + addr[-4:])


class SignupIn(BaseModel):
    name: str
    email: str
    mobile: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class OtpIn(BaseModel):
    code: str


class KycIn(BaseModel):
    nid: str
    photo_hash: str | None = None
    wallet: str | None = None            # address of the signing key that the investor's browser created


class DecisionIn(BaseModel):
    user_id: str
    approve: bool
    reason: str | None = None


@app.get("/api/demo-accounts")
def demo_accounts():
    _leader_only()
    out = [{"label": "Admin", "role": "admin", "email": "admin@blockexdse.demo", "password": ADMIN_PASSWORD},
           {"label": "Broker", "role": "broker", "email": "broker@blockexdse.demo", "password": BROKER_PASSWORD}]
    out += [{"label": t["name"], "role": "trader", "email": f"{t['name'].lower()}@blockexdse.demo", "password": DEMO_PASSWORD}
            for t in DEP["traders"]]
    return out


@app.post("/api/auth/signup")
def signup(b: SignupIn):
    _leader_only()
    u, code, token = AUTH.signup(b.name, b.email, b.mobile, b.password)
    return {"token": token, "user": AUTH.public(u), "otp_demo": code}


@app.post("/api/auth/login")
def login(b: LoginIn):
    _leader_only()
    u, token = AUTH.login(b.email, b.password)
    out = {"token": token, "user": AUTH.public(u)}
    if u["role"] == "trader" and u["name"] in DEMO_NAMES and u["email"].endswith("@blockexdse.demo"):
        out["demo_key"] = "0x" + S.demo_trader_key(u["name"])    # demo accounts only: the browser signs orders with this key
    return out


@app.post("/api/auth/logout")
def logout(authorization: str = Header(default=None)):
    AUTH.logout((authorization or "").removeprefix("Bearer ").strip())
    return {"ok": True}


@app.post("/api/auth/otp/verify")
def otp_verify(b: OtpIn, u=Depends(current_user)):
    AUTH.verify_otp(u, b.code)
    return {"user": AUTH.public(u)}


@app.post("/api/auth/otp/resend")
def otp_resend(u=Depends(current_user)):
    return {"otp_demo": AUTH.resend_otp(u)}


@app.post("/api/kyc")
def kyc_submit(b: KycIn, u=Depends(current_user)):
    wallet = (b.wallet or "").strip()
    if not Web3.is_address(wallet):
        raise HTTPException(400, "A signing address is required. Reload the dashboard: your browser creates the key.")
    if any(x is not u and (x.get("wallet_req") or x["wallet"] or "").lower() == wallet.lower() for x in AUTH.users.values()):
        raise HTTPException(409, "This signing address is already linked to another account.")
    AUTH.submit_kyc(u, b.nid, b.photo_hash)
    u["wallet_req"] = Web3.to_checksum_address(wallet)
    return {"user": AUTH.public(u)}


@app.get("/api/me")
def me(u=Depends(current_user)):
    out = {"user": AUTH.public(u)}
    if u["wallet"]:
        out["portfolios"] = {m: CLIENTS[m].balance(u["wallet"], list(MK[m]["tickers"])) for m in MK if not MK[m].get("hidden")}
    return out


@app.get("/api/admin/requests")
def admin_requests(_=Depends(staff_user)):
    return {"pending": AUTH.pending(), "decided": AUTH.decided()[-10:]}


@app.post("/api/admin/decision")
def admin_decision(d: DecisionIn, staff=Depends(staff_user)):
    u = AUTH.users.get(d.user_id)
    if not u or u["role"] != "trader":
        raise HTTPException(404, "Unknown request.")
    if u["status"] != "approval_pending":
        raise HTTPException(409, "This request is not waiting for a decision.")
    if not d.approve:
        AUTH.decide(u, False, staff, reason=d.reason)
        return {"user": AUTH.public(u)}
    with APPROVE_LOCK:
        wallet = u.get("wallet_req")             # address of the key created in the investor's own browser; the key never leaves it
        if not wallet:
            raise HTTPException(409, "This account has no signing address. Ask the investor to submit identity details again.")
        reg = None
        for m, cfg in MK.items():                # the trader is KYC-registered on every visible market's contract
            if cfg.get("hidden"):
                continue
            r = CLIENTS[m].register_trader(wallet, cfg["new_cash"])
            reg = reg or r
            for sym in cfg["tickers"]:
                CLIENTS[m].credit_shares(wallet, sym, cfg["new_shares"])
        AUTH.decide(u, True, staff, wallet=wallet, tx=reg["tx"])
        notice("joined", name=u["name"].split()[0])
    return {"user": AUTH.public(u), "tx": reg["tx"], "block": reg["block"]}


# ───────────────────────── gateway: market state ─────────────────────────
POOL = ThreadPoolExecutor(max_workers=8)
PIPE_LOCK = threading.Lock()
ORDERS: dict = {}
SEQ = {"n": 0}
VERSION = {"n": 0}                                                       # bumps on every market change (drives the live stream)
BOOKS = {m: {"BUY": [], "SELL": []} for m in MK}                         # resting limit orders per market
TAPE = {m: deque(maxlen=60) for m in MK}                                 # recent trades per market
STATS = {m: {t: {"last": None, "high": None, "low": None, "volume": 0, "trades": 0} for t in MK[m]["tickers"]} for m in MK}
SIM = {m: False for m in MK}
PRICES = {m: {t: deque(maxlen=400) for t in MK[m]["tickers"]} for m in MK}     # v2.1: intraday trade prices for charts
TURNOVER = {m: {} for m in MK}                                          # v2.1: traded value per ticker
IDX = {m: deque(maxlen=3000) for m in MK}                                # v2.1: demo index history (t, value)
NOTICES = deque(maxlen=80)                                               # v2.1: live notice board (events in this market)
CIRCUIT_SEEN = {}                                                        # last notice time per stock and kind (keeps the board readable)


def index_value(m):
    """Demo index (base 1000 at the reference prices), weighted by each ticker's illustrative weight "w"."""
    tk = MK[m]["tickers"]
    tw = sum(v.get("w", 1) for v in tk.values()) or 1
    return round(1000 * sum(v.get("w", 1) * ((STATS[m][t]["last"] or v["ref"]) / v["ref"]) for t, v in tk.items()) / tw, 2)


def notice(kind, market="DSE", **params):
    NOTICES.appendleft({"t": int(time.time() * 1000), "kind": kind, "market": market, **params})


for _m in MK:
    IDX[_m].append((int(time.time() * 1000), index_value(_m)))


def bump():
    VERSION["n"] += 1


def now_ms():
    return int(time.time() * 1000)


def record_trade(m, trade):
    if trade["ticker"] not in STATS[m]:
        return
    s = STATS[m][trade["ticker"]]
    p = trade["price"]
    s["last"], s["volume"], s["trades"] = p, s["volume"] + trade["qty"], s["trades"] + 1
    s["high"] = p if s["high"] is None else max(s["high"], p)
    s["low"] = p if s["low"] is None else min(s["low"], p)
    PRICES[m][trade["ticker"]].append((now_ms(), p))
    TURNOVER[m][trade["ticker"]] = TURNOVER[m].get(trade["ticker"], 0) + trade["qty"] * p
    IDX[m].append((now_ms(), index_value(m)))
    lo, hi = limits(m, trade["ticker"])
    edge = (m, trade["ticker"], p >= hi)
    if (p >= hi or p <= lo) and time.time() - CIRCUIT_SEEN.get(edge, 0) > 120:    # one notice per stock and side every 2 minutes
        CIRCUIT_SEEN[edge] = time.time()
        notice("circuit", m, ticker=trade["ticker"], price=p, up=p >= hi)
    if trade["qty"] * p >= MK[m]["risk_notional"] // 5:
        notice("block", m, ticker=trade["ticker"], qty=trade["qty"], price=p, tx=trade["tx"])
    TAPE[m].appendleft({"t": now_ms(), "ticker": trade["ticker"], "qty": trade["qty"], "price": p,
                        "buyer": trade["buyer"], "seller": trade["seller"], "tx": trade["tx"], "block": trade["block"]})


def depth(m, ticker, side, n=5):
    levels = {}
    for o in list(BOOKS[m][side]):
        if o["ticker"] == ticker and o["remaining"] > 0:
            levels[o["price"]] = levels.get(o["price"], 0) + o["remaining"]
    rows = sorted(levels.items(), key=lambda kv: kv[0], reverse=(side == "BUY"))
    return [[p, q] for p, q in rows[:n]]


def snapshot(m):
    tickers = {}
    for t, meta in MK[m]["tickers"].items():
        s, ref = STATS[m][t], meta["ref"]
        last = s["last"] if s["last"] is not None else ref
        tickers[t] = {"name": meta["name"], "ref": ref, "last": last, "traded": s["last"] is not None,
                      "chg": round((last - ref) / ref * 100, 2), "high": s["high"], "low": s["low"], "volume": s["volume"],
                      "trades": s["trades"], "band": bps_of(m, t) / 100,
                      "bids": depth(m, t, "BUY"), "asks": depth(m, t, "SELL")}
    return {"market": m, "v": VERSION["n"], "tickers": tickers, "tape": list(TAPE[m])[:25], "sim": SIM[m]}


def best_opposite(m, ticker, side):
    book = BOOKS[m]["SELL" if side == "BUY" else "BUY"]
    prices = [o["price"] for o in list(book) if o["ticker"] == ticker and o["remaining"] > 0]
    if not prices:
        return None
    return min(prices) if side == "BUY" else max(prices)


# ───────────────────────── gateway: pipeline ─────────────────────────
QUORUM: dict = {}                   # market -> (routine quorum, escalated quorum), read from the contract
HELD: dict = {}                     # escalated orders one signature short: waiting for a human decision
TRADELOG = {m: [] for m in MK}      # the gateway's off-chain trade records (each is anchored on-chain by its hash)


def refresh_quorum():
    for m in MK:
        QUORUM[m] = CLIENTS[m].quorum()


if IS_LEADER:
    refresh_quorum()


def stage(rec, name):
    rec["stages"][name] = now_ms()
    rec["status"] = name
    STORE.save(rec)
    bump()
    if DEMO_DELAY and not rec.get("fast"):
        time.sleep(DEMO_DELAY)


def ask_peer(pid, batch):
    try:
        r = HTTP.post(f"http://127.0.0.1:{PEERS[pid]}/attest", json=batch, timeout=4.0)
        r.raise_for_status()
        return pid, r.json()
    except Exception as e:
        return pid, {"node": pid, "verdict": "no-response", "signature": "", "reason": type(e).__name__}


def collect(m, orders, required, ask_all=False):
    """Collect validator signatures over one batch of orders.

    The gateway signs first (it is validator 1), then asks only as many other validators as it still needs, in
    parallel, and asks the rest only if some of them fail. Returns ({node id: signature}, detail rows, peers asked).
    """
    if required <= 0:
        return {}, [], 0
    batch = {"market": m, "orders": orders}
    dig = S.attest_digest(CLIENTS[m].domain, S.batch_root([S.order_hash(o) for o in orders]))
    good, detail, asked = {}, {}, 0

    def take(v):
        node, ok = v.get("node"), False
        if v.get("verdict") == "accept" and v.get("signature"):
            try:
                ok = recover_d(dig, v["signature"]).lower() == EDGE_ADDR[str(node)].lower()
            except Exception:
                ok = False
        if ok:
            good[node] = bytes.fromhex(v["signature"].removeprefix("0x"))
            reason = ""
        else:
            reason = v.get("reason", "") if v.get("verdict") != "accept" else "signature does not match this order"
        detail[node] = {"node": node, "verdict": v.get("verdict"), "agree": ok, "reason": reason}

    take(attest(batch))
    peers = [p for p in PEERS if p != NODE_ID]
    k = int.from_bytes(dig[-2:], "big") % len(peers)         # spread the load: start at a different peer each time
    peers = peers[k:] + peers[:k]
    need = required - len(good)
    first = peers if (ask_all or need >= len(peers)) else peers[:max(need, 0)]
    rest = [p for p in peers if p not in first]
    for group in (first, rest):
        if not group or len(good) >= required:
            continue
        futs = [POOL.submit(ask_peer, p, batch) for p in group]
        for f in futs:
            take(f.result()[1])
        asked += len(group)
    for p in PEERS:
        detail.setdefault(p, {"node": p, "verdict": "not-asked", "agree": False, "reason": "not needed"})
    return good, [detail[p] for p in sorted(detail)], asked


def record_hash(trade: dict) -> str:
    return hashlib.sha256(json.dumps(trade, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def try_match(rec):
    """Match the new on-chain order against crossing resting orders (price-time priority)."""
    m, cl = rec["market"], CLIENTS[rec["market"]]
    me_side = rec["side"]
    opp = "SELL" if me_side == "BUY" else "BUY"
    mine = {"id": rec["id"], "chain_id": rec["chain_id"], "trader": rec["trader"], "ticker": rec["ticker"],
            "price": rec["price"], "remaining": rec["qty"]}

    def crosses(o):
        if o["ticker"] != rec["ticker"] or o["trader"].lower() == rec["trader"].lower():
            return False
        return o["price"] <= rec["price"] if me_side == "BUY" else o["price"] >= rec["price"]

    cands = [o for o in BOOKS[m][opp] if crosses(o) and o["remaining"] > 0]
    cands.sort(key=lambda o: (o["price"] if me_side == "BUY" else -o["price"], o["chain_id"]))
    for o in cands:
        if mine["remaining"] <= 0:
            break
        buy, sell = (mine, o) if me_side == "BUY" else (o, mine)
        t0 = time.perf_counter()
        try:
            r = cl.match(buy["chain_id"], sell["chain_id"])
        except Exception as e:
            rec["notes"].append(f"match with {o['id']} skipped: {e}")
            continue
        qty, price = r["qty"], r["price"]
        mine["remaining"] -= qty
        o["remaining"] -= qty
        trade = {"trade_id": r["trade_id"], "market": m, "buy_order": buy["id"], "sell_order": sell["id"], "ticker": rec["ticker"],
                 "qty": qty, "price": price, "buyer": _name_of(buy["trader"]), "seller": _name_of(sell["trader"]),
                 "tx": r["tx"], "block": r["block"]}
        h = record_hash(trade)
        TRADELOG[m].append({"trade_id": r["trade_id"], "record": copy.deepcopy(trade), "record_hash": h})
        a = cl.anchor(r["trade_id"], h)
        trade.update(gas=r["gas"], anchor_tx=a["tx"], anchor_gas=a["gas"], record_hash=h,
                     chain_ms=round((time.perf_counter() - t0) * 1000, 1))
        rec["trades"].append(trade)
        rec["gas_total"] += r["gas"] + a["gas"]
        rec["tx_count"] += 2
        record_trade(m, trade)
        other = ORDERS.get(o["id"])
        if other:
            other["trades"].append(trade)
            other["filled"] += qty
            other["status"] = "settled" if o["remaining"] == 0 else "partial"
            STORE.save(other)
        bump()
    BOOKS[m][opp] = [o for o in BOOKS[m][opp] if o["remaining"] > 0]
    rec["filled"] = rec["qty"] - mine["remaining"]
    if mine["remaining"] > 0 and rec["otype"] == "LIMIT":
        BOOKS[m][me_side].append(mine)
    return mine["remaining"]


def finish(rec, t0):
    """After the order is on-chain: match it, cancel the unfilled rest of a market order, set the final status."""
    cl = CLIENTS[rec["market"]]
    left = try_match(rec)
    if rec["otype"] == "MARKET" and left > 0:          # market orders never rest: the contract lets the relayer cancel the rest
        c = cl.cancel(rec["chain_id"])
        rec["gas_total"] += c["gas"]
        rec["tx_count"] += 1
        rec["cancelled_qty"] = left
    rec["chain_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    if rec["trades"]:
        stage(rec, "matched")
    if rec["filled"] == rec["qty"]:
        stage(rec, "settled")
    elif rec["otype"] == "MARKET":
        rec["status"] = "part_filled" if rec["filled"] else "cancelled"
        STORE.save(rec)
    else:
        rec["status"] = "partial" if rec["filled"] else "open"
        STORE.save(rec)
    # v2.1 notice board: an escalated (4 of 4) order that traded; the demo bots post at most one per stock every 90 s
    if rec["trades"] and (rec.get("risk") or {}).get("tier") and not rec.get("bench") and \
            (rec.get("trader_name") not in BOTS or time.time() - CIRCUIT_SEEN.get(("esc", rec["market"], rec["ticker"]), 0) > 90):
        CIRCUIT_SEEN[("esc", rec["market"], rec["ticker"])] = time.time()
        notice("escalated", rec["market"], ticker=rec["ticker"], qty=rec["filled"], votes=(rec.get("votes") or {}).get("agree", 0),
               reviewer=bool((rec.get("votes") or {}).get("compliance")))


def settle(rec, sigs: dict, comp_sig: bytes = b""):
    """Send the signed order and its validator signatures to the contract, which verifies both, then match."""
    cl, o = CLIENTS[rec["market"]], rec["order"]
    t0 = time.perf_counter()
    r = cl.place_orders([o], [bytes.fromhex(o["sig"].removeprefix("0x"))], b"".join(sigs[n] for n in sorted(sigs)), comp_sig)
    rec.update(chain_id=r["first_id"], place_tx=r["tx"], place_block=r["block"], place_gas=r["gas"])
    rec["gas_total"] += r["gas"]
    rec["tx_count"] += 1
    finish(rec, t0)


def _risk(o):
    try:
        return risk_of(o)
    except Exception:                                     # unknown ticker etc. (only reachable when edge checks are off)
        return {"score_bps": 0, "score": 0.0, "tier": 0, "level": "STANDARD", "notional": 0, "size_part": 0, "price_part": 0, "deviation_bps": 0}


def run_pipeline(rec):
    with PIPE_LOCK:
        t_start = time.perf_counter()
        m, o = rec["market"], rec["order"]
        try:
            mode = rec.get("bench")     # None for normal orders; benchmark modes: chain_only, edge_only, fixed3, fixed4, racd
            t0 = time.perf_counter()
            lazy = STATE["p_lazy"] > 0 and random.random() < STATE["p_lazy"]   # benchmark only: a careless gateway check
            STATE["lazy_now"] = lazy                                           # ... and then its own validator signs unchecked too
            skip = mode == "chain_only" or STATE["fault"] == "rogue" or lazy   # no edge check at all / compromised gateway
            ok, why = (True, "ok") if skip else validate(o)
            rec["edge_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            if not ok:
                rec["error"], rec["rejected_by"] = why, "edge"
                return stage(rec, "rejected")
            stage(rec, "edge_validated")

            t0 = time.perf_counter()
            std, esc = QUORUM[m]
            risk = _risk(o)
            required = esc if risk["tier"] else std
            risk["required"] = required
            rec["risk"] = risk
            sigs, detail, asked = collect(m, [o], required, ask_all=(mode == "fixed4"))
            rec["votes"] = {"agree": len(sigs), "required": required, "detail": detail, "asked": asked, "shared": 1}
            rec["consensus_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            if len(sigs) < required:
                if risk["tier"] and 0 < std <= len(sigs):                  # a risky order, one validator short: a person decides
                    rec["held"] = {"since": now_ms(), "have": len(sigs), "need": required,
                                   "sigs": {str(n): S.hx(s) for n, s in sigs.items()}}
                    HELD[rec["id"]] = rec
                    notice("held", m, ticker=o["ticker"], side=o["side"], qty=o["qty"], have=len(sigs), need=required)
                    return stage(rec, "held")
                rec["error"], rec["rejected_by"] = f"not enough validator signatures: {len(sigs)} of {required}", "consensus"
                return stage(rec, "rejected")
            stage(rec, "consensus")
            settle(rec, sigs)
        except Exception as e:  # keep the pipeline alive on any failure
            rec["error"] = str(e)[:200]
            if not rec.get("chain_id"):
                rec["rejected_by"] = "contract"
            rec["status"] = "rejected"
            STORE.save(rec)
        finally:
            STATE["lazy_now"] = False
            rec["total_ms"] = round((time.perf_counter() - t_start) * 1000 - (0 if rec.get("fast") else DEMO_DELAY * 1000 * len(rec["stages"])), 1)
            STORE.save(rec)
            bump()


def signed_order(key_hex, market, ticker, qty, price, side, otype="LIMIT", ttl=1800, trader=None):
    """Build an order and sign it with the given key (used by the demo bots, the benchmark and the proof lab)."""
    o = {"market": market, "trader": trader or S.address_of(key_hex), "ticker": ticker, "qty": int(qty), "price": int(price),
         "side": side, "otype": otype, "nonce": secrets.randbits(62), "expiry": int(time.time()) + ttl}
    o["sig"] = S.hx(S.sign(key_hex, S.order_digest(CLIENTS[market].domain, o)))
    return o


def new_rec(u, order, fast=False, sim=False, bench=None):
    SEQ["n"] += 1
    return {"id": f"ORD-{SEQ['n']:04d}", "ts": now_ms(), "owner": u["id"], "trader": order["trader"], "trader_name": u["name"],
            "market": order["market"], "otype": order["otype"], "ticker": order["ticker"], "qty": int(order["qty"]),
            "price": int(order["price"]), "side": order["side"], "order": order, "order_hash": S.hx(S.order_hash(order)),
            "status": "submitted", "stages": {"submitted": now_ms()}, "trades": [], "filled": 0, "gas_total": 0, "tx_count": 0,
            "notes": [], "fast": fast, "sim": sim, "bench": bench}


def create_order(u, order, fast=False, sim=False):
    market = order["market"]
    if market not in MK:
        raise HTTPException(400, "Unknown market.")
    if order["otype"] not in S.OTYPES:
        raise HTTPException(400, "Order type must be LIMIT or MARKET.")
    if order["ticker"] not in MK[market]["tickers"]:
        raise HTTPException(400, f"Unknown ticker for {market}.")
    if order["side"] not in S.SIDES:
        raise HTTPException(400, "Side must be BUY or SELL.")
    rec = new_rec(u, order, fast=fast, sim=sim)
    ORDERS[rec["id"]] = rec
    STORE.save(rec)
    STATE["orders_seen"] += 1
    bump()
    threading.Thread(target=run_pipeline, args=(rec,), daemon=True).start()
    return rec


def bot_order(name, market, ticker, qty, price, side, otype="LIMIT", fast=True, sim=True):
    """A demo bot is its own client: it signs with its own (demo) key, exactly like a browser does."""
    u = next(x for x in AUTH.users.values() if x["name"] == name)
    if otype == "MARKET":
        price = protective_price(market, ticker, side)
    return create_order(u, signed_order(S.demo_trader_key(name), market, ticker, qty, price, side, otype), fast=fast, sim=sim)


class OrderIn(BaseModel):
    market: str = "DSE"
    ticker: str
    qty: int
    price: int | None = None
    side: str
    otype: str = "LIMIT"
    nonce: str | int | None = None
    expiry: int | None = None
    sig: str | None = None


@app.post("/api/order")
def submit_order(o: OrderIn, u=Depends(trading_user)):
    _leader_only()
    if not (o.price and o.price > 0):
        raise HTTPException(400, "A signed order must carry a price (for a market order, the protective limit).")
    if o.nonce is None or not o.expiry or not o.sig:
        raise HTTPException(400, "Orders must be signed by the account holder. Reload the dashboard to get version 2.")
    try:
        nonce = int(o.nonce)
    except Exception:
        raise HTTPException(400, "The nonce must be a whole number.") from None
    order = {"market": o.market, "trader": u["wallet"], "ticker": o.ticker, "qty": o.qty, "price": o.price, "side": o.side.upper(),
             "otype": o.otype.upper(), "nonce": nonce, "expiry": int(o.expiry), "sig": o.sig if o.sig.startswith("0x") else "0x" + o.sig}
    rec = create_order(u, order)
    return {"id": rec["id"]}


class CancelIn(BaseModel):
    sig: str | None = None


@app.post("/api/orders/{oid}/cancel")
def cancel_order(oid: str, b: CancelIn | None = None, u=Depends(current_user)):
    _leader_only()
    rec = ORDERS.get(oid)
    if not rec or rec.get("owner") != u["id"]:
        raise HTTPException(404, "unknown order")
    m = rec["market"]
    try:
        sig = bytes.fromhex(((b.sig if b else "") or "").removeprefix("0x"))
    except ValueError:
        raise HTTPException(400, "The cancel signature is not valid hex.") from None
    with PIPE_LOCK:
        if rec["status"] not in ("open", "partial"):
            raise HTTPException(409, "Only resting orders can be cancelled.")
        entry = next((o for o in BOOKS[m][rec["side"]] if o["id"] == oid and o["remaining"] > 0), None)
        if not entry:
            raise HTTPException(409, "This order is no longer on the book.")
        try:
            c = CLIENTS[m].cancel(entry["chain_id"], sig)       # the contract checks the investor's signature
        except RuntimeError as e:
            raise HTTPException(400, f"The contract refused the cancellation: {e}") from None
        BOOKS[m][rec["side"]] = [o for o in BOOKS[m][rec["side"]] if o["id"] != oid]
        rec["cancelled_qty"] = entry["remaining"]
        rec["gas_total"] += c["gas"]
        rec["cancel_tx"] = c["tx"]
        rec["stages"]["cancelled"] = now_ms()
        rec["status"] = "part_filled" if rec["filled"] else "cancelled"
        STORE.save(rec)
        bump()
    return {"id": oid, "status": rec["status"]}


# ───────────────────────── gateway: review queue (broker or admin) ─────────────────────────
@app.get("/api/review")
def review_list(_=Depends(staff_user)):
    _leader_only()
    keys = ("id", "ts", "trader_name", "market", "ticker", "side", "otype", "qty", "price", "risk", "votes", "held")
    return sorted(({k: r.get(k) for k in keys} for r in HELD.values() if r["status"] == "held"), key=lambda r: r["id"])


class ReviewIn(BaseModel):
    approve: bool
    reason: str | None = None


@app.post("/api/review/{oid}")
def review_decide(oid: str, d: ReviewIn, staff=Depends(staff_user)):
    """A reviewer may stand in for ONE missing validator on an escalated order. The contract enforces that limit."""
    _leader_only()
    with PIPE_LOCK:
        rec = HELD.get(oid)
        if not rec or rec["status"] != "held":
            raise HTTPException(404, "This order is not waiting for review.")
        HELD.pop(oid, None)
        rec["review"] = {"by": staff["name"], "approved": d.approve, "at": now_ms(), "reason": (d.reason or "")[:200]}
        if not d.approve:
            rec["error"], rec["rejected_by"] = "rejected at compliance review", "review"
            rec["stages"]["rejected"] = now_ms()
            rec["status"] = "rejected"
        else:
            m, o = rec["market"], rec["order"]
            sigs = {int(n): bytes.fromhex(s[2:]) for n, s in rec["held"]["sigs"].items()}
            dig = S.attest_digest(CLIENTS[m].domain, S.batch_root([S.order_hash(o)]))
            rec["votes"]["compliance"] = True
            try:
                stage(rec, "consensus")
                settle(rec, sigs, S.sign(S.compliance_key(), dig))
            except Exception as e:
                rec["error"] = str(e)[:200]
                rec["rejected_by"] = "contract"
                rec["status"] = "rejected"
        STORE.save(rec)
        bump()
    return {"id": oid, "status": rec["status"], "error": rec.get("error")}


def _visible(u, rec):
    return u["role"] in ("broker", "admin") or rec.get("owner") == u["id"]


@app.get("/api/orders")
def list_orders(u=Depends(current_user)):
    _leader_only()
    rows = [r for r in ORDERS.values() if _visible(u, r) and not (r.get("sim") and u["role"] != "trader")]
    return sorted(rows, key=lambda r: r["id"], reverse=True)[:60]


@app.get("/api/orders/{oid}")
def get_order(oid: str, u=Depends(current_user)):
    _leader_only()
    if oid not in ORDERS or not _visible(u, ORDERS[oid]):
        raise HTTPException(404, "unknown order")
    return ORDERS[oid]


# ───────────────────────── gateway: public market data + live stream ─────────────────────────
@app.get("/api/info")
def info():
    _leader_only()
    markets = {}
    for m, cfg in MK.items():
        if cfg.get("hidden"):
            continue
        markets[m] = {k: cfg[k] for k in ("code", "name", "country", "currency", "hours", "model", "tick_note", "fmt", "new_cash", "new_shares", "risk_notional", "max_qty")}
        markets[m]["contract"] = DEP["contracts"][m]
        markets[m]["domain"] = S.hx(CLIENTS[m].domain)
        markets[m]["quorum"] = {"routine": QUORUM[m][0], "risky": QUORUM[m][1]}
        markets[m]["counts"] = CLIENTS[m].counts()
        markets[m]["tickers"] = {t: {"name": v["name"], "ref": v["ref"], "band": bps_of(m, t) / 100, "band_bps": bps_of(m, t),
                                     "lo": limits(m, t)[0], "hi": limits(m, t)[1], "sector": v.get("sector", ""), "about": v.get("about", ""), "w": v.get("w", 1)}
                                 for t, v in cfg["tickers"].items()}
        markets[m]["wallet"] = cfg.get("wallet", {"methods": [], "min": 0, "max": 0})
    try:
        public_url = (ROOT / "logs" / "public_url.txt").read_text(encoding="utf-8").strip()
    except Exception:
        public_url = ""
    return {"version": VERSION_TAG, "markets": markets, "chain": CHAIN.info(), "storage": STORE.mode,
            "validators": len(PEERS), "crypto": crypto_backend(), "quickstart": QUICKSTART, "public_url": public_url}


@app.get("/api/market/{code}")
def market_snapshot(code: str):
    _leader_only()
    if code not in MK:
        raise HTTPException(404, "Unknown market.")
    return snapshot(code)


@app.get("/api/stream/{code}")
async def stream(code: str):
    _leader_only()
    if code not in MK:
        raise HTTPException(404, "Unknown market.")

    async def gen():
        last, last_sent = -1, 0.0
        while True:
            if VERSION["n"] != last or time.time() - last_sent > 5:
                last, last_sent = VERSION["n"], time.time()
                yield f"data: {json.dumps(snapshot(code))}\n\n"
            await asyncio.sleep(0.3)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/balances")
def balances(market: str = "DSE", _=Depends(staff_user)):
    _leader_only()
    if market not in MK:
        raise HTTPException(404, "Unknown market.")
    return [{"name": x["name"], "role": x["role"], "address": x["wallet"], **CLIENTS[market].balance(x["wallet"], list(MK[market]["tickers"]))}
            for x in AUTH.wallet_users()]


@app.get("/api/nodes")
def nodes():
    _leader_only()
    out = []
    for pid, port in PEERS.items():
        try:
            t0 = time.perf_counter()
            h = HTTP.get(f"http://127.0.0.1:{port}/health", timeout=1.5).json()
            out.append({**h, "up": True, "ping_ms": round((time.perf_counter() - t0) * 1000, 1)})
        except Exception:
            out.append({"node": pid, "port": port, "up": False})
    return out


@app.post("/api/fault/{pid}/{on}")
def set_fault(pid: int, on: str, _=Depends(admin_user)):
    _leader_only()
    if pid not in PEERS:
        raise HTTPException(404, "Unknown node.")
    bad = on.lower() not in ("off", "false", "0", "heal")
    notice("validator", node=pid, faulty=bad)
    if pid == NODE_ID:
        return fault(on)
    return HTTP.post(f"http://127.0.0.1:{PEERS[pid]}/fault/{on}", timeout=2).json()


# ───────────────────────── v2.1: wallet (add money / withdraw), watchlist, price history ─────────────────────────
WALLET_LOCK = threading.Lock()
METHOD_NAME = {"bkash": "bKash", "nagad": "Nagad", "rocket": "Rocket", "bank": "Bank transfer", "card": "Debit card"}


class DepositIn(BaseModel):
    market: str
    amount: int                       # in the market's base unit (BDT, or pence on the LSE)
    method: str


class WithdrawIn(BaseModel):
    market: str
    amount: int
    method: str
    nonce: str
    expiry: int
    sig: str


class WatchIn(BaseModel):
    market: str
    ticker: str
    on: bool = True


def _wallet_market(m):
    if m not in MK or MK[m].get("hidden"):
        raise HTTPException(404, "Unknown market.")
    return MK[m].get("wallet") or {"methods": [], "min": 0, "max": 0}


def _wallet_log(u):
    return u.setdefault("wallet_log", [])


@app.get("/api/wallet")
def wallet_get(u=Depends(trading_user)):
    _leader_only()
    return {"history": list(reversed(_wallet_log(u)))[:50],
            "methods": {m: [{"id": x, "name": METHOD_NAME.get(x, x)} for x in _wallet_market(m)["methods"]] for m in MK if not MK[m].get("hidden")}}


@app.post("/api/wallet/deposit")
def wallet_deposit(b: DepositIn, u=Depends(trading_user)):
    """Practice top-up. The payment is SIMULATED (no money moves); the broker key credits the on-chain cash."""
    _leader_only()
    w = _wallet_market(b.market)
    if b.method not in w["methods"]:
        raise HTTPException(400, "Choose a payment method.")
    if not (w["min"] <= b.amount <= w["max"]):
        raise HTTPException(400, f"Amount must be between {w['min']} and {w['max']}.")
    with WALLET_LOCK:
        r = CLIENTS[b.market].deposit_cash(u["wallet"], b.amount)
        ref = "SIM-" + secrets.token_hex(3).upper()
        entry = {"id": ref, "type": "deposit", "market": b.market, "amount": b.amount, "method": b.method,
                 "method_name": METHOD_NAME.get(b.method, b.method), "tx": r["tx"], "block": r["block"], "t": now_ms(), "status": "completed"}
        _wallet_log(u).append(entry)
    bump()
    return {"entry": entry, "balance": CLIENTS[b.market].balance(u["wallet"], list(MK[b.market]["tickers"]))}


@app.post("/api/wallet/withdraw")
def wallet_withdraw(b: WithdrawIn, u=Depends(trading_user)):
    """Withdrawal signed on the investor's device. The edge checks the signature first; the contract checks it again."""
    _leader_only()
    w = _wallet_market(b.market)
    if b.method not in w["methods"]:
        raise HTTPException(400, "Choose where to send the money.")
    if not (0 < b.amount <= w["max"]):
        raise HTTPException(400, f"Amount must be between 1 and {w['max']}.")
    try:
        nonce, sig = int(b.nonce), bytes.fromhex(b.sig.removeprefix("0x"))
        signer = S.recover(S.withdraw_digest(CLIENTS[b.market].domain, u["wallet"], b.amount, nonce, b.expiry), sig)
    except (ValueError, TypeError):
        raise HTTPException(400, "The withdrawal signature is not valid.")
    if signer.lower() != u["wallet"].lower():
        raise HTTPException(400, "The withdrawal was not signed with your key.")
    if b.expiry < time.time():
        raise HTTPException(400, "The signed withdrawal has expired. Try again.")
    with WALLET_LOCK:
        free = CLIENTS[b.market].balance(u["wallet"], [])["cash"]
        if b.amount > free:
            raise HTTPException(400, "Not enough free cash. Cash locked in open buy orders cannot be withdrawn.")
        try:
            r = CLIENTS[b.market].withdraw_cash(u["wallet"], b.amount, nonce, b.expiry, sig)
        except RuntimeError as e:
            raise HTTPException(400, f"The contract refused the withdrawal: {e}")
        ref = "SIM-" + secrets.token_hex(3).upper()
        entry = {"id": ref, "type": "withdraw", "market": b.market, "amount": b.amount, "method": b.method,
                 "method_name": METHOD_NAME.get(b.method, b.method), "tx": r["tx"], "block": r["block"], "t": now_ms(), "status": "completed"}
        _wallet_log(u).append(entry)
    bump()
    return {"entry": entry, "balance": CLIENTS[b.market].balance(u["wallet"], list(MK[b.market]["tickers"]))}


@app.get("/api/watchlist")
def watchlist_get(u=Depends(current_user)):
    _leader_only()
    return u.setdefault("watchlist", {})


@app.post("/api/watchlist")
def watchlist_set(b: WatchIn, u=Depends(current_user)):
    _leader_only()
    if b.market not in MK or b.ticker not in MK[b.market]["tickers"]:
        raise HTTPException(404, "Unknown stock.")
    wl = u.setdefault("watchlist", {})
    cur = [t for t in wl.get(b.market, []) if t != b.ticker]
    wl[b.market] = cur + [b.ticker] if b.on else cur
    return wl


@app.get("/api/history/{market}/{ticker}")
def price_history(market: str, ticker: str, days: int = 30):
    """Today: prices of the simulated trades. Before today: an ILLUSTRATIVE series (seeded, inside the price band, ending at
    the reference price). It is not real market history and is labelled as such in the dashboard."""
    _leader_only()
    if market not in MK or ticker not in MK[market]["tickers"]:
        raise HTTPException(404, "Unknown stock.")
    ref, bps = ref_of(market, ticker), bps_of(market, ticker)
    rnd = random.Random(f"{market}-{ticker}-history")
    days = max(5, min(int(days), 90))
    closes, p = [], ref * (1 + rnd.uniform(-0.6, 0.6) * bps / 10000)
    for _ in range(days):
        p = p * (1 + rnd.gauss(0, 0.25) * bps / 10000)
        p = min(max(p, ref * (1 - 2.5 * bps / 10000)), ref * (1 + 2.5 * bps / 10000))
        closes.append(p)
    shift = ref - closes[-1]                                       # end the series at the reference price
    closes = [max(1, round(c + shift * (i + 1) / days)) for i, c in enumerate(closes)]
    day = 86_400_000
    start = (now_ms() // day) * day
    return {"market": market, "ticker": ticker, "ref": ref, "illustrative": True,
            "daily": [{"t": start - (days - i) * day, "close": c} for i, c in enumerate(closes)],
            "today": [{"t": t, "price": px} for t, px in PRICES[market][ticker]]}


# ───────────────────────── v2.1: market overview, leaderboard, live board, quick start ─────────────────────────
def _first(name):
    return (name or "Investor").split()[0][:16]


@app.get("/api/overview/{market}")
def overview(market: str):
    """Public market overview, like an exchange home page: demo index, turnover, breadth, sectors, movers, notices."""
    _leader_only()
    _visible_market(market)
    m, rows = market, []
    for t, v in MK[m]["tickers"].items():
        st = STATS[m][t]
        last = st["last"] if st["last"] is not None else v["ref"]
        rows.append({"ticker": t, "name": v["name"], "sector": v.get("sector", ""), "last": last, "ref": v["ref"],
                     "chg": round((last - v["ref"]) / v["ref"] * 100, 2), "volume": st["volume"], "trades": st["trades"],
                     "turnover": TURNOVER[m].get(t, 0)})
    sectors = {}
    for r in rows:
        s_ = sectors.setdefault(r["sector"], {"sector": r["sector"], "n": 0, "chg_sum": 0.0, "turnover": 0, "tickers": []})
        s_["n"] += 1
        s_["chg_sum"] += r["chg"]
        s_["turnover"] += r["turnover"]
        s_["tickers"].append(r["ticker"])
    sec = [{"sector": k, "chg": round(v["chg_sum"] / v["n"], 2), "turnover": v["turnover"], "tickers": v["tickers"]} for k, v in sectors.items()]
    hist = list(IDX[m])
    if len(hist) > 240:                                          # keep the response small: about 240 points
        step = len(hist) / 240
        hist = [hist[int(i * step)] for i in range(240)] + [hist[-1]]
    now = index_value(m)
    vals = [v for _, v in IDX[m]]
    return {"market": m, "v": VERSION["n"],
            "index": {"name": "Demo index", "base": 1000, "value": now, "chg": round(now - 1000, 2), "chg_pct": round((now - 1000) / 10, 2),
                      "high": max(vals) if vals else now, "low": min(vals) if vals else now, "history": hist},
            "summary": {"turnover": sum(r["turnover"] for r in rows), "volume": sum(r["volume"] for r in rows),
                        "trades": sum(r["trades"] for r in rows), "adv": sum(1 for r in rows if r["chg"] > 0),
                        "dec": sum(1 for r in rows if r["chg"] < 0), "unch": sum(1 for r in rows if r["chg"] == 0)},
            "sectors": sorted(sec, key=lambda x: -x["chg"]),
            "movers": {"gainers": sorted([r for r in rows if r["chg"] > 0], key=lambda r: -r["chg"])[:5],
                       "losers": sorted([r for r in rows if r["chg"] < 0], key=lambda r: r["chg"])[:5],
                       "active": sorted([r for r in rows if r["turnover"]], key=lambda r: -r["turnover"])[:5]},
            "rows": rows,
            "notices": [n for n in list(NOTICES) if n.get("market") == m][:25],
            "status": {"open": True, "note": "Demo market: open at all times", "hours": MK[m]["hours"]}}


LB = {"at": 0.0, "data": None, "lock": threading.Lock()}


def _baseline(u):
    """Practice value at the start: the starting cash and shares at reference prices, plus money added, minus money taken out."""
    cfg = MK["DSE"]
    demo = u["name"] in DEMO_NAMES and u["email"].endswith("@blockexdse.demo")
    cash0, sh0 = (cfg["demo_cash"], cfg["demo_shares"]) if demo else (cfg["new_cash"], cfg["new_shares"])
    v = cash0 + sum(sh0 * t["ref"] for t in cfg["tickers"].values())
    for e in u.get("wallet_log", []):
        if e["market"] == "DSE":
            v += e["amount"] if e["type"] == "deposit" else -e["amount"]
    return v


@app.get("/api/leaderboard")
def leaderboard():
    """Practice challenge: investors ranked by the change in their DSE practice portfolio. Demo bots are left out."""
    _leader_only()
    with LB["lock"]:
        if LB["data"] is not None and time.time() - LB["at"] < 8:
            return LB["data"]
        tks = list(MK["DSE"]["tickers"])
        last = {t: STATS["DSE"][t]["last"] or MK["DSE"]["tickers"][t]["ref"] for t in tks}
        rows, players = [], 0
        ntr = {}
        for r in ORDERS.values():                                # trades per investor; only investors with a trade are ranked,
            if r["market"] == "DSE" and r.get("owner") and r.get("trades"):   # so the chain is read for active players only
                ntr[r["owner"]] = ntr.get(r["owner"], 0) + len(r["trades"])
        for u in AUTH.wallet_users():
            if u["role"] != "trader" or u["name"] in BOTS:
                continue
            players += 1
            if not ntr.get(u["id"]):
                continue
            try:
                b = CLIENTS["DSE"].balance(u["wallet"], tks)
            except Exception:
                continue
            val = b["cash"] + b["locked_cash"] + sum((b["shares"][t] + b["locked_shares"][t]) * last[t] for t in tks)
            base = _baseline(u)
            rows.append({"id": u["id"], "name": _first(u["name"]), "value": val, "ret": round((val - base) / base * 100, 3) if base else 0.0,
                         "trades": ntr[u["id"]], "quick": bool(u.get("quick"))})
        rows.sort(key=lambda r: (-r["ret"], -r["trades"]))
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        LB["data"], LB["at"] = {"market": "DSE", "n": len(rows), "players": players, "rows": rows[:50], "t": now_ms()}, time.time()
        return LB["data"]


@app.get("/api/board/feed")
def board_feed():
    """Public feed for the big-screen board: the latest orders, with first names only."""
    _leader_only()
    rows = [r for r in ORDERS.values() if not r.get("bench") and r["market"] != "BNC"]
    rows.sort(key=lambda r: r["id"], reverse=True)
    keys = ("id", "ts", "market", "ticker", "side", "otype", "qty", "price", "status", "filled", "stages", "place_tx", "risk")
    out = []
    for r in rows[:12]:
        x = {k: r.get(k) for k in keys}
        x["name"] = _first(r.get("trader_name"))
        x["votes"] = {"agree": (r.get("votes") or {}).get("agree"), "required": (r.get("votes") or {}).get("required"),
                      "compliance": bool((r.get("votes") or {}).get("compliance")),
                      "detail": [{"node": d["node"], "agree": d["agree"], "verdict": d["verdict"]} for d in (r.get("votes") or {}).get("detail", [])]}
        x["anchored"] = bool(r.get("trades")) and all(t.get("record_hash") for t in r["trades"])
        out.append(x)
    return out


class QuickIn(BaseModel):
    name: str
    wallet: str


QUICK_RATE = deque(maxlen=200)


@app.post("/api/auth/quickstart")
def quickstart(b: QuickIn):
    """Demo days: a visitor taps "Try it now", picks a nickname, and gets a practice account at once.
    The signing key is still created in the visitor's browser; only its address is sent and registered on-chain."""
    _leader_only()
    if not QUICKSTART:
        raise HTTPException(403, "Quick start is switched off on this system.")
    now = time.time()
    while QUICK_RATE and now - QUICK_RATE[0] > 60:
        QUICK_RATE.popleft()
    if len(QUICK_RATE) >= 30:
        raise HTTPException(429, "Many visitors are joining right now. Please try again in a minute.")
    wallet = (b.wallet or "").strip()
    if not Web3.is_address(wallet):
        raise HTTPException(400, "A signing address is required. Reload the page: your browser creates the key.")
    if any((x.get("wallet_req") or x["wallet"] or "").lower() == wallet.lower() for x in AUTH.users.values()):
        raise HTTPException(409, "This signing address is already linked to an account.")
    u = AUTH.quick(b.name)
    QUICK_RATE.append(now)
    with APPROVE_LOCK:
        reg = None
        wallet = Web3.to_checksum_address(wallet)
        for m, cfg in MK.items():
            if cfg.get("hidden"):
                continue
            r = CLIENTS[m].register_trader(wallet, cfg["new_cash"])
            reg = reg or r
            for sym in cfg["tickers"]:
                CLIENTS[m].credit_shares(wallet, sym, cfg["new_shares"])
        u["wallet"], u["reg_tx"], u["decided_by"] = wallet, reg["tx"], "quick start"
    notice("joined", name=_first(u["name"]))
    return {"token": AUTH._session(u, ttl=12 * 3600), "user": AUTH.public(u), "tx": reg["tx"]}


@app.get("/vendor/{name}")
def vendor_file(name: str):
    if name not in ("qrcode.js", "sign.js"):
        raise HTTPException(404, "not found")
    return FileResponse(DASH / "vendor" / name, media_type="application/javascript")


# ───────────────────────── gateway: market simulator (liquidity bots) ─────────────────────────
@app.get("/api/admin/sim")
def sim_status(_=Depends(admin_user)):
    return dict(SIM)


@app.post("/api/admin/sim/{market}/{on}")
def sim_switch(market: str, on: str, _=Depends(admin_user)):
    if market not in MK:
        raise HTTPException(404, "Unknown market.")
    SIM[market] = on.lower() in ("on", "true", "1")
    bump()
    return dict(SIM)


def sim_loop():
    """Demo-only order flow: three KYC traders sign and post limit orders around the last price and sometimes send market orders."""
    time.sleep(3)
    while True:
        time.sleep(SIM_EVERY)
        try:
            active = [m for m, on in SIM.items() if on]
            if not active or PIPE_LOCK.locked():
                continue
            m = random.choice(active)
            bot = random.choice(BOTS)
            t = random.choice(list(MK[m]["tickers"]))
            ref = ref_of(m, t)
            last = STATS[m][t]["last"] or ref
            step = max(1, round(ref * 0.005))
            side = random.choice(["BUY", "SELL"])
            qty = random.randint(1, 15)
            dev = (last - ref) / ref                    # v2.1: gentle pull back towards the reference price, so the demo
            pull = -1 if dev > 0.03 else 1 if dev < -0.03 else 0    # market moves like a market instead of pinning at the limits
            if pull and random.random() < 0.6:
                side = "SELL" if pull < 0 else "BUY"
            if random.random() < 0.18:
                bot_order(bot, m, t, qty, 0, side, "MARKET")
            else:
                px = last + (random.randint(-2, 2) + (pull if random.random() < 0.6 else 0)) * step
                lo, hi = limits(m, t)
                bot_order(bot, m, t, qty, min(max(px, lo), hi), side, "LIMIT")
        except Exception:
            pass


if IS_LEADER:
    for _m in os.getenv("DEMO_SIM", "").split(","):     # v2.1: run.py --demo starts the market simulator on these markets
        if _m.strip() in SIM:
            SIM[_m.strip()] = True
    threading.Thread(target=sim_loop, daemon=True).start()


# ───────────────────────── gateway: benchmark (admin only) ─────────────────────────
BENCH = {"jobs": {}, "seq": 0, "running": False}
BENCH_MODES = {"chain_only": (0, 0), "edge_only": (0, 0), "fixed3": (3, 3), "fixed4": (4, 4), "racd": (3, 4)}   # (routine, risky) quorum
INVALID_KINDS = ("bad_price", "bad_size", "restricted", "bad_ticker", "bad_kyc")


def bench_workload(n, seed, mix="standard"):
    """Seeded, reproducible order mix: 62% routine, 14% risky but valid, 24% invalid (five kinds).

    bad_price, bad_ticker and bad_kyc are also refused by the contract. bad_size (an input error far above the size
    limit) and restricted (an account frozen after KYC) break rules that only the edge validators know.
    Two special mixes serve the quorum-depth experiment: "edge_invalid" (only the two edge-rule violations) and
    "valid" (only routine and risky orders, in the usual 62:14 proportion).
    """
    rng, m = random.Random(seed), "BNC"
    kinds = ["routine"] * 62 + ["risky"] * 14 + ["bad_price"] * 6 + ["bad_size"] * 6 + ["restricted"] * 6 + ["bad_ticker"] * 3 + ["bad_kyc"] * 3
    if mix == "edge_invalid":
        kinds = ["bad_size", "restricted"]
    elif mix == "valid":
        kinds = ["routine"] * 62 + ["risky"] * 14
    out = []
    for i in range(n):
        kind, t = rng.choice(kinds), rng.choice(list(MK[m]["tickers"]))
        ref, bps = ref_of(m, t), bps_of(m, t)
        side, qty, signer = rng.choice(["BUY", "SELL"]), rng.randint(1, 10), BOTS[i % 3]
        price = round(ref * (1 + rng.uniform(-0.01, 0.01)))
        if kind == "risky":
            price = round(ref * (1 + rng.choice([-1, 1]) * 0.7 * bps / 10000))
        elif kind == "bad_price":
            price = round(ref * (1 + rng.choice([-1, 1]) * (bps / 10000 + 0.15)))
        elif kind == "bad_size":
            qty = rng.randint(2, 10) * MK[m]["max_qty"]
        elif kind == "restricted":
            signer = MK[m]["restricted"][0]
        elif kind == "bad_ticker":
            t = "ZZZZ"
        elif kind == "bad_kyc":
            signer = None                                   # a key that was never registered
        out.append({"kind": kind, "ticker": t, "side": side, "qty": qty, "price": max(1, price), "signer": signer})
    return out


def _pct(vals, q):
    if not vals:
        return 0.0
    v = sorted(vals)
    return round(v[min(len(v) - 1, int(round(q * (len(v) - 1))))], 1)


def _machine_cpu():
    """Busy CPU seconds of the whole machine (Linux only): includes the blockchain node."""
    try:
        with open("/proc/stat", encoding="ascii") as f:
            v = list(map(int, f.readline().split()[1:9]))
        return (sum(v) - v[3] - v[4]) / os.sysconf("SC_CLK_TCK")
    except Exception:
        return None


def _rapl_uj():
    """Package energy counters in microjoules (Linux with readable RAPL counters only)."""
    total, found = 0, False
    try:
        for d in sorted(Path("/sys/class/powercap").glob("intel-rapl:*")):
            if d.name.count(":") != 1:                      # packages only, not their sub-zones
                continue
            total += int((d / "energy_uj").read_text().strip())
            found = True
    except Exception:
        return None
    return total if found else None


def _usage():
    """Counters behind the energy proxy: CPU seconds and signature operations of all four edge processes."""
    cpu, mine, signs, recs = 0.0, 0.0, 0, 0
    for pid in PEERS:
        try:
            h = health() if pid == NODE_ID else HTTP.get(f"http://127.0.0.1:{PEERS[pid]}/health", timeout=2).json()
            cpu, signs, recs = cpu + h["cpu_s"], signs + h["signs"], recs + h["recovers"]
            mine += h["cpu_s"] if pid == NODE_ID else 0
        except Exception:
            pass
    return {"cpu_edge_s": cpu, "cpu_gateway_s": mine, "signs": signs, "recovers": recs, "cpu_machine_s": _machine_cpu(), "energy_uj": _rapl_uj()}


def set_compromised(c):
    """Benchmark only: validators 1..c sign without checking (validator 1 is the gateway)."""
    for pid in PEERS:
        mode = "rogue" if pid <= c else "off"
        if pid == NODE_ID:
            STATE["fault"] = mode
        else:
            try:
                HTTP.post(f"http://127.0.0.1:{PEERS[pid]}/fault/{mode}", timeout=2)
            except Exception:
                pass


def set_noise(p_lazy, p_drop):
    """Benchmark only: every validator (and the gateway's own check) is careless with probability p_lazy; every other
    validator fails to answer with probability p_drop."""
    STATE["p_lazy"] = p_lazy
    for pid in PEERS:
        if pid != NODE_ID:
            try:
                HTTP.post(f"http://127.0.0.1:{PEERS[pid]}/noise/{p_lazy}/{p_drop}", timeout=2)
            except Exception:
                pass


def run_batch(recs, mode):
    """Benchmark only: several orders share one round of validator signatures and one transaction."""
    with PIPE_LOCK:
        m, t_start = recs[0]["market"], time.perf_counter()
        std, esc = QUORUM[m]
        groups = {}
        for rec in recs:
            o = rec["order"]
            ok, why = (True, "ok") if STATE["fault"] == "rogue" else validate(o)
            if not ok:
                rec.update(error=why, rejected_by="edge", status="rejected")
                continue
            risk = _risk(o)
            risk["required"] = esc if risk["tier"] else std
            rec["risk"] = risk
            groups.setdefault(risk["required"], []).append(rec)
        for req, grp in groups.items():
            orders, t0 = [r["order"] for r in grp], time.perf_counter()
            sigs, detail, asked = collect(m, orders, req, ask_all=(mode == "fixed4"))
            ms = round((time.perf_counter() - t0) * 1000, 2)
            for i, r in enumerate(grp):
                r["votes"] = {"agree": len(sigs), "required": req, "detail": detail, "asked": asked if i == 0 else 0, "shared": len(grp)}
                r["consensus_ms"] = ms if i == 0 else 0
            if len(sigs) < req:
                for r in grp:
                    if r["risk"]["tier"] and 0 < std <= len(sigs):
                        r["status"] = "held"
                    else:
                        r.update(status="rejected", rejected_by="consensus", error=f"not enough validator signatures: {len(sigs)} of {req}")
                continue
            try:
                res = CLIENTS[m].place_orders(orders, [bytes.fromhex(o["sig"][2:]) for o in orders], b"".join(sigs[n] for n in sorted(sigs)))
            except Exception as e:
                for r in grp:
                    r.update(status="rejected", rejected_by="contract", error=str(e)[:200])
                continue
            for i, r in enumerate(grp):
                r.update(chain_id=res["first_id"] + i, place_tx=res["tx"], place_block=res["block"])
                r["gas_total"] += res["gas"] / len(grp)
                r["place_gas"] = res["gas"] / len(grp)
                r["tx_count"] += 1 / len(grp)
            for r in grp:
                try:
                    finish(r, time.perf_counter())
                except Exception as e:
                    r["notes"].append(f"post-placement step failed: {e}")
        took = round((time.perf_counter() - t_start) * 1000, 1)
        for rec in recs:
            rec["total_ms"] = took
            STORE.save(rec)
        bump()


def bench_mode(mode, workload, batch=1, compromised=0, p_lazy=0.0, p_drop=0.0, mix="standard"):
    m, cl = "BNC", CLIENTS["BNC"]
    cl.set_quorum(*BENCH_MODES[mode])
    refresh_quorum()
    BOOKS[m] = {"BUY": [], "SELL": []}
    recs = []
    for i, w in enumerate(workload):                        # investors sign on their own devices: not part of the timing
        key = S.demo_trader_key(w["signer"]) if w["signer"] else hashlib.sha256(f"bench-nokyc-{i}".encode()).hexdigest()
        owner = next(u for u in AUTH.users.values() if u["name"] == (w["signer"] if w["signer"] in BOTS else BOTS[0]))
        rec = new_rec(owner, signed_order(key, m, w["ticker"], w["qty"], w["price"], w["side"]), fast=True, sim=True, bench=mode)
        rec["kind"] = w["kind"]
        ORDERS[rec["id"]] = rec
        recs.append(rec)
    if compromised:
        set_compromised(compromised)
    if p_lazy or p_drop:
        set_noise(p_lazy, p_drop)
    try:
        u0, t0 = _usage(), time.perf_counter()
        if batch <= 1 or mode == "chain_only":
            batch = 1
            for rec in recs:
                run_pipeline(rec)
        else:
            for i in range(0, len(recs), batch):
                run_batch(recs[i:i + batch], mode)
        elapsed, u1 = time.perf_counter() - t0, _usage()
    finally:
        if compromised:
            set_compromised(0)
        if p_lazy or p_drop:
            set_noise(0.0, 0.0)
        cl.set_quorum(3, 4)
        refresh_quorum()

    invalid = [r for r in recs if r["kind"] in INVALID_KINDS]
    valid = [r for r in recs if r["kind"] not in INVALID_KINDS]
    risky = [r for r in recs if r["kind"] == "risky"]
    reached = lambda r: bool(r.get("chain_id"))  # noqa: E731
    placed = [r for r in recs if reached(r)]
    lat = [r["total_ms"] for r in recs]
    att = [r["consensus_ms"] for r in recs if r.get("votes", {}).get("required")]
    votes = lambda r: r.get("votes", {}).get("agree", 0)  # noqa: E731
    gas = sum(r["gas_total"] for r in recs)
    chain_recovers = sum(1 + votes(r) / r["votes"].get("shared", 1) for r in placed if r.get("votes"))
    d = lambda k: (None if u0[k] is None or u1[k] is None else u1[k] - u0[k])  # noqa: E731
    energy = d("energy_uj")
    q_of = lambda r: BENCH_MODES[mode][_risk(r["order"])["tier"]]  # noqa: E731  signatures this order needs in this configuration
    einv = [r for r in recs if r["kind"] in ("bad_size", "restricted")]        # break rules that only the edge knows
    res = {
        "mode": mode, "batch": batch, "compromised": compromised, "mix": mix, "p_lazy": p_lazy, "p_drop": p_drop,
        "orders": len(recs), "elapsed_s": round(elapsed, 2),
        "throughput_ops": round(len(recs) / elapsed, 2),
        "lat_mean_ms": round(sum(lat) / len(lat), 1), "lat_p50_ms": _pct(lat, 0.5), "lat_p95_ms": _pct(lat, 0.95),
        "lat_valid_mean_ms": round(sum(r["total_ms"] for r in valid) / max(len(valid), 1), 1),
        "valid_orders": len(valid), "valid_accepted": sum(1 for r in valid if reached(r)),
        "valid_held": sum(1 for r in valid if r["status"] == "held"),
        "valid_rejected": sum(1 for r in valid if r["status"] == "rejected"),
        "invalid_orders": len(invalid), "invalid_reached_ledger": sum(1 for r in invalid if reached(r)),
        "invalid_value_on_ledger": sum(r["qty"] * r["price"] for r in invalid if reached(r)),
        "invalid_blocked_edge": sum(1 for r in invalid if r.get("rejected_by") == "edge"),
        "invalid_blocked_validators": sum(1 for r in invalid if r.get("rejected_by") == "consensus" or r["status"] == "held"),
        "invalid_blocked_contract": sum(1 for r in invalid if r.get("rejected_by") == "contract"),
        "risky_orders": len(risky), "risky_accepted": sum(1 for r in risky if reached(r)),
        "risky_accepted_below4": sum(1 for r in risky if reached(r) and votes(r) < 4),
        "risky_held": sum(1 for r in risky if r["status"] == "held"),
        "edge_rule_invalid": len(einv), "edge_rule_invalid_reached": sum(1 for r in einv if reached(r)),
        "edge_rule_invalid_q3": sum(1 for r in einv if q_of(r) == 3), "edge_rule_invalid_q4": sum(1 for r in einv if q_of(r) == 4),
        "edge_rule_invalid_q3_reached": sum(1 for r in einv if q_of(r) == 3 and reached(r)),
        "edge_rule_invalid_q4_reached": sum(1 for r in einv if q_of(r) == 4 and reached(r)),
        "valid_q3": sum(1 for r in valid if q_of(r) == 3), "valid_q4": sum(1 for r in valid if q_of(r) == 4),
        "valid_short": sum(1 for r in valid if r["status"] == "held" or r.get("rejected_by") == "consensus"),
        "valid_q3_short": sum(1 for r in valid if q_of(r) == 3 and (r["status"] == "held" or r.get("rejected_by") == "consensus")),
        "valid_q4_short": sum(1 for r in valid if q_of(r) == 4 and (r["status"] == "held" or r.get("rejected_by") == "consensus")),
        "tx_total": round(sum(r["tx_count"] for r in recs)), "gas_total": round(gas), "gas_per_order": round(gas / len(recs)),
        "gas_per_accepted": round(gas / max(len(placed), 1)),
        "gas_place_mean": round(sum(r.get("place_gas", 0) for r in placed) / max(len(placed), 1)),
        "wasted_gas_invalid": round(sum(r["gas_total"] for r in invalid if reached(r))),
        "trades": sum(len(r["trades"]) for r in recs),
        "trades_with_invalid_taker": sum(len(r["trades"]) for r in invalid if reached(r)),
        "edge_ms_mean": round(sum(r.get("edge_ms", 0) for r in recs) / len(recs), 2),
        "attest_ms_mean": round(sum(att) / max(len(att), 1), 2),
        "peer_requests": sum(r.get("votes", {}).get("asked", 0) for r in recs),
        "edge_signs": u1["signs"] - u0["signs"], "edge_recovers": u1["recovers"] - u0["recovers"],
        "chain_recovers": round(chain_recovers),
        "sigs_per_accepted": round((u1["signs"] - u0["signs"]) / max(len(placed), 1), 2),
        "cpu_edge_s": round(u1["cpu_edge_s"] - u0["cpu_edge_s"], 3),
        "cpu_edge_ms_per_order": round((u1["cpu_edge_s"] - u0["cpu_edge_s"]) * 1000 / len(recs), 2),
        "cpu_gateway_ms_per_order": round((u1["cpu_gateway_s"] - u0["cpu_gateway_s"]) * 1000 / len(recs), 2),
        "cpu_validators_ms_per_order": round((u1["cpu_edge_s"] - u0["cpu_edge_s"] - u1["cpu_gateway_s"] + u0["cpu_gateway_s"]) * 1000 / len(recs), 2),
        "cpu_machine_s": None if d("cpu_machine_s") is None else round(d("cpu_machine_s"), 2),
        "energy_j": None if energy is None or energy < 0 else round(energy / 1e6, 2),
        "crypto_backend": crypto_backend(),
    }
    return res


class BenchIn(BaseModel):
    modes: list[str] = list(BENCH_MODES)
    n: int = 60
    seed: int = 7
    label: str = ""
    batch: int = 1
    compromised: int = 0
    p_lazy: float = 0.0
    p_drop: float = 0.0
    mix: str = "standard"


def _bench_job(jid, b: BenchIn):
    job = BENCH["jobs"][jid]
    try:
        workload = bench_workload(b.n, b.seed, b.mix)
        for mode in b.modes:
            job["progress"] = mode
            job["results"].append(bench_mode(mode, workload, b.batch, b.compromised, b.p_lazy, b.p_drop, b.mix))
        job["state"] = "done"
    except Exception as e:
        job["state"], job["error"] = "error", str(e)[:300]
    finally:
        BENCH["running"] = False


@app.post("/api/admin/bench/start")
def bench_start(b: BenchIn, _=Depends(admin_user)):
    _leader_only()
    if "BNC" not in MK:
        raise HTTPException(409, "Benchmark market not deployed. Restart the system.")
    if b.n < 5 or b.n > 500 or any(m not in BENCH_MODES for m in b.modes) or not 1 <= b.batch <= 50 or not 0 <= b.compromised <= 3:
        raise HTTPException(400, "Use n 5 to 500, known modes, batch 1 to 50 and compromised 0 to 3.")
    if not (0 <= b.p_lazy <= 1 and 0 <= b.p_drop <= 1) or b.mix not in ("standard", "edge_invalid", "valid"):
        raise HTTPException(400, "Use p_lazy and p_drop between 0 and 1, and mix standard, edge_invalid or valid.")
    if BENCH["running"]:
        raise HTTPException(409, "A benchmark is already running.")
    BENCH["running"] = True
    BENCH["seq"] += 1
    jid = f"J{BENCH['seq']}"
    BENCH["jobs"][jid] = {"state": "running", "progress": "", "results": [], "n": b.n, "seed": b.seed, "label": b.label,
                          "batch": b.batch, "compromised": b.compromised, "chain": CHAIN.info()}
    threading.Thread(target=_bench_job, args=(jid, b), daemon=True).start()
    return {"job": jid}


@app.get("/api/admin/bench/{jid}")
def bench_status(jid: str, _=Depends(admin_user)):
    if jid not in BENCH["jobs"]:
        raise HTTPException(404, "Unknown job.")
    return BENCH["jobs"][jid]


@app.post("/api/admin/link/{ms}")
def set_link(ms: float, _=Depends(admin_user)):
    """Emulated network distance: every other validator waits this long before answering."""
    _leader_only()
    out = []
    for pid in PEERS:
        if pid != NODE_ID:
            try:
                out.append(HTTP.post(f"http://127.0.0.1:{PEERS[pid]}/link/{ms}", timeout=2).json())
            except Exception:
                out.append({"node": pid, "error": "unreachable"})
    return out


# ───────────────────────── gateway: independent audit (any signed-in user) ─────────────────────────
TAMPER: dict = {}                   # market -> (trade id, original price) while the tamper demonstration is on


def _visible_market(market):
    if market not in MK or MK[market].get("hidden"):
        raise HTTPException(404, "Unknown market.")


@app.get("/api/audit/{market}")
def audit(market: str, _=Depends(current_user)):
    """Re-checks the whole market from the ledger: signatures, quorums, matching priority, balances, anchors."""
    _leader_only()
    _visible_market(market)
    with PIPE_LOCK:
        rep = audit_market(CLIENTS[market], TRADELOG[market])
    rep["tamper_demo_on"] = market in TAMPER
    return rep


# ───────────────────────── gateway: proof lab (admin only) ─────────────────────────
LAB = {
    "forged_order": ("Place an order in another investor's name", "The gateway signs an order for Alice with its own key."),
    "fake_quorum": ("Claim approvals that do not exist", "A valid order is sent with one validator signature instead of three."),
    "duplicate_signer": ("Count one validator three times", "The same validator signature is repeated three times."),
    "outsider_signer": ("Use signatures from unknown keys", "Three signatures made with keys that are not validators."),
    "downgrade_risk": ("Pass a risky order as routine", "A risky order is sent with three signatures instead of four."),
    "replay": ("Replay an old order", "An order that the contract already accepted is submitted a second time."),
    "expired": ("Use an expired order", "An order whose expiry time has passed, signed by all four validators."),
    "out_of_band": ("Break the price band", "A price outside the circuit-breaker band, signed by all four validators."),
    "unsigned_cancel": ("Cancel an investor's order without consent", "The gateway tries to cancel a resting order without the investor's signature."),
}


def _lab_sigs(m, orders, ids=(1, 2, 3, 4)):
    """Signatures made directly with the demo validator keys: the worst case where those validators collude."""
    dig = S.attest_digest(CLIENTS[m].domain, S.batch_root([S.order_hash(o) for o in orders]))
    return dig, [S.sign(S.edge_key(i), dig) for i in ids]


def _lab_peers(m, order):
    """Ask the other validators honestly and count how many refuse."""
    votes = [ask_peer(p, {"market": m, "orders": [order]})[1] for p in PEERS if p != NODE_ID]
    refused = [v for v in votes if v.get("verdict") != "accept"]
    return {"asked": len(votes), "refused": len(refused), "reason": refused[0].get("reason", "") if refused else ""}


def _lab_resting(m, t, lo, key):
    """A real, honest resting order (lowest allowed bid, 1 share) for tests that need one. Returns (order, sigs, chain id)."""
    cl = CLIENTS[m]
    o = signed_order(key, m, t, 1, lo, "BUY")
    sigs, _, _ = collect(m, [o], QUORUM[m][1], ask_all=True)
    att = b"".join(sigs[n] for n in sorted(sigs))
    r = cl.place_orders([o], [bytes.fromhex(o["sig"][2:])], att)
    return o, att, r["first_id"]


def lab_attack(name, m):
    cl, t = CLIENTS[m], next(iter(MK[m]["tickers"]))
    lo, hi = limits(m, t)
    frank = S.demo_trader_key("Frank")
    raw = lambda o: [bytes.fromhex(o["sig"][2:])]  # noqa: E731
    res = {"name": name, "title": LAB[name][0], "attempt": LAB[name][1], "validators": None}
    if name == "forged_order":
        alice = next(x["address"] for x in DEP["traders"] if x["name"] == "Alice")
        o = signed_order(_KEY, m, t, 1, lo, "BUY", trader=alice)             # signed by the gateway, not by Alice
        res["validators"] = _lab_peers(m, o)
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), b"".join(_lab_sigs(m, [o])[1])))
    elif name == "fake_quorum":
        o = signed_order(frank, m, t, 1, lo, "BUY")
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), b"".join(_lab_sigs(m, [o], ids=(1,))[1])))
    elif name == "duplicate_signer":
        o = signed_order(frank, m, t, 1, lo, "BUY")
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), _lab_sigs(m, [o], ids=(1,))[1][0] * 3))
    elif name == "outsider_signer":
        o = signed_order(frank, m, t, 1, lo, "BUY")
        dig = _lab_sigs(m, [o], ids=())[0]
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), b"".join(S.sign(secrets.token_hex(32), dig) for _ in range(3))))
    elif name == "downgrade_risk":
        o = signed_order(frank, m, t, 1, hi, "BUY")                          # at the band edge: the contract scores it as risky
        res["risk"] = risk_of(o)["level"]
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), b"".join(_lab_sigs(m, [o], ids=(1, 2, 3))[1])))
    elif name == "expired":
        o = signed_order(frank, m, t, 1, lo, "BUY", ttl=-120)
        res["validators"] = _lab_peers(m, o)
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), b"".join(_lab_sigs(m, [o])[1])))
    elif name == "out_of_band":
        o = signed_order(frank, m, t, 1, hi + max(1, hi // 10), "BUY")
        res["validators"] = _lab_peers(m, o)
        res["contract"] = cl.simulate(cl.place_fn([o], raw(o), b"".join(_lab_sigs(m, [o])[1])))
    elif name in ("replay", "unsigned_cancel"):
        o, att, cid = _lab_resting(m, t, lo, frank)                          # real order, cancelled again below
        try:
            if name == "replay":
                res["contract"] = cl.simulate(cl.place_fn([o], raw(o), att))
            else:
                res["contract"] = cl.simulate(cl.c.functions.cancelOrder(cid, S.sign(_KEY, S.cancel_digest(cl.domain, cid))))
        finally:
            cl.cancel(cid, S.sign(frank, S.cancel_digest(cl.domain, cid)))   # clean up with the investor's own signature
        res["setup"] = f"used a real 1-share order (on-chain id {cid}), then cancelled it with the investor's signature"
    res["blocked"] = res["contract"] != "ok"
    return res


@app.get("/api/lab")
def lab_list(_=Depends(admin_user)):
    return [{"name": k, "title": v[0], "attempt": v[1]} for k, v in LAB.items()]


@app.post("/api/lab/attack/{name}")
def lab_run(name: str, market: str = "DSE", _=Depends(admin_user)):
    _leader_only()
    _visible_market(market)
    if name != "all" and name not in LAB:
        raise HTTPException(404, "Unknown test.")
    with PIPE_LOCK:
        try:
            return [lab_attack(n, market) for n in (LAB if name == "all" else [name])]
        except Exception as e:
            raise HTTPException(500, f"The test could not run: {str(e)[:200]}") from None


@app.post("/api/lab/tamper/{market}/{on}")
def lab_tamper(market: str, on: str, _=Depends(admin_user)):
    """Change one number in the gateway's own off-chain trade record. The audit then finds the mismatch."""
    _leader_only()
    _visible_market(market)
    log = TRADELOG[market]
    if on.lower() in ("on", "true", "1"):
        if not log:
            raise HTTPException(409, "No trade has settled on this market yet. Settle one trade first.")
        if market not in TAMPER:
            TAMPER[market] = (log[-1]["trade_id"], log[-1]["record"]["price"])
            log[-1]["record"]["price"] += 1
        return {"tampered": True, "trade_id": TAMPER[market][0]}
    if market in TAMPER:
        tid, price = TAMPER.pop(market)
        for e in log:
            if e["trade_id"] == tid:
                e["record"]["price"] = price
    return {"tampered": False}


# ───────────────────────── static: dashboard + installable web app ─────────────────────────
@app.get("/")
def dashboard():
    if not IS_LEADER:
        return {"node": NODE_ID, "role": "validator", "gateway": f"http://localhost:{PEERS[LEADER_ID]}"}
    return FileResponse(DASH / "index.html")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(DASH / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(DASH / "sw.js", media_type="text/javascript")


@app.get("/icon-{size}.png")
def icon_png(size: int):
    if size not in (180, 192, 512):
        raise HTTPException(404, "not found")
    return FileResponse(DASH / f"icon-{size}.png", media_type="image/png")


@app.get("/icon.svg")
def icon():
    return FileResponse(DASH / "icon.svg", media_type="image/svg+xml")


@app.get("/vendor/sign.js")
def vendor_sign():
    return FileResponse(DASH / "vendor" / "sign.js", media_type="text/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")

"""
BlockExDSE edge node (FastAPI).

Run three of them:  NODE_ID=1 PORT=9001 / NODE_ID=2 PORT=9002 / NODE_ID=3 PORT=9003
Node 1 is the gateway/leader: it serves the dashboard, receives orders, runs the PBFT-lite
vote against nodes 2 and 3, applies RACD (risk-adaptive consensus depth), then submits to the
chain, matches, settles and anchors the SHA-256 record hash. Nodes 2 and 3 validate and vote.
"""
import hashlib
import json
import os
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from contract_client import ContractClient

NODE_ID = int(os.getenv("NODE_ID", "1"))
PORT = int(os.getenv("PORT", str(9000 + NODE_ID)))
LEADER_ID = 1
IS_LEADER = NODE_ID == LEADER_ID
PEERS = {1: 9001, 2: 9002, 3: 9003}
DEMO_DELAY = float(os.getenv("DEMO_DELAY", "0.35"))   # purely visual pause between stages; set 0 for benchmarks
PRICE_BAND = 0.20                                      # +/-20% circuit-breaker vs reference price
ROOT = Path(__file__).resolve().parent.parent

_KEY = hashlib.sha256(f"blockexdse-edge-{NODE_ID}".encode()).hexdigest()
ACCOUNT = Account.from_key(_KEY)
STATE = {"faulty": False, "votes_cast": 0, "orders_seen": 0}

client = ContractClient()
DEP = client.dep
TICKERS: dict = DEP["tickers"]
TRADERS = {t["address"].lower(): t["name"] for t in DEP["traders"]}
EDGE_ADDR = DEP["edge_nodes"]                           # node id (str) -> expected signer address

app = FastAPI(title=f"BlockExDSE edge node {NODE_ID}")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ───────────────────────── storage (MongoDB if reachable, else memory) ─────────────────────────
class Storage:
    def __init__(self):
        self.mem = {}
        self.col = None
        self.mode = "memory"
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


# ───────────────────────── validation + hashing (runs on EVERY node) ─────────────────────────
def validate(o: dict):
    if str(o.get("trader", "")).lower() not in TRADERS:
        return False, "participant not KYC-registered"
    if o.get("ticker") not in TICKERS:
        return False, "unknown ticker"
    if o.get("side") not in ("BUY", "SELL"):
        return False, "side must be BUY or SELL"
    try:
        qty, price = int(o["qty"]), int(o["price"])
    except Exception:
        return False, "qty/price must be integers"
    if qty <= 0:
        return False, "quantity must be > 0"
    if price <= 0:
        return False, "price must be > 0"
    ref = TICKERS[o["ticker"]]
    if abs(price - ref) / ref > PRICE_BAND:
        return False, f"price outside ±{int(PRICE_BAND*100)}% band of reference {ref}"
    return True, "ok"


def canonical(batch: dict) -> str:
    orders = [{"trader": o["trader"].lower(), "ticker": o["ticker"], "qty": int(o["qty"]),
               "price": int(o["price"]), "side": o["side"]} for o in batch["orders"]]
    return json.dumps({"batch_id": batch["batch_id"], "ts": batch["ts"], "orders": orders},
                      sort_keys=True, separators=(",", ":"))


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def cast_vote(batch: dict) -> dict:
    """Independent check + signed hash. A 'faulty' node returns a corrupted hash (Byzantine demo)."""
    verdicts = [validate(o) for o in batch["orders"]]
    verdict = "accept" if all(v[0] for v in verdicts) else "reject"
    h = sha256_hex(canonical(batch))
    if STATE["faulty"]:
        h = sha256_hex(str(random.random()))
    sig = ACCOUNT.sign_message(encode_defunct(text=f"{h}|{verdict}")).signature.hex()
    STATE["votes_cast"] += 1
    return {"node": NODE_ID, "verdict": verdict, "hash": h, "signature": sig if sig.startswith("0x") else "0x" + sig,
            "reason": next((v[1] for v in verdicts if not v[0]), "ok")}


# ───────────────────────── RACD: risk-adaptive consensus depth ─────────────────────────
def racd(o: dict):
    notional = int(o["qty"]) * int(o["price"])
    dev = abs(int(o["price"]) - TICKERS[o["ticker"]]) / TICKERS[o["ticker"]]
    score = 0.5 * min(notional / 500_000, 1) + 0.5 * min(dev / 0.10, 1)
    escalated = score >= 0.5
    return {"score": round(score, 3), "level": "ESCALATED" if escalated else "STANDARD",
            "required": 3 if escalated else 2, "notional": notional, "deviation": round(dev, 4)}


# ───────────────────────── follower endpoints ─────────────────────────
class Batch(BaseModel):
    batch_id: str
    ts: int
    orders: list[dict]


@app.post("/vote")
def vote(b: Batch):
    return cast_vote(b.model_dump())


@app.get("/health")
def health():
    return {"node": NODE_ID, "port": PORT, "address": ACCOUNT.address, "faulty": STATE["faulty"],
            "votes_cast": STATE["votes_cast"], "leader": IS_LEADER}


@app.post("/fault/{on}")
def fault(on: str):
    STATE["faulty"] = on.lower() in ("on", "true", "1")
    return {"node": NODE_ID, "faulty": STATE["faulty"]}


# ───────────────────────── leader: pipeline ─────────────────────────
POOL = ThreadPoolExecutor(max_workers=8)
PIPE_LOCK = threading.Lock()
ORDERS: dict = {}
SEQ = {"n": 0}
BOOK = {"BUY": [], "SELL": []}   # resting orders: dicts with local id, chain_id, trader, ticker, price, remaining


def now_ms():
    return int(time.time() * 1000)


def stage(rec, name):
    rec["stages"][name] = now_ms()
    rec["status"] = name
    STORE.save(rec)
    if DEMO_DELAY:
        time.sleep(DEMO_DELAY)


def ask_peer(pid, batch):
    try:
        r = httpx.post(f"http://127.0.0.1:{PEERS[pid]}/vote", json=batch, timeout=3.0)
        r.raise_for_status()
        return pid, r.json()
    except Exception as e:
        return pid, {"node": pid, "verdict": "no-response", "hash": "", "signature": "", "reason": type(e).__name__}


def propose_batch(batch: dict, required: int):
    """PBFT-lite: collect signed hashes from all nodes; accept if >= required match the leader's hash."""
    leader_vote = cast_vote(batch)
    futs = [POOL.submit(ask_peer, pid, batch) for pid in PEERS if pid != NODE_ID]
    votes = [leader_vote] + [f.result()[1] for f in futs]
    my_hash = leader_vote["hash"]
    detail, agree = [], 0
    for v in votes:
        ok = False
        if v["verdict"] == "accept" and v["hash"] == my_hash and v["signature"]:
            try:
                signer = Account.recover_message(encode_defunct(text=f"{v['hash']}|{v['verdict']}"), signature=v["signature"])
                ok = signer.lower() == EDGE_ADDR[str(v["node"])].lower()
            except Exception:
                ok = False
        agree += ok
        detail.append({"node": v["node"], "verdict": v["verdict"], "agree": ok, "reason": v.get("reason", "")})
    return agree >= required, agree, sorted(detail, key=lambda d: d["node"])


def record_hash(trade: dict) -> str:
    return sha256_hex(json.dumps(trade, sort_keys=True, separators=(",", ":")))


def try_match(rec):
    """Match the newly placed on-chain order against crossing resting orders (price-time priority)."""
    me_side = rec["side"]
    opp = "SELL" if me_side == "BUY" else "BUY"
    mine = {"id": rec["id"], "chain_id": rec["chain_id"], "trader": rec["trader"], "ticker": rec["ticker"],
            "price": rec["price"], "remaining": rec["qty"]}

    def crosses(o):
        if o["ticker"] != rec["ticker"] or o["trader"].lower() == rec["trader"].lower():
            return False
        return o["price"] <= rec["price"] if me_side == "BUY" else o["price"] >= rec["price"]

    cands = [o for o in BOOK[opp] if crosses(o) and o["remaining"] > 0]
    cands.sort(key=lambda o: (o["price"] if me_side == "BUY" else -o["price"], o["chain_id"]))
    for o in cands:
        if mine["remaining"] <= 0:
            break
        buy, sell = (mine, o) if me_side == "BUY" else (o, mine)
        t0 = time.perf_counter()
        try:
            m = client.match(buy["chain_id"], sell["chain_id"])
        except Exception as e:
            rec["notes"].append(f"match with {o['id']} skipped: {e}")
            continue
        qty, price = m["qty"], m["price"]
        mine["remaining"] -= qty
        o["remaining"] -= qty
        trade = {"trade_id": m["trade_id"], "buy_order": buy["id"], "sell_order": sell["id"], "ticker": rec["ticker"],
                 "qty": qty, "price": price, "buyer": TRADERS[buy["trader"].lower()],
                 "seller": TRADERS[sell["trader"].lower()], "tx": m["tx"], "block": m["block"]}
        h = record_hash(trade)
        a = client.anchor(m["trade_id"], h)
        trade.update(gas=m["gas"], anchor_tx=a["tx"], anchor_gas=a["gas"], record_hash=h,
                     chain_ms=round((time.perf_counter() - t0) * 1000, 1))
        rec["trades"].append(trade)
        rec["gas_total"] += m["gas"] + a["gas"]
        # counterparty bookkeeping
        other = ORDERS.get(o["id"])
        if other:
            other["trades"].append(trade)
            other["filled"] += qty
            other["status"] = "settled" if o["remaining"] == 0 else "partial"
            STORE.save(other)
    BOOK[opp] = [o for o in BOOK[opp] if o["remaining"] > 0]
    rec["filled"] = rec["qty"] - mine["remaining"]
    if mine["remaining"] > 0:
        BOOK[me_side].append(mine)


def run_pipeline(rec):
    with PIPE_LOCK:
        t_start = time.perf_counter()
        try:
            o = {k: rec[k] for k in ("trader", "ticker", "qty", "price", "side")}
            # stage 2: edge validation
            t0 = time.perf_counter()
            ok, why = validate(o)
            rec["edge_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            if not ok:
                rec["error"] = why
                return stage(rec, "rejected")
            stage(rec, "edge_validated")

            # stage 3: RACD + PBFT-lite consensus
            t0 = time.perf_counter()
            rec["risk"] = racd(o)
            batch = {"batch_id": rec["id"], "ts": rec["ts"], "orders": [o]}
            passed, agree, detail = propose_batch(batch, rec["risk"]["required"])
            rec["votes"] = {"agree": agree, "required": rec["risk"]["required"], "detail": detail}
            rec["consensus_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            rec["batch_hash"] = sha256_hex(canonical(batch))
            if not passed:
                rec["error"] = f"consensus failed: {agree}/{rec['risk']['required']} votes"
                return stage(rec, "rejected")
            stage(rec, "consensus")

            # stage 4: on-chain placement + matching
            t0 = time.perf_counter()
            r = client.place_order(rec["trader"], rec["ticker"], rec["qty"], rec["price"], rec["side"],
                                   rec["batch_hash"], agree, rec["risk"]["required"])
            rec.update(chain_id=r["chain_id"], place_tx=r["tx"], place_block=r["block"])
            rec["gas_total"] += r["gas"]
            try_match(rec)
            rec["chain_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            if rec["trades"]:
                stage(rec, "matched")
            if rec["filled"] == rec["qty"]:
                stage(rec, "settled")
            else:
                rec["status"] = "partial" if rec["filled"] else "open"
                STORE.save(rec)
        except Exception as e:  # keep the pipeline alive on any failure
            rec["error"] = str(e)[:200]
            rec["status"] = "rejected"
            STORE.save(rec)
        finally:
            rec["total_ms"] = round((time.perf_counter() - t_start) * 1000 - DEMO_DELAY * 1000 * len(rec["stages"]), 1)
            STORE.save(rec)


class OrderIn(BaseModel):
    trader: str
    ticker: str
    qty: int
    price: int
    side: str


def _leader_only():
    if not IS_LEADER:
        raise HTTPException(400, f"node {NODE_ID} is a validator; use the gateway on port {PEERS[LEADER_ID]}")


@app.post("/api/order")
def submit_order(o: OrderIn):
    _leader_only()
    SEQ["n"] += 1
    rec = {"id": f"ORD-{SEQ['n']:04d}", "ts": now_ms(), "trader": o.trader, "trader_name": TRADERS.get(o.trader.lower(), "?"),
           "ticker": o.ticker, "qty": o.qty, "price": o.price, "side": o.side.upper(), "status": "submitted",
           "stages": {"submitted": now_ms()}, "trades": [], "filled": 0, "gas_total": 0, "notes": []}
    ORDERS[rec["id"]] = rec
    STORE.save(rec)
    STATE["orders_seen"] += 1
    threading.Thread(target=run_pipeline, args=(rec,), daemon=True).start()
    return {"id": rec["id"]}


@app.get("/api/orders")
def list_orders():
    _leader_only()
    return sorted(ORDERS.values(), key=lambda r: r["id"], reverse=True)[:50]


@app.get("/api/orders/{oid}")
def get_order(oid: str):
    _leader_only()
    if oid not in ORDERS:
        raise HTTPException(404, "unknown order")
    return ORDERS[oid]


@app.get("/api/info")
def info():
    _leader_only()
    return {"traders": DEP["traders"], "tickers": TICKERS, "contract": DEP["address"], "storage": STORE.mode,
            "chain": client.counts(), "price_band": PRICE_BAND}


@app.get("/api/balances")
def balances():
    _leader_only()
    return [{"name": t["name"], "address": t["address"], **client.balance(t["address"], list(TICKERS))} for t in DEP["traders"]]


@app.get("/api/book")
def book():
    _leader_only()
    return {s: sorted(BOOK[s], key=lambda o: (o["price"], o["chain_id"])) for s in BOOK}


@app.get("/api/nodes")
def nodes():
    _leader_only()
    out = []
    for pid, port in PEERS.items():
        try:
            t0 = time.perf_counter()
            h = httpx.get(f"http://127.0.0.1:{port}/health", timeout=1.5).json()
            out.append({**h, "up": True, "ping_ms": round((time.perf_counter() - t0) * 1000, 1)})
        except Exception:
            out.append({"node": pid, "port": port, "up": False})
    return out


@app.post("/api/fault/{pid}/{on}")
def set_fault(pid: int, on: str):
    _leader_only()
    if pid == NODE_ID:
        STATE["faulty"] = on.lower() in ("on", "true", "1")
        return {"node": pid, "faulty": STATE["faulty"]}
    return httpx.post(f"http://127.0.0.1:{PEERS[pid]}/fault/{on}", timeout=2).json()


@app.get("/")
def dashboard():
    if not IS_LEADER:
        return {"node": NODE_ID, "role": "validator", "gateway": f"http://localhost:{PEERS[LEADER_ID]}"}
    return FileResponse(ROOT / "dashboard" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

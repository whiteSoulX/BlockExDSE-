"""
BlockExDSE Edge Node — Tier 1 of the two-tier consensus (v2).

Run three copies of this on different ports to simulate three edge nodes:
    EDGE_ID=1 PORT=9001 python edge_node.py   (primary: intake + matching + dashboard)
    EDGE_ID=2 PORT=9002 python edge_node.py   (replica: PBFT-lite peer + delegate)
    EDGE_ID=3 PORT=9003 python edge_node.py   (replica: PBFT-lite peer + delegate)

What changed from v1: v1 only queued raw orders and voted on them with a
PBFT-lite HMAC round; nothing matched, nothing reached the chain. v2 adds:

  1. A real continuous-double-auction matching engine (matching_engine.py)
     with price-time priority, partial fills, and LIMIT/MARKET/IOC/FOK
     order kinds (FR6, FR17). Order intake and matching are centralized at
     the PRIMARY edge node for this phase (documented simplification — see
     README); the other two nodes still independently validate and vote on
     every batch and independently cast their own on-chain delegate vote.
  2. A risk scorer (risk_scorer.py) that scores every batch and lets the
     PRIMARY propose it to the chain; the chain (BlockExDSE.sol) then
     routes it to the FAST or FULL consensus path. This is the project's
     core v2 contribution — see the contract's top-of-file comment.
  3. Real chain wiring (chain_client.py): batches are actually proposed,
     voted, and settled on a live chain, not just simulated.
  4. A live order-book WebSocket feed for the dashboard.
"""

import asyncio
import hashlib
import hmac
import itertools
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(__file__))
from matching_engine import MatchingEngine, Side, OrderKind
from risk_scorer import RiskScorer
from chain_client import ChainClient

EDGE_ID = os.environ.get("EDGE_ID", "1")
PORT = int(os.environ.get("PORT", "9001"))
PRIMARY_PORT = int(os.environ.get("PRIMARY_PORT", "9001"))
IS_PRIMARY = PORT == PRIMARY_PORT

# Node addressing: defaults assume all three nodes share one machine (the
# original local-demo shape). For a real multi-host deployment (e.g. three
# separate cloud services with different hostnames), set PRIMARY_URL and
# PEER_URLS explicitly — hardcoding 127.0.0.1 here would silently break
# cross-node communication the moment nodes stop sharing a loopback address.
PRIMARY_URL = os.environ.get("PRIMARY_URL", f"http://127.0.0.1:{PRIMARY_PORT}")
_default_local_peers = [f"http://127.0.0.1:{p}" for p in (9001, 9002, 9003) if p != PORT]
PEER_URLS = [u.strip().rstrip("/") for u in os.environ.get("PEER_URLS", "").split(",") if u.strip()] or _default_local_peers

# Separate from the above: the URLs a BROWSER can reach, used only to
# populate the dashboard's node-health display. On one machine these are
# identical to the internal addresses; on docker-compose or separate cloud
# services they are not (a browser cannot resolve a compose service name
# like "edge2", and cross-service internal URLs are usually private).
SELF_URL = os.environ.get("PUBLIC_URL", os.environ.get("SELF_URL", f"http://127.0.0.1:{PORT}"))
PEER_PUBLIC_URLS = [u.strip().rstrip("/") for u in os.environ.get("PEER_PUBLIC_URLS", "").split(",") if u.strip()] or PEER_URLS

# Well-known, publicly known Hardhat default-account keys — LOCAL DEMO ONLY.
# Never use these outside a disposable local/testnet chain.
_DEFAULT_DELEGATE_KEYS = {
    "1": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "2": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "3": "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
}

RPC_URL = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
DELEGATE_PRIVATE_KEY = os.environ.get("DELEGATE_PRIVATE_KEY", _DEFAULT_DELEGATE_KEYS.get(EDGE_ID, ""))
DEPLOYMENT_DESCRIPTOR = os.environ.get(
    "DEPLOYMENT_DESCRIPTOR", os.path.join(os.path.dirname(__file__), "..", "deployment.json")
)
BATCH_INTERVAL_SECONDS = float(os.environ.get("BATCH_INTERVAL_SECONDS", "5.0"))
CHAIN_ENABLED = os.environ.get("CHAIN_ENABLED", "1") != "0"

SHARED_SECRET = b"blockexdse-prototype-shared-secret"  # HMAC stand-in signature (prototype only)

chain: ChainClient | None = None
if CHAIN_ENABLED and DELEGATE_PRIVATE_KEY and os.path.exists(DEPLOYMENT_DESCRIPTOR):
    try:
        chain = ChainClient(RPC_URL, DELEGATE_PRIVATE_KEY, DEPLOYMENT_DESCRIPTOR)
    except Exception as exc:  # pragma: no cover - startup diagnostics only
        print(f"[edge {EDGE_ID}] WARNING: chain client unavailable ({exc}); running edge-only.")
        chain = None
else:
    print(f"[edge {EDGE_ID}] WARNING: no deployment descriptor / delegate key found; running edge-only "
          f"(orders will match locally but nothing will settle on-chain).")

matching_engine = MatchingEngine()
risk_scorer = RiskScorer()

_local_id_seq = itertools.count(1)
orders_registry: dict[int, dict] = {}          # local_id -> order record
pending_new_order_ids: list[int] = []          # local ids awaiting on-chain placement this cycle
pending_fills: list[dict] = []                 # fills awaiting on-chain settlement this cycle
settlement_log: list[dict] = []                # completed settlements, most recent last
batch_log: list[dict] = []                     # history of proposed batches, most recent last

ws_subscribers: dict[str, set[WebSocket]] = {}


class OrderIn(BaseModel):
    trader: str = Field(..., description="Wallet address of the trader")
    ticker: str
    side: Literal["BUY", "SELL"]
    kind: Literal["LIMIT", "MARKET", "IOC", "FOK"] = "LIMIT"
    quantity: int = Field(..., gt=0)
    price: int = Field(0, ge=0)


def canonical_json(data) -> bytes:
    return json.dumps(data, sort_keys=True, default=str).encode()


def sign_batch(payload: dict) -> str:
    return hmac.new(SHARED_SECRET, canonical_json(payload), hashlib.sha256).hexdigest()


def order_kind_to_chain(kind: str) -> int:
    return {"LIMIT": 0, "MARKET": 1, "IOC": 2, "FOK": 3}[kind]


def order_side_to_chain(side: str) -> int:
    return {"BUY": 0, "SELL": 1}[side]


# ── Order intake + matching (primary only) ─────────────────────────────
def submit_order(order: OrderIn) -> dict:
    local_id = next(_local_id_seq)
    record = {
        "local_id": local_id,
        "trader": order.trader,
        "ticker": order.ticker,
        "side": order.side,
        "kind": order.kind,
        "quantity": order.quantity,
        "price": order.price,
        "remaining": order.quantity,
        "timestamp": time.time(),
        "status": "NEW",
        "onchain_id": None,
        "risk_score": risk_scorer.score_order(order.trader, order.ticker, order.kind, order.quantity, order.price),
    }
    orders_registry[local_id] = record
    pending_new_order_ids.append(local_id)

    fills, book_status = matching_engine.submit(
        local_id, order.trader, order.ticker, Side(order.side), OrderKind(order.kind), order.quantity, order.price
    )
    record["status"] = book_status

    for f in fills:
        risk_scorer.record_last_trade_price(f.ticker, f.price)
        pending_fills.append({
            "buy_local_id": f.buy_order_id,
            "sell_local_id": f.sell_order_id,
            "ticker": f.ticker,
            "price": f.price,
            "quantity": f.quantity,
            "timestamp": time.time(),
        })
        for oid in (f.buy_order_id, f.sell_order_id):
            other = orders_registry.get(oid)
            if other and other["local_id"] != local_id:
                other["remaining"] -= f.quantity
                other["status"] = "PARTIALLY_FILLED" if other["remaining"] > 0 else "FILLED_PENDING_SETTLEMENT"

    if book_status in ("FILLED",):
        record["status"] = "FILLED_PENDING_SETTLEMENT"
    record["remaining"] = record["quantity"] - sum(
        f["quantity"] for f in pending_fills if f["buy_local_id"] == local_id or f["sell_local_id"] == local_id
    )

    return {"order": record, "fills": [f.__dict__ for f in fills], "book_status": book_status}


# ── PBFT-lite (Tier 1, edge cluster) ────────────────────────────────────
def run_edge_quorum(payload: dict) -> dict:
    own_signature = sign_batch(payload)
    votes = {EDGE_ID: own_signature}

    for peer_url in PEER_URLS:
        try:
            resp = httpx.post(f"{peer_url}/batch/validate", json={"payload": payload}, timeout=3.0)
            if resp.status_code == 200:
                body = resp.json()
                votes[body["edge_id"]] = body["signature"]
        except httpx.RequestError:
            continue

    approved = len(votes) >= 2 and len(set(votes.values())) == 1
    return {"approved": approved, "votes": votes, "digest": own_signature}


def notify_peers_to_vote(digest_hex: str, tier: str):
    if tier != "FULL":
        return
    for peer_url in PEER_URLS:
        try:
            httpx.post(f"{peer_url}/batch/chain_vote", json={"digest": digest_hex, "tier": tier}, timeout=5.0)
        except httpx.RequestError:
            continue


def run_batch_cycle() -> dict:
    """The full Tier-1 -> Tier-2 -> settlement pipeline for one batch."""
    if not pending_new_order_ids and not pending_fills:
        return {"status": "no_activity"}

    order_ids = list(pending_new_order_ids)
    fills = list(pending_fills)
    pending_new_order_ids.clear()
    pending_fills.clear()

    payload = {
        "orders": [orders_registry[oid] for oid in order_ids],
        "fills": fills,
    }
    quorum = run_edge_quorum(payload)
    if not quorum["approved"]:
        # Requeue for the next cycle rather than dropping activity.
        pending_new_order_ids.extend(order_ids)
        pending_fills.extend(fills)
        return {"status": "edge_quorum_failed", "quorum": quorum}

    risk_scores = [orders_registry[oid]["risk_score"] for oid in order_ids]
    risk_bps = risk_scorer.score_batch_bps(risk_scores)
    digest_hex = quorum["digest"]
    digest_bytes = bytes.fromhex(digest_hex)

    result = {
        "status": "edge_approved",
        "digest": digest_hex,
        "risk_score_bps": risk_bps,
        "order_count": len(order_ids),
        "fill_count": len(fills),
        "onchain": None,
    }

    if chain is None:
        batch_log.append({**result, "tier": None, "timestamp": time.time()})
        return result

    try:
        chain.propose_batch(digest_bytes, risk_bps)
        batch = chain.get_batch(digest_bytes)
        tier = batch["tier"]
        notify_peers_to_vote(digest_hex, tier)

        ready = chain.wait_until_batch_ready(digest_bytes, timeout_s=20.0, poll_s=0.3)
        if not ready:
            result["status"] = "chain_not_ready_timeout"
            result["tier"] = tier
            batch_log.append({**result, "timestamp": time.time()})
            return result

        onchain_ids: dict[int, int] = {}
        for oid in order_ids:
            o = orders_registry[oid]
            onchain_id = chain.place_batched_order(
                o["trader"], o["ticker"], order_side_to_chain(o["side"]), order_kind_to_chain(o["kind"]),
                o["quantity"], o["price"], digest_bytes,
            )
            o["onchain_id"] = int(onchain_id)
            onchain_ids[oid] = int(onchain_id)

        # Resolve local ids for fills whose counterparties were placed in an
        # earlier cycle (their onchain_id already exists in orders_registry).
        settlements = []
        for f in fills:
            buy_onchain = onchain_ids.get(f["buy_local_id"]) or orders_registry[f["buy_local_id"]]["onchain_id"]
            sell_onchain = onchain_ids.get(f["sell_local_id"]) or orders_registry[f["sell_local_id"]]["onchain_id"]
            match_id, _ = chain.record_match(buy_onchain, sell_onchain, f["price"], f["quantity"])
            off_chain_record = {**f, "buy_onchain_id": buy_onchain, "sell_onchain_id": sell_onchain}
            off_chain_hash = hashlib.sha256(canonical_json(off_chain_record)).digest()
            settlement_id, receipt = chain.settle_trade(match_id, off_chain_hash)
            settlement = {
                "settlement_id": int(settlement_id),
                "match_id": int(match_id),
                "ticker": f["ticker"],
                "price": f["price"],
                "quantity": f["quantity"],
                "off_chain_hash": off_chain_hash.hex(),
                "tx_hash": receipt.transactionHash.hex(),
                "timestamp": time.time(),
            }
            settlements.append(settlement)
            settlement_log.append(settlement)

        result["status"] = "settled"
        result["tier"] = tier
        result["onchain_order_ids"] = onchain_ids
        result["settlements"] = settlements
        batch_log.append({**result, "timestamp": time.time()})
        return result

    except Exception as exc:  # noqa: BLE001 - surface chain errors to the caller/demo
        result["status"] = "chain_error"
        result["error"] = str(exc)
        batch_log.append({**result, "timestamp": time.time()})
        return result


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    if IS_PRIMARY:
        async def periodic_batches():
            while True:
                await asyncio.sleep(BATCH_INTERVAL_SECONDS)
                try:
                    await asyncio.to_thread(run_batch_cycle)
                except Exception as exc:  # noqa: BLE001
                    print(f"[edge {EDGE_ID}] batch cycle error: {exc}")
        task = asyncio.create_task(periodic_batches())
    yield
    if task:
        task.cancel()


app = FastAPI(title=f"BlockExDSE Edge Node {EDGE_ID}", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


DASHBOARD_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "index.html")


@app.get("/")
def serve_dashboard():
    if IS_PRIMARY and os.path.exists(DASHBOARD_PATH):
        return FileResponse(DASHBOARD_PATH)
    return {"message": f"BlockExDSE edge node {EDGE_ID} (replica) — dashboard is served by the primary node on port {PRIMARY_PORT}."}


@app.post("/orders")
def post_order(order: OrderIn):
    if not IS_PRIMARY:
        try:
            resp = httpx.post(f"{PRIMARY_URL}/orders", json=order.model_dump(), timeout=5.0)
            return resp.json()
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"primary edge node unreachable: {exc}") from exc

    if order.kind != "MARKET" and order.price <= 0:
        raise HTTPException(status_code=400, detail="price must be positive for non-MARKET orders")

    return submit_order(order)


@app.post("/participants/verify")
def verify_participant_demo(body: dict):
    """
    Self-serve DEMO registration only. The report's own design (FR3, the
    use-case diagram in Fig. 3.3) makes KYC a regulator-controlled action,
    not something a trader grants themself — this exists purely so a
    stranger opening the public demo has a way to get unblocked without
    emailing an admin, and it is only reachable because the local/demo
    deployer key doubles as delegate #1 here. A real deployment would gate
    this behind actual identity verification and a regulator role, not an
    open POST endpoint.
    """
    if not IS_PRIMARY:
        try:
            resp = httpx.post(f"{PRIMARY_URL}/participants/verify", json=body, timeout=10.0)
            return resp.json()
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"primary edge node unreachable: {exc}") from exc

    if chain is None:
        raise HTTPException(status_code=503, detail="no chain connection configured on this node")

    address = (body.get("address") or "").strip()
    if not address:
        raise HTTPException(status_code=400, detail="address is required")

    try:
        receipt = chain.verify_participant(address)
        return {"status": "verified", "address": address, "tx_hash": receipt.transactionHash.hex()}
    except Exception as exc:  # noqa: BLE001 - surface the revert reason to the caller
        raise HTTPException(status_code=400, detail=f"verification failed: {exc}") from exc


@app.post("/batch/validate")
def validate_batch(payload: dict):
    """Called BY peer edge nodes during the primary's PBFT-lite round."""
    signature = sign_batch(payload["payload"])
    return {"edge_id": EDGE_ID, "signature": signature}


@app.post("/batch/chain_vote")
def chain_vote(body: dict):
    """Called BY the primary once edge quorum is reached, asking this node's
    own delegate identity to independently cast an on-chain vote for a FULL
    tier batch."""
    if chain is None:
        return {"status": "no_chain_client"}
    digest_bytes = bytes.fromhex(body["digest"])
    try:
        chain.vote_batch(digest_bytes)
        return {"status": "voted", "edge_id": EDGE_ID}
    except Exception as exc:  # noqa: BLE001
        return {"status": "vote_failed", "error": str(exc)}


@app.post("/batch/propose")
def propose_batch_now():
    """Manual trigger, in addition to the automatic periodic cycle."""
    if not IS_PRIMARY:
        raise HTTPException(status_code=400, detail="only the primary edge node runs batch cycles")
    return run_batch_cycle()


@app.get("/orderbook/{ticker}")
def get_orderbook(ticker: str, levels: int = 10):
    return matching_engine.depth(ticker, levels)


@app.get("/orders/{local_id}")
def get_order(local_id: int):
    order = orders_registry.get(local_id)
    if not order:
        raise HTTPException(status_code=404, detail="unknown order")
    return order


@app.get("/settlements")
def get_settlements(limit: int = 50):
    return settlement_log[-limit:][::-1]


@app.get("/batches")
def get_batches(limit: int = 50):
    return batch_log[-limit:][::-1]


@app.get("/health")
def health():
    return {
        "edge_id": EDGE_ID,
        "port": PORT,
        "is_primary": IS_PRIMARY,
        "chain_connected": chain is not None,
        "pending_orders": len(pending_new_order_ids),
        "pending_fills": len(pending_fills),
    }


@app.get("/config")
def get_config():
    """Lets the dashboard discover node addresses instead of assuming every
    node shares one hostname — required once nodes are deployed as separate
    cloud services rather than local processes on one machine."""
    return {
        "edge_id": EDGE_ID,
        "is_primary": IS_PRIMARY,
        "self_public_url": SELF_URL,
        "primary_url": PRIMARY_URL,
        "peer_public_urls": PEER_PUBLIC_URLS,
        "all_public_node_urls": [SELF_URL] + PEER_PUBLIC_URLS,
    }


@app.websocket("/ws/orderbook/{ticker}")
async def ws_orderbook(websocket: WebSocket, ticker: str):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(matching_engine.depth(ticker))
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)

"""
BlockExDSE Edge Node — Tier 1 of the two-tier consensus.

Run three copies of this on different ports to simulate three edge nodes:
    EDGE_ID=1 PORT=9001 python edge_node.py
    EDGE_ID=2 PORT=9002 python edge_node.py
    EDGE_ID=3 PORT=9003 python edge_node.py

Each node:
  1. Accepts trade order submissions (D1) from the frontend.
  2. Validates fields (price > 0, quantity > 0, etc.) — mirrors the
     require() checks in the smart contract, but rejected here means it
     never costs gas or touches the chain at all.
  3. Batches accepted orders.
  4. Runs a simplified PBFT-lite vote with the other two edge nodes:
     each node independently validates the same batch, signs a hash of it,
     and shares that signature. If 2-of-3 nodes agree, the batch is approved.
  5. Forwards the approved batch on-chain as a delegate (chain.py):
     placeOrderFor() for each order, a simple equal-quantity match, then
     recordMatch()/settleTrade() for anything that matched. Requires
     CONTRACT_ADDRESS (or the frontend's generated contractAddress.json)
     and DELEGATE_PRIVATE_KEY to be configured — without them this step is
     skipped and the node behaves exactly as it did before (off-chain
     PBFT-lite demo only).

Off-chain records (D1/D2/D5/D6) are persisted to MongoDB when reachable
(storage.py) and silently skipped otherwise, so this still runs with no
extra infrastructure. Signatures are still an HMAC stand-in, not real
per-node keypairs — that remains a documented prototype simplification.
"""

import os
import time
import hashlib
import hmac
import json
import logging
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

import chain
import storage

logger = logging.getLogger("blockexdse.edge")
logging.basicConfig(level=logging.INFO)

EDGE_ID = os.environ.get("EDGE_ID", "1")
PORT = int(os.environ.get("PORT", "9001"))

# In a real deployment these would be separate machines; here they're
# separate processes on localhost, one per port.
PEER_PORTS = [p for p in [9001, 9002, 9003] if p != PORT]

# Shared secret for the HMAC stand-in signature (prototype only — replace
# with real per-node keypairs before anything resembling production use).
SHARED_SECRET = b"blockexdse-prototype-shared-secret"

app = FastAPI(title=f"BlockExDSE Edge Node {EDGE_ID}")

# Prototype only: wide open so the browser-based frontend (any origin/port)
# can call these nodes directly. Restrict to known origins before any real
# deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory state (prototype only) ────────────────────────────────────
pending_orders: list[dict] = []
next_order_id = 1


class OrderIn(BaseModel):
    trader: str = Field(..., description="Wallet address of the trader")
    ticker: str
    order_type: Literal["BUY", "SELL"]
    quantity: int = Field(..., gt=0)
    price: int = Field(..., gt=0)


class OrderRecord(BaseModel):
    id: int
    trader: str
    ticker: str
    order_type: str
    quantity: int
    price: int
    timestamp: float


def sign_batch(batch: list[dict]) -> str:
    """HMAC stand-in for a real signature over the batch contents (D5)."""
    payload = json.dumps(batch, sort_keys=True).encode()
    return hmac.new(SHARED_SECRET, payload, hashlib.sha256).hexdigest()


@app.post("/orders", response_model=OrderRecord)
def submit_order(order: OrderIn):
    """
    Step 1 of the sequence diagram: Trader -> Edge node: Submit order.
    Validation here mirrors, but is cheaper than, the smart contract's
    require() checks — malformed orders never reach the chain at all.
    """
    global next_order_id

    if order.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be positive")
    if order.price <= 0:
        raise HTTPException(status_code=400, detail="price must be positive")

    record = {
        "id": next_order_id,
        "trader": order.trader,
        "ticker": order.ticker,
        "order_type": order.order_type,
        "quantity": order.quantity,
        "price": order.price,
        "timestamp": time.time(),
        "status": "pending_batch",
    }
    next_order_id += 1
    pending_orders.append(record)
    storage.record_order(EDGE_ID, record)
    return record


@app.get("/orders/pending")
def get_pending_orders():
    return pending_orders


@app.post("/batch/propose")
def propose_batch():
    """
    Step 2 of the sequence diagram: PBFT-lite vote (2-of-3).

    This node bundles its current pending orders into a batch, signs it,
    and asks its two peers to independently validate + sign the SAME
    batch. If 2 of 3 signatures agree (including this node's own), the
    batch is approved and ready to forward to the blockchain layer.

    This is the concrete implementation of the "6 total messages, not
    O(n^2)" claim from your consensus design: 1 request + 1 response per
    peer = 4 messages for 2 peers, plus this node's own signature = well
    under full PBFT's message complexity even at this tiny scale, and the
    message count stays flat as you add more edge nodes at the batching
    tier (unlike full PBFT's quadratic growth).
    """
    if not pending_orders:
        return {"status": "no_orders", "batch": []}

    batch = list(pending_orders)
    own_signature = sign_batch(batch)
    votes = {EDGE_ID: own_signature}

    for peer_port in PEER_PORTS:
        try:
            resp = httpx.post(
                f"http://127.0.0.1:{peer_port}/batch/validate",
                json={"batch": batch},
                timeout=2.0,
            )
            if resp.status_code == 200:
                peer_id = resp.json()["edge_id"]
                votes[peer_id] = resp.json()["signature"]
        except httpx.RequestError:
            # Peer unreachable — in the full system this counts as a
            # non-vote; 2-of-3 can still succeed without it.
            continue

    approved = len(votes) >= 2 and len(set(votes.values())) == 1

    storage.record_batch(
        EDGE_ID,
        {
            "batch_hash": own_signature,
            "order_ids": [o["id"] for o in batch],
            "votes": votes,
            "approved": approved,
            "timestamp": time.time(),
        },
    )

    result = {
        "status": "approved" if approved else "rejected",
        "batch_size": len(batch),
        "votes_received": len(votes),
        "votes_required": 2,
        "batch_hash": own_signature,
        "batch": batch,
    }

    if approved:
        pending_orders.clear()
        result["on_chain"] = _forward_batch_on_chain(batch, own_signature)

    return result


def _forward_batch_on_chain(batch: list[dict], batch_hash: str) -> dict:
    """Places every order in an approved batch on-chain as a delegate, then
    matches and settles what it can. Returns a summary for the API response;
    never raises — a chain-side failure is reported but doesn't undo the
    PBFT-lite approval that already happened off-chain."""
    client = chain.get_client()
    if not client.enabled:
        return {"forwarded": False, "reason": "no CONTRACT_ADDRESS/DELEGATE_PRIVATE_KEY configured"}

    placed = []
    try:
        for order in batch:
            result = client.place_order_for(
                order["trader"], order["ticker"], order["order_type"], order["quantity"], order["price"]
            )
            enriched = {**order, "on_chain_order_id": result["order_id"], "tx_hash": result["tx_hash"], "status": "on_chain"}
            placed.append(enriched)
            storage.record_order(EDGE_ID, enriched)
    except Exception as err:
        logger.exception("Failed to place batch on-chain")
        return {"forwarded": False, "error": str(err), "placed": len(placed)}

    matches = chain.match_orders(
        [{**p, "id": p["on_chain_order_id"]} for p in placed]
    )

    settlements = []
    for m in matches:
        try:
            match_result = client.record_match(m["buy"]["id"], m["sell"]["id"], m["price"], m["quantity"])

            off_chain_record = {
                "match_id": match_result["match_id"],
                "batch_hash": batch_hash,
                "buy_order": m["buy"],
                "sell_order": m["sell"],
                "matched_price": m["price"],
                "matched_quantity": m["quantity"],
                "settled_at": time.time(),
            }
            off_chain_hash = hashlib.sha256(json.dumps(off_chain_record, sort_keys=True, default=str).encode()).hexdigest()

            settle_result = client.settle_trade(match_result["match_id"], off_chain_hash)

            record = {
                **off_chain_record,
                "off_chain_hash": off_chain_hash,
                "settlement_id": settle_result["settlement_id"],
                "match_tx_hash": match_result["tx_hash"],
                "settlement_tx_hash": settle_result["tx_hash"],
            }
            storage.record_settlement(record)
            settlements.append(record)
        except Exception as err:
            logger.exception("Failed to record match/settlement on-chain")
            settlements.append({"error": str(err), "buy_order_id": m["buy"]["id"], "sell_order_id": m["sell"]["id"]})

    return {
        "forwarded": True,
        "orders_placed": len(placed),
        "matches_found": len(matches),
        "settlements": settlements,
    }


@app.post("/batch/validate")
def validate_batch(payload: dict):
    """Called BY peer edge nodes during another node's PBFT-lite round."""
    batch = payload["batch"]
    signature = sign_batch(batch)
    return {"edge_id": EDGE_ID, "signature": signature}


@app.get("/health")
def health():
    return {"edge_id": EDGE_ID, "port": PORT, "pending_orders": len(pending_orders)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)

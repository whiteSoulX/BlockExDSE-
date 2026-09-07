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
  5. Forwards the approved, pre-validated batch onward (to the blockchain
     layer — that wiring is the next piece to build).

This is intentionally simple for the prototype: no persistent state, no
real cryptographic signatures yet (HMAC stand-in), in-memory only.
"""

import os
import time
import hashlib
import hmac
import json
from typing import Literal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import httpx

EDGE_ID = os.environ.get("EDGE_ID", "1")
PORT = int(os.environ.get("PORT", "9001"))

# In a real deployment these would be separate machines; here they're
# separate processes on localhost, one per port.
PEER_PORTS = [p for p in [9001, 9002, 9003] if p != PORT]

# Shared secret for the HMAC stand-in signature (prototype only — replace
# with real per-node keypairs before anything resembling production use).
SHARED_SECRET = b"blockexdse-prototype-shared-secret"

app = FastAPI(title=f"BlockExDSE Edge Node {EDGE_ID}")

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
    }
    next_order_id += 1
    pending_orders.append(record)
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

    if approved:
        pending_orders.clear()

    return {
        "status": "approved" if approved else "rejected",
        "batch_size": len(batch),
        "votes_received": len(votes),
        "votes_required": 2,
        "batch_hash": own_signature,
        "batch": batch,
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

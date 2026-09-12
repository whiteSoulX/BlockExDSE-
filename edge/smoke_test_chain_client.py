"""
One-off manual smoke test against a live local Hardhat node + deployed
contract. Not part of the pytest suite (it needs a running chain) — run
directly with: py -3 edge/smoke_test_chain_client.py
"""

import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from chain_client import ChainClient

DELEGATE_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DELEGATE_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
DELEGATE_2 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
TRADER_ADDR = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"  # hardhat signer #3

DESCRIPTOR = os.path.join(os.path.dirname(__file__), "..", "deployment.json")


def digest(label: str) -> bytes:
    return hashlib.sha256(label.encode()).digest()


def main():
    d0 = ChainClient("http://127.0.0.1:8545", DELEGATE_0, DESCRIPTOR)
    d1 = ChainClient("http://127.0.0.1:8545", DELEGATE_1, DESCRIPTOR)
    d2 = ChainClient("http://127.0.0.1:8545", DELEGATE_2, DESCRIPTOR)

    print("Block number:", d0.block_number())

    d0.verify_participant(TRADER_ADDR)
    print("Trader KYC-verified.")

    # --- FAST path ---
    fast_digest = digest("smoke-fast-batch")
    d0.propose_batch(fast_digest, 1000)  # low risk -> FAST
    batch = d0.get_batch(fast_digest)
    print("FAST batch:", batch)
    assert batch["tier"] == "FAST" and batch["finalized"] is True

    ready = d0.wait_until_batch_ready(fast_digest, timeout_s=15)
    print("FAST batch ready after challenge window:", ready)
    assert ready

    order_id = d0.place_batched_order(TRADER_ADDR, "DSEX", 0, 0, 100, 50, fast_digest)
    print("Placed order via FAST batch, order id:", order_id)

    # --- FULL path ---
    full_digest = digest("smoke-full-batch")
    d0.propose_batch(full_digest, 9000)  # high risk -> FULL
    batch = d0.get_batch(full_digest)
    print("FULL batch after proposer's own vote:", batch)
    assert batch["tier"] == "FULL" and batch["finalized"] is False

    d1.vote_batch(full_digest)
    batch = d0.get_batch(full_digest)
    print("FULL batch after 2nd vote:", batch)
    assert batch["finalized"] is True

    ready = d0.is_batch_ready(full_digest)
    print("FULL batch ready immediately after quorum:", ready)
    assert ready

    order_id_2 = d0.place_batched_order(TRADER_ADDR, "DSEX", 1, 0, 100, 50, full_digest)
    print("Placed order via FULL batch, order id:", order_id_2)

    match_id, _ = d0.record_match(order_id, order_id_2, 50, 100)
    print("Recorded match id:", match_id)

    settlement_id, receipt = d0.settle_trade(match_id, digest("off-chain-record"))
    print("Settled. Settlement id:", settlement_id, "tx hash:", receipt.transactionHash.hex())

    print("\nALL SMOKE TESTS PASSED")


if __name__ == "__main__":
    main()

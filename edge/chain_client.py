"""
Thin web3.py wrapper around the deployed BlockExDSE contract.

The v1 prototype never actually wired the edge layer to the chain (the
report described this as the "next step your team should build" — see the
old README). This module is that wiring: it reads the ABI and deployed
address from a deployment descriptor file (written by scripts/deploy.js) so
neither ever has to be copied by hand between the JavaScript and Python
halves of the system, and exposes exactly the contract calls the edge layer
needs to drive the risk-adaptive consensus tier and settlement.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware


class ChainClient:
    def __init__(self, rpc_url: str, private_key: str, descriptor_path: str | Path):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        # Harmless on mainnet-shaped chains; required on some POA testnets.
        try:
            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        except Exception:
            pass

        descriptor = json.loads(Path(descriptor_path).read_text())
        self.address = Web3.to_checksum_address(descriptor["address"])
        self.abi = descriptor["abi"]
        self.contract = self.w3.eth.contract(address=self.address, abi=self.abi)

        self.account = self.w3.eth.account.from_key(private_key)

    # ── internal: sign, send, wait ─────────────────────────────────────
    def _send(self, fn, gas: int | None = None):
        tx_params = {
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
        }
        if gas is not None:
            tx_params["gas"] = gas
        tx = fn.build_transaction(tx_params)
        signed = self.account.sign_transaction(tx)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
        tx_hash = self.w3.eth.send_raw_transaction(raw)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        return receipt

    # ── admin / setup ───────────────────────────────────────────────────
    def add_delegate(self, delegate_address: str):
        return self._send(self.contract.functions.addDelegate(Web3.to_checksum_address(delegate_address)))

    def verify_participant(self, participant_address: str):
        return self._send(self.contract.functions.verifyParticipant(Web3.to_checksum_address(participant_address)))

    # ── risk-adaptive batch consensus (Tier 2) ─────────────────────────
    def propose_batch(self, digest: bytes, risk_score_bps: int):
        return self._send(self.contract.functions.proposeBatch(digest, risk_score_bps))

    def vote_batch(self, digest: bytes):
        return self._send(self.contract.functions.voteBatch(digest))

    def challenge_batch(self, digest: bytes):
        return self._send(self.contract.functions.challengeBatch(digest))

    def is_batch_ready(self, digest: bytes) -> bool:
        return self.contract.functions.isBatchReady(digest).call()

    def get_batch(self, digest: bytes) -> dict:
        b = self.contract.functions.getBatch(digest).call()
        return {
            "digest": b[0].hex(),
            "tier": "FAST" if b[1] == 0 else "FULL",
            "proposer": b[2],
            "riskScoreBps": b[3],
            "voteCount": b[4],
            "challengeDeadlineBlock": b[5],
            "finalized": b[6],
            "disputed": b[7],
            "exists": b[8],
        }

    def wait_until_batch_ready(self, digest: bytes, timeout_s: float = 30.0, poll_s: float = 0.5) -> bool:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if self.is_batch_ready(digest):
                return True
            time.sleep(poll_s)
        return False

    # ── settlement pipeline ─────────────────────────────────────────────
    def place_batched_order(self, trader: str, ticker: str, order_type: int, kind: int, quantity: int, price: int, batch_digest: bytes):
        fn = self.contract.functions.placeBatchedOrder(
            Web3.to_checksum_address(trader), ticker, order_type, kind, quantity, price, batch_digest
        )
        receipt = self._send(fn)
        return self._first_event_arg(receipt, "OrderPlaced", "orderId")

    def record_match(self, buy_order_id: int, sell_order_id: int, matched_price: int, matched_quantity: int):
        fn = self.contract.functions.recordMatch(buy_order_id, sell_order_id, matched_price, matched_quantity)
        receipt = self._send(fn)
        return self._first_event_arg(receipt, "OrdersMatched", "matchId"), receipt

    def settle_trade(self, match_id: int, off_chain_hash: bytes):
        fn = self.contract.functions.settleTrade(match_id, off_chain_hash)
        receipt = self._send(fn)
        settlement_id = self._first_event_arg(receipt, "TradeSettled", "settlementId")
        return settlement_id, receipt

    def _first_event_arg(self, receipt, event_name: str, arg_name: str):
        event = getattr(self.contract.events, event_name)()
        logs = event.process_receipt(receipt)
        return logs[0]["args"][arg_name]

    def block_number(self) -> int:
        return self.w3.eth.block_number

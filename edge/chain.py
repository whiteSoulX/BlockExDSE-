"""
Blockchain client for the edge layer — the piece that used to be missing.

Once a batch clears PBFT-lite validation, the proposing node uses this
module to forward it on-chain as a delegate:
  1. placeOrderFor() for each order in the batch (on behalf of its trader).
  2. A simple price-time-priority match of the newly placed orders.
  3. recordMatch() + settleTrade() for each match found, anchoring the
     off-chain record's SHA-256 hash (see storage.py).

Deliberately simple for the prototype: matching only pairs orders of equal
quantity (the contract has no partial-fill bookkeeping, so we don't pretend
to support it), transactions are sent and awaited one at a time (no manual
nonce management), and there is no retry/backoff on RPC failure.
"""

import json
import os
from pathlib import Path

from eth_account import Account
from web3 import Web3

EDGE_DIR = Path(__file__).resolve().parent
DEFAULT_ABI_PATH = EDGE_DIR / "../frontend/src/lib/contractAbi.json"
DEFAULT_ADDRESS_PATH = EDGE_DIR / "../frontend/src/lib/contractAddress.json"

RPC_URL = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
DELEGATE_PRIVATE_KEY = os.environ.get("DELEGATE_PRIVATE_KEY", "")
CONTRACT_ABI_PATH = os.environ.get("CONTRACT_ABI_PATH", str(DEFAULT_ABI_PATH))
CONTRACT_ADDRESS_PATH = os.environ.get("CONTRACT_ADDRESS_PATH", str(DEFAULT_ADDRESS_PATH))

ORDER_TYPE = {"BUY": 0, "SELL": 1}


def _load_contract_address() -> str:
    env_addr = os.environ.get("CONTRACT_ADDRESS", "").strip()
    if env_addr:
        return env_addr
    try:
        with open(CONTRACT_ADDRESS_PATH) as f:
            return json.load(f).get("address", "")
    except (OSError, json.JSONDecodeError):
        return ""


class ChainClient:
    """Lazily connects; every method is a no-op-safe check via `.enabled`."""

    def __init__(self):
        self.w3 = None
        self.contract = None
        self.account = None
        self.enabled = False
        self._connect()

    def _connect(self):
        address = _load_contract_address()
        if not address or not DELEGATE_PRIVATE_KEY:
            return
        try:
            with open(CONTRACT_ABI_PATH) as f:
                abi = json.load(f)
        except (OSError, json.JSONDecodeError):
            return

        w3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not w3.is_connected():
            return

        self.w3 = w3
        self.contract = w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)
        self.account = Account.from_key(DELEGATE_PRIVATE_KEY)
        self.enabled = True

    def _send(self, fn):
        """Builds, signs, sends, and awaits a contract function call. Returns the receipt."""
        nonce = self.w3.eth.get_transaction_count(self.account.address)
        tx = fn.build_transaction({"from": self.account.address, "nonce": nonce, "gas": 1_000_000})
        signed = Account.sign_transaction(tx, private_key=self.account.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    def place_order_for(self, trader: str, ticker: str, order_type: str, quantity: int, price: int) -> dict:
        receipt = self._send(
            self.contract.functions.placeOrderFor(trader, ticker, ORDER_TYPE[order_type], quantity, price)
        )
        events = self.contract.events.OrderPlaced().process_receipt(receipt)
        return {"order_id": events[0]["args"]["orderId"], "tx_hash": receipt.transactionHash.hex()}

    def record_match(self, buy_order_id: int, sell_order_id: int, price: int, quantity: int) -> dict:
        receipt = self._send(self.contract.functions.recordMatch(buy_order_id, sell_order_id, price, quantity))
        events = self.contract.events.OrdersMatched().process_receipt(receipt)
        return {"match_id": events[0]["args"]["matchId"], "tx_hash": receipt.transactionHash.hex()}

    def settle_trade(self, match_id: int, off_chain_hash_hex: str) -> dict:
        receipt = self._send(self.contract.functions.settleTrade(match_id, bytes.fromhex(off_chain_hash_hex.removeprefix("0x"))))
        events = self.contract.events.TradeSettled().process_receipt(receipt)
        return {"settlement_id": events[0]["args"]["settlementId"], "tx_hash": receipt.transactionHash.hex()}


_client = None


def get_client() -> ChainClient:
    global _client
    if _client is None:
        _client = ChainClient()
    return _client


def match_orders(orders: list[dict]) -> list[dict]:
    """Simple price-time-priority match, equal-quantity pairs only (see
    module docstring for why partial fills aren't attempted). `orders` must
    already carry an on-chain `order_id` (set after placeOrderFor)."""
    by_ticker: dict[str, list[dict]] = {}
    for o in orders:
        by_ticker.setdefault(o["ticker"], []).append(o)

    matches = []
    for ticker, ticker_orders in by_ticker.items():
        buys = sorted(
            (o for o in ticker_orders if o["order_type"] == "BUY"),
            key=lambda o: (-o["price"], o["timestamp"]),
        )
        sells = sorted(
            (o for o in ticker_orders if o["order_type"] == "SELL"),
            key=lambda o: (o["price"], o["timestamp"]),
        )
        used_sells = set()
        for buy in buys:
            for sell in sells:
                if sell["id"] in used_sells:
                    continue
                if buy["price"] >= sell["price"] and buy["quantity"] == sell["quantity"]:
                    matches.append({"buy": buy, "sell": sell, "price": sell["price"], "quantity": sell["quantity"]})
                    used_sells.add(sell["id"])
                    break
    return matches

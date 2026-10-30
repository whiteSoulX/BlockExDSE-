"""Thin web3.py wrapper around the BlockExDSE contract (talks to the Hardhat node)."""
import json
import os
import threading
from pathlib import Path

from web3 import Web3

ROOT = Path(__file__).resolve().parent.parent
RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
DEPLOYMENT = ROOT / "deployment.json"
ARTIFACT = ROOT / "artifacts" / "contracts" / "BlockExDSE.sol" / "BlockExDSE.json"


def hx(b) -> str:
    """bytes/HexBytes -> '0x...' string (works across hexbytes versions)."""
    s = b.hex() if hasattr(b, "hex") else str(b)
    return s if s.startswith("0x") else "0x" + s


def to_b32(text: str) -> bytes:
    return text.encode()[:32].ljust(32, b"\0")


def from_b32(b) -> str:
    return bytes(b).rstrip(b"\0").decode()


def connect() -> Web3:
    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 30}))
    if not w3.is_connected():
        raise RuntimeError(f"Cannot reach Hardhat node at {RPC_URL}. Start it with: npx hardhat node")
    return w3


def load_artifact() -> dict:
    if not ARTIFACT.exists():
        raise RuntimeError("Contract artifact missing. Run: npx hardhat compile")
    return json.loads(ARTIFACT.read_text())


class ContractClient:
    SIDE = {"BUY": 0, "SELL": 1}

    def __init__(self):
        if not DEPLOYMENT.exists():
            raise RuntimeError("deployment.json missing. Run: python edge/deploy.py")
        dep = json.loads(DEPLOYMENT.read_text())
        self.dep = dep
        self.w3 = connect()
        self.admin = Web3.to_checksum_address(dep["admin"])
        self.c = self.w3.eth.contract(address=Web3.to_checksum_address(dep["address"]), abi=dep["abi"])
        self._lock = threading.Lock()

    # ---- internal ----
    def _send(self, fn):
        with self._lock:
            tx_hash = fn.transact({"from": self.admin})
            rcpt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        if rcpt["status"] != 1:
            raise RuntimeError("transaction reverted")
        return {"tx": hx(tx_hash), "block": rcpt["blockNumber"], "gas": rcpt["gasUsed"]}

    @staticmethod
    def _clean(e: Exception) -> str:
        msg = str(e)
        for key in ("revert ", "reverted with reason string "):
            if key in msg:
                return msg.split(key, 1)[1].strip(" '\")(")[:120]
        return msg[:160]

    # ---- writes ----
    def place_order(self, trader, ticker, qty, price, side, batch_hash_hex, votes, required):
        fn = self.c.functions.placeOrder(
            Web3.to_checksum_address(trader), to_b32(ticker), int(qty), int(price),
            self.SIDE[side], bytes.fromhex(batch_hash_hex.removeprefix("0x")), int(votes), int(required),
        )
        try:
            r = self._send(fn)
        except Exception as e:
            raise RuntimeError(self._clean(e)) from None
        r["chain_id"] = self.c.functions.orderCount().call(block_identifier=r["block"])
        return r

    def match(self, buy_id, sell_id):
        try:
            r = self._send(self.c.functions.matchOrders(int(buy_id), int(sell_id)))
        except Exception as e:
            raise RuntimeError(self._clean(e)) from None
        tid = self.c.functions.tradeCount().call(block_identifier=r["block"])
        t = self.c.functions.getTrade(tid).call(block_identifier=r["block"])
        r.update(trade_id=tid, qty=t[3], price=t[4])
        return r

    def anchor(self, trade_id, record_hash_hex):
        try:
            return self._send(self.c.functions.anchorHash(int(trade_id), bytes.fromhex(record_hash_hex)))
        except Exception as e:
            raise RuntimeError(self._clean(e)) from None

    # ---- reads ----
    def balance(self, addr, tickers):
        a = Web3.to_checksum_address(addr)
        return {
            "cash": self.c.functions.cash(a).call(),
            "shares": {t: self.c.functions.holdings(a, to_b32(t)).call() for t in tickers},
        }

    def counts(self):
        return {"orders": self.c.functions.orderCount().call(), "trades": self.c.functions.tradeCount().call()}

"""
web3.py wrapper (v2: signed orders, validator attestations checked by the contract, collateral locking). One shared connection and signer, one contract per market.

Chain modes (any EVM-compatible chain works):
  - default: local Hardhat node, transactions sent from its unlocked admin account;
  - signed:  set RPC_URL and CHAIN_PRIVATE_KEY (a funded TEST-chain key). Transactions are signed locally.
"""
import json
import os
import re
import threading
from pathlib import Path
from urllib.parse import urlparse

from eth_account import Account
from web3 import Web3
from web3.logs import DISCARD

import signing as S
from markets import CHAIN_NAMES

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
        raise RuntimeError(f"Cannot reach the blockchain node at {RPC_URL}. Start it with: npx hardhat node")
    return w3


def load_artifact() -> dict:
    if not ARTIFACT.exists():
        raise RuntimeError("Contract artifact missing. Run: npx hardhat compile")
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))


def clean_error(e: Exception) -> str:
    msg = str(e)
    m = re.search(r"reverted with reason string '([^']*)'", msg) or re.search(r"execution reverted: ([^'\"}]*)", msg)
    if m:
        return m.group(1).strip()[:120]
    for key in ("revert ", "reverted with reason string "):
        if key in msg:
            return msg.split(key, 1)[1].strip(" '\")(")[:120]
    return msg[:160]


class Chain:
    """Shared connection + transaction sender (serialised, so nonces never collide)."""
    _inst = None
    _guard = threading.Lock()

    @classmethod
    def get(cls):
        with cls._guard:
            if cls._inst is None:
                cls._inst = cls()
            return cls._inst

    def __init__(self):
        self.w3 = connect()
        key = os.getenv("CHAIN_PRIVATE_KEY", "").strip()
        self.acct = Account.from_key(key) if key else None
        self.admin = self.acct.address if self.acct else self.w3.eth.accounts[0]
        self.mode = "signed" if self.acct else "local-unlocked"
        self.lock = threading.Lock()

    def info(self):
        cid = self.w3.eth.chain_id
        return {"id": cid, "name": CHAIN_NAMES.get(cid, f"EVM chain {cid}"), "mode": self.mode,
                "rpc_host": urlparse(RPC_URL).netloc, "admin": self.admin,
                "block_time_ms": int(os.getenv("BLOCK_TIME_MS", "0") or 0)}

    def send(self, fn):
        with self.lock:
            if self.acct:
                tx = fn.build_transaction({"from": self.admin, "nonce": self.w3.eth.get_transaction_count(self.admin, "pending")})
                signed = self.acct.sign_transaction(tx)
                raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
                h = self.w3.eth.send_raw_transaction(raw)
            else:
                h = fn.transact({"from": self.admin})
            rcpt = self.w3.eth.wait_for_transaction_receipt(h, timeout=120)
        if rcpt["status"] != 1:
            raise RuntimeError("transaction reverted")
        return rcpt, hx(h)


class ContractClient:
    def __init__(self, market: str):
        if not DEPLOYMENT.exists():
            raise RuntimeError("deployment.json missing. Run: python edge/deploy.py")
        dep = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
        self.dep, self.market = dep, market
        self.chain = Chain.get()
        self.w3 = self.chain.w3
        self.admin = self.chain.admin
        self.address = Web3.to_checksum_address(dep["contracts"][market])
        self.c = self.w3.eth.contract(address=self.address, abi=dep["abi"])
        self.domain = S.domain_separator(self.w3.eth.chain_id, self.address)

    # ---- internal ----
    def _send(self, fn):
        rcpt, h = self.chain.send(fn)
        return {"tx": h, "block": rcpt["blockNumber"], "gas": rcpt["gasUsed"], "rcpt": rcpt}

    def _do(self, fn):
        try:
            return self._send(fn)
        except Exception as e:
            raise RuntimeError(clean_error(e)) from None

    def _tx(self, fn):
        r = self._do(fn)
        r.pop("rcpt", None)
        return r

    def simulate(self, fn) -> str:
        """Ask the contract what it would do (eth_call, nothing is written). Returns "ok" or the revert reason."""
        try:
            fn.call({"from": self.admin})
            return "ok"
        except Exception as e:
            return clean_error(e)

    # ---- order entry ----
    def place_fn(self, orders, trader_sigs, att_sigs=b"", comp_sig=b""):
        return self.c.functions.placeOrders([S.order_tuple(o) for o in orders], [bytes(x) for x in trader_sigs],
                                            bytes(att_sigs), bytes(comp_sig))

    def place_orders(self, orders, trader_sigs, att_sigs=b"", comp_sig=b""):
        """One transaction for one or more signed orders. Returns the first on-chain order id."""
        r = self._do(self.place_fn(orders, trader_sigs, att_sigs, comp_sig))
        ids = [e["args"]["id"] for e in self.c.events.OrderPlaced().process_receipt(r.pop("rcpt"), errors=DISCARD)]
        r["first_id"] = min(ids)                             # ids of a batch are consecutive
        return r

    def match(self, buy_id, sell_id):
        r = self._do(self.c.functions.matchOrders(int(buy_id), int(sell_id)))
        a = self.c.events.TradeSettled().process_receipt(r.pop("rcpt"), errors=DISCARD)[0]["args"]
        r.update(trade_id=a["id"], qty=a["qty"], price=a["price"])
        return r

    def cancel(self, order_id, sig=b""):
        return self._tx(self.c.functions.cancelOrder(int(order_id), bytes(sig)))

    def anchor(self, trade_id, record_hash_hex):
        return self._tx(self.c.functions.anchorHash(int(trade_id), bytes.fromhex(record_hash_hex)))

    # ---- admin / onboarding ----
    def register_trader(self, addr, start_cash):
        return self._tx(self.c.functions.registerTrader(Web3.to_checksum_address(addr), int(start_cash)))

    def credit_shares(self, addr, ticker, qty):
        return self._tx(self.c.functions.creditShares(Web3.to_checksum_address(addr), to_b32(ticker), int(qty)))

    def set_edge_node(self, addr):
        return self._tx(self.c.functions.setEdgeNode(Web3.to_checksum_address(addr), True))

    def set_validators(self, addrs):
        return self._tx(self.c.functions.setValidators([Web3.to_checksum_address(a) for a in addrs]))

    def set_compliance(self, addr):
        return self._tx(self.c.functions.setCompliance(Web3.to_checksum_address(addr)))

    def set_ticker(self, ticker, ref, band_bps):
        return self._tx(self.c.functions.setTicker(to_b32(ticker), int(ref), int(band_bps)))

    def set_risk_notional(self, v):
        return self._tx(self.c.functions.setRiskNotional(int(v)))

    def set_quorum(self, std, esc):
        return self._tx(self.c.functions.setQuorum(int(std), int(esc)))

    def is_kyc(self, addr) -> bool:
        return bool(self.c.functions.kyc(Web3.to_checksum_address(addr)).call())

    # ---- reads ----
    def balance(self, addr, tickers):
        a, f = Web3.to_checksum_address(addr), self.c.functions
        return {"cash": f.cash(a).call(), "locked_cash": f.lockedCash(a).call(),
                "shares": {t: f.holdings(a, to_b32(t)).call() for t in tickers},
                "locked_shares": {t: f.lockedShares(a, to_b32(t)).call() for t in tickers}}

    def counts(self):
        return {"orders": self.c.functions.orderCount().call(), "trades": self.c.functions.tradeCount().call()}

    def quorum(self):
        return self.c.functions.quorumStd().call(), self.c.functions.quorumEsc().call()

    def config(self):
        f = self.c.functions
        return {"quorum_std": f.quorumStd().call(), "quorum_esc": f.quorumEsc().call(), "validators": f.getValidators().call(),
                "compliance": f.compliance().call(), "risk_notional": f.riskNotional().call(), "domain": S.hx(self.domain)}

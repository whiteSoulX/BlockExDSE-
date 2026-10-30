"""Deploy BlockExDSE to the local Hardhat node, seed KYC traders, write deployment.json."""
import hashlib
import json
import sys
from pathlib import Path

from eth_account import Account
from web3 import Web3

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract_client import DEPLOYMENT, connect, load_artifact, to_b32  # noqa: E402

TICKERS = {"GP": 300, "BRACBANK": 45, "SQURPHARMA": 220, "ROBI": 28, "BATBC": 380}  # reference prices (BDT)
TRADER_NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank"]
START_CASH = 5_000_000
START_SHARES = 500


def edge_address(i: int) -> str:
    return Account.from_key(hashlib.sha256(f"blockexdse-edge-{i}".encode()).hexdigest()).address


def main():
    w3 = connect()
    accts = w3.eth.accounts
    admin = accts[0]
    art = load_artifact()
    C = w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"])
    rcpt = w3.eth.wait_for_transaction_receipt(C.constructor().transact({"from": admin}))
    addr = rcpt["contractAddress"]
    c = w3.eth.contract(address=addr, abi=art["abi"])
    print(f"Contract deployed at {addr} (gas {rcpt['gasUsed']})")

    def tx(fn):
        w3.eth.wait_for_transaction_receipt(fn.transact({"from": admin}))

    for i in (1, 2, 3):                      # flat whitelist of edge-node addresses
        tx(c.functions.setEdgeNode(Web3.to_checksum_address(edge_address(i)), True))
    traders = []
    for name, a in zip(TRADER_NAMES, accts[1:1 + len(TRADER_NAMES)]):
        tx(c.functions.registerTrader(a, START_CASH))
        for t in TICKERS:
            tx(c.functions.creditShares(a, to_b32(t), START_SHARES))
        traders.append({"name": name, "address": a})
        print(f"  KYC trader {name:6s} {a}")

    DEPLOYMENT.write_text(json.dumps({
        "address": addr, "admin": admin, "abi": art["abi"],
        "traders": traders, "tickers": TICKERS,
        "edge_nodes": {str(i): edge_address(i) for i in (1, 2, 3)},
    }, indent=2))
    print(f"Wrote {DEPLOYMENT}")


if __name__ == "__main__":
    main()

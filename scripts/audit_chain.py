"""Standalone audit of the ledger. Needs only the chain (RPC_URL) and deployment.json; the gateway can be switched off.

Usage:  python scripts/audit_chain.py            (all visible markets)
        python scripts/audit_chain.py DSE
It re-checks every investor signature, every validator signature and quorum, price-time priority of every trade,
conservation of cash and shares, and that every trade has an anchored record hash.
"""
import sys

from _client import ROOT  # noqa: F401  (also puts edge/ on the path and picks the project's Python)
from audit import audit_market
from contract_client import ContractClient
from markets import MARKETS

markets = sys.argv[1:] or [m for m, cfg in MARKETS.items() if not cfg.get("hidden")]
ok = True
for m in markets:
    rep = audit_market(ContractClient(m))
    ok &= rep["ok"]
    print(f"\n{m}  contract {rep['contract']}  block {rep['block']}: {rep['orders']} orders, {rep['trades']} trades, "
          f"{rep['signatures_checked']} signatures re-checked")
    for c in rep["checks"]:
        print(("  PASS " if c["ok"] else "  FAIL ") + c["name"] + "  (" + c["detail"] + ")")
    for p in rep["problems"]:
        print("       problem: " + p)
print("\nAUDIT PASSED" if ok else "\nAUDIT FOUND PROBLEMS")
raise SystemExit(0 if ok else 1)

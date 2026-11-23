"""Security checks for version 2 against the running system. 18 checks.

1. The hashes and the risk score computed off-chain equal the contract's own.
2. Nine attacks by a dishonest gateway are each refused by the contract (and by honest validators where they see them).
3. The independent audit passes, detects a changed off-chain record, and passes again once it is restored.
"""
import json
import os
import random

from _client import ROOT, Checker, S, call, login, market_info, submit
from web3 import Web3

check = Checker()
dep = json.loads((ROOT / "deployment.json").read_text(encoding="utf-8"))
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "http://127.0.0.1:8545")))
c = w3.eth.contract(address=Web3.to_checksum_address(dep["contracts"]["DSE"]), abi=dep["abi"])
alice, bob, admin = login("alice@blockexdse.demo"), login("bob@blockexdse.demo"), login("admin@blockexdse.demo", "Admin@123")
mk = market_info("DSE")
dom = bytes.fromhex(mk["domain"][2:])

# ---- 1. parity between the edge code and the contract ----
o = {"market": "DSE", "trader": dep["traders"][0]["address"], "ticker": "GP", "qty": 7, "price": 301, "side": "SELL", "otype": "LIMIT",
     "nonce": 123456789, "expiry": 2_000_000_000}
root = S.batch_root([S.order_hash(o)])
check("domain separator equals the contract's", bytes(c.functions.DOMAIN_SEPARATOR().call()) == dom)
check("order digest equals the contract's", bytes(c.functions.orderDigest(S.order_tuple(o)).call()) == S.order_digest(dom, o))
check("attestation and cancel digests equal the contract's", bytes(c.functions.attestDigest(root).call()) == S.attest_digest(dom, root)
      and bytes(c.functions.cancelDigest(42).call()) == S.cancel_digest(dom, 42))
rng, diff, tiers = random.Random(11), 0, [0, 0]
for _ in range(300):
    t = rng.choice(list(mk["tickers"]))
    cfg = mk["tickers"][t]
    qty, price, otype = rng.choice([1, 5, 40, 300, 2500, 9000]), rng.randint(cfg["lo"], cfg["hi"]), rng.choice(["LIMIT", "MARKET"])
    off = S.risk(cfg["ref"], cfg["band_bps"], mk["risk_notional"], qty, price, otype)
    diff += c.functions.riskScore(S.b32(t), qty, price, S.OTYPES[otype]).call() != off["score_bps"]
    tiers[off["tier"]] += 1
check("risk score: the edge rule equals the contract rule on 300 random orders", diff == 0, f"{tiers[0]} routine, {tiers[1]} risky, {diff} differences")

# ---- 2. the nine attacks ----
expected = {"forged_order": "bad trader signature", "fake_quorum": "quorum not reached", "duplicate_signer": "duplicate validator signature",
            "outsider_signer": "unknown validator", "downgrade_risk": "quorum not reached for escalated order", "replay": "nonce already used",
            "expired": "order expired", "out_of_band": "price outside band", "unsigned_cancel": "cancel not signed by the trader"}
s, res = call("/api/lab/attack/all?market=DSE", token=admin, method="POST")
res = res if s == 200 else []
for r in res:
    check(f"attack refused: {r['title'].lower()}", r["blocked"] and expected[r["name"]] in r["contract"], f"| contract: {r['contract']}")
seen = [r for r in res if r.get("validators")]
check("honest validators also refused every bad order they were shown", len(res) == 9 and len(seen) == 3 and all(r["validators"]["refused"] == 3 for r in seen),
      "; ".join(f"{r['name']}: {r['validators']['refused']}/3" for r in seen))
s, _ = call("/api/lab/attack/all?market=DSE", token=alice, method="POST")
check("only the admin can run the proof lab", s == 403, f"http {s}")

# ---- 3. the audit ----
submit(alice, "SQURPHARMA", "SELL", 3, 220)
t = submit(bob, "SQURPHARMA", "BUY", 3, 220)
s, rep = call("/api/audit/DSE", token=alice)
check("independent audit passes", s == 200 and rep["ok"] and rep["trades"] >= 1 and t["status"] == "settled",
      f"{rep.get('orders')} orders, {rep.get('trades')} trades, {rep.get('signatures_checked')} signatures re-checked; problems: {rep.get('problems')}")
call("/api/lab/tamper/DSE/on", token=admin, method="POST")
_, rep2 = call("/api/audit/DSE", token=alice)
check("audit detects a changed off-chain trade record", not rep2["ok"] and any("off-chain record" in p for p in rep2["problems"]), str(rep2["problems"][:1]))
call("/api/lab/tamper/DSE/off", token=admin, method="POST")
_, rep3 = call("/api/audit/DSE", token=alice)
check("audit passes again after the record is restored", rep3["ok"])
check.finish()

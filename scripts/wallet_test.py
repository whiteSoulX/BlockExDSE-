"""v2.1 checks: practice wallet (add money, signed withdrawal), watchlist, stock details and price history. 15 checks.

Run with the system started (python run.py). Money is simulated; the contract rules are real.
"""
import os
import time

from _client import KEYS, Checker, S, call, login, market_info, wallet_of

check = Checker()
alice = login("alice@blockexdse.demo")
bob = login("bob@blockexdse.demo")
mk = market_info("DSE")
dom = bytes.fromhex(mk["domain"][2:])
addr = wallet_of(alice)


def cash(tok, m="DSE"):
    return call("/api/me", token=tok)[1]["portfolios"][m]["cash"]


def signed_withdraw(key, trader, amount, m="DSE", ttl=600, nonce=None):
    nonce = nonce if nonce is not None else int.from_bytes(os.urandom(7), "big")
    expiry = int(time.time()) + ttl
    sig = S.hx(S.sign(key, S.withdraw_digest(bytes.fromhex(market_info(m)["domain"][2:]), trader, amount, nonce, expiry)))
    return {"market": m, "amount": amount, "method": "bkash" if m == "DSE" else "bank", "nonce": str(nonce), "expiry": expiry, "sig": sig}


# ── stock information ──
check("stock details: sector and description for every ticker", all(v.get("sector") and v.get("about") for v in mk["tickers"].values()))
check("wallet limits and payment methods published", mk["wallet"]["min"] > 0 and "bkash" in mk["wallet"]["methods"])
s, h = call("/api/history/DSE/GP")
check("price history: illustrative series ends at the reference price", s == 200 and h["illustrative"] and len(h["daily"]) == 30 and h["daily"][-1]["close"] == h["ref"])

# ── add money ──
before = cash(alice)
s, j = call("/api/wallet/deposit", {"market": "DSE", "amount": 25_000, "method": "bkash"}, token=alice)
check("add money: on-chain cash goes up by the amount", s == 200 and cash(alice) == before + 25_000 and j["entry"]["tx"].startswith("0x"), j.get("entry", {}).get("id"))
s, _ = call("/api/wallet/deposit", {"market": "DSE", "amount": 10, "method": "bkash"}, token=alice)
s2, _ = call("/api/wallet/deposit", {"market": "DSE", "amount": 5_000, "method": "paypal"}, token=alice)
check("add money: amount below the minimum and unknown method refused", s == 400 and s2 == 400)
s, _ = call("/api/wallet/deposit", {"market": "DSE", "amount": 5_000, "method": "bkash"})
check("add money: needs a signed-in investor", s == 401)

# ── withdraw (signed on the investor's device) ──
key = KEYS[alice]
before = cash(alice)
body = signed_withdraw(key, addr, 7_000)
s, j = call("/api/wallet/withdraw", body, token=alice)
check("withdraw: signed by the owner, cash goes down", s == 200 and cash(alice) == before - 7_000, j.get("entry", {}).get("tx"))
s, j = call("/api/wallet/withdraw", body, token=alice)
check("withdraw: the same signed request cannot be replayed", s == 400, j.get("detail"))
other_key = os.urandom(32).hex()
s, j = call("/api/wallet/withdraw", signed_withdraw(other_key, addr, 1_000), token=alice)
check("withdraw: a signature from another key is refused", s == 400, j.get("detail"))
s, j = call("/api/wallet/withdraw", signed_withdraw(KEYS[bob], wallet_of(bob), 1_000), token=alice)
check("withdraw: Bob's signed request cannot take Alice's cash", s == 400, j.get("detail"))
s, j = call("/api/wallet/withdraw", signed_withdraw(key, addr, mk["wallet"]["max"] + 1), token=alice)
check("withdraw: above the per-request limit is refused", s == 400, j.get("detail"))
# contract-level checks: the edge is bypassed, the contract alone must refuse
from contract_client import ContractClient                  # _client already put edge/ on the import path
cc = ContractClient("DSE")
n, e = int.from_bytes(os.urandom(7), "big"), int(time.time()) + 600
forged = S.sign(other_key, S.withdraw_digest(dom, addr, 1_000, n, e))
r1 = cc.simulate(cc.withdraw_fn(addr, 1_000, n, e, forged))
too_much = cash(alice) + 1
r2 = cc.simulate(cc.withdraw_fn(addr, too_much, n, e, S.sign(key, S.withdraw_digest(dom, addr, too_much, n, e))))
check("contract alone refuses a forged withdrawal and one larger than the free cash", r1 != "ok" and r2 != "ok", f"{r1} | {r2}")
s, j = call("/api/wallet", token=alice)
check("wallet history lists the deposit and the withdrawal", s == 200 and [x["type"] for x in j["history"][:2]] == ["withdraw", "deposit"])

# ── watchlist ──
s, j = call("/api/watchlist", {"market": "DSE", "ticker": "GP", "on": True}, token=alice)
s2, j2 = call("/api/watchlist", {"market": "DSE", "ticker": "NOPE", "on": True}, token=alice)
check("watchlist: add a stock; an unknown stock is refused", s == 200 and "GP" in j["DSE"] and s2 == 404)

# ── the audit still balances: issued + added - withdrawn ──
s, rep = call("/api/audit/DSE", token=login("admin@blockexdse.demo", "Admin@123"))
names = {c["name"]: c for c in rep.get("checks", [])}
check("audit passes; cash conservation counts deposits and withdrawals; withdrawals re-checked",
      s == 200 and rep["ok"] and names["No cash was created or destroyed"]["ok"] and names.get("Every withdrawal was signed by the account owner", {}).get("ok"),
      names.get("No cash was created or destroyed", {}).get("detail"))
check.finish()

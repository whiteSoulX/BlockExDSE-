"""End-to-end trading check on the DSE market against the running gateway (http://127.0.0.1:9001). 15 checks."""
from _client import KEYS, Checker, call, cancel, login, submit, wait_order

check = Checker()
alice, bob, admin, broker = (login("alice@blockexdse.demo"), login("bob@blockexdse.demo"), login("admin@blockexdse.demo", "Admin@123"),
                             login("broker@blockexdse.demo", "Broker@123"))
me = lambda t: call("/api/me", token=t)[1]["portfolios"]["DSE"]  # noqa: E731

o1 = submit(alice, "GP", "SELL", 100, 300)
check("signed sell rests on-chain with 3 validator signatures", o1["status"] == "open" and o1["votes"]["agree"] == 3 and o1["risk"]["level"] == "STANDARD",
      f"signatures={o1['votes']['agree']}/{o1['votes']['required']} {o1['risk']['level']}")
check("shares are locked while the order rests", me(alice)["locked_shares"]["GP"] == 100 and me(alice)["shares"]["GP"] == 400)
o2 = submit(bob, "GP", "BUY", 60, 305)
t = o2["trades"][0] if o2.get("trades") else {}
check("buy matches + settles", o2["status"] == "settled" and t, f"price={t.get('price')} tx={t.get('tx', '')[:12]}")
check("resting price priority, price improvement refunded", t.get("price") == 300 and me(bob)["locked_cash"] == 0)
check("hash anchored", str(t.get("anchor_tx", "")).startswith("0x"))
o3 = submit(bob, "GP", "BUY", 40, 300)
_, o1b = call(f"/api/orders/{o1['id']}", token=alice)
check("second fill completes seller", o3["status"] == "settled" and o1b["status"] == "settled")
pa, pb = me(alice), me(bob)
check("balances moved", pa["shares"]["GP"] == 400 and pb["shares"]["GP"] == 600 and pa["locked_shares"]["GP"] == 0, f"Alice GP={pa['shares']['GP']} Bob GP={pb['shares']['GP']}")
o4 = submit(alice, "GP", "BUY", 10, 999)
check("price band rejects at the edge", o4["status"] == "rejected" and o4.get("rejected_by") == "edge", o4.get("error"))
s_anon, _ = call("/api/order", dict(market="DSE", ticker="GP", qty=1, price=300, side="BUY"))
s_staff, _ = call("/api/order", dict(market="DSE", ticker="GP", qty=1, price=300, side="BUY"), token=admin)
check("no sign-in / non-trader blocked", s_anon == 401 and s_staff == 403, f"anonymous={s_anon} admin={s_staff}")
o5 = submit(alice, "GP", "BUY", 1, 300, key=KEYS[bob])
check("order signed with someone else's key is refused", o5["status"] == "rejected" and "not signed by the account holder" in o5.get("error", ""), o5.get("error"))
o6 = submit(alice, "GP", "BUY", 20000, 300)
check("input-error size is refused at the edge", o6["status"] == "rejected" and "size limit" in o6.get("error", ""), o6.get("error"))

call("/api/fault/3/on", token=admin, method="POST")
o7 = submit(alice, "ROBI", "BUY", 5, 28)
check("one faulty validator: routine order still passes with 3 of 4", o7["status"] in ("open", "settled") and o7["votes"]["agree"] == 3, f"signatures={o7['votes']['agree']}/{o7['votes']['required']}")
o8 = submit(alice, "BATBC", "BUY", 10, 400)
check("one faulty validator: risky order is held for review, not lost", o8["status"] == "held" and o8["held"]["have"] == 3 and o8["held"]["need"] == 4, f"{o8.get('status')} {o8.get('held')}")
held = [r["id"] for r in call("/api/review", token=broker)[1]]
s, j = call(f"/api/review/{o8['id']}", dict(approve=True), token=broker, method="POST")
o8b = wait_order(alice, o8["id"], done=("open", "settled", "rejected"))
check("reviewer approval stands in for the missing validator (checked by the contract)", o8["id"] in held and s == 200 and o8b["status"] in ("open", "settled") and str(o8b.get("place_tx", "")).startswith("0x"), f"{o8b['status']} {o8b.get('error') or ''}")
call("/api/fault/3/off", token=admin, method="POST")
o9 = submit(alice, "BATBC", "BUY", 10, 400)
check("healed: risky order passes with 4 of 4", o9["status"] in ("open", "settled") and o9["votes"]["agree"] == 4, str(o9["risk"]["level"]))
for o in (o7, o8b, o9):                                     # leave no resting test orders behind
    if o["status"] == "open":
        cancel(alice, o["id"])
check.finish()

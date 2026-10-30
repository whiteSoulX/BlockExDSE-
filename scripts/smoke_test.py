"""End-to-end check against the running gateway (http://127.0.0.1:9001)."""
import json, sys, time, urllib.request

BASE = "http://127.0.0.1:9001"
def call(path, body=None, method=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method=method)
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def submit(trader, ticker, side, qty, price):
    oid = call("/api/order", dict(trader=trader, ticker=ticker, qty=qty, price=price, side=side))["id"]
    for _ in range(60):
        o = call(f"/api/orders/{oid}")
        if o["status"] in ("settled", "open", "partial", "rejected"):
            return o
        time.sleep(0.2)
    return o

info = call("/api/info")
A, B = info["traders"][0]["address"], info["traders"][1]["address"]
ok = True
def check(name, cond, extra=""):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name, extra)

o1 = submit(A, "GP", "SELL", 100, 300)
check("sell rests on-chain", o1["status"] == "open", f"votes={o1['votes']['agree']}/{o1['votes']['required']} {o1['risk']['level']}")
o2 = submit(B, "GP", "BUY", 60, 305)
check("buy matches + settles", o2["status"] == "settled" and o2["trades"], f"price={o2['trades'][0]['price'] if o2['trades'] else None} tx={o2['trades'][0]['tx'][:12] if o2['trades'] else ''}")
check("resting price priority", o2["trades"] and o2["trades"][0]["price"] == 300)
check("hash anchored", o2["trades"] and o2["trades"][0]["anchor_tx"].startswith("0x"))
o3 = submit(B, "GP", "BUY", 40, 300)
check("second fill completes seller", o3["status"] == "settled" and call(f"/api/orders/{o1['id']}")["status"] == "settled")
bal = {b["name"]: b for b in call("/api/balances")}
check("balances moved", bal["Alice"]["shares"]["GP"] == 400 and bal["Bob"]["shares"]["GP"] == 600, f"Alice GP={bal['Alice']['shares']['GP']} Bob GP={bal['Bob']['shares']['GP']}")
o4 = submit(A, "GP", "BUY", 10, 999)
check("price band rejects", o4["status"] == "rejected", o4.get("error"))
o5 = submit("0x000000000000000000000000000000000000dEaD", "GP", "BUY", 1, 300)
check("non-KYC rejected", o5["status"] == "rejected", o5.get("error"))
call("/api/fault/3/on", method="POST")
o6 = submit(A, "ROBI", "BUY", 5, 28)
check("one faulty node: STANDARD passes 2/3", o6["status"] in ("open", "settled") and o6["votes"]["agree"] == 2, f"votes={o6['votes']['agree']}/{o6['votes']['required']}")
o7 = submit(A, "BATBC", "BUY", 10, 418)
check("one faulty node: ESCALATED rejected", o7["status"] == "rejected", o7.get("error"))
call("/api/fault/3/off", method="POST")
o8 = submit(A, "BATBC", "BUY", 10, 418)
check("healed: ESCALATED passes 3/3", o8["status"] in ("open", "settled") and o8["votes"]["agree"] == 3, f"{o8['risk']}")
print("ALL PASSED" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)

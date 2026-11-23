"""Checks for multiple markets, market orders, signed cancel, depth, the live stream, the simulator and chain info. 15 checks."""
import json
import time
import urllib.request

from _client import BASE, Checker, call, cancel, login, submit

check = Checker()
alice, bob, carol, admin = (login("alice@blockexdse.demo"), login("bob@blockexdse.demo"), login("carol@blockexdse.demo"),
                            login("admin@blockexdse.demo", "Admin@123"))
snap = lambda m: call(f"/api/market/{m}")[1]  # noqa: E731
pa0 = call("/api/me", token=alice)[1]["portfolios"]

s, info = call("/api/info")
check("two markets with their own contract, currency and tickers",
      set(info["markets"]) == {"DSE", "LSE"} and info["markets"]["LSE"]["currency"] == "GBX" and "HSBA" in info["markets"]["LSE"]["tickers"]
      and info["markets"]["DSE"]["contract"] != info["markets"]["LSE"]["contract"])
nodes = call("/api/nodes")[1]
check("four validators are online", len(nodes) == 4 and all(n.get("up") for n in nodes) and info["validators"] == 4 and info["version"] == "2.0", f"crypto backend {info['crypto']}")
check("chain info available", info["chain"]["id"] > 0 and info["chain"]["mode"] in ("local-unlocked", "signed"), f"{info['chain']['name']} / {info['chain']['mode']}")

o1 = submit(alice, "HSBA", "SELL", 10, 900, market="LSE")
d = snap("LSE")["tickers"]["HSBA"]["asks"]
check("LSE limit sell rests and shows in depth", o1["status"] == "open" and d and d[0] == [900, 10], f"asks={d}")

o2 = submit(bob, "HSBA", "BUY", 4, market="LSE", otype="MARKET")
t = o2["trades"][0] if o2.get("trades") else {}
st = snap("LSE")["tickers"]["HSBA"]
check("market buy fills at the resting price", o2["status"] == "settled" and t.get("price") == 900 and o2["otype"] == "MARKET", f"price={t.get('price')} protective={o2['price']}")
check("last price, volume and tape update", st["last"] == 900 and st["volume"] == 4 and snap("LSE")["tape"][0]["qty"] == 4, f"last={st['last']} vol={st['volume']}")

o3 = submit(bob, "ULVR", "BUY", 5, market="LSE", otype="MARKET")
check("market order with no liquidity is cancelled", o3["status"] == "cancelled" and o3["filled"] == 0 and o3.get("cancelled_qty") == 5, o3["status"])

submit(alice, "ULVR", "SELL", 3, 4500, market="LSE")
o4 = submit(bob, "ULVR", "BUY", 10, market="LSE", otype="MARKET")
check("partly filled market order cancels the rest", o4["status"] == "part_filled" and o4["filled"] == 3 and o4["cancelled_qty"] == 7, f"filled={o4['filled']} cancelled={o4.get('cancelled_qty')}")

submit(alice, "SHEL", "SELL", 5, 2700, market="LSE")
o5 = submit(alice, "SHEL", "SELL", 7, 2700, market="LSE")
lv = snap("LSE")["tickers"]["SHEL"]["asks"]
check("depth adds up orders at the same price", lv and lv[0] == [2700, 12], f"asks={lv}")
s_other, _ = call(f"/api/orders/{o5['id']}/cancel", {}, token=bob, method="POST")
s_nosig, j_nosig = cancel(alice, o5["id"], signed=False)
check("cancel without the investor's signature is refused by the contract", s_nosig == 400 and "not signed" in j_nosig.get("detail", ""), j_nosig.get("detail"))
s_own, j_own = cancel(alice, o5["id"])
s_again, _ = cancel(alice, o5["id"])
lv2 = snap("LSE")["tickers"]["SHEL"]["asks"]
check("cancel: owner only, removes from depth, not repeatable", s_other == 404 and s_own == 200 and j_own["status"] == "cancelled" and s_again == 409 and lv2[0] == [2700, 5], f"codes={s_other},{s_own},{s_again} asks={lv2}")

pa = call("/api/me", token=alice)[1]["portfolios"]
check("markets are separate ledgers", pa["LSE"]["shares"]["HSBA"] + pa["LSE"]["locked_shares"]["HSBA"] == pa0["LSE"]["shares"]["HSBA"] - 4 and pa["DSE"]["shares"]["GP"] == pa0["DSE"]["shares"]["GP"], f"LSE HSBA {pa0['LSE']['shares']['HSBA']} -> {pa['LSE']['shares']['HSBA']}; DSE GP unchanged")

bad = submit(bob, "GP", "BUY", 1, 300, market="LSE")
check("a DSE ticker is rejected on the LSE market", bad["status"] == "http_400", str(bad.get("error")))

req = urllib.request.Request(BASE + "/api/stream/LSE")
got = ""
try:
    with urllib.request.urlopen(req, timeout=6) as r:
        got = r.readline().decode() + r.readline().decode()
except Exception as e:
    got = str(e)
check("live stream pushes market data", got.startswith("data: ") and "tickers" in got and json.loads(got[6:])["market"] == "LSE")

call("/api/admin/sim/DSE/on", token=admin, method="POST")
t0, seen = time.time(), 0
while time.time() - t0 < 30:
    time.sleep(1.5)
    sn = snap("DSE")
    seen = sum(len(v["bids"]) + len(v["asks"]) for v in sn["tickers"].values()) + len(sn["tape"])
    if seen >= 4:
        break
call("/api/admin/sim/DSE/off", token=admin, method="POST")
check("market simulator creates live order flow", seen >= 4, f"depth levels + trades seen = {seen}")
check.finish()

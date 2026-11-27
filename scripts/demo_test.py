"""v2.1 demo-day checks: market overview, "Try it now" quick start, practice challenge, live board feed, app install files.

Run with the system started (python run.py, or python run.py --demo). Money and prices are simulated; the contract rules are real.
"""
import os
import time
import urllib.error
import urllib.request

from _client import BASE, KEYS, Checker, S, call, market_info, submit

check = Checker()
info = call("/api/info")[1]
dse = market_info("DSE")
n_tk = len(dse["tickers"])

# ── market overview, like an exchange home page ──
s, ov = call("/api/overview/DSE")
check("overview is public (no sign-in needed)", s == 200)
check("overview lists every DSE stock", s == 200 and len(ov["rows"]) == n_tk)
sm = ov["summary"]
check("breadth adds up: up + down + unchanged = number of stocks", sm["adv"] + sm["dec"] + sm["unch"] == n_tk, f'{sm["adv"]}/{sm["dec"]}/{sm["unch"]}')
w = {k: v["w"] for k, v in dse["tickers"].items()}
idx = round(1000 * sum(w[r["ticker"]] * r["last"] / r["ref"] for r in ov["rows"]) / sum(w.values()), 2)
check("demo index = weighted average of last / reference, base 1000", abs(idx - ov["index"]["value"]) < 0.5 and ov["index"]["base"] == 1000,
      f'{ov["index"]["value"]} vs {idx}')
check("index is labelled as a demo index, not the DSEX", "DSEX" not in ov["index"]["name"] and "demo" in ov["index"]["name"].lower())
check("sectors and movers present", {x["sector"] for x in ov["sectors"]} == {v["sector"] for v in dse["tickers"].values()}
      and set(ov["movers"]) == {"gainers", "losers", "active"})
check("hidden benchmark market has no public overview", call("/api/overview/BNC")[0] == 404)

# ── "Try it now": a practice account in one step, key made by the visitor ──
def quick(name):
    key, addr = os.urandom(32).hex(), None
    addr = S.address_of(key)
    s, j = call("/api/auth/quickstart", {"name": name, "wallet": addr})
    if s == 200:
        KEYS[j["token"]] = key
    return s, j, key, addr


s, qa, key_a, addr_a = quick("Tasnim Rahman")
check("quick start creates an active trader with a browser-made address", s == 200 and qa["user"]["status"] == "active"
      and qa["user"]["wallet"].lower() == addr_a.lower() and qa["tx"].startswith("0x"), qa.get("detail", ""))
tok_a = qa.get("token")
me = call("/api/me", token=tok_a)[1]
p = me["portfolios"]["DSE"]
check("quick account starts with the practice cash and shares, on-chain", p["cash"] == dse["new_cash"]
      and all(p["shares"][t] == dse["new_shares"] for t in dse["tickers"]))
check("same address cannot be linked twice", call("/api/auth/quickstart", {"name": "Again", "wallet": addr_a})[0] == 409)
check("a one-letter nickname is refused", call("/api/auth/quickstart", {"name": "X", "wallet": S.address_of(os.urandom(32).hex())})[0] in (400, 422))
check("a missing address is refused", call("/api/auth/quickstart", {"name": "No Key", "wallet": "0x123"})[0] == 400)
s, j = call("/api/auth/quickstart", {"name": "নাদিয়া", "wallet": S.address_of(os.urandom(32).hex())})
check("a Bangla nickname is accepted", s == 200, j.get("detail", ""))
ov = call("/api/overview/DSE")[1]
check("notice board shows the new player by first name only", any(n["kind"] == "joined" and n.get("name") == "Tasnim" for n in ov["notices"]))

# ── a quick account trades like any other account ──
s, qb, _, _ = quick("Rafi Ahmed")
tok_b = qb["token"]
lo, hi = dse["tickers"]["GP"]["lo"], dse["tickers"]["GP"]["hi"]
for _ in range(5):                                              # sell at the top of the band until an ask rests on the book
    oa = submit(tok_a, "GP", "SELL", 2, hi)                     # (earlier runs may have left bids there, which fill first)
    if oa.get("status") in ("open", "partial"):
        break
ob = submit(tok_b, "GP", "BUY", 2, hi)                          # so this buy always finds a seller: A's order or a cheaper one
check("quick accounts can sign and trade", oa.get("status") in ("settled", "partial", "open") and ob.get("status") == "settled",
      f'{oa.get("status")} / {ob.get("status")}')

# ── practice challenge ──
time.sleep(9)                                                  # the leaderboard is cached for 8 seconds
s, lb = call("/api/leaderboard")
check("leaderboard is public", s == 200 and "rows" in lb and lb["players"] >= lb["n"])
names = [r["name"] for r in lb["rows"]]
check("demo bots are not ranked", not any(n in ("Dave", "Erin", "Frank") for n in names))
check("an investor with a trade is ranked, by first name only", "Rafi" in names and all(" " not in n for n in names))
check("ranked by return, best first", all(lb["rows"][i]["ret"] >= lb["rows"][i + 1]["ret"] for i in range(len(lb["rows"]) - 1)))
check("only investors with a trade are ranked", all(r["trades"] >= 1 for r in lb["rows"]))

# ── live board feed (public, for the big screen) ──
s, feed = call("/api/board/feed")
check("board feed is public and short", s == 200 and 0 < len(feed) <= 12)
check("board feed shows the latest order with the validator votes", any(o["id"] == ob["id"] for o in feed)
      and all("detail" in o["votes"] for o in feed))
check("board feed leaks no e-mail, wallet or key data", not any(k in o for o in feed for k in ("trader", "owner", "email", "sig", "wallet")))

# ── install as an app, QR code ──
def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, "", b""


s, ct, body = get("/manifest.webmanifest")
check("web app manifest lists PNG icons (needed to install)", s == 200 and b"icon-192.png" in body and b"icon-512.png" in body)
check("app icons are served", all(get(f"/icon-{z}.png")[0] == 200 and get(f"/icon-{z}.png")[1] == "image/png" for z in (180, 192, 512)))
check("QR code library served; other vendor names refused", get("/vendor/qrcode.js")[0] == 200 and get("/vendor/other.js")[0] == 404)
check("info tells the app whether quick start is on and which link phones should open", "quickstart" in info and "public_url" in info)
check.finish()

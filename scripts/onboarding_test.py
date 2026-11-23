"""End-to-end check of sign-up, OTP, identity, the browser-made signing key, approval and on-chain registration. 14 checks."""
import random
import time

from _client import Checker, call, login, new_key, submit

check = Checker()
tag = str(random.randint(10 ** 5, 10 ** 6 - 1))
email, pw = f"new{tag}@example.com", "Strong1pass"
nid = "19" + str(random.randint(10 ** 7, 10 ** 8 - 1))      # 10 digits
key, addr = new_key()                                        # made on the investor's device; the server only ever sees the address

s, _ = call("/api/auth/signup", dict(name="Test Trader", email=email, mobile="01712345678", password="short"))
check("weak password rejected", s == 400)
s, j = call("/api/auth/signup", dict(name="Test Trader", email=email, mobile="01712345678", password=pw))
tok, code = j.get("token"), j.get("otp_demo", "")
check("sign-up ok, OTP issued", s == 200 and len(code) == 6 and j["user"]["status"] == "otp_pending")
s, _ = call("/api/auth/signup", dict(name="Test Trader", email=email, mobile="01712345678", password=pw))
check("duplicate email rejected", s == 409)
s, _ = call("/api/auth/otp/verify", dict(code="000000" if code != "000000" else "111111"), token=tok)
s2, j2 = call("/api/auth/otp/verify", dict(code=code), token=tok)
check("wrong OTP rejected, right OTP accepted", s == 400 and s2 == 200 and j2["user"]["status"] == "kyc_pending")
s, _ = call("/api/kyc", dict(nid="12345"), token=tok)
s0, _ = call("/api/kyc", dict(nid=nid, photo_hash="ab" * 32), token=tok)
check("identity step needs the investor's signing address", s0 == 400)
s2, j2 = call("/api/kyc", dict(nid=nid, photo_hash="ab" * 32, wallet=addr), token=tok)
dump = str(j2)
check("bad ID rejected, good ID accepted; raw ID not returned", s == 400 and s2 == 200 and nid not in dump and j2["user"]["status"] == "approval_pending", f"last4={j2['user'].get('nid_last4')}")
s, _ = call("/api/order", dict(market="DSE", ticker="ROBI", qty=1, price=28, side="BUY"), token=tok)
check("unapproved user cannot trade", s == 403)
s, _ = call("/api/admin/requests", token=tok)
check("trader cannot use admin endpoints", s == 403)

broker = login("broker@blockexdse.demo", "Broker@123")
s, j = call("/api/admin/requests", token=broker)
mine = [u for u in j["pending"] if u["email"] == email]
s2, j2 = call("/api/admin/decision", dict(user_id=mine[0]["id"], approve=True), token=broker) if mine else (0, {})
check("broker approves; the browser-made address is registered on-chain", bool(mine) and s2 == 200 and j2["user"]["status"] == "active" and j2["tx"].startswith("0x") and j2["user"]["wallet"] == addr, f"wallet={j2.get('user', {}).get('wallet')}")
_, me = call("/api/me", token=tok)
p = me.get("portfolios", {}).get("DSE", {})
l = me.get("portfolios", {}).get("LSE", {})
check("registered on-chain on both markets with starting balances", p.get("cash") == 1_000_000 and p.get("shares", {}).get("ROBI") == 100 and l.get("cash") == 10_000_000 and l.get("shares", {}).get("HSBA") == 100, f"DSE cash={p.get('cash')} LSE cash={l.get('cash')}")

carol = login("carol@blockexdse.demo")
submit(carol, "ROBI", "SELL", 20, 28)
o = submit(tok, "ROBI", "BUY", 5, 28, key=key)
check("new trader signs with the new key, buys and settles on-chain", o["status"] == "settled" and o["trades"], f"tx={o['trades'][0]['tx'][:12] if o.get('trades') else ''}")

s, j = call("/api/auth/signup", dict(name="Second User", email=f"two{tag}@example.com", mobile="01812345678", password=pw))
t2 = j["token"]
call("/api/auth/otp/verify", dict(code=j["otp_demo"]), token=t2)
key2, addr2 = new_key()
s, _ = call("/api/kyc", dict(nid=nid, wallet=addr2), token=t2)
check("same ID cannot be linked twice", s == 409)
sdup, _ = call("/api/kyc", dict(nid="2" + nid[1:], wallet=addr), token=t2)
call("/api/kyc", dict(nid="2" + nid[1:], wallet=addr2), token=t2)
check_dup = sdup == 409
s, j = call("/api/admin/requests", token=broker)
two = [u for u in j["pending"] if u["email"] == f"two{tag}@example.com"]
call("/api/admin/decision", dict(user_id=two[0]["id"], approve=False, reason="Photo unclear"), token=broker)
_, me2 = call("/api/me", token=t2)
s, _ = call("/api/order", dict(market="DSE", ticker="ROBI", qty=1, price=28, side="BUY"), token=t2)
check("rejected user sees reason and cannot trade; a signing address cannot be reused", me2["user"]["status"] == "rejected" and me2["user"]["reject_reason"] == "Photo unclear" and s == 403 and check_dup)

codes = [call("/api/auth/login", dict(email=email, password="wrong"))[0] for _ in range(6)]
check("login locks after repeated failures", codes[:4] == [401] * 4 and codes[-1] == 429, str(codes))
check.finish()

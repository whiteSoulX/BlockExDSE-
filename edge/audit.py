"""
Independent audit of one market, from the ledger alone.

Anyone with read access to the chain (a regulator, a broker, an investor) can run this. It does not ask the exchange
to be trusted: it re-reads every transaction and re-checks

  1. the investor's signature on every order;
  2. the validator signatures on every order, and that there were enough of them for the order's risk tier;
  3. that every trade respected price-time priority (the best-priced, earliest resting order was matched first);
  4. that no cash and no shares were created or destroyed;
  5. that every trade record kept by the exchange off-chain still matches the hash anchored on-chain.

Standalone use:  python scripts/audit_chain.py   (needs only the RPC endpoint and deployment.json)
"""
import hashlib
import json

from eth_abi import encode
from eth_utils import keccak

import signing as S

EVENTS = ("TraderRegistered", "SharesCredited", "OrderPlaced", "OrderAttested", "TradeSettled", "HashAnchored", "OrderCancelled")
ORDER_TYPES = ["bytes32", "address", "bytes32", "uint256", "uint256", "uint8", "uint8", "uint256", "uint256"]


def _get_logs(ev):
    try:
        return ev.get_logs(from_block=0)
    except TypeError:                                    # older web3.py
        return ev.get_logs(fromBlock=0)


def _events(cl):
    rows = []
    for name in EVENTS:
        for lg in _get_logs(getattr(cl.c.events, name)()):
            rows.append((lg["blockNumber"], lg["logIndex"], name, dict(lg["args"]), lg["transactionHash"]))
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows


def record_hash(record: dict) -> str:
    return hashlib.sha256(json.dumps(record, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def audit_market(cl, trade_log=None) -> dict:
    w3, c, f = cl.w3, cl.c, cl.c.functions
    cfg = cl.config()
    validators = [a.lower() for a in cfg["validators"]]
    compliance = cfg["compliance"].lower()
    std, esc, risk_notional = cfg["quorum_std"], cfg["quorum_esc"], cfg["risk_notional"]
    events = _events(cl)
    checks, problems = [], []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    def bad(msg):
        if len(problems) < 25:
            problems.append(msg)

    # ── 1 and 2: signatures and quorums, taken from the transaction input (not from anything the exchange reports) ──
    attested = {a["id"]: a for _, _, n, a, _ in events if n == "OrderAttested"}
    tx_cache, ticker_cfg = {}, {}
    n_orders = sig_ok = att_ok = quorum_ok = escalated = with_reviewer = 0
    sigs_checked = 0
    for _, _, name, a, txh in events:
        if name != "OrderPlaced":
            continue
        n_orders += 1
        if txh not in tx_cache:
            _, args = c.decode_function_input(w3.eth.get_transaction(txh)["input"])
            ins = [tuple(x[k] for k in ("trader", "ticker", "qty", "price", "side", "otype", "nonce", "expiry")) if hasattr(x, "keys") else tuple(x) for x in args["ins"]]
            hashes = [keccak(encode(ORDER_TYPES, [S.ORDER_TYPEHASH, *o])) for o in ins]
            dig = S.attest_digest(cl.domain, S.batch_root(hashes))
            att, signers = bytes(args["attSigs"]), []
            for k in range(len(att) // 65):
                try:
                    signers.append(S.recover(dig, att[k * 65:(k + 1) * 65]).lower())
                except ValueError:
                    signers.append("?")
            comp = False
            if len(bytes(args["compSig"])) == 65:
                try:
                    comp = S.recover(dig, bytes(args["compSig"])).lower() == compliance
                except ValueError:
                    comp = False
            tx_cache[txh] = (ins, hashes, [bytes(x) for x in args["traderSigs"]], signers, comp)
        ins, hashes, tsigs, signers, comp = tx_cache[txh]
        oid, oh = a["id"], bytes(a["orderHash"])
        if oh not in hashes:
            bad(f"order {oid}: its hash is not in the transaction that placed it")
            continue
        i = hashes.index(oh)
        o = ins[i]
        sigs_checked += 1 + len(signers)
        try:
            if S.recover(S.digest(cl.domain, oh), tsigs[i]).lower() == o[0].lower():
                sig_ok += 1
            else:
                bad(f"order {oid}: not signed by its investor")
        except ValueError:
            bad(f"order {oid}: malformed investor signature")
        distinct = set(signers)
        good = len(distinct) == len(signers) and all(s in validators for s in signers)
        if good:
            att_ok += 1
        else:
            bad(f"order {oid}: a validator signature is unknown or repeated")
        if o[1] not in ticker_cfg:
            ticker_cfg[o[1]] = f.tickers(o[1]).call()
        ref, bps = ticker_cfg[o[1]]
        tier = S.risk(ref, bps, risk_notional, o[2], o[3], "MARKET" if o[5] == 1 else "LIMIT")["tier"]
        escalated += tier
        with_reviewer += 1 if (comp and tier) else 0
        enough = len(distinct) >= std and (len(distinct) + (1 if comp else 0) >= esc if tier else True)
        ev = attested.get(oid)
        if good and enough and ev and ev["tier"] == tier and ev["votes"] == len(distinct):
            quorum_ok += 1
        else:
            bad(f"order {oid}: {len(distinct)} validator signatures, tier {tier}, needs {esc if tier else std}")
    add("Every order is signed by its investor", sig_ok == n_orders, f"{sig_ok} of {n_orders} investor signatures verified")
    add("Every validator signature is genuine and counted once", att_ok == n_orders, f"{att_ok} of {n_orders} orders")
    add("Every order had enough validator signatures for its risk tier", quorum_ok == n_orders,
        f"{quorum_ok} of {n_orders} orders ({escalated} risky, {with_reviewer} of them approved by the reviewer)")

    # ── 3: replay the order book and check price-time priority of every trade ──
    book, n_trades, prio_ok, price_ok = {}, 0, 0, 0
    anchors, trade_ids = {}, []
    for _, _, name, a, _ in events:
        if name == "OrderPlaced":
            book[a["id"]] = {"trader": a["trader"].lower(), "ticker": a["ticker"], "side": a["side"], "price": a["price"], "rem": a["qty"]}
        elif name == "OrderCancelled":
            if a["id"] in book:
                book[a["id"]]["rem"] = 0
        elif name == "HashAnchored":
            anchors[a["tradeId"]] = bytes(a["recordHash"]).hex()
        elif name == "TradeSettled":
            n_trades += 1
            trade_ids.append(a["id"])
            b, s = book.get(a["buyId"]), book.get(a["sellId"])
            if not b or not s:
                bad(f"trade {a['id']}: refers to an unknown order")
                continue
            rest_id, agg_id = min(a["buyId"], a["sellId"]), max(a["buyId"], a["sellId"])
            rest, agg = book[rest_id], book[agg_id]
            if a["price"] == rest["price"] and a["qty"] == min(b["rem"], s["rem"]):
                price_ok += 1
            else:
                bad(f"trade {a['id']}: price or quantity does not follow the rules")
            better = False
            for oid, x in book.items():
                if oid >= agg_id or oid == rest_id or x["rem"] <= 0 or x["side"] != rest["side"] or x["ticker"] != rest["ticker"]:
                    continue
                if x["trader"] == agg["trader"]:
                    continue                             # an investor is never matched against their own order
                crosses = x["price"] <= agg["price"] if rest["side"] == 1 else x["price"] >= agg["price"]
                ahead = (x["price"] < rest["price"] if rest["side"] == 1 else x["price"] > rest["price"]) or (x["price"] == rest["price"] and oid < rest_id)
                if crosses and ahead:
                    better = True
                    bad(f"trade {a['id']}: order {oid} had priority over order {rest_id}")
                    break
            prio_ok += 0 if better else 1
            b["rem"] -= a["qty"]
            s["rem"] -= a["qty"]
    add("Every trade respected price-time priority", prio_ok == n_trades, f"{prio_ok} of {n_trades} trades")
    add("Every trade used the resting order's price and the right quantity", price_ok == n_trades, f"{price_ok} of {n_trades} trades")

    # ── 4: conservation of cash and shares ──
    traders = sorted({a["trader"] for _, _, n, a, _ in events if n == "TraderRegistered"})
    cash_in = sum(a["cash"] for _, _, n, a, _ in events if n == "TraderRegistered")
    cash_now = sum(f.cash(t).call() + f.lockedCash(t).call() for t in traders)
    shares_in = {}
    for _, _, n, a, _ in events:
        if n == "SharesCredited":
            shares_in[a["ticker"]] = shares_in.get(a["ticker"], 0) + a["qty"]
    shares_ok = all(sum(f.holdings(t, tk).call() + f.lockedShares(t, tk).call() for t in traders) == q for tk, q in shares_in.items())
    add("No cash was created or destroyed", cash_in == cash_now, f"issued {cash_in}, held now {cash_now} across {len(traders)} accounts")
    add("No shares were created or destroyed", shares_ok, f"{len(shares_in)} tickers checked across {len(traders)} accounts")

    # ── 5: anchors, and the exchange's off-chain records against them ──
    add("Every trade has a record hash anchored on-chain", all(t in anchors for t in trade_ids), f"{sum(1 for t in trade_ids if t in anchors)} of {n_trades} trades")
    if trade_log is not None:
        by_id = {e["trade_id"]: e for e in trade_log}
        match = [t for t in trade_ids if t in by_id and record_hash(by_id[t]["record"]) == anchors.get(t)]
        mism = [t for t in trade_ids if t in by_id and record_hash(by_id[t]["record"]) != anchors.get(t)]
        missing = [t for t in trade_ids if t not in by_id]
        for t in mism:
            bad(f"trade {t}: the exchange's off-chain record does not match the hash anchored on-chain")
        detail = f"{len(match)} of {len(trade_ids) - len(missing)} off-chain records match"
        if missing:
            detail += f"; {len(missing)} trades have no off-chain record here (they were made before the gateway last started)"
        add("The exchange's off-chain trade records match their on-chain anchors", not mism, detail)

    return {"market": cl.market, "contract": cl.address, "block": w3.eth.block_number, "ok": all(x["ok"] for x in checks),
            "orders": n_orders, "trades": n_trades, "signatures_checked": sigs_checked, "validators": len(validators),
            "quorum": {"routine": std, "risky": esc}, "checks": checks, "problems": problems}
